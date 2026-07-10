# Legacy GCD Codebases — Production Patterns & Pitfalls (Extended Tier)

> **Applies to:** GCD-heavy code maintained alongside Swift 6.2 concurrency · Xcode 26 · **Last reviewed:** 2026-07-06
> Extended-tier doc: how to keep dispatch-era code correct while it awaits migration, and what kills you when the two worlds touch. Migration sequencing lives in [concurrency.md](concurrency.md) §6.

## Production patterns for code you're NOT migrating yet

1. **One queue per subsystem, named, with a documented role.** `DispatchQueue(label: "com.app.imagecache", qos: .utility)` — the label shows up in crash logs and Instruments; anonymous queues make every deadlock investigation archaeology. A queue protects *specific state*; write which state in a comment at the declaration.
2. **Target-queue hierarchies over queue proliferation.** Dozens of independent concurrent queues = thread explosion (GCD spawns threads for blocked work; 60+ threads in a hang report is this). Funnel related serial queues into a shared target: `DispatchQueue(label:…, target: subsystemQueue)` — concurrency capped, ordering per-queue preserved.
3. **State access idiom, pick one per subsystem and never mix:** everything-on-the-queue (all access dispatched, `dispatchPrecondition(condition: .onQueue(q))` asserting in every accessor — the assertions are how the *next* engineer learns the rules) — or a lock (`OSAllocatedUnfairLock`/`Mutex`) for leaf state with no callouts while held. Mixed lock+queue protection for the same state is how the "protected" state races anyway.
4. **`DispatchWorkItem` for cancellable/debounced work** — but remember `cancel()` is advisory pre-execution only (won't stop a running item), and pair every `asyncAfter` debounce with item replacement.

## Pitfalls (failure → detection → fix)

### 1. `.sync` deadlocks — the whole family

**Failure.** (a) `queue.sync` from code already on `queue` (directly or via target hierarchy) → instant deadlock. (b) `DispatchQueue.main.sync` from the main thread — same, the launch-crash classic. (c) A→B `.sync` while B→A `.sync` — deadly embrace under load only. (d) `.sync` onto a queue whose current work awaits *your* queue via a completion handler — the async-shaped variant that hits weeks later.

**Detection.** App frozen, no crash; pause the debugger → two threads in `__DISPATCH_WAIT_FOR_QUEUE__` / `semaphore_wait_trap`. Watchdog kills at launch show `0x8badf00d` with a `dispatch_sync` frame. Field: MetricKit hang diagnostics with dispatch frames on top.

**Fix.** Treat `.sync` as a code smell needing justification: legitimate uses are narrow (synchronous reads of queue-protected state from *known-foreign* threads — the "synchronized getter"). Everything else → `.async` + completion, or migrate the seam to async/await. Guard the remaining ones: `dispatchPrecondition(condition: .notOnQueue(q))` at the top of any `.sync` wrapper.

### 2. QoS inversion

**Failure.** High-QoS (user-initiated) work waits — via `.sync`, semaphore, or serial-queue ordering — on `.background` work. GCD boosts *some* patterns (sync onto a queue boosts the queue) but **cannot boost across semaphores or custom condition waits**: the UI stalls at background priority, worst on cold devices / low power mode. Symptom: "slow only for some users, unreproducible on dev devices."

**Detection.** Time Profiler with the **Thread State / QoS coloring**: a userInteractive thread blocked while a background thread runs the needed work. Also `os_signpost` intervals straddling the wait.

**Fix.** Don't wait on lower-QoS work from higher-QoS contexts; hand results *up* asynchronously. Give queues explicit, honest QoS (unspecified QoS + inherited priorities = chaos). Replace semaphore-based waiting with dependencies GCD can see (`DispatchGroup.notify`, or migration to `await`).

### 3. `DispatchGroup` bookkeeping drift

**Failure.** `enter()`/`leave()` mismatches: an early-return path skips `leave()` → `notify` never fires (silent hang of the feature); a double-`leave` → crash (`Unbalanced call to dispatch_group_leave()`). These accrete in evolving code because every new branch must remember the pairing manually.

**Fix.** Enter/leave pairs at the *same lexical level*, `defer { group.leave() }` immediately after `enter()` where feasible. Honestly: `DispatchGroup` fan-out is the *first* thing to migrate — `withTaskGroup` makes the entire failure class unrepresentable. Migrate these opportunistically even in "frozen" legacy code; risk is low, payoff immediate.

### 4. Semaphores as async glue (the modern injury)

**Failure.** `DispatchSemaphore.wait()` to make async code synchronous — "just this once" — inside code that later runs on the **cooperative thread pool** (called from a Task). The pool assumes forward progress; blocking its threads on work scheduled for the same pool = whole-app soft-lock with a clean-looking crash-free session. This is *the* top incident cause in half-migrated codebases and why [concurrency.md](concurrency.md) §4 bans blocking in async contexts.

**Detection.** Grep: `DispatchSemaphore` in any file that also contains `await`/`Task` (CI gate). Runtime: hangs where all cooperative threads sit in `semaphore_wait_trap`. Xcode 26's concurrency runtime warnings flag some blocking-in-task cases — treat those warnings as errors.

**Fix.** Invert the seam: make the *caller* async (usually smaller than it looks), or push the blocking wait onto an explicit non-cooperative thread (`DispatchQueue.global().async` + completion) as a stopgap. Never inside a Task.

### 5. The serial-queue → actor false equivalence

Covered fully in [concurrency.md](concurrency.md) §4; restated here because the *legacy* side of the seam is where you decide: a serial queue guarantees **FIFO**; an actor does not. Inventory each serial queue's role before migrating — "mutual exclusion only" queues become actors safely; "ordering pipelines" become single-consumer `AsyncStream` loops.

## Minimum bar for a GCD subsystem you're keeping

- [ ] Every queue labeled, QoS explicit, protected-state documented at declaration
- [ ] `dispatchPrecondition` asserts in state accessors
- [ ] No `.sync` without a `notOnQueue` precondition and a justifying comment
- [ ] No `DispatchSemaphore` reachable from async contexts (CI grep)
- [ ] `DispatchGroup`s migrated to task groups opportunistically
- [ ] Thread count in steady state < ~1.5× core count (Instruments; thread explosion check)

**Related:** migration order & FIFO trap → [concurrency.md](concurrency.md) · ObjC-era retention traps in the same code → [objc-interop.md](objc-interop.md) · blocked-vs-busy diagnosis → [performance.md](performance.md) §4
