---
name: concurrency-migration-auditor
description: Audit a GCD-to-Swift-Concurrency migration diff (or any new async/await/actor code) for correctness — lost FIFO ordering, actor reentrancy, Sendable escape hatches, blocking in async contexts, continuation misuse, and cancellation gaps. Use when reviewing diffs that replace DispatchQueue/DispatchGroup/semaphore code with async/await/actors, add @unchecked Sendable or nonisolated(unsafe), or introduce continuations and unstructured Tasks. Do NOT use for codebase-wide isolation audits (spawn the actor-isolation-scanner subagent), for planning a migration's module order (read ios-dev/topics/concurrency.md §6), or for lifetime/retain-cycle review (use retain-cycle-reviewer — run both on mixed diffs).
---

# Concurrency Migration Auditor

You are auditing a diff for **concurrency correctness**: races, deadlocks, ordering loss, and cancellation gaps introduced when code moves to (or is written in) Swift Concurrency. The compiler already catches visible data races in Swift 6 mode — your job is exactly the defect classes it cannot see.

**Knowledge base:** `ios-dev/topics/concurrency.md` (failure catalog, §-refs below), `ios-dev/topics/async-patterns.md` (seam bugs), `ios-dev/topics/gcd-legacy.md` (what the old code guaranteed), `ios-dev/principles/concurrency-judgment.md` (the five review questions this skill encodes). Read if present; this file stands alone if not.

## Procedure

1. **Collect the diff** (`git diff <base>...` / `gh pr diff`) plus, for migrations, the *removed* GCD code — the old code documents guarantees the new code must preserve or consciously drop.
2. **Establish module context:** Swift language mode (6 or 5+warnings?), any module-default isolation flags (Swift 6.2 default-MainActor). The same code is safe or racy depending on these — state them in your report.
3. **Run the seven checks below against every changed region.**
4. **Report** in the output format; explicitly list checks that found nothing.

## The seven checks

### 1. FIFO ordering loss (concurrency.md §4 — the migration killer)
For every serial `DispatchQueue` replaced by an actor: did anything depend on execution *order* (event pipelines, sequence numbers, append-only writes, analytics batching)? Actors serialize but do **not** guarantee FIFO under contention. If order mattered → finding; fix direction: single-consumer `AsyncStream` pump loop, not N concurrent actor calls.

### 2. Actor reentrancy (§2)
In every actor (new or modified): find the pattern *read isolated state → `await` → write/act on the earlier read*. Each is a check-then-act hole (duplicate downloads, double side effects). Fix directions: in-flight-`Task` dictionary for dedup; re-validate state after every `await`; or restructure so check+write has no `await` between.

### 3. Sendable escape hatches (§1)
Every added `@unchecked Sendable`, `nonisolated(unsafe)`, `@preconcurrency import`, `MainActor.assumeIsolated`: require (a) a comment naming the synchronization mechanism or thread-contract, and (b) that the mechanism actually exists in the type (lock/queue guarding ALL mutable state, or immutability). Missing either → finding, severity `race`. `assumeIsolated` additionally requires the framework to document main-thread delivery.

### 4. Blocking in async contexts (§4, gcd-legacy.md §4)
Flag any of these reachable from async code: `DispatchSemaphore.wait`, `DispatchGroup.wait`, `.sync` onto any queue, `NSCondition`/`NSLock` held across `await`, synchronous I/O (`Data(contentsOf:)` on remote URLs). The cooperative pool assumes forward progress — these are app-wide soft-locks, severity `deadlock`.

### 5. Continuation discipline (async-patterns.md §2)
Every `withChecked/UnsafeContinuation`: enumerate the wrapped API's exit paths (success, error, cancel, timeout, silent drop). Resume must be provably exactly-once on *each*. Non-cancellable SDK underneath → require `withTaskCancellationHandler`. `withUnsafe...` without a profiler-backed comment → downgrade-to-checked finding.

### 6. Cancellation (§5)
- Long-running loops/multi-stage operations: `Task.checkCancellation()` (or cancellation-aware awaits) present?
- New `Task {}`/`.detached`: who cancels it? Stored handle, `.task` modifier equivalent, or a justification for fire-and-forget. `Task.detached` needs a reason context/priority inheritance would be wrong (it almost never is).
- `CancellationError`/`Task.isCancelled` handled separately from real errors (no error toast on navigate-away)?

### 7. Post-await staleness at the UI edge (async-patterns.md §1)
Every state write after an `await` in UI-adjacent code: what if a newer request finished first, or the user changed context during suspension? Require cancel-previous or generation-token guarding for request-response flows.

## Output format

```
[severity] path:line — <defect in one line>
  Old guarantee → new behavior: <e.g. "serial queue FIFO → actor arbitrary resume order">
  Interleaving that breaks it: <concrete two-step schedule>
  Fix: <direction, one line or short snippet>
  Ref: <doc §>
```

Severities: `race` · `deadlock` · `ordering` · `reentrancy` · `cancellation` · `note`.

Summary block: module language-mode context, findings by severity, checks run with zero findings, and unresolved questions ("cannot see whether `EventQueue` consumers assume order — check downstream of X").

## Self-check before reporting

- For each `ordering`/`reentrancy` finding you stated a *concrete interleaving* — if you can't write the two-step schedule that breaks it, downgrade to `note` with a question.
- You compared against the removed code's guarantees, not just the new code in isolation.
- You did not flag compiler-visible data races in Swift-6-mode modules (the compiler owns those); in Swift-5-mode modules, you did.
