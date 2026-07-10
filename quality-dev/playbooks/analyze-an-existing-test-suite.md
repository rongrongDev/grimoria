# Playbook B — Analyze an Existing Test Suite (bounded time budget)

**Applies to:** any unfamiliar JS/TS suite (patterns port to other stacks); tools referenced: Vitest/Jest, Playwright, Stryker 8.x · **Last verified:** 2026-07-06
**Standalone:** yes — followable with no other context. **Time budget: 4 hours** for a mid-sized service (adjust proportionally; the *ratios* between phases matter more than the total).
**Agent-invokable version:** `.claude/skills/test-suite-auditor/SKILL.md` executes this playbook and emits the report template below. For CI-history flake ranking at scale, dispatch `.claude/agents/ci-flake-history-scanner.md`; for mutation interpretation at scale, `.claude/agents/mutation-gap-analyzer.md`.

The core stance: **coverage numbers are the last thing you look at, not the first.** A suite's quality is what its tests would *catch*, and you learn that by reading tests and mutating code, not by reading dashboards. The 100%-coverage-shipped-a-critical-bug story (`quality-dev/principles/test-strategy.md`) is the null hypothesis you're testing against.

## Phase 1 — Inventory (30 min)

Facts, no judgment yet. Collect:

- **Counts by layer:** `find`/glob test files; classify unit / integration / E2E by directory, config, and imports (a "unit" test importing a DB client is integration wearing a costume — note these, they're findings).
- **Runtime & config:** total wall time per suite; CI config: parallelism, shuffle on/off, retry policy, quarantine mechanism (present? expiring?).
- **Coverage config:** thresholds, exclusions (`coveragePathIgnorePatterns` hiding the scary directories is a classic), whether coverage gates merges.
- **Git archaeology (10 min, high yield):** `git log --oneline -20 -- <test-dirs>` — commit messages like "fix flaky test", "skip for now", "bump timeout" are the suite confessing. Count `.skip`/`.todo`/`xit` occurrences and their `git blame` ages.

Artifact: the inventory block of the report template.

## Phase 2 — Verification quality sampling (60 min — the heart of the audit)

**Read 10–15 tests chosen by risk, not randomly:** pick from the modules that matter (money, auth, core domain — if you don't know which, 5 min of `git log --format=%H --since=1.year | wc -l` per directory finds the churn centers). For each test, answer one question: **"What bug would this catch?"** Score:

- **A — behavioral:** asserts values/persisted effects/observable outcomes; would catch a real regression.
- **B — shallow:** runs real code but asserts existence (`toBeDefined`, `toBeTruthy`, status-only, snapshot-approved-ritually).
- **C — self-referential:** asserts mocks called mocks; would survive any bug in the real code.

Greps that accelerate (run, then verify by reading — density signals, not verdicts): `toBeDefined|toBeTruthy|not\.toThrow` density; `toHaveBeenCalled` vs value-assertion ratio; snapshot count + `.snap` sizes; `expect(` count per test file tail (files with 1 expect per 40 lines).

**Mutation spot-check (20 min of the 60):** run Stryker incremental on ONE high-risk module (`quality-dev/tools/stryker.md`, scope to that module only). The score triangulates your reading: 90% coverage + <60% mutation score confirms a B/C-heavy suite with hard numbers nobody can argue with. This single artifact has changed more executive minds than any report prose I've written.

## Phase 3 — Flakiness & determinism signals (45 min)

- **Static tells (grep, 10 min):** `waitForTimeout|sleep\(|setTimeout` in tests (count + where); `retries:` in config (how many? recorded anywhere?); hardcoded IDs/emails in fixtures (`test@test`, sequential IDs); `Date.now()`/`new Date()` in logic under test without injection; `test.only` history in git log.
- **Dynamic tells (30 min, run in background while writing up):** shuffle canary — run unit/integration with random order (`sequence.shuffle`) twice; failures = order dependence, taxonomy #4. Repeat canary — `--repeat-each=5` on the E2E smoke set if runnable locally. CI history — if accessible, pull last ~50 runs: retry-pass counts per test, red-then-green patterns. (At scale, this is the `ci-flake-history-scanner` subagent's job; within this audit, 50 runs eyeballed suffices for a risk read.)
- Classify what you find against the six-cause taxonomy in `quality-dev/principles/flakiness.md` — the report names *causes*, not just counts.

## Phase 4 — Gap map against risk (30 min)

Invert Playbook A, step 1: list the system's top ~10 risks (money paths, "exactly once" claims, authz, cross-service seams), then ask what would catch each. Specifically check for the chronically-missing four: concurrency tests on uniqueness claims (grep for `Promise.all` in tests — usually zero); authz deny cells; contract tests on consumed/provided APIs; error-path tests that assert *no partial effects*. Each unguarded H-impact risk is a top-priority remediation row regardless of how good the existing tests are.

## Phase 5 — Report & remediation plan (45 min)

Emit exactly this structure (agents: verbatim headings):

```markdown
# Test Suite Audit — <repo> — <date> — <auditor>
## Verdict (3 sentences max)
[Trustworthiness of green; the one number that matters; the headline risk.]
## Inventory
[counts/layers/runtimes/config table + git-archaeology notes]
## Verification quality
[A/B/C tally with 3–5 quoted exemplar tests; mutation spot-check score vs coverage]
## Flakiness & determinism
[static tells with counts; canary results; causes per taxonomy; retry/quarantine policy state]
## Gaps vs risk
[risk → what would catch it → exists? table]
## Remediation plan (prioritized)
[P0/P1/P2 rows: action | effort S/M/L | which failure class it prevents]
## Not assessed
[explicitly out of scope/time — never imply completeness you don't have]
```

**Prioritization rule for the plan:** P0 = unguarded H-impact risks + any flake-masking policy (unrecorded retries, non-expiring quarantine) — these make green meaningless; P1 = B/C-grade tests on money paths, missing concurrency/authz tests; P2 = structure (layer inversion, runtime, snapshot hygiene). Resist the urge to lead with "rewrite the E2E suite" — the highest-leverage first PR is usually *policy* (record retries, shuffle on, lint-ban sleeps) because it stops the rot while you fix substance.

## Failure modes of the audit itself

| Failure mode | Prevention |
|---|---|
| Judging by coverage % | Phase 2 reads tests first; mutation spot-check triangulates |
| Random sampling reads 10 trivial tests | Sample by churn × impact |
| Reporting counts without causes ("47 sleeps") | Every finding names its failure class + the doc that fixes it |
| Unbounded spelunking blows the budget | Phase time-boxes are hard; park rabbit holes in "Not assessed" |
| Plan nobody executes (20 undifferentiated items) | ≤3 P0s, each ≤1 week effort, each tied to a named risk |
