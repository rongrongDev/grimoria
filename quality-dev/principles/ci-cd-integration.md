# CI/CD Integration — pipeline architecture, gating policy, and the politics of red

**Applies to:** concept doc; examples assume GitHub-Actions-class CI, Playwright 1.5x sharding, Vitest 3.x · **Last verified:** 2026-07-06
**Standalone:** yes. Definitions: a check *blocks merge* when the PR cannot land while it's red; *advisory* checks report without blocking; *quarantine* removes a flaky test from the blocking set while keeping it running and tracked; *sharding* splits one suite across parallel machines; *test impact analysis* selects tests based on what changed.
**Related:** `quality-dev/principles/flakiness.md` (retry/quarantine judgment), `quality-dev/principles/test-strategy.md` (what exists to be gated), tool mechanics in `quality-dev/tools/`.

## The design goal: every red is news, every green is meaningful

A pipeline is a *signal instrument*, and its enemy is alarm fatigue. The moment developers learn that red sometimes means nothing ("re-run it, it's the flaky one"), you no longer have a gate — you have a ritual. I watched a team merge through a red checkout test during the exact week the red was real; the postmortem's root cause line was alarm fatigue, and the fatigue was self-inflicted via two years of tolerated flakiness. Every policy below serves that one goal.

## Stage architecture — feedback speed as a budget, not an aspiration

Structure stages by *who is waiting* for them:

**Stage 0 — pre-commit / editor (seconds):** lint, types, formatting, secrets scan. Includes the test-hygiene lint rules other docs mandate (sleep bans, `test.only` detection).

**Stage 1 — PR, blocking (hard budget: ≤10 min wall time):** unit + fast integration on changed scope (test impact analysis, below), diff-aware SAST, new-violation axe checks if UI, incremental mutation on designated core paths (`quality-dev/tools/stryker.md`), contract tests for the changed service (`quality-dev/tools/pact.md`). The 10-minute number is behavioral, not aesthetic: past ~10 minutes developers context-switch, and past ~20 they batch changes into bigger, riskier PRs. When the budget is breached, *shard or demote something* — never just raise the budget.

**Stage 2 — merge queue / post-merge (≤30 min):** full unit+integration (backstopping impact analysis), full E2E smoke journeys (5–15, `quality-dev/tools/playwright.md` sharding), `can-i-deploy` contract verification, DB-migration checks. Red here auto-reverts or blocks deploy — *not* a "we'll look later" channel.

**Stage 3 — scheduled (nightly/weekly):** full E2E matrix (browsers/devices), full mutation run with trend dashboard, load & soak profiles (`quality-dev/tools/k6.md`), DAST, full accessibility sweep, dependency audit, **shuffled-order + repeat-each flake hunts** on the newest tests. Stage 3 red pages the *owning team* with a ticket, never blocks unrelated merges.

## Making Stage 1 fast without lying to yourself

- **Parallelize by default;** any test that can't run in parallel is carrying hidden shared state — fix the test, not the parallelism (taxonomy #2/#4, `quality-dev/principles/flakiness.md`).
- **Shard E2E** across machines with balanced timing files; rebalance when timing data drifts (a shard 2× slower than siblings sets your wall time).
- **Test impact analysis with a backstop.** Select tests by dependency graph on PRs, but run *everything* in Stage 2 — dependency graphs miss dynamic imports, config-driven wiring, and codegen. Impact analysis without a backstop is a slow-motion coverage hole; the backstop converts its errors from "escaped defect" to "30-minute-delayed revert."
- **Cache ruthlessly, verify honestly:** restored node_modules and build caches are fine; cached *test results* are only safe when keyed on full transitive input hashes. A "hit" that skips a test whose indirect dependency changed is a false green — the worst artifact a pipeline can emit.

## Flaky-test gating policy — the part most teams get wrong

Full judgment in `quality-dev/principles/flakiness.md`; the pipeline's enforcement half:

1. **Retries: at most 1, always recorded.** A retry-pass is a *data point filed against the test*, visible on a dashboard — not a silent absolution. Unlimited retries convert flakiness from a visible problem into an invisible tax and eventually into missed real failures (a test failing 3× in a row at 5% flake rate is telling you something; retry-until-green ensures nobody hears it).
2. **Auto-quarantine on threshold:** >2 retry-passes in 7 days ⇒ automatic quarantine PR: removed from blocking set, kept running non-blocking, ticket auto-filed to the owning team with failure signatures attached, **expiry ≤14 days** — then fixed or deleted. Auto-quarantine keeps the blocking suite trustworthy *without* a human deciding to tolerate each flake.
3. **Quarantine exemptions:** money-path guards (checkout/auth/payout) cannot be auto-quarantined — they page instead. A flaky critical guard is a fix-now, not a file-away (the reasoning: `quality-dev/principles/flakiness.md`, decision tree step 2).
4. **New-test admission:** a brand-new E2E/integration test runs `--repeat-each=20` in Stage 3 its first night; failures bounce it back before it ever gets the power to block merges. (Agents writing tests must meet the same bar: `quality-dev/orchestration/README.md`.)

## What blocks a merge vs what's advisory

| Check | Blocks merge? | Rationale |
|---|---|---|
| Lint / types / formatting | Yes | Cheap, deterministic, zero-judgment |
| Secrets scan | Yes — always | A committed secret is an incident |
| Unit + integration (impacted) | Yes | The core correctness gate |
| Contract verification (changed service) | Yes | Breaking a consumer is a production incident with extra steps |
| New SAST critical/high | Yes | Diff-aware; baseline debt doesn't block (`quality-dev/principles/security-testing.md`) |
| Incremental mutation score on core paths | Yes — break-even rule only | Prevents verification decay without repo-wide absolutism |
| E2E smoke (merge queue) | Yes, at Stage 2 | Deploy gate, not PR gate — too slow for Stage 1 |
| New axe critical/serious (UI PRs) | Yes | Deterministic subset of a11y (`quality-dev/principles/accessibility-testing.md`) |
| Full E2E matrix, DAST, load/soak, full mutation | No — scheduled + paged | Too slow/env-bound for merges; red pages owners with SLA |
| Coverage % | **No** | Gating % breeds assertion-free tests; gate verification (mutation) instead — `quality-dev/principles/mutation-testing.md` |
| Baseline security/a11y debt | No — SLA-tracked | Ratchet down monthly; blocking on old debt kills the gate politically |

The meta-rule: **block on what is deterministic, fast, and attributable to this PR; schedule-and-page what is slow, environmental, or repo-global.** Every check that blocks must be one the median developer trusts; each false red spends trust you'll need for a true one.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Pipeline slower than the 10-min budget | Wall-time trend per stage | Shard, demote to Stage 2/3, tighten impact analysis | Budget alarm on stage duration; breach creates a ticket automatically |
| Retry-until-green culture | Retry-pass counts trending up; re-run button folklore | Enforce max-1 retry + auto-quarantine | Retry dashboard reviewed weekly; retry-pass rate is a team KPI, visible |
| Quarantine graveyard | Quarantined count grows, ages exceed expiry | Enforce fix-or-delete at expiry | Expiry breach pages owning team's manager, not QA |
| False green from stale caches | Escaped defect traced to skipped test | Key result caches on full transitive hashes | Stage 2 backstop runs everything; cache-hit audit in postmortems |
| Impact analysis coverage hole | Stage 2 catches what Stage 1 skipped | Fix the dependency-graph blind spot | Weekly diff report: tests Stage 2 failed that Stage 1 never selected |
| Advisory channel nobody reads | Stage 3 findings aging without owners | Convert to paged tickets with SLA | Every Stage 3 red auto-files to the *owning team's* queue, never a shared QA queue |

## Cross-references

- What the stages should contain for a brand-new service: `quality-dev/playbooks/build-a-test-strategy-from-scratch.md` (step 5 produces this doc's tables filled in)
- Ranking existing flakes before setting thresholds: `.claude/agents/ci-flake-history-scanner.md`
- Tool-level parallelism/sharding switches: `quality-dev/tools/playwright.md`, `quality-dev/tools/jest-vitest.md`
