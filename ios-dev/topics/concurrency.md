# Swift Concurrency: Isolation, the Races That Survive It, and Safe Migration

> **Applies to:** Swift 6.2 compiler · Swift 6 language mode (Swift 5-mode caveats inline) · iOS 17+ deployment · Xcode 26 · **Last reviewed:** 2026-07-06
> **Judgment companion:** [../principles/concurrency-judgment.md](../principles/concurrency-judgment.md) · **Callables:** `.claude/skills/concurrency-migration-auditor`, `.claude/agents/actor-isolation-scanner`

## The model in one page

- **Isolation domains:** each actor instance, each global actor (`@MainActor`), and "nonisolated" (no protection). Mutable state belongs to exactly one domain; the compiler enforces that crossing domains happens via `await` with `Sendable` values (Swift 6 mode: violations are *errors*; Swift 5 mode with `StrictConcurrency=complete`: warnings).
- **Actors serialize access, not intent.** Every `await` inside an actor method is a suspension point where *other calls to the same actor interleave*. This single fact generates most post-migration bugs (§2).
- **`@MainActor` is a compile-time contract**, not a thread trampoline. Calling a `@MainActor` function from elsewhere *suspends and hops*; it does not run "soon" or "immediately," and two hops can interleave with user events between them.
- **Sendable is the load-bearing wall.** Value types compose it; classes need immutability (`final` + `let` of Sendable types) or internal synchronization to claim it honestly. Every `@unchecked Sendable` is an unverified promise — audit them like `unsafe` blocks.
- **Swift 6.2 "approachable concurrency"** (know these exist; adopt deliberately): module-wide **default MainActor isolation** (great for app targets, wrong for libraries); `nonisolated(nonsending)` — nonisolated async functions now run on the *caller's* actor under the upcoming-feature flag, eliminating a class of surprise off-main hops; `@concurrent` to explicitly demand off-actor execution. **Stamp which flags a module uses in its README** — code reads differently under different defaults.

---

## Failure catalog (failure → detection → fix → prevention)

### 1. Data race smuggled through `@unchecked Sendable` / `nonisolated(unsafe)`

**Failure.** A class with mutable state gets `@unchecked Sendable` to silence the compiler during migration. Two tasks mutate it. Crash signatures: heap corruption (`malloc: incorrect checksum for freed object`), `EXC_BAD_ACCESS` in `swift_release` at addresses far from the race, or dictionaries throwing `NSInternalInconsistencyException`. The crash site almost never names the racing code — that's what makes these two-week bugs.

**Detection.**
- **Thread Sanitizer** (scheme → Diagnostics → TSan): run your integration/UI test suite under it in CI weekly (it's ~5–10× slower — not for every PR). TSan reports the *actual* two racing stacks.
- Static: grep for `@unchecked Sendable` and `nonisolated(unsafe)` — every hit needs either a lock/queue inside, truly immutable state, or a fix. The `actor-isolation-scanner` subagent does this codebase-wide and triages.

**Fix.** In order of preference: make it a value type; make the class `final` with `let` stored properties; make it an `actor`; keep it a class with an internal `Mutex` (Swift 6's `Synchronization.Mutex`) or `OSAllocatedUnfairLock` guarding *all* mutable state — then `@unchecked Sendable` is honest, and say why in a comment.

**Prevention.** Swift 6 language mode on (module by module — see §6). PR rule: `@unchecked Sendable` requires a justifying comment naming the synchronization mechanism; the `concurrency-migration-auditor` skill enforces this.

### 2. Actor reentrancy: the data race is gone, the logic race remains

**Failure.** Check-then-act across an `await`:

```swift
actor ImageCache {
    private var cache: [URL: UIImage] = [:]
    func image(for url: URL) async throws -> UIImage {
        if let hit = cache[url] { return hit }
        let img = try await download(url)   // ← suspension: 5 concurrent callers all miss,
        cache[url] = img                    //    all download. Worse when the "act" is
        return img                          //    non-idempotent (double-charge, double-append).
    }
}
```

No TSan report, no compiler error — memory is safe, *logic* is racy. Symptoms: duplicate network calls, duplicate analytics events, list items appearing twice, "impossible" state assertions.

**Detection.** Code review for the pattern *read isolated state → `await` → write isolated state based on the earlier read*. Runtime: log-and-diff request counts; a stress test firing N concurrent calls at the actor and asserting one download.

**Fix.** Store the **in-flight Task** as the state, so the check-then-act becomes atomic (no `await` between check and write):

```swift
actor ImageCache {
    private var inFlight: [URL: Task<UIImage, Error>] = [:]
    func image(for url: URL) async throws -> UIImage {
        if let task = inFlight[url] { return try await task.value }
        let task = Task { try await self.download(url) }
        inFlight[url] = task                       // synchronous section: check+write, no await
        defer { inFlight[url] = nil }              // runs after the await below — by then value is cached
        return try await task.value
    }
}
```

General rule: **re-validate every assumption after every `await`**, or restructure so the assumption-and-mutation window contains no `await`.

**Prevention.** Review checklist item in `concurrency-migration-auditor`. Comment convention: mark intentional suspension points inside actors with what may have changed.

### 3. `@MainActor` misuse

Three distinct failure modes:

**(a) Assuming synchronous arrival.** `await MainActor.run { self.items = new }` from a background task — but the user tapped "clear" between suspension and resumption. State updates that must be atomic with respect to user actions need to *originate* on the main actor, or re-validate on arrival (this is §2 wearing a different hat).

**(b) `@MainActor` on everything.** Whole-app `@MainActor` (or Swift 6.2 default isolation) is a fine *app-target* default — until image decoding, JSON parsing of 10 MB payloads, or diffing runs isolated to main. Detection: Instruments → **Hangs** shows main-thread intervals >250 ms; Time Profiler attributes them. Fix: move the hot function off with `nonisolated` + `@concurrent` (6.2) or an actor; pass `Sendable` snapshots in/out.

**(c) Protocol conformance holes.** A `@MainActor` class conforming to a nonisolated protocol (`URLSessionDelegate`, `UICollectionViewDataSource`-style callbacks from ObjC, or your own) — the requirement is called from *anywhere*, so Swift 6 mode rejects the conformance or forces `nonisolated` members that then can't touch main-isolated state. Fixes, in order: mark the protocol requirement `@MainActor` if you own the protocol; use an **isolated conformance** `extension Foo: @MainActor Bar` (Swift 6.2, SE-0470) when the protocol is only *used* from main; as a last resort `nonisolated` + `MainActor.assumeIsolated { }` **only** when the framework documents main-thread delivery (it traps otherwise — that trap is a *feature*: a loud crash at the exact violation instead of silent corruption).

**Prevention.** Don't sprinkle `MainActor.run` — it's a smell that isolation boundaries are drawn wrong. Design rule: UI-facing types are `@MainActor`; services are actors or Sendable; the boundary between them passes value snapshots.

### 4. GCD → Concurrency migration: the ordering trap

**Failure.** "Replace the serial queue with an actor" — but a **serial `DispatchQueue` guarantees FIFO order; an actor does not.** Actor calls waiting at suspension points resume by priority, not arrival order. If the queue was serializing *a sequence* (analytics events, write-ahead log, socket frames), the actor version reorders under load. Symptoms: out-of-order events visible only in production traffic, corrupted append-only files.

**Detection.** Ask of every serial queue being migrated: "does anything depend on FIFO?" If events carry sequence numbers or the consumer assumes append order — yes. The `concurrency-migration-auditor` skill asks this per queue.

**Fix.** For ordered pipelines, use a single consumer loop over an `AsyncStream` (one `for await` loop processes in yield order), not N concurrent actor calls:

```swift
actor EventLog {
    private let stream: AsyncStream<Event>
    private let continuation: AsyncStream<Event>.Continuation
    private var pump: Task<Void, Never>?
    init() {
        (stream, continuation) = AsyncStream.makeStream(bufferingPolicy: .unbounded) // bound it in real code
        // start pump in a factory or on first log(); see lifetime note in memory-management.md §5
    }
    nonisolated func log(_ e: Event) { continuation.yield(e) }   // sync, ordered by yield
}
```

**Other GCD traps in the same migration:** `DispatchQueue.sync` from an actor (or `semaphore.wait()` bridging async to sync) can deadlock the **cooperative thread pool** — the pool is sized to core count and *assumes forward progress*; blocking its threads on work scheduled on the same pool is a hang with no crash log. Rule: **never block inside async code** — no semaphores, no `.sync`, no `NSLock` held across `await` (`Mutex` held across `await` doesn't compile; semaphores do, which is why they're the danger). Full legacy-GCD patterns: [gcd-legacy.md](gcd-legacy.md).

**Prevention.** Migrate leaf-first (see §6). CI grep gate: `DispatchSemaphore` + `async` in the same file ⇒ flagged.

### 5. Cancellation: cooperative means "ignored by default"

**Failure modes.** (a) A detached/unstructured `Task` loops forever after its screen is gone — wasted battery, and with `self` captured, a lifetime leak ([memory-management.md](memory-management.md) §5). (b) A migrated download loop never checks cancellation, so "cancel" in the UI does nothing for 30 s. (c) Inverse bug: code treats `CancellationError` as a *failure* and shows an error toast when the user simply navigated away — check `Task.isCancelled` / catch `CancellationError` separately and exit silently.

**Detection.** Grep long-running loops for absence of `Task.checkCancellation()`. Runtime: cancel mid-operation in a test; assert prompt return and no error surfaced.

**Fix.**
- In loops and between expensive stages: `try Task.checkCancellation()`.
- Around non-cancellable callback APIs: `withTaskCancellationHandler(operation:onCancel:)` — note `onCancel` runs *immediately on the cancelling thread*, so it must be thread-safe and typically just calls `task.cancel()`/`resume(throwing:)` on the wrapped primitive.
- Prefer **structured** forms: `async let` and `withThrowingTaskGroup` propagate cancellation to children automatically; a thrown error in a group cancels siblings. Every `Task {}`/`Task.detached {}` is a hand-managed lifetime — justify it or restructure. SwiftUI: `.task {}` / `.task(id:)` gets cancellation-on-disappear for free; use it instead of view-model-spawned tasks wherever possible.

**Prevention.** `concurrency-migration-auditor` flags unstructured tasks without stored handles; code-review rule: `Task.detached` requires a comment explaining why inheriting actor context and priority would be wrong (it almost never is — `Task {}` inheriting context is usually what you want).

### 6. The migration itself introducing races (the war story)

I watched a team migrate a GCD-heavy sync engine to async/await and *add* three data races that GCD had accidentally prevented — the old code funneled everything through one serial queue; the new code split work across actors and `Task {}`s, and shared mutable model objects (reference types, now touched from two domains) raced. TSan caught two; the third shipped and corrupted Core Data saves under exactly-concurrent foreground/background sync.

**The safe migration order:**
1. Turn on `StrictConcurrency=complete` warnings in Swift 5 mode. Read them; don't fix-by-silencing.
2. Make your **model/value layer Sendable first** (leaf dependencies, no imports of your other modules).
3. Convert **leaf async operations** (network, disk) to async/await; keep call sites GCD via small bridges.
4. Draw isolation: UI types `@MainActor`, each shared mutable service an actor — checking every prior serial queue for the FIFO trap (§4).
5. Flip modules to Swift 6 language mode leaf-first; the errors are your remaining real races.
6. Only then delete the GCD bridges.

Migrating call-sites-first (top-down) inverts the dependency on Sendable and forces `@unchecked` everywhere — that's the path that shipped the Core Data race.

---

## Detection toolbox summary

| Tool | Catches | Cost |
|---|---|---|
| Swift 6 language mode | Compile-time data races | Migration effort; the point of it all |
| Thread Sanitizer in CI (nightly) | Runtime races incl. `@unchecked` lies | 5–10× runtime |
| Hangs instrument + MetricKit hang reports | Main-actor overload (§3b) | Free in the field via MetricKit |
| `actor-isolation-scanner` subagent | Codebase-wide unsafe-opt-out inventory | One isolated agent run |
| Stress tests (N-concurrent-callers) | Reentrancy logic races (§2) | Cheap, deterministic with task groups |

**Related:** UI-vs-async ordering races → [async-patterns.md](async-patterns.md) · main-thread cost of `@MainActor` → [performance.md](performance.md) · testing actors → [testing.md](testing.md)
