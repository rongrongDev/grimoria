# Mutation Testing — measuring whether your tests would notice

**Applies to:** concept doc; examples use StrykerJS 8.x · **Last verified:** 2026-07-06
**Standalone:** yes. Definitions: *mutation testing* tooling makes small deliberate changes ("mutants") to production code — `>=` → `>`, `+` → `-`, delete a statement, force a boolean — and re-runs your tests against each mutant. A mutant is *killed* if any test fails, *survived* if all pass. *Mutation score* = killed ÷ (total − ignored/equivalent).
**Related:** `quality-dev/tools/stryker.md` (running it), `.claude/agents/mutation-gap-analyzer.md` (bulk interpretation), `quality-dev/principles/test-strategy.md` (where verification strength matters most).

## What a mutation score tells you that line coverage cannot

Line coverage answers: *did this code run under test?* Mutation score answers: *if this code changed, would any test object?* Those are different questions, and the gap between them is where shipped bugs live.

The case that made me a permanent convert: a billing module, 92% line coverage, a suite everyone trusted. First Stryker run: a survived mutant flipping `>=` to `>` in the discount-threshold check (`if (subtotal >= threshold)`). Meaning: **no test in the suite exercised the exact-boundary case** — a cart worth exactly $100.00 against a $100 threshold. Production had that bug's sibling for two quarters; customers at exactly the threshold didn't get the promised discount, and it surfaced as a slow drip of support tickets nobody connected. The lines were covered. The boundary was never verified. Coverage counts execution; mutation counts *detection*.

Rules of thumb calibrated over many codebases:

- A suite with 90% line coverage and no attention to assertions typically lands at **45–65% mutation score** on first run. That number is not shameful; it's just the truth arriving.
- Chasing 100% mutation score is as pathological as chasing 100% coverage — the last 10% is mostly equivalent mutants and low-value paths. **80–85% on risk-ranked core modules** is where diminishing returns start.
- The score's trend and its *survivor list* matter far more than the number.

## Interpreting survived mutants — the decision tree

Every survivor is one of four things. Classify before acting; only two deserve new tests.

1. **Missing/weak assertion (the valuable case).** The mutated code ran under a test, but no assertion pinned the behavior. `arithmetic operator` and `conditional boundary` survivors in business logic are almost always this. → **Write/strengthen the test.** Target the exact boundary or output the mutant altered.
2. **Untested error/edge path.** The mutant lives in a branch no test enters (often `catch` blocks, fallback defaults). → Decide by risk: error handling around money, auth, or data integrity gets a test; a log-and-rethrow wrapper may not.
3. **Dead or unreachable code.** No input can reach the mutated line. → **Delete the code**, don't write a test to feed it. Mutation testing is one of the best dead-code detectors you'll ever run.
4. **Equivalent mutant.** The change doesn't alter behavior (e.g. mutating a performance hint, or `<` → `<=` on a loop that provably never hits the boundary). No test can kill it. → Mark ignored with a comment; chasing these is the classic way teams burn out on mutation testing in month one.

Triage heuristic for a big survivor list: sort by **mutator type × file risk**. `ConditionalBoundary`, `EqualityOperator`, `ArithmeticOperator` survivors in pricing/auth/quota files first; `StringLiteral` mutants in log messages last (usually ignorable noise — configure them off, see `quality-dev/tools/stryker.md`).

## Where mutation testing is worth the CI cost — and where it isn't

Mutation testing is expensive by construction: roughly (number of mutants) × (tests covering each), even with per-test coverage analysis. A full run on a mid-size service is minutes to hours. Spend it where verification strength pays:

**Worth it:**
- Core domain logic: pricing, billing, quotas, permission calculators, state machines, parsers/serializers, retry/backoff logic.
- Anywhere a silent wrong answer costs money or trust (contrast with a loud crash, which users report for free).
- Security-adjacent decisions (authz predicates, input validation) — a survived mutant in an authz check is a finding, not a metric.
- As a **one-shot audit** when inheriting a suite: one run tells you more about real quality than a month of reading coverage reports (see `quality-dev/playbooks/analyze-an-existing-test-suite.md`).

**Not worth it:**
- Glue/wiring code, controllers that delegate immediately, generated code, migrations, UI component wiring — mutants there mostly measure whether you tested the framework.
- Every PR on the whole repo. That's how a 10-minute pipeline becomes 90 and the team turns the tool off forever within a quarter (I've watched exactly this arc twice).

**Cost-control pattern that keeps it alive** (details in `quality-dev/tools/stryker.md`):
- PR-time: **incremental mode**, mutating only changed files in designated core paths — minutes, not hours.
- Nightly/weekly: full run on core modules; publishes score trend + top survivors to a dashboard.
- Gate policy: PR fails only if it *lowers* the incremental score on core paths ("break-even or better"), never a repo-wide absolute bar.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| High coverage, low verification (assertion-free suite) | First mutation run on a core module scores <60% with high coverage | Strengthen assertions on survivors of type 1 | Mutation gate (break-even rule) on core paths; review norm: every test names the failure it detects |
| Team drowns in survivors, abandons tool | Survivor count in hundreds, no triage in 2+ weeks | Triage by mutator×risk (tree above); ignore noise mutators | Scope to core modules only; dashboard tracks *trend*, not absolute |
| Equivalent mutants chased with contorted tests | Tests asserting on internals/timing to kill a mutant | Mark equivalent & ignore with comment | Reviewer checklist: "is this test verifying behavior, or hunting a mutant?" |
| Mutation on the wrong code (glue/generated) | Score noise, long runtimes, no actionable survivors | Trim `mutate` globs to risk-ranked paths | Config reviewed against the top-10 risk-module list from `quality-dev/principles/test-strategy.md` |
| CI cost explosion | Pipeline time regression traced to mutation stage | Incremental on PR, full run nightly | Hard time budget on the PR stage; full runs scheduled, never merge-blocking |

## Operational notes

- Run mutation testing **only on a green suite**. Mutants "killed" by an already-flaky test are lies in both directions; fix flakiness first (`quality-dev/principles/flakiness.md`).
- A mutation run's survivor report across a whole module is thousands of lines of low-density output. Don't paste it into a working context — dispatch the `mutation-gap-analyzer` subagent (`.claude/agents/mutation-gap-analyzer.md`), which runs Stryker, applies the classification tree above, and returns only the ranked, classified gaps.
- Score comparisons are only meaningful with identical config (same mutators, same `mutate` globs, same ignores). Pin the config in the repo; changes to it go through `quality-dev/CHANGELOG.md`.
