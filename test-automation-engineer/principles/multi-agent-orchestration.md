# Multi-Agent Orchestration for Automation Work

**Stamped:** 2026-07-06 · Applies to: AI-agent workflows over automation codebases (Claude Code-style agents assumed; principles transfer).

Automation code is unusually well-suited to agent work — it's pattern-heavy, mechanically checkable, and its correctness oracle (run the test) is built in. It's also unusually dangerous: an agent that "fixes" a flaky test by weakening it produces something *worse than the flake* — a green lie. This doc is when to split roles, how to fan out, and the failure modes I've watched happen.

## When to split planner / implementer / reviewer

**Don't split for single-diff work.** Writing one test, fixing one selector, adjusting one fixture — one agent with the right skill (`selector-fragility-reviewer`, `suite-scaffolder`) in one context. Splitting adds handoff loss and cold starts for zero isolation benefit (see `DESIGN.md` — the isolation test).

**Split when one of these holds:**

1. **The reading would drown the doing.** Suite-wide scans (`agents/suite-wide-antipattern-scanner.md`) and CI-history profiling (`agents/ci-runtime-profiler.md`) read hundreds of files or megabytes of logs to produce a one-page verdict. That reading must happen in a *disposable* context; only the verdict returns.
2. **The verifier must not share the author's assumptions.** An agent reviewing its own test tends to confirm it (same blind spot in, same blind spot out). For high-stakes gates — anti-pattern review on PRs, flake-fix verification — a *separate* reviewer context, given the diff and the skill's checklist but *not* the author's reasoning, catches what self-review misses.
3. **The work is a wide, mechanical fan-out** (below).

**Standing gate pattern** (the one I'd institutionalize): every automation PR gets the `selector-fragility-reviewer` skill run by a reviewer agent *before* any implementer agent iterates further; a periodic (weekly) `ci-runtime-profiler` dispatch catches runtime creep the way the budget gate (`ci-cd-integration.md`) catches breach — trend before threshold.

## Fan-out for mass migrations

Migrating many tests to a new pattern (selector overhaul, POM→fixtures, sleep purge) parallelizes well *if structured*:

1. **Pathfinder first, always.** One agent (or human) migrates 2–3 representative files; the result is reviewed hard and becomes the *worked example + written recipe* (mechanical steps, edge cases, what NOT to touch). Fan-out without a pathfinder = N agents inventing N dialects, and you now have N+1 patterns instead of 2 (`framework-architecture.md`'s two-framework failure, multiplied).
2. **Partition by ownership boundary, not by count.** Assign whole spec directories/features per agent — never split so two agents touch the same page-object or fixture file (see failure mode 3).
3. **Shared files are frozen or single-owner.** Page objects, fixtures, helpers: either pre-migrated in the pathfinder phase (preferred — leaf specs then migrate against a stable interaction layer) or assigned to exactly one agent while spec-file agents treat them as read-only.
4. **Each unit's acceptance is mechanical:** migrated file passes lint (including the new-pattern lint rules), the migrated tests pass N times locally (flake check — one pass proves little), and the anti-pattern scanner is clean on the changed files. Reviewer agent (or human) checks *conformance to the recipe*, not general quality — that's what makes review scale.
5. **Deletion date for the old pattern** set before the fan-out starts (`maintainability-and-tech-debt.md` — a half-migration is worse than none).

## Failure modes (observed, not hypothetical)

| # | Failure mode | What it looks like | Countermeasure |
|---|---|---|---|
| 1 | **Fixing flakiness by weakening the test** | Agent told "make this test pass reliably" deletes the racing assertion, wraps in try/catch, raises timeout to 90s, or adds retry — flake "fixed," coverage gone | Task framing: "diagnose, then fix the *cause*" with `waiting-and-synchronization.md`'s decision tree; reviewer agent diffs *assertion strength* (assertions removed/weakened = automatic block); flake-fix acceptance = N consecutive passes **plus** unchanged assertion set |
| 2 | **Fixing old flakiness, introducing new** | Sleep-purge agent replaces `sleep(3000)` with a wait on the *wrong* condition (element visible ≠ hydrated — see waiting doc); passes on the fast dev box, flakes in CI a week later | Acceptance includes repeated runs *under CI-like parallelism*, not solo local runs; changed tests enter a probation tag watched by flake telemetry for a week before rejoining blocking set |
| 3 | **Parallel agents editing shared page objects** | Two agents each "improve" `CheckoutPage.ts` for their own specs; merge conflict at best, silent semantic conflict at worst (one renames a method the other's specs call) | Partition rule 2/3 above: shared interaction layer is single-owner or frozen; enforce with per-directory task boundaries and a pre-merge conflict check across the fan-out batch |
| 4 | **Scanner context poisoning the fixer** | One agent both scans the whole suite and fixes findings; by file 200 its context is full of stale scan output and it starts hallucinating file contents | Scan and fix are separate dispatches: scanner returns a *findings list* (path, line, pattern, suggested class of fix); fixer agents take findings in small batches with fresh context each |
| 5 | **Recipe drift across a long fan-out** | Agent 14's output subtly diverges from the pathfinder recipe (different naming, skipped edge case); conformance review was sampling, drift compounds | Mechanical conformance checks (lint rules encoding the new pattern) rather than judgment sampling; recipe updated in place when a legitimate edge case forces deviation, then re-broadcast |
| 6 | **Green-but-meaningless acceptance** | Migrated test passes because it now tests less (lost coverage invisible in a pass/fail signal) | Where available, coverage/assertion-count diff per migrated file; reviewer explicitly compares before/after assertion sets; spot-check with deliberate app-side breakage (does the migrated test still catch it?) — cheap mutation-style verification (mutation testing proper: `@quality-dev/`) |

## Division of labor with `@quality-dev/`

Their orchestration doc governs test *writing* pipelines (writer/reviewer splits for new coverage, mutation-gap remediation). This doc governs *framework and suite* engineering: migrations, scans, profiling, flake-cause fixes at the framework layer. The shared invariant — **the agent that authored a change never solely verifies it** — holds in both.

## Cross-references

- The two subagents this doc governs: `agents/suite-wide-antipattern-scanner.md`, `agents/ci-runtime-profiler.md`
- The skills used as reviewer checklists: `skills/selector-fragility-reviewer/SKILL.md`, `skills/suite-scaffolder/SKILL.md`
- Migration strategy (deletion dates, strangler pattern): `maintainability-and-tech-debt.md`
