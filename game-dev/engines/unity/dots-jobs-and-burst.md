# Unity: Jobs, Burst, and DOTS/Entities — Adoption Judgment and Pitfalls

**Applies to:** Unity 6.x; Job System + Burst (stable, use freely), Entities/DOTS 1.x package line. Package versions matter — stamp them in decisions.
**Last reviewed:** 2026-07-06.
**Principles this implements:** [../../principles/concurrency-and-race-conditions.md](../../principles/concurrency-and-race-conditions.md) (the threading model), [../../principles/architecture-ecs-vs-oop.md](../../principles/architecture-ecs-vs-oop.md) (when ECS pays — read §2 there before any DOTS migration).

---

## 1. Adoption ladder — take the cheapest rung that fixes your measured problem

1. **Burst-compiled jobs on native containers** (no ECS): 80% of DOTS's performance win at 20% of its architectural cost. Any data-parallel hot loop — culling, boids, procedural mesh, mass raycasts (`RaycastCommand`) — can move here while the game stays GameObjects. **This is the default recommendation.**
2. **Hybrid:** ECS for a hot simulation core (projectiles, crowds), GameObjects for presentation, sync layer per [architecture doc §2](../../principles/architecture-ecs-vs-oop.md). What most shipped "DOTS games" actually are.
3. **Full Entities + Entities Graphics:** massive-scale sims/RTS where entity count is the game. Commit only with profiler evidence and a team that has done rung 1–2 first; the content-workflow and debugging costs are real (subscenes/baking, harder click-to-inspect, package churn).

## 2. Job System mechanics & pitfalls

The safety system is the best race-condition detector you'll ever get free — **in the editor**. It validates that no two scheduled jobs can access the same `NativeContainer` conflictingly and throws immediately, with names. Pitfalls with teeth:

- **Safety checks are editor/development-build only.** Code that "works" because you leaked a job past a sync point will corrupt memory silently in player builds. Never ship code that only passes with `[NativeDisableContainerSafetyRestriction]` sprinkled on — every such attribute is an unproven claim of disjointness; require a comment proving it, per the [concurrency doc §2 prevention](../../principles/concurrency-and-race-conditions.md) rules.
- **`JobHandle.Complete()` placement is the perf model:** complete at point-of-use, not point-of-schedule ([concurrency doc §4](../../principles/concurrency-and-race-conditions.md) "schedule early, complete late"). The dependency *chain* is the API: pass handles, don't block.
- **Allocator discipline:** `Allocator.Temp` (1 frame, per-thread, fast), `TempJob` (≤4 frames, must dispose), `Persistent`. The leak class: `TempJob`/`Persistent` containers whose `Dispose` is skipped on an early-out path — editor leak detection (`NativeLeakDetection`) names the allocation site; keep it on in CI.
- **Don't capture managed state:** jobs take blittable structs + native containers. The compile errors guide you; the design consequence is the gather/compute/apply shape from [concurrency doc §2](../../principles/concurrency-and-race-conditions.md) — engine API access happens main-thread-side of the job boundary, always.
- **`IJobParallelFor` batch size:** default 1 is almost always wrong for small work items; 32–128 typical — tune with the profiler's job overhead visible ([concurrency doc §4 granularity](../../principles/concurrency-and-race-conditions.md)).

## 3. Burst mechanics & the determinism angle

- Burst gives 5–50× over Mono for math-heavy loops (real range, measured repeatedly; biggest on vectorizable float work using `Unity.Mathematics` types — `float3/float4x4` map to SIMD).
- **Determinism:** Burst's default fast float model permits FMA/reassociation differences across CPU architectures. For lockstep/rollback sim code compiled by Burst, this is [desync root cause #1](../../principles/networking-and-multiplayer.md) wearing a Unity badge: pin `FloatMode.Deterministic`/strict where offered (verify per Burst version — deterministic mode has evolved across 1.8+), or keep cross-machine-deterministic math in fixed-point. Same-machine replay is safe; *cross-machine* float determinism is the research project the [networking doc §5](../../principles/networking-and-multiplayer.md) warns about.
- `[BurstCompile]` on static methods with function pointers for managed→burst calls; check the Burst Inspector when a "bursted" job is slow — a stray managed call or non-blittable field silently deoptimizes the whole job.

## 4. Entities (ECS) — the pitfalls past the brochure

- **Structural changes are the frame-cost cliff:** add/remove component or create/destroy entity = archetype move = memcpy + sync point. Per-frame structural churn (e.g., add-component-as-event patterns on thousands of entities) recreates the GC-hitch experience without a GC. Fixes: enableable components (`IEnableableComponent`) for on/off state, ECB (EntityCommandBuffer) playback at defined sync points, pooling entities by pre-creating archetypes.
- **Sync points from structural changes stall the job pipeline** — the Entities profiler module shows them; treat every one as a budget line item.
- **`SystemBase.Update` order:** explicit `[UpdateInGroup]`/`[UpdateBefore]` — the [architecture doc §3.4 update-order rule](../../principles/architecture-ecs-vs-oop.md), enforced by attribute. Implicit order dependencies between systems are the same landmine as MonoBehaviour execution order.
- **Baking/subscenes:** authoring GameObjects bake to entities at build/load. The workflow trap: live-editing bake results doesn't persist; team members lose work until they internalize authoring-vs-runtime split. Budget onboarding time for this — it's the #1 "DOTS is unusable" complaint and it's a training issue, not a tech one.
- **Managed components / class-based `IComponentData`** quietly reintroduce GC + main-thread-only access. They exist for interop; a hot loop over managed components has DOTS's costs with none of its wins — the `allocation-hotspot-scanner` should flag them in sim paths.
- **Entities Graphics ≠ gameplay parity:** some engine features (certain particle/audio/physics/animation workflows) still route through GameObjects; plan the hybrid sync layer, don't discover it. (State of parity moves per package release — verify current gaps before committing scope.)

## 5. Failure → detection → fix → prevention

| Failure | Detection | Fix | Prevention |
|---|---|---|---|
| Race between jobs | editor safety exception (dev); silent corruption (player) | restructure to disjoint writes / dependency chain | never ship safety-attribute suppressions without proof comment; CI runs dev-build sim tests |
| Native container leak | editor leak detection log with site | dispose on all paths (`using`/try-finally) | leak detection on in CI, zero-tolerance |
| Main thread stalls on `Complete()` | Profiler timeline: early `JobHandle.Complete` | move completion to consumption point | [concurrency doc §4](../../principles/concurrency-and-race-conditions.md) review pattern |
| Job overhead exceeds work | Profiler: tiny job boxes, scheduling overhead visible | batch size up; merge jobs | granularity rule of thumb §2 |
| Per-frame structural changes | Entities profiler: sync points, archetype churn | ECB at sync points; enableable components | budget line for structural changes; review gate |
| Burst job cross-platform desync | determinism suite across platforms ([testing doc §3](../../principles/testing-and-determinism.md)) | strict/deterministic float mode or fixed-point | determinism CI on sim-code PRs; `netcode-desync-reviewer` skill |
| "DOTS rewrite" stalls content team | velocity metrics, designer complaints | re-scope to hybrid (rung 2) | require profiler evidence + rung-1-first in migration proposals |
