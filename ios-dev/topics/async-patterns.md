# Async Patterns: Combine ↔ async/await Interop, Cancellation, and UI Races

> **Applies to:** Swift 6.2 / Swift 6 language mode · iOS 17+ · Combine (maintenance-mode framework — stable, not evolving) · Xcode 26 · **Last reviewed:** 2026-07-06
> **Companions:** [concurrency.md](concurrency.md) (isolation model) · [state-and-architecture.md](state-and-architecture.md) (who owns the task)

## Positioning: Combine's role in 2026

Combine is done evolving but not deprecated; it still owns two niches async/await handles poorly: **multi-subscriber hot streams with operators** (debounce/throttle/combineLatest over UI signals) and **`@Published`-era codebases**. Direction of travel for new code: async/await + `AsyncStream` first; Combine where operator composition over hot streams genuinely pays. What you must master is the **seam**, because that's where the bugs live.

---

## Failure catalog (failure → detection → fix → prevention)

### 1. The stale-response UI race (the one every app has shipped)

**Failure.** User types "sw" → search fires; types "swift" → second search fires; *first* response arrives last and overwrites the better results. No data race, no Swift 6 diagnostic — pure ordering. Same shape: pull-to-refresh racing pagination; avatar loads racing cell reuse.

**Detection.** Hard to spot in dev (local servers answer in order). Test by making the fake network answer *out of order* — a `TestScheduler`/clock-controlled mock where response N completes before N-1. If your tests can't express "responses arrive out of order," you can't catch this class at all.

**Fix — pick one, by situation:**
- **Cancel-previous (default for search/refresh):** SwiftUI `.task(id: query)` gives this for free — identity change cancels the old task. Imperative version: store the task, `previous?.cancel()` before starting anew. Ensure the transport actually honors cancellation (`URLSession` async APIs do).
- **Guard-by-token (when old work must complete, e.g., uploads):** capture a generation token/ID when starting; compare on arrival before writing state.

```swift
// Cancel-previous, no framework needed:
func search(_ query: String) {
    searchTask?.cancel()
    searchTask = Task { [weak self] in
        guard let results = try? await self?.api.search(query) else { return }
        guard !Task.isCancelled else { return }      // late but pre-write check
        self?.results = results
    }
}
```

**Prevention.** Rule: *every* state write from async work answers "what if a newer request finished first?" in code (cancellation or token), not in hope. Out-of-order mock in the test suite as a permanent fixture.

### 2. Continuation misuse: the hang with no crash log

**Failure.** Bridging callback APIs with `withCheckedContinuation` and resuming **zero times** on some path — e.g., the delegate has an error callback you didn't wire, or the SDK simply never calls back on failure. The task awaits forever: UI spinner never stops, task (and its captures — see [memory-management.md](memory-management.md) §5) leaks. Double-resume is the *loud* failure (`SWIFT TASK CONTINUATION MISUSE` crash with checked continuations); zero-resume is the silent one, and it's worse.

**Detection.** Checked continuations log `leaked its continuation` when the continuation deallocates unresumed — grep your logs/console for `CONTINUATION MISUSE`. Field signature: hung spinners, tasks visible in the debugger's task list that never complete.

**Fix.** Discipline per bridge:
- Enumerate **every** exit path of the callback API (success, error, cancel, timeout, "SDK silently drops the request") and resume exactly once on each; a `Bool`/lock-guarded `resume(returning:)` wrapper if the SDK can double-call.
- Wrap non-cancellable SDKs in `withTaskCancellationHandler` and resume with `CancellationError` on cancel — otherwise your "cancel-previous" fix in §1 silently doesn't work through this bridge.
- Always `withChecked…` in debug/release both; the overhead is negligible against the failure mode. `withUnsafe…` only with a profiler-proven need and a comment.

**Prevention.** Code-review checklist on any `withCheckedContinuation`: list of exit paths in a comment above it. Timeout watchdog around third-party bridges you don't trust.

### 3. Cancellation lost at the Combine seam

**Failure.** `publisher.values` (AsyncPublisher) or continuation bridges hide a subscription. Two directions of loss:
- **async → Combine:** wrapping a publisher into `withCheckedContinuation` + `sink` and dropping the `AnyCancellable` — the pipeline dies instantly (nothing arrives; see §2's zero-resume) or, if stored globally, *outlives* the awaiting task's cancellation.
- **Combine → async:** `Task { for await v in publisher.values { … } }` — cancelling the *task* correctly cancels the subscription (this direction is safe), but teams "fix" a compile error by moving to `sink` inside the task, recreating direction one.

**Fix.** Prefer the built-ins: `publisher.values` for consuming Combine in async (cancellation flows correctly); for the reverse, don't wrap async work in `Future` (it starts eagerly, doesn't cancel) — use `Deferred { Future { … } }` only for legacy call sites, or better, change the call site to async.

**Prevention.** Grep gate: `Future {` containing `Task {` or `await` ⇒ review. The `concurrency-migration-auditor` skill flags eager-Future bridges.

### 4. `AsyncStream` backpressure: the unbounded default

**Failure.** `AsyncStream` default buffering is **`.unbounded`**. A fast producer (CoreMotion at 100 Hz, socket frames, scroll events) with a slow consumer (main-actor rendering) buffers everything: memory climbs for the whole session, and the consumer processes *stale* events long after reality moved on — the "app keeps animating data from 30 seconds ago" bug.

**Detection.** Allocations instrument: growth attributed to stream buffer nodes. Behavioral: increasing UI lag behind ground truth over time.

**Fix.** Choose the policy that matches the data's meaning: `.bufferingNewest(1)` for "latest state wins" (sensor readings, progress), `.bufferingOldest(n)` for "must not drop the first N" (rare), unbounded only for finite, event-complete streams. If you need real conflation/debounce semantics, do it explicitly at the producer.

**Prevention.** Lint/grep: `AsyncStream` without an explicit `bufferingPolicy` argument ⇒ warning. Every stream declares its drop semantics on purpose.

### 5. Combine pipeline lifetime and threading at the UI edge

**Failure (lifetime).** Sinks stored in `Set<AnyCancellable>` on `self` capturing `self` strongly — covered as a cycle in [memory-management.md](memory-management.md) §4; the async-pattern consequence is *pipelines that keep firing side effects after the owner should be gone* (analytics double-fires are the classic tell).

**Failure (threading).** `.receive(on: DispatchQueue.main)` forgotten before a UI-writing sink — under Swift 6 with `@MainActor` VMs this is now often a *compile* error at the seam (good), but pre-migration modules deliver on `URLSession`'s queue and corrupt UIKit state intermittently. Also: `.receive(on:)` guarantees delivery queue, **not** subscription or upstream-work queue — `subscribe(on:)` controls where work *starts*; confusing them puts network calls on main.

**Fix/Prevention.** UI-facing pipelines end in a `@MainActor` context (or explicit `.receive(on: DispatchQueue.main)` in legacy modules); every stored sink has `[weak self]`; audit with the grep pair `sink {` without `[weak` and UI-writes without upstream `receive(on:.*main`.

---

## Interop cheat sheet (the seams, one line each)

| From → To | Use | Trap |
|---|---|---|
| Combine → async | `for await x in publisher.values` | Values buffer per AsyncPublisher demand; fine for UI, check for hot firehoses |
| Combine (single value) → async | `try await publisher.values.first(where: { _ in true })` or continuation | Enumerate all exit paths (§2) |
| async → Combine | Change the call site to async instead, if at all possible | — |
| async → Combine (forced) | `Deferred { Future { promise in Task { … } } }` + cancellation wiring | Bare `Future` is eager and non-cancelling |
| Callback SDK → async | `withCheckedThrowingContinuation` + `withTaskCancellationHandler` | Zero-resume hangs (§2) |
| Hot events → async | `AsyncStream` with explicit `bufferingPolicy` | Unbounded default (§4) |

**Related:** actor hops and ordering → [concurrency.md](concurrency.md) · who owns the consuming task → [state-and-architecture.md](state-and-architecture.md) §5 · testing out-of-order arrival → [testing.md](testing.md)
