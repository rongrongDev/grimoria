# Performance & Frame Budgets

**Applies to:** engine-agnostic; engine mechanics in [../engines/unity/performance-and-gc.md](../engines/unity/performance-and-gc.md) and [../engines/unreal/performance-and-insights.md](../engines/unreal/performance-and-insights.md).
**Last reviewed:** 2026-07-06.
**Related skills/agents:** `gc-allocation-auditor` (skill — diff review), `frame-budget-planner` (skill — new-system budgeting), `frame-profiler-analyzer` (subagent — capture analysis), `allocation-hotspot-scanner` (subagent — whole-repo sweep).

Performance in games is not "make it fast," it's "never miss the train." A frame that takes 17ms at 60Hz is not 3% late — it's 100% dropped, presented a full extra vsync interval later. Players don't perceive average fps; they perceive the worst frame in any given second. Every rule in this doc follows from that.

---

## 1. The budget, in numbers

| Target | Frame budget | What one dropped frame costs |
|---|---|---|
| 30fps (console baseline) | 33.3ms | visible hitch |
| 60fps (standard) | 16.6ms | visible hitch; reviewers screenshot frame-time graphs now |
| 120fps / VR 90Hz | 8.3ms / 11.1ms | VR: nausea; cert-relevant on some platforms |

Rules of allocation, hard-won:

1. **Budget to 85% of the target, per subsystem, at worst case.** The last 15% is for the interaction effects no subsystem owns: cache pressure, driver spikes, OS interference. Teams that budget to 100% ship at 52fps.
2. **Budget the worst realistic scene, not the average.** The number that matters is "40 AI + 200 projectiles + 3 explosion VFX during a save autosave," because that's the moment the player is most engaged and most sensitive.
3. **Write the budget down per subsystem before building.** Example 16.6ms split for a mid-size action game: sim/gameplay 3ms, physics 2.5ms, animation 2ms, rendering (CPU submit) 3ms, VFX 1ms, UI 1ms, audio 0.5ms, streaming/misc 1ms, reserve 2.6ms. The exact split matters less than the *existence of a number to be over* — "animation is 2× budget" is actionable; "the game is slow" is not. The `frame-budget-planner` skill produces this table for a new system.

## 2. Profile first — the non-negotiable

**Failure mode:** Engineer "optimizes" what looks slow in the code. I once watched a team spend three weeks vectorizing a pathfinding inner loop that the profiler later showed at 0.3% of frame time; the actual cost was a `LogWarning` formatting strings 400 times per frame in a shipped build. Guessing has roughly coin-flip accuracy on where time goes, and it's worse for allocation.

**Detection of the anti-pattern:** Any performance PR whose description doesn't contain a before/after capture. Reject it. Not as bureaucracy — because half of them make things *slower* (added complexity, worse cache behavior) and none of them can be verified later without the baseline.

**Fix/procedure:** Capture (Unity Profiler/Memory Profiler, Unreal Insights, Tracy/RAD Telemetry for custom engines) → sort by inclusive time in the *worst* frames, not average → attribute to subsystem budget line → fix the top item → re-capture, same scene, same platform. One variable at a time. Profile on target hardware: a dev PC with a 7950X3D hides everything that will kill you on a Series S or a 2019 phone.

**Prevention:** Automated per-commit performance test: fixed camera flythrough of the worst scene, record frame-time histogram (p50/p95/p99 + count of frames >budget), fail CI on regression beyond noise floor. Establish the noise floor by running the test 10× on an idle machine first; ±3% is typical, gate at +8–10%. Dispatch `frame-profiler-analyzer` when a capture needs deep attribution.

## 3. Per-frame allocation — the GC pause that cost a review point

**Failure mode:** Managed-language engines (Unity C#, Godot C#, any Lua/JS-scripted engine) garbage-collect. Allocating in the per-frame path doesn't hurt *now* — it schedules a pause for *later*. The pause lands on whatever frame is unlucky. On a shipped Unity title of mine, a 48-byte-per-frame allocation in the HUD (string concat of the score) accumulated to a GC.Collect every ~70 seconds costing 12ms — one dropped frame per minute at 60fps. A reviewer's frame-time graph caught it; we saw the screenshot in the review. That's why the rule is **zero** managed allocation per frame in steady state, not "small."

Top allocation sources by how often I've found them in audits (checklist for the `gc-allocation-auditor` skill):

1. String building for UI/debug every frame (concat, `$"..."`, `ToString()`)
2. LINQ / iterator methods in gameplay code (`Where`, `foreach` over interfaces)
3. Boxing: value type → `object`/interface, enum keys in `Dictionary` without a comparer, `string.Format` with value-type args
4. Closures capturing locals in per-frame lambdas/delegates
5. `new` of temp collections/arrays per call (`GetComponents`, physics query non-`NonAlloc` variants)
6. Returning arrays from properties (Unity's `Mesh.vertices` class of API — each read copies)
7. Async/coroutine machinery allocated per frame instead of pooled

**Detection:** Unity — Profiler "GC Alloc" column with Deep Profile off (on distorts), sorted per-frame; anything nonzero in steady-state gameplay is a finding. CI gate: run scripted gameplay 60s, assert total GC allocated below threshold and GC.Collect count == expected. Godot C#: same discipline, weaker tooling — use dotnet-counters/dotTrace. Native engines: substitute "allocation" with malloc churn — Tracy shows it; the failure is fragmentation + allocator lock contention rather than pauses, same discipline applies.

**Fix:** Cache and reuse (StringBuilder, preallocated lists cleared per frame), pool (below), `NonAlloc`/span-based API variants, custom struct enumerators, comparers for enum-keyed dictionaries. Fix in *steady-state paths first*; a load-time allocation is almost never worth touching.

**Prevention:** `gc-allocation-auditor` skill on every gameplay PR; `allocation-hotspot-scanner` subagent quarterly or before ship; the CI allocation gate above; incremental GC on (Unity) as harm reduction, never as the fix — it spreads the pause, it doesn't remove the cost.

## 4. Object pooling — decision tree

Pool when **all** of: object is spawned/despawned in steady-state gameplay (projectiles, VFX, damage numbers, audio one-shots, AI corpses); construction is nontrivial (allocation + component init + engine registration); peak concurrent count is boundable.

Do **not** pool when: created once per level (pooling adds bugs, saves nothing); unbounded variety (pooling per-prefab explodes memory); the real problem is design (10,000 projectiles/sec wants a particle/batch solution, not 10,000 pooled GameObjects).

**The pooling bug class that will bite you:** state leaks across reuse. A pooled projectile keeps its trail renderer's history, its "already hit player X" set, its coroutine still running from the previous life. Symptom: rare, unreproducible "ghost" behavior that QA reports as random. **Prevention:** a single `Reset()` contract per pooled type, called on *acquire* (not release — release-time reset misses fields mutated after release by lingering references), plus a debug-build check that a released object is never touched (poison the state, assert on access).

## 5. Draw calls, batching, and the CPU render wall

**Failure mode:** Frame time dominated by CPU submitting draw calls, not GPU work. Symptom signature: GPU idle gaps in the capture, main/render thread pegged, frame time scales with object *count* not resolution. (Test: drop resolution to 50% — if fps doesn't move, you're CPU-bound; the single fastest triage step that most juniors skip.)

**Detection:** Draw call / setpass count in the frame debugger (Unity Frame Debugger, Unreal `stat RHI`, RenderDoc anywhere). Budget order-of-magnitude: mobile ~500–1500 draws, console/PC a few thousand — but the real budget is ms on *your* target, measure it.

**Fix priority order:** (1) instancing for repeated meshes, (2) static batching / mesh merging for immovable geometry, (3) atlas textures so materials can merge, (4) fewer material variants — every unique material state is a batch break, (5) SRP Batcher (Unity URP/HDRP) or Nanite-appropriate content (UE5) as the engine-native path — see engine docs.

**Prevention:** Content rules with teeth: max material count per asset, atlas policy, an automated scene lint that reports draw-call count per scene against budget in CI. It's an asset-discipline problem more than a code problem — see [asset-pipeline-and-memory.md](asset-pipeline-and-memory.md).

## 6. The hitch taxonomy (non-steady-state)

Steady-state fps and hitches are different diseases:

| Hitch source | Signature | Fix |
|---|---|---|
| GC pause | periodic, ~equal spacing, managed engines | §3 |
| Shader/PSO compilation | first time an effect/material appears | precompile/warm PSO cache at load (UE5 PSO precaching; Unity `ShaderVariantCollection.WarmUp`) |
| Asset load on main thread | on spawn/scene transition | async load APIs, preload critical set — [asset-pipeline-and-memory.md](asset-pipeline-and-memory.md) §4 |
| Physics burst | many bodies wake at once | stagger activation, sleep tuning |
| Spawn burst | wave start, door open | pre-instantiate into pool during calm, amortize over frames |
| OS/driver | random, absent in captures | can't fix; detect by process-external timeline (Unreal Insights context switches, ETW) so you stop chasing ghosts |

**Prevention:** p99/p99.9 frame time in the CI perf test, not just average — hitches are invisible in means. Soak test ≥30 min: memory growth + hitch frequency over time catches fragmentation and slow leaks that a 60-second test never sees.

## 7. When to stop

Optimization has a stop condition: every subsystem inside budget on min-spec at worst case, p99 frame time under target, soak clean. Past that, further optimization is *negative* — it spends complexity you'll pay for in every future feature. The budget table is also the permission slip to stop.
