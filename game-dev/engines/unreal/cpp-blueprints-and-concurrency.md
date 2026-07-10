# Unreal: C++ vs Blueprints, UObject Lifetime, and Threading

**Applies to:** UE 5.4–5.6.
**Last reviewed:** 2026-07-06.
**Principles this implements:** [../../principles/architecture-ecs-vs-oop.md](../../principles/architecture-ecs-vs-oop.md) (composition rules), [../../principles/concurrency-and-race-conditions.md](../../principles/concurrency-and-race-conditions.md) (the threading model — read it first; every rule below is an instance).

---

## 1. The C++/Blueprint split — a placement policy, not a debate

Blueprints cost: ~10× interpreter overhead on logic-dense code ([perf doc §2.2](performance-and-insights.md)), un-diffable binary assets (merge conflicts + unreviewable changes — the [architecture doc §5](../../principles/architecture-ecs-vs-oop.md) problem squared, because BP graphs conflict *and* can't be text-merged), hard-reference dependency closures ([assets doc §2](assets-and-streaming.md)), and spaghetti past ~50 nodes. Blueprints buy: designer iteration speed measured in seconds, and visual clarity for genuinely event-shaped logic.

The policy that ships clean projects: **C++ owns systems, state, and anything ticking; Blueprints own content-specific event wiring and tuning.** Concretely — C++: base classes exposing `BlueprintCallable`/`BlueprintImplementableEvent` surfaces, all per-frame logic, all sim state ([sim/view separation](../../principles/architecture-ecs-vs-oop.md) §3.5), all networking-relevant logic (replicated state and validation live in reviewable text — a [security §2](../../principles/security-and-anti-cheat.md) requirement in practice). BP: "when this boss reaches phase 2, play this sequence and enable that spawner" — per-asset behavior on the C++ skeleton, data in the graph's defaults, DataAssets/DataTables for bulk tuning. Review gate: a BP with a Tick node containing math, or >2 levels of BP inheritance, or BP-only gameplay state that netcode/saves must see — all three are move-to-C++ findings. Audit an inherited project with the reference viewer + a BP complexity pass ([analyze-existing-project guide](../../guides/analyze-existing-project.md) has the recipe).

## 2. UObject lifetime — the crash-cluster generator

The model ([README](README.md)): GC via `UPROPERTY` reachability, actor destruction is *explicit* (`Destroy()`) with collection later, and destroyed-but-uncollected objects fail `IsValid()` but pass `!= nullptr`.

| Failure | Detection | Fix | Prevention |
|---|---|---|---|
| Raw `UObject*` member without `UPROPERTY()` | crash cluster in telemetry, "impossible" garbage state; `-stompmalloc` repro | `UPROPERTY()` (owner) or `TWeakObjectPtr` (observer) | header review lint; UHT can't save you — grep-based CI check for raw UObject ptr members |
| `!= nullptr` on destroyed actor | intermittent NPE-adjacent behavior after deaths/level unloads | `IsValid()` everywhere; `IsValidLowLevel` never (wrong tool) | code convention + review checklist |
| Delegate bound to dead object | crash on broadcast, often frames after destroy | dynamic delegates auto-null with UPROPERTY objects; raw/`AddRaw` on non-UObjects is a manual-unbind contract — pair bind/unbind like the [event-leak rule](../../principles/architecture-ecs-vs-oop.md) §3.3 | prefer `AddWeakLambda`/`AddUObject`; audit `AddRaw` in reviews |
| Lambda captures `this`/actor by pointer into async work | use-after-free when the latent op outlives the actor | capture `TWeakObjectPtr` + pin-and-check inside | standing rule: no raw `this` capture into anything latent (timers, async loads, HTTP, task graph) |
| Timer/latent action fires after owner death | ditto | timers bound to the object are cleared on destroy *if* set with object binding; manual handles need explicit `ClearTimer` | prefer object-bound timer overloads |

## 3. Threading — where each thing is allowed to run

The law, restated from [concurrency doc §2](../../principles/concurrency-and-race-conditions.md): **UObjects are game-thread property.** Spawning, destroying, property-writing, most engine APIs — game thread only, enforced by `check(IsInGameThread())` in debug builds (run debug builds; those checks are the free race detector). What actually goes off-thread:

- **Task graph / `UE::Tasks`** for frame-scoped fan-out over plain data — the gather/compute/apply pattern verbatim: copy POD inputs out, compute in tasks, apply results on the game thread (`AsyncTask(ENamedThreads::GameThread, ...)` or task-with-game-thread-dependency for the apply hop). `ParallelFor` for wide loops (batch-size judgment per [concurrency §4](../../principles/concurrency-and-race-conditions.md)).
- **`FRunnable`/dedicated threads** only for continuous background services (audio decode feeds, network pumps, gen workers) with SPSC/MPSC queue handoff — not for frame work; a free-running thread touching frame state is the [§2 race class](../../principles/concurrency-and-race-conditions.md) on a timer.
- **`FNonAbandonableTask`/`AsyncTask` pool** for one-shot background jobs (file IO, compression) whose results *post back* to the game thread.
- **Render thread**: game code touches it only via the proxy system and `ENQUEUE_RENDER_COMMAND` — mutating UPrimitiveComponent-owned data the render proxy reads, without the dirty/re-create flow, is the [§1 game/render race](../../principles/concurrency-and-race-conditions.md); symptoms are one-frame visual corruption and RT crash dumps with GT state.
- **Physics (Chaos)** runs its solver async in 5.x configs: read results at defined sync points; forcing mid-step reads (line traces against mid-update state from tasks) is UB-adjacent — traces from the game thread at defined phases only.

**Blueprint threading rule for reviewers:** all BP execution is game-thread; any C++ that calls BP events (`BlueprintImplementableEvent`) from a task has smuggled BP off-thread — instant finding, crashes are downstream.

**Determinism note:** `ParallelFor`/tasks in sim code follow [concurrency §6](../../principles/concurrency-and-race-conditions.md) — indexed output slots, no completion-order effects, no shared `FRandomStream` across tasks ([README](README.md) RNG rule) — enforced by the `netcode-desync-reviewer` skill on sim diffs.

## 4. Modules, headers, and the build-time tax (the architecture nobody budgets)

UE compile times are a *product decision*: 15-minute incremental builds mean designers wait on programmers who wait on the build. The levers: module granularity (gameplay monolith module → 40-minute links; split along the [phase/system boundaries](../../principles/architecture-ecs-vs-oop.md) §3.4 you already have), IWYU discipline (forward declare in headers, include in cpp), avoiding `Engine.h`-style umbrella includes, and keeping BP-exposed surface area deliberate (UHT-generated glue scales with it). Track build time in CI as a first-class metric with a regression gate — it decays in silent 10-second increments exactly like load time ([asset doc §4](../../principles/asset-pipeline-and-memory.md)), and the team that measures it is the team that still has fast builds at year three.
