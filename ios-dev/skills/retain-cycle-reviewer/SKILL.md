---
name: retain-cycle-reviewer
description: Review a Swift/ObjC diff or PR for retain-cycle and object-lifetime risk — closure captures, delegate references, Timer/NotificationCenter/Combine retention, and Task lifetime extension. Use when reviewing changes that add stored closures, delegates, timers, observers, Combine subscriptions, or unstructured Tasks, or when asked to check a diff for leaks/memory issues. Do NOT use for whole-codebase memory audits (run Instruments/memory-graph workflows from ios-dev/topics/memory-management.md, or a fan-out per ios-dev/principles/multi-agent-orchestration.md), for diagnosing an existing leak from a crash/metric report, or for non-lifetime memory concerns like footprint or cache sizing.
---

# Retain-Cycle Reviewer

You are reviewing a diff for **object-lifetime defects only**: retain cycles, external-root retention, and unwanted lifetime extension. Stay in scope — style, naming, and unrelated bugs are other reviews.

**Knowledge base:** rubric details and war stories live in `ios-dev/topics/memory-management.md` (mechanics, §-numbers referenced below) and `ios-dev/principles/memory-judgment.md` (the capture decision tree). Read them if present; this file is self-sufficient if not.

## Procedure

1. **Collect the diff.** If not provided, obtain it (`git diff <base>...` or the PR via `gh pr diff`). Review only changed/added lines plus enough surrounding context to determine ownership (who stores what).
2. **For every changed line matching a trigger below, run its check.**
3. **Report findings** in the output format at the end. If nothing triggers, say so explicitly and list which trigger classes you checked — silence must be distinguishable from "didn't look."

## Trigger classes and checks

### A. Closures capturing `self` (or any reference type)

For each new/modified closure, answer **in order** (full tree: memory-judgment.md):

1. Non-escaping (runs before the call returns)? → strong capture is CORRECT. Flag *spurious* `[weak self]` here as a comprehension-tax note (severity: note).
2. Escaping AND stored on `self` or anything `self` owns (property, `cancellables`, a debouncer/handler object held by `self`)? → **must be `[weak self]`**. Missing = finding (severity: cycle).
3. Escaping, fire-once, bounded (network/animation completion)? → strong is acceptable *if* completing after owner dismissal is desired/harmless; `[weak self]` if the work is UI-only. If the strong choice is load-bearing (e.g., persists a payment result), require a comment; if `[weak self]` would silently drop a must-finish effect (guard-return in a save/payment path), flag THAT (severity: correctness — the "always weak" availability bug).
4. Any `[unowned self]`? → flag unless the closure provably cannot outlive `self` by construction (severity: crash-risk). Suggested fix is always `weak` + guard.
5. After `guard let self` in a long-lived loop (`for await`): is `self` re-checked after later `await`s if the loop should stop on owner death? (§5)

### B. Delegates and weak-shaped properties

- New `var delegate`/`var dataSource`/observer/listener property not declared `weak` → finding (§2), unless a comment justifies intentional ownership. Protocol must be class-bound (`AnyObject`) for `weak` to compile — include that in the fix.
- New `URLSession(configuration:delegate:...)` → verify a matching `invalidateAndCancel()`/`finishTasksAndInvalidate()` exists on a teardown path; URLSession retains its delegate until invalidated (§2 war story).

### C. Runloop/singleton-rooted retention (§3)

- `Timer.scheduledTimer(target:selector:)` or `CADisplayLink(target:)` → finding: runloop→timer→target chain makes `deinit`-based invalidation impossible. Fix: block-based + `[weak self]` + deterministic `invalidate()`.
- `NotificationCenter.addObserver(forName:...using:)` → token must be stored and removed on a deterministic path, and the closure needs `[weak self]`; suggest the async-sequence form (`for await ... in NotificationCenter.default.notifications(...)` inside `.task`) where the code is already async.

### D. Combine (§4)

- `.sink`/`.assign` stored via `.store(in: &cancellables)` where `cancellables` lives on `self`: closure must capture `self` weakly.
- `assign(to: \..., on: self)` → always a finding (cannot be weak); fix: `sink` + `[weak self]`, or `assign(to: &$property)`.

### E. Task lifetime (§5)

- `Task {}`/`Task.detached {}` in an object: if long-lived (loops, `for await`, sleeps > seconds), require (a) stored handle + cancellation at a lifecycle boundary AND (b) `[weak self]`. Fire-once short tasks: strong is fine — apply check A3.
- In SwiftUI: `Task {}` in view/VM init or `onAppear` where `.task`/`.task(id:)` would give automatic cancellation → recommend the modifier (severity: note unless the task is long-lived, then cycle-risk).

## Output format

For each finding:

```
[severity] path:line — <one-line defect statement>
  Chain: <who retains whom, e.g. "self → cancellables → sink closure → self">
  Fix: <concrete replacement code or one-line direction>
  Ref: memory-management.md §N
```

Severities: `cycle` (definite/likely permanent leak) · `crash-risk` (unowned misuse) · `correctness` (weak dropping must-finish work) · `lifetime` (extension without cycle — long-lived Task class) · `note` (spurious weak, style-level lifetime hygiene).

Close with the summary block: findings count by severity, trigger classes checked, and any context you lacked (e.g., "could not determine whether `Debouncer` is stored on self — verify ownership of X").

## Self-check before reporting

- Did you verify *storage* (ownership) rather than pattern-matching syntax? A closure passed through but not stored is not a cycle.
- Every `cycle` finding names the complete chain. If you can't name the chain, downgrade to `note` with a question.
- No findings outside lifetime scope.
