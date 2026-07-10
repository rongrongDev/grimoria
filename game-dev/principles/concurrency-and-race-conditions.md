# Concurrency & Race Conditions in Game Code

**Applies to:** engine-agnostic; Unity Jobs/Burst specifics in [../engines/unity/dots-jobs-and-burst.md](../engines/unity/dots-jobs-and-burst.md), Unreal task graph in [../engines/unreal/cpp-blueprints-and-concurrency.md](../engines/unreal/cpp-blueprints-and-concurrency.md).
**Last reviewed:** 2026-07-06.
**Related:** [game-loop-and-timing.md](game-loop-and-timing.md), [testing-and-determinism.md](testing-and-determinism.md) (determinism is the first casualty of careless threading).

Games are one of the few domains where you ship a soft-realtime concurrent system to millions of heterogeneous machines with no ability to attach a debugger. The house style that survives this is *structured* concurrency: wide fan-out over immutable input, hard sync points, and almost no free-running threads. Every place I've seen "just spawn a thread for it" in game code, I've later seen the crash report cluster.

---

## 1. The frame is a pipeline — know your threads

The mental model that prevents most bugs: a modern engine frame is a pipeline of **game/main thread** (sim N) → **render thread** (building GPU commands for sim N-1) → **RHI/submit thread** → **GPU** (drawing N-2), with a **worker pool** (jobs/tasks) fanning out from the game and render threads. Consequences:

- The image on screen is always 1–3 frames behind the sim. (Relevant to input latency budgets and to why "read back from the GPU this frame" is always a stall.)
- **Data the render thread reads must not be mutated by the game thread mid-frame.** Engines solve this with copy/snapshot (render proxies in Unreal, extracted render data in Unity SRP). The bug class: bypassing the snapshot — e.g., a game-thread callback mutating a material/mesh the render thread is consuming. Symptom: rare flicker/corruption, crash dumps inside the render thread with game-thread state on the stack.
- Blocking the game thread on the render thread (or GPU) collapses the pipeline: one 5ms wait costs a whole frame of throughput.

## 2. Race conditions — failure → detection → fix → prevention

**Failure mode (the big three in game code):**
1. **Job writes overlapping data** — two jobs write the same entity/array range without disjointness. Symptom: position "snaps," physics jitter that changes with core count.
2. **Game/render thread race** — §1 above.
3. **Main-thread-only API called off-thread** — most engine APIs (Unity's entire scene API, most of UObject-land in practice) are main-thread-only; calling them from a task "works" 999 times then corrupts internal state. Symptom: crash in unrelated engine code minutes later.

**Detection:** These bugs are load- and core-count-dependent, so: run debug builds with the engine's race detection **on** (Unity Jobs safety checks + Burst safety, Unreal `-checkthreads` style asserts and TSan on supported targets, plain TSan for custom engines); test on both a 4-core and a 16+-core machine — several races I've chased only manifested on high-core-count consumer CPUs the team didn't develop on; treat "impossible" corrupted-state crash clusters in telemetry as race-until-proven-otherwise.

**Fix:** Restructure, don't lock (see §3). Make job inputs immutable snapshots, make writes disjoint by construction (chunk/range ownership), move engine-API calls back to a main-thread apply phase.

**Prevention:** The **gather → parallel compute → apply** pattern as house style: main thread gathers an immutable input snapshot → workers compute into private output buffers → main thread applies results serially. It's deterministic (worker *scheduling* order can vary, but if outputs are written to indexed slots rather than appended, results are order-independent — this is what keeps replays working, see [testing-and-determinism.md](testing-and-determinism.md) §3), trivially reviewable, and the apply phase is the single choke point where engine APIs are legal.

## 3. Locks in game code — mostly no

A mutex in the per-frame path is a frame-time grenade: priority inversion or contention turns a 0.01ms critical section into a multi-ms stall, and it lands as a p99 hitch you can't reproduce. Decision tree:

- Sharing between per-frame systems → **don't share; restructure** (gather/compute/apply, double-buffer, message queue drained at a sync point).
- Producer/consumer across frames (streaming results, network packets in) → lock-free SPSC/MPSC queue, or a small mutex around a *swap of buffer pointers* (lock held for nanoseconds, not while working).
- Genuinely rare cross-thread access (config reload) → a mutex is fine; contention that can't happen costs nothing.
- Atomics/lock-free beyond a queue you got from a library → you must be able to explain acquire/release semantics on ARM (consoles, mobile are weakly ordered — code that "works" on x86 dev machines breaks there). If that sentence isn't comfortable, restructure instead. This is the honest bar; most gameplay engineers never need to clear it.

## 4. Job-system pitfalls (engine-agnostic core; engine docs have specifics)

- **Too-fine granularity:** scheduling overhead exceeds work. A job under ~5–10µs of work is overhead-dominated; batch (e.g., 64–256 entities per job item, tune with the profiler, not intuition).
- **Sync-point sprawl:** every "complete all jobs now so I can read the result" flushes the pipeline. Symptom in captures: worker threads sawtoothing idle/busy with main thread stalls between. Fix: schedule early / complete late — issue jobs at frame start, consume results at the last possible phase, express ordering as job dependencies instead of blocking completes.
- **Main thread as bottleneck while workers idle:** the profiler shows 15ms main, workers 20% busy. The fix is usually *moving whole systems* (animation, pathfinding, culling) into jobs, not micro-parallelizing one loop.
- **Frame-spanning jobs:** a job still running when the next frame's job graph is scheduled creates dependency hairballs and hidden +1-frame latencies. Either it's per-frame work (must fit in the frame) or it's a background task (streaming, pathfind requests) with an explicit async contract and result latency measured in frames.

## 5. What belongs off the main thread (priority order)

When the main thread is over budget, these move first because they have natural snapshot inputs and deferred outputs: (1) culling & LOD selection, (2) animation pose evaluation, (3) pathfinding (async request/response with a tick-stamped result — gameplay must tolerate N-tick-old paths), (4) physics broadphase/solver (engines do this internally — your job is to not force mid-step readbacks), (5) procedural generation & streaming decompression, (6) audio DSP (already off-thread in every engine; your job: never allocate or lock in audio callbacks — an audio underrun is *more* audible than a dropped frame).

Gameplay *rules* logic usually stays serial: it's branchy, order-dependent, touches everything, and is rarely the bottleneck. Parallelizing gameplay rules is the most common concurrency over-reach I've reviewed; the profiler almost never justifies it.

## 6. Determinism under concurrency

The iron law: **parallel scheduling may vary; observable simulation results may not.** Allowed: parallelism where outputs land in slots keyed by stable entity/index order, then applied in that order. Forbidden in deterministic sim: appending results in completion order; floating-point reductions in nondeterministic order (parallel sum of floats is order-dependent!); reading "how many jobs finished" as game state; per-thread RNG without a stable mapping to entities. If the game has replays, rollback, or lockstep netplay, every parallelization PR needs the determinism test suite run (see [testing-and-determinism.md](testing-and-determinism.md) §3, and the `netcode-desync-reviewer` skill).

## 7. Checklist

- [ ] No engine main-thread-only API reachable from worker code (grep + debug asserts on)
- [ ] Per-frame path contains no mutex acquisition that can contend
- [ ] All parallel writes disjoint by construction (indexed slots / range ownership)
- [ ] Jobs scheduled early, completed late; no mid-frame complete-all
- [ ] Job batch sizes justified by profiler, not defaults
- [ ] Determinism suite green on core-count variation (4c vs 16c) if game needs determinism
- [ ] Race-detection/safety-check build runs in CI at least nightly
