# Unreal: Performance, Insights Workflow, and the Nanite/Lumen Era

**Applies to:** UE 5.4–5.6. Nanite/Lumen behavior shifts per minor version — re-verify thresholds.
**Last reviewed:** 2026-07-06.
**Principles this implements:** [../../principles/performance-and-frame-budgets.md](../../principles/performance-and-frame-budgets.md) (budgets, profile-first, hitch taxonomy). This doc is the UE toolchain and UE-specific cost centers. Agent: `frame-profiler-analyzer` (feed it Insights traces).

---

## 1. Triage ladder (fastest diagnosis per minute spent)

1. `stat unit` — the four numbers that partition every frame problem: **Frame / Game / Draw / GPU**. Highest one names the bound: Game = game thread (§2), Draw = render thread/RHI (§3), GPU (§4). This is the UE version of the [drop-resolution test](../../principles/performance-and-frame-budgets.md) §5 — do it before anything else.
2. `stat game` (tick counts/costs by category), `stat scenerendering` (draws, primitives), `stat gpu` (GPU pass breakdown), `stat streaming` (texture pool pressure).
3. **Unreal Insights** for anything real: `-trace=default,task` (add `memory`, `loadtime` channels per question), captured **on target hardware in a Test/Shipping-adjacent config** — Editor and DebugGame numbers are fiction for the same reasons as Unity's editor ([principles §2](../../principles/performance-and-frame-budgets.md)). Big traces → `frame-profiler-analyzer` subagent with the budget table.
4. `stat startfile`/`stopfile` for on-device stat capture when Insights hookup is awkward; `csvprofile` + PerfReportTool for fleet/soak trend lines ([testing doc §6](../../principles/testing-and-determinism.md)).

## 2. Game-thread costs (the usual UE suspects, in the order I find them)

1. **Tick volume**: thousands of actors/components ticking at frame rate for no reason. Fix ladder: don't tick (event-driven), tick slower (`SetTickInterval`), tick together (aggregate managers instead of per-actor logic — one crowd manager beats 500 AI ticks for cache and dispatch reasons per [architecture doc §2](../../principles/architecture-ecs-vs-oop.md)). Detect: `stat game`, Insights task view sorted by count × cost.
2. **Blueprint VM in hot paths**: per-instruction interpreter overhead ~10× C++ for logic-dense code ([cpp-blueprints doc §1](cpp-blueprints-and-concurrency.md) has the split rules; nativization no longer exists — the fix is moving the function to C++, keeping the BP call site).
3. **Spawning**: `SpawnActor` is heavyweight (allocation + registration + construction scripts + BeginPlay cascade). Steady-state spawn/despawn → pool per [principles §4](../../principles/performance-and-frame-budgets.md), with `Reset-on-acquire` and deferred-spawn tricks; projectile-heavy games move projectiles out of Actors entirely (batched manager or Mass/instanced representation — the [ECS-hot-core hybrid](../../principles/architecture-ecs-vs-oop.md) §2 in UE clothes).
4. **Sync loads mid-gameplay**: `LoadObject`/hard `LoadSynchronous` on soft ptrs in gameplay — Insights `loadtime` channel + `stat streaming`; fix via async load + preload sets ([assets doc §3](assets-and-streaming.md)).
5. **String/name churn**: `FString` concat per frame, `FName` construction from strings in ticks — UE's version of the [allocation rule](../../principles/performance-and-frame-budgets.md) §3; native allocator churn shows as `FMemory` time and fragmentation on consoles, not GC pauses, but the discipline is identical.
6. **GC hitches**: UObject GC is mark-and-sweep with a pause proportional to object count. 100k+ UObjects = multi-ms `CollectGarbage` spikes on a cadence. Detect: `stat gc`, `LogGarbage` verbose timing. Fix: fewer UObjects (managers/structs/Mass instead of actor-per-thing), incremental GC settings (`gc.` cvars per version), cluster settings; *schedule* collections at safe points (level transition) rather than letting the timer land one mid-combat.

## 3. Render-thread / draw costs

Draw-call triage per [principles §5](../../principles/performance-and-frame-budgets.md): `stat scenerendering` + `stat RHI` for counts, RenderDoc/Insights for attribution. UE-specific levers, in order: **Nanite for everything it supports** (it collapses per-mesh draw cost for opaque static-ish geometry — its cost model is closer to "flat base + per-pixel" than per-object); **instanced static meshes / HISM** for repeated non-Nanite geometry; **material consolidation** (each material = state change; material *instances* of a shared parent are nearly free, unique parent materials are not); mesh merging for micro-prop clutter. Movable lights casting dynamic shadows multiply draw passes — shadow-casting light count is a content budget with teeth ([frame-budget-planner](../../principles/performance-and-frame-budgets.md) line item).

## 4. GPU: Nanite/Lumen/VSM budget realities

The UE5 stack (Nanite + Lumen + Virtual Shadow Maps + TSR) buys generational visuals for a **large fixed baseline cost** — on a mid console tier expect several ms each for Lumen GI/reflections and VSM before your content draws a pixel (exact numbers move per version/platform; measure with `stat gpu` per pass — the *shape* of the judgment is what's stable). Decision consequences: at 60fps on console, the full stack fits only with aggressive internal-resolution scaling (TSR from ~50-60%); a stylized or competitive title often ships faster and clearer by *disabling* Lumen (baked/SSGI) and using the budget on resolution/frame rate — choose per product, not per hype. Nanite caveats that surprise: masked/deforming/translucent materials and aggregate micro-geometry (foliage) hit its weak paths (version-dependent — foliage support improved across 5.x; verify current); overdraw from kitbashed overlapping Nanite geometry still costs; non-Nanite meshes mixed into a Nanite scene reintroduce the old per-object costs *plus* VSM invalidations. VSM cost is driven by invalidation: anything moving under a shadow-casting light re-renders shadow pages — a spinning pickup in every room is a VSM tax collector.

## 5. Hitches (UE-specific instances of the [principles §6 taxonomy](../../principles/performance-and-frame-budgets.md))

| Hitch | UE signature | Fix |
|---|---|---|
| PSO compilation | first-encounter stutter; `stat pipelinestatecache` | **PSO precaching** (5.2+, on by default and improving per version) + bundled PSO cache from playtests; still *verify* on min-spec D3D12 — this was the era's defining stutter and regressions recur |
| GC pause | `stat gc` spike cadence | §2.6 |
| Sync load | `loadtime` trace, `FStreamableManager` misuse | [assets doc §3](assets-and-streaming.md) |
| World Partition cell load burst | hitch at cell boundary crossings | cell size/streaming source tuning, HLOD setup — [assets doc §3](assets-and-streaming.md) |
| Shader compile (editor only) | PIE start stalls | DDC health — [assets doc §5](assets-and-streaming.md); don't chase as a runtime bug |
| Construction-script cascades | spawn hitch with BP stack in trace | simplify construction scripts; pool |

## 6. CI gates (UE mechanics for [principles §2](../../principles/performance-and-frame-budgets.md))

Gauntlet (or functional-test framework) driving a scripted flythrough of the worst scene on devkits, emitting csvprofile → PerfReportTool trend dashboards; assert p95/p99 frame time + hitch count/hour + `stat gc` spike ceiling. Memory: `memreport -full` at standard checkpoints diffed per build against the [budget table](../../principles/asset-pipeline-and-memory.md) §1. Cooked-build boot + load-time budget test nightly ([assets doc §4](assets-and-streaming.md)). A perf PR without a before/after Insights trace on target hardware gets bounced — same rule as everywhere, [principles §2](../../principles/performance-and-frame-budgets.md).
