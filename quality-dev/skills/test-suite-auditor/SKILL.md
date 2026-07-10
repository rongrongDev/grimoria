---
name: test-suite-auditor
description: Audit an existing test suite's real quality within a bounded time budget — verification strength (what tests would actually catch, not coverage %), flakiness/determinism signals, gaps vs business risk, and a prioritized remediation plan. Use when inheriting an unfamiliar codebase, when asked "how good are our tests", after an escaped defect, or as the per-repo worker in a fleet-wide fan-out. Do NOT use for designing tests for new work (use test-strategy-planner), for diagnosing one known flaky test (use flaky-test-diagnoser), or for suite-wide CI-history mining (dispatch the ci-flake-history-scanner subagent — this skill only eyeballs recent runs).
---

# Test Suite Auditor

You are executing `quality-dev/playbooks/analyze-an-existing-test-suite.md` in compressed form (read it if available; this skill is self-sufficient). Governing stance: **coverage numbers are the last thing you look at. A suite's quality is what its tests would catch, learned by reading tests and mutating code — the null hypothesis is that green means nothing.** Budget: scale the playbook's 4-hour human budget to your context; keep the phase *ratios*.

**You are read-only with one exception** (running test/mutation commands). Do not fix anything you find — an auditor that edits becomes a diff, not a report (`quality-dev/orchestration/README.md`, fan-out rules).

## Procedure

**Phase 1 — Inventory (fast, facts only):** test counts by layer (classify by imports, not directory names — a "unit" test importing a DB client is integration in costume; note these); runtimes; CI config (parallelism, shuffle, retry policy — recorded or silent? — quarantine with/without expiry); coverage config exclusions (ignore-patterns hiding directories is a finding); git archaeology: `git log --oneline -20` on test dirs ("fix flaky", "bump timeout", "skip for now" = the suite confessing), count and `git blame`-age `.skip`/`.todo`.

**Phase 2 — Verification quality (the heart; spend the most here):** select 10–15 tests from the highest churn × impact modules (money/auth/core domain; churn via `git log --format=%H --since=1.year -- <dir> | wc -l`). For each, answer "what bug would this catch?" and grade: **A** behavioral (asserts values/persisted effects) / **B** shallow (`toBeDefined`, status-only, ritual snapshots) / **C** self-referential (asserts mocks called mocks). Accelerate with greps (density signals, verify by reading): `toBeDefined|toBeTruthy|not\.toThrow`; `toHaveBeenCalled` vs value-assert ratio; `.snap` sizes. **If runnable:** Stryker incremental on ONE high-risk module (`quality-dev/tools/stryker.md`) — coverage% vs mutation-score gap is the single most persuasive artifact the audit produces.

**Phase 3 — Flakiness signals:** static greps: `waitForTimeout|sleep\(|setTimeout` in tests; hardcoded IDs/shared emails in fixtures; `Date.now()` in logic under test; retry config. Dynamic (if runnable): shuffle canary ×2 (order dependence); `--repeat-each=5` on a fast subset. Recent CI runs if accessible (~50 max — beyond that is `ci-flake-history-scanner` territory): retry-pass patterns. Classify findings by the six-cause taxonomy names from `quality-dev/principles/flakiness.md` — report causes, not counts.

**Phase 4 — Gaps vs risk:** list the system's top ~10 risks (money paths, uniqueness/"exactly once" claims, authz, cross-service seams), then check what would catch each. The chronically-missing four: concurrency tests on uniqueness claims (grep `Promise.all` in tests — usually zero); authz deny cells; contracts on service seams; error-path tests asserting no partial effects.

## Output contract (emit exactly this template — fan-out aggregation depends on it)

```markdown
# Test Suite Audit — <repo> — <date> — <auditor>
## Verdict (3 sentences max)
## Inventory
## Verification quality
[A/B/C tally + 3–5 quoted exemplars; mutation spot-check vs coverage if run]
## Flakiness & determinism
[findings by taxonomy cause; retry/quarantine policy state]
## Gaps vs risk
[risk → what would catch it → exists? table]
## Remediation plan (prioritized)
[≤3 P0s (each ≤1 week effort), P1s, P2s: action | effort S/M/L | failure class prevented]
## Not assessed
```

Prioritization rule: P0 = unguarded high-impact risks + flake-masking *policy* (silent retries, expiry-less quarantine) — policy fixes stop the rot cheapest; P1 = B/C tests on money paths, missing concurrency/authz tests; P2 = structure (layer inversion, runtime, snapshot hygiene). Never imply completeness: everything skipped goes in "Not assessed".

## References

Full playbook with time-boxes: `quality-dev/playbooks/analyze-an-existing-test-suite.md` · Grading rationale: `quality-dev/principles/test-strategy.md`, `quality-dev/principles/mutation-testing.md` · Taxonomy: `quality-dev/principles/flakiness.md` · Deep helpers: `.claude/agents/ci-flake-history-scanner.md`, `.claude/agents/mutation-gap-analyzer.md`
