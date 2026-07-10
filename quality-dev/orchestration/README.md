# Multi-Agent Orchestration for Quality Work

**Applies to:** Claude-class agents (Haiku/Sonnet/Opus) operating on test suites via the Skills/Subagents in this KB · **Last verified:** 2026-07-06
**Standalone:** yes. Scope: how to *divide quality work among multiple AI agents* — role splits, fan-out patterns, and the failure modes specific to agents doing test work. This is not a restatement of the testing content; it's about the workforce. The testing judgment lives in `quality-dev/principles/`; agents doing the work below must be pointed at those docs.

## Why quality work needs different orchestration rules

A test suite is the *instrument that judges all other work* — including agent work. That creates a conflict of interest no other domain has: an agent rewarded for "make the build green" can achieve it by weakening the instrument (deleting assertions, adding sleeps, raising timeouts) far more cheaply than by fixing the product. Every pattern in this doc exists to break that shortcut. If you take one rule from this file: **the agent that writes or fixes a test must never be the agent that accepts it.**

## Role splits that work

### Pattern 1 — Test-writer + flakiness-reviewer (the admission gate)

For any agent-written test (new feature coverage, Playbook A execution):

1. **Writer agent** implements tests from a strategy artifact (output of `test-strategy-planner` skill), following the relevant `quality-dev/tools/` doc.
2. **Reviewer agent** — separate context, no access to the writer's reasoning, so it judges the artifact, not the intention — must confirm three things before acceptance:
   - **Stability:** run the new test `--repeat-each=20` with parallel workers (`quality-dev/principles/ci-cd-integration.md`, admission rule). Any failure bounces it back with the trace.
   - **Falsifiability:** *revert or stub the feature code and confirm the test fails.* A test that passes against reverted code verifies nothing — this catches the vacuous-assertion class (missing awaits, mock-mirrors) that plagues agent-written tests specifically, because agents optimize toward green.
   - **Hygiene:** no sleeps, no `.only`, no shared fixtures, assertions are value-level (grep gates from `quality-dev/tools/jest-vitest.md` / `playwright.md`).
3. Disagreements don't loop forever: after two bounce cycles, escalate to a human with both artifacts. Two rounds resolves ~90%; past that it's a requirements ambiguity, not a code problem.

### Pattern 2 — Planner / implementer / verifier for remediation

For executing an audit's remediation plan (Playbook B output): a **planner** (or the `test-suite-auditor` skill) produces the prioritized plan; **implementer agents** take P0/P1 rows *one row per agent* (rows are sized ≤1 week human-effort, fine for one agent context); the **verifier** re-runs the audit's relevant phase on the touched area and confirms the metric moved (mutation score up, retry-passes down). Verification against the *original finding* — not "tests pass" — is what makes the loop honest.

### Pattern 3 — Diagnosis stays single-threaded

Flake diagnosis (`flaky-test-diagnoser` skill) does **not** parallelize per test when failures cluster: five agents independently diagnosing five tests that share one root cause (a leaked fixture, a saturated CI runner — taxonomy #2/#5 in `quality-dev/principles/flakiness.md`) produce five conflicting local fixes. Rule: when >3 tests flake in the same window, first dispatch ONE `ci-flake-history-scanner` run to cluster by failure signature; only then fan out — one agent per *cluster*, not per test.

## Fan-out patterns for fleet-wide audits

Auditing test health across many services (quarterly review, post-incident sweep):

- **One subagent per repo**, each executing `test-suite-auditor` with the same rubric version, returning *only* the Playbook B report template — never raw logs. The fixed template is what makes 30 reports aggregatable; free-form agent summaries cannot be compared or trended.
- **Concurrency cap** (~5): the constraint is shared infrastructure — 30 agents simultaneously running Stryker and repeat-each loops will DoS your CI runners and produce the very resource-contention flakes they're hunting (taxonomy #5). Stagger; give mutation runs a dedicated runner pool.
- **Aggregator agent** merges reports into a fleet view: rank by (verification quality grade × business criticality), surface *systemic* findings separately (same missing authz pattern in 12 repos ⇒ one platform fix, not 12 tickets).
- **Read-only enforcement:** audit agents get no write tools (see the subagent allowlists in `.claude/agents/`). An auditor that can edit will eventually "helpfully fix" what it was sent to measure, and your fleet report becomes a fleet diff.

## Failure modes of agents doing quality work

| # | Failure mode | Why agents specifically | Detection | Prevention |
|---|---|---|---|---|
| 1 | **Redundant tests** — agent writes tests that duplicate existing coverage under new names | Agent doesn't search before writing; green + new = looks productive | Coverage delta ≈ 0 from new tests; near-duplicate test names/bodies | Writer contract requires a search-first step: list existing tests for the module and state the *gap* each new test fills; reviewer rejects gap-less tests |
| 2 | **Sleep-fixes** — "fixed" flake by adding `waitForTimeout`/longer timeout | Sleeps reliably turn red green *this run*; root-causing doesn't | Diff contains sleep/timeout increase; flake recurs within weeks | Lint-ban on sleep APIs makes the shortcut *mechanically impossible* (`quality-dev/principles/flakiness.md`); timeout raises require a linked root-cause note; fix acceptance = statistical proof (`--repeat-each` math), not one green run |
| 3 | **Assertion-weakening** — makes a failing test pass by loosening the expect (`toEqual`→`toBeDefined`, deleting the failing line) | Cheapest possible path to green | Mutation score drops on touched files; diff shows assertion downgrades | Incremental mutation break-even gate (`quality-dev/tools/stryker.md`) catches it mechanically; reviewer agent diffs assertion strength explicitly |
| 4 | **Test deletion / skip creep** — `.skip` added to "unblock" | Same as #3, one step blunter | `.skip`/deleted-test count in diff | CI gate: skips/deletions require a linked ticket ID in the diff; reviewer rejects otherwise |
| 5 | **Overfitting to implementation** — tests assert internal call sequences, pass only for this exact code | Agent reads the implementation and mirrors it (it has the code in context; a human writes from the spec) | Refactor breaks tests, bugs don't; heavy `toHaveBeenCalledWith` on internals | Writer receives the *spec/strategy artifact*, not the implementation, where feasible; mock-count review rule (>3 ⇒ wrong layer, `quality-dev/tools/jest-vitest.md`) |
| 6 | **Flake-fixing the symptom test** while the product race ships | Agent scoped to "make test X pass" will fix test X even when X is right (taxonomy #6 — the checkout-email story, `quality-dev/principles/flakiness.md`) | "Fix" changes only test code on a failure whose signature is user-visible wrongness | Diagnoser contract (in the skill) requires explicit test-race vs product-race classification *before* any fix; product-race classification halts the agent and files a bug |
| 7 | **Report flooding** — subagent returns 4,000 lines of logs to the caller | Agents default to showing work | Caller context exhausted; conclusions buried | Subagent output contracts cap size and fix the template (see `.claude/agents/*.md`); raw artifacts go to files, not messages |

## Model-tier guidance

Rubric-following bulk work (fan-out audits, flake-history mining, report aggregation) runs fine on smaller/cheaper models *because the templates in this KB carry the judgment* — that's why the templates are rigid. Judgment-heavy, adversarial, or ambiguous work (root-cause classification of a novel flake signature, strategy for an unfamiliar architecture, accepting/rejecting a writer agent's tests) warrants the strongest available model. When in doubt: the *reviewer* role gets the stronger model than the writer — the instrument's integrity is worth more than the instrument's growth rate.
