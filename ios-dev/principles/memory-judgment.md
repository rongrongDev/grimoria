# Memory Judgment: weak vs unowned vs strong, and When to Distrust the Tools

> **Applies to:** Swift 6.2 · iOS 17+ · Xcode 26 · **Last reviewed:** 2026-07-06
> Mechanics and detection workflow: [../topics/memory-management.md](../topics/memory-management.md). This doc is the *reasoning* — read it once slowly; apply it forever.

## The capture-list decision tree (complete, no "it depends")

For a closure capturing `self` (or any reference), ask **three questions in order**:

**Q1 — Does the closure escape?** (Stored, or passed to an API marked `@escaping`?)
- **No** → capture **strong** (plain `self`). Non-escaping closures run before the call returns; a cycle is impossible; `[weak self]` here adds a lying nil-branch that the next reader must reason about. This is not a style preference — spurious weak is a comprehension tax on every future reader.
- **Yes** → Q2.

**Q2 — Can the closure's lifetime exceed the moment you'd want `self` gone?**
- **Stored on `self`, or on anything `self` transitively owns** → cycle territory → **`[weak self]`**. No exceptions worth their risk.
- **Held by an external system indefinitely** (NotificationCenter token closure, socket handlers, long-lived `Task`) → **`[weak self]`**, and re-guard after every `await` ([../topics/memory-management.md](../topics/memory-management.md) §5).
- **Fire-once and bounded** (URLSession completion, animation completion, alert action) → Q3.

**Q3 — For fire-once closures: is `self` staying alive until completion *desirable*?**
- Result must be processed even if the user navigated away (finishing a save, posting analytics) → **strong `self`**, on purpose. The temporary extension *is the feature*. Write the comment.
- Work is pointless without the screen (updating labels) → **`[weak self]`**; the closure becomes a no-op after dismissal, which is exactly right.

**Where does `unowned` fit?** Almost nowhere, and that's the judgment: `unowned` is a *performance-and-clarity* micro-optimization that converts a lifetime-reasoning mistake into a **production crash**, where `weak` converts the same mistake into a silent no-op. Use `unowned` only when **all three** hold: (1) the closure provably cannot outlive `self` — proof by construction (same-object stored property closure invoked only by `self`'s own methods), not by "I checked the call sites today"; (2) the code path is hot enough that the weak side-table hit was *measured* (it essentially never is); (3) an optional-unwrap would genuinely obscure the code. In twenty years, the `unowned` crashes I've debugged outnumber the profiler wins I've seen by roughly fifty to zero.

The crash that teaches this: `unowned self` in a debounced-search closure. Works in every test. A user types, hits back *during the debounce window*, the timer fires into a deallocated `self`: `Fatal error: Attempted to read an unowned reference` — top crash for a week, reproducible only with a specific typing-then-back rhythm. `weak` would have made it literally nothing.

## Lifetime extension is a tool, not a sin

Junior engineers learn "always weak self" and then write `guard let self else { return }` in a payment-completion handler — silently dropping the receipt-persist step when the user dismisses the sheet fast. Seniors know **the capture list is a statement about what should happen to in-flight work when the owner dies**: weak = "abandon it," strong = "finish it." Choose per closure, and say so out loud in review when it's load-bearing. "Always weak" is not a safety rule; it's an *availability* bug pattern with good PR.

## When to distrust each tool

- **Leaks instrument says clean** — means only "no unreachable cycles." Abandoned-but-referenced memory (registries, caches, task-retained objects) is invisible to it. Trust Allocations generations, not Leaks, for "memory grows."
- **Memory graph shows the retainer, but the retainer looks innocent** — closures show as anonymous `closure` nodes; the *capture* you need is one level in. Malloc stack logging (scheme → Diagnostics) attaches allocation backtraces, which is usually the missing name.
- **`deinit` fired, so we're fine** — `deinit` proves *this* object died, not that its spawned tasks, timers, or observers did. Pair the canary with behavior checks (does the log keep ticking after dismissal?).
- **"It only leaks in release" / "only on device"** — believe it; optimizer-dependent lifetimes (especially around `autoreleasepool` and ObjC bridging) are real. Profile the release build ([../topics/performance.md](../topics/performance.md) workflow rule 1).

## The economics: when to hunt vs when to ship

A leak's cost = bytes × accumulation rate × session length × user count; the hunt's cost is engineer-days. A 300-byte one-time leak in a launch path is not worth a day. Per-navigation leaks of view-controller graphs (usually 100 KB–several MB *each*) compound into jetsam kills and 40-minute-session crashes — those are always worth it. Triage by *rate*, not existence: mark generations across the top three user loops; fix what recurs per loop, file what's one-time, and gate regressions with the `assertDeallocated` pattern + `XCTMemoryMetric` soak so the hunt happens at review time, when it costs minutes.

**Related mechanics:** [../topics/memory-management.md](../topics/memory-management.md) · Task-lifetime interaction: [../topics/concurrency.md](../topics/concurrency.md) §5 · Callable: `.claude/skills/retain-cycle-reviewer`
