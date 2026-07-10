# Unity: Performance, GC, and the Profiler Workflow

**Applies to:** Unity 6.x (6000.x); GC facts verified for the Boehm incremental GC (still current in Unity 6 — recheck if/when CoreCLR lands). URP/HDRP.
**Last reviewed:** 2026-07-06.
**Principles this implements:** [../../principles/performance-and-frame-budgets.md](../../principles/performance-and-frame-budgets.md) — read it for the *why* (budgets, hitch taxonomy, profile-first discipline). This doc is the Unity *how*.
**Skill/agents:** `gc-allocation-auditor` (diff review), `allocation-hotspot-scanner` (repo sweep), `frame-profiler-analyzer` (capture analysis).

---

## 1. The GC, concretely

Unity's Boehm GC is non-moving, non-generational, stop-the-world (incremental mode splits the pause across frames but the *total* cost and the trigger — heap growth from allocation — are unchanged). Numbers to reason with: collection cost scales with *live heap size and object count*, not allocation rate; a mid-size game with a 200–400MB managed heap sees full collections in the 5–25ms range on console/desktop CPUs — i.e., **one GC = one-to-two dropped frames at 60fps, guaranteed, whenever it fires.** Incremental GC (Project Settings → Player) amortizes marking across frames using spare frame time — turn it on, but treat it as harm reduction: it can still exceed budget in busy scenes, and write barriers add a small steady cost. The only actual fix is the [zero-steady-state-allocation rule](../../principles/performance-and-frame-budgets.md) (§3 there; Unity-specific catalog below).

**Unity-specific allocation sources** beyond the engine-agnostic top-7:

| Source | Fix |
|---|---|
| `GetComponent<T>()` misses returning "null" allocate a string in editor only — but *calling it per frame at all* is a cache-miss habit | cache in `Awake` |
| `gameObject.tag == "X"` allocates (tag property copies) | `CompareTag("X")` |
| `Mesh.vertices`, `Material.shaderKeywords`, `Input.touches`, etc. — array-returning properties copy per access | cache per frame; use `Mesh.GetVertices(list)`, `Touchscreen` via Input System |
| Physics: `RaycastAll`, `OverlapSphere` | `NonAlloc` variants / `RaycastCommand` batches |
| `material` property (instantiates a material silently — also a *leak*: instances outlive renderer unless destroyed) | `sharedMaterial` for reads; MaterialPropertyBlock / material instancing knowingly |
| Coroutine `yield return new WaitForSeconds(x)` per loop iteration | cache the YieldInstruction; or `yield return null` + timer |
| `Instantiate`/`Destroy` churn | pooling — [principles §4 decision tree](../../principles/performance-and-frame-budgets.md); Unity 6's `ObjectPool<T>` (`UnityEngine.Pool`) is fine, write the acquire-time `Reset()` yourself |
| UGUI: any change to a Canvas element rebuilds that canvas's geometry | split static/dynamic canvases; a score counter on the main HUD canvas re-tessellates the whole HUD every frame |
| `Debug.Log` in builds (string + boxing + stack trace) | strip via `[Conditional]` wrapper; never raw `Debug.Log` in per-frame paths |
| Closures/lambdas registered per frame; `+=` delegate churn | cache delegates; see also the [event-leak class](../../principles/architecture-ecs-vs-oop.md) §3.3 |

## 2. Profiler workflow (the capture ritual)

1. **Profile player builds on target hardware** over the Profiler's remote connection. Editor captures are directionally useful for allocation *sources* but editor overhead distorts timing by 2–10×; Deep Profile distorts worse — use it only to expand a specific callstack you've already localized in a normal capture.
2. Capture the *worst* scene at *worst* moment ([principles §1.2](../../principles/performance-and-frame-budgets.md)). Use `ProfilerRecorder`/custom `ProfilerMarker`s around your subsystems so the timeline speaks your budget table's language — unmarked code lands in an undifferentiated `PlayerLoop` soup.
3. Triage order in the CPU module: check main thread vs `Gfx.WaitForPresent`-class markers first (waiting on GPU/vsync = you're GPU-bound or vsync-capped; CPU optimization is wasted — drop-resolution test, [principles §5](../../principles/performance-and-frame-budgets.md)); then Timeline view (not Hierarchy) to see main/render/job threads together — a "slow main thread" that's actually idle-waiting on a job completion is a scheduling fix, not an optimization ([../../principles/concurrency-and-race-conditions.md](../../principles/concurrency-and-race-conditions.md) §4).
4. GC Alloc column, steady-state scene: sort descending; anything nonzero is a finding for the `gc-allocation-auditor` checklist. For heap *growth over time*, Memory Profiler package snapshots (diff two snapshots 10 min apart — leaked materials/textures from the `material` trap and un-unloaded Addressables dominate real-world diffs).
5. Big captures → dispatch the `frame-profiler-analyzer` subagent with the capture + budget table rather than eyeballing 30k samples.

## 3. Rendering cost: URP/HDRP specifics

- **SRP Batcher is the batching model now** (URP/HDRP): it binds per-material data once and draws compatible objects with minimal state change. Compatibility requires shaders with properly declared CBUFFERs (Shader Graph output complies) — one incompatible shader on mass-instanced props silently falls off the fast path. Check Frame Debugger → "SRP Batch" groupings; "batch broken by: material property block on incompatible shader" class messages tell you exactly why a batch split. Note: `MaterialPropertyBlock` breaks SRP Batcher compatibility — with SRP Batcher, per-instance variation wants *material instances* (cheap under SRP Batcher) or shader instanced properties; this inverts the Built-in RP era advice, a classic stale-knowledge trap.
- **GPU Resident Drawer / GPU instancing** (Unity 6, URP+HDRP): for large static worlds, enable it (BatchRendererGroup-based) before hand-rolling instancing.
- Draw-call triage stays engine-agnostic: Frame Debugger to attribute, then instancing → static batching (memory cost: duplicated verts) → atlasing, per [principles §5](../../principles/performance-and-frame-budgets.md).
- **Shader variant explosion:** multi_compile keywords multiply build time, memory, and first-use hitches. Audit with the shader variant stripping report; warm PSO/variant hitches at load via `ShaderVariantCollection` recorded from a real play session ([principles §6 hitch table](../../principles/performance-and-frame-budgets.md)).
- Overdraw (mobile especially): URP's overdraw debug view; UI is the usual offender — full-screen transparent `Image`s with 0.01 alpha still rasterize every pixel.

## 4. CI gates (Unity mechanics for the [principles §2/§6 gates](../../principles/performance-and-frame-budgets.md))

- Play-mode perf test: Unity Test Framework + Performance Testing package (`Measure.Frames()`), scripted camera flythrough, assert p95/p99 frame time + `GC.Alloc` count == 0 for the steady-state window. Runs on device farm/console devkits nightly.
- Allocation gate on PRs: `gc-allocation-auditor` skill on the diff + a play-mode test asserting zero steady-state alloc in the touched scene.
- Memory gate: Memory Profiler snapshot at standard checkpoint, assert category totals against the [budget table](../../principles/asset-pipeline-and-memory.md) §1.
- Build-size report per commit: [asset doc §1](../../principles/asset-pipeline-and-memory.md).

## 5. Failure → detection → fix → prevention quick table

| Failure | Detection | Fix | Prevention |
|---|---|---|---|
| Periodic hitch, ~N-second cadence | Profiler: `GC.Collect` marker | hunt allocations (§1 table) | zero-alloc CI gate; incremental GC as cushion |
| Hitch on first ability/VFX use | Profiler: shader compile marker | variant warmup collection | PSO/variant warmup at load, recorded from play session |
| HUD costs 3ms | Profiler: `Canvas.BuildBatch` / `Canvas.SendWillRenderCanvases` | canvas splitting, disable raycast targets, no layout groups in dynamic UI | UI perf review in `frame-budget-planner` output for HUD features |
| Frame time fine in editor, terrible on device | (definition of the trap) | profile player build on min-spec | device capture required in perf PR template |
| Memory grows 10MB/min | Memory Profiler snapshot diff | material instance leaks, event-held objects, un-released Addressables handles | soak test with snapshot diff in nightly ([testing doc §6](../../principles/testing-and-determinism.md)) |
| Main thread idle-waits on jobs | Timeline: `JobHandle.Complete` early in frame | schedule early/complete late; restructure dependencies | [concurrency doc §4](../../principles/concurrency-and-race-conditions.md) review |
