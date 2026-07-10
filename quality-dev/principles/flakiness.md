# Flakiness — root causes, quarantine judgment, and proving a fix

**Applies to:** tool-agnostic (examples reference Playwright 1.5x, Vitest 3.x) · **Last verified:** 2026-07-06
**Standalone:** yes. Definition used throughout: a test is *flaky* when it both passes and fails against identical code. Corollary that drives everything here: **every flaky test is either a broken test or a broken product.** "It's just flaky" is a refusal to diagnose, not a diagnosis.
**Related:** `.claude/skills/flaky-test-diagnoser/SKILL.md` (single-test diagnosis), `.claude/agents/ci-flake-history-scanner.md` (suite-wide ranking), `quality-dev/principles/concurrency-and-async-testing.md` (deterministic waiting in depth), `quality-dev/principles/ci-cd-integration.md` (gating policy).

The story I want you to carry: I once spent a full week on a checkout test that failed roughly 1 run in 40. Everyone wanted it quarantined; two engineers had already "fixed" it twice by extending timeouts. The real cause was a product race — the order-confirmation email job could read the order row *before* the payment-status update committed, because the two writes happened in separate transactions with no ordering guarantee. The test wasn't flaky. The product was. Customers had been intermittently receiving "payment failed" emails for paid orders for months; support had a macro for it. **The flaky test was the only part of the system telling the truth.** Never let the quarantine reflex delete your best production-bug detector.

## Root-cause taxonomy

Diagnose by matching the *failure signature* before touching the test. In ~20 years of triage these six cover >95%:

### 1. Async races in the test (assert before steady state)
The test checks the UI/API before the system finished reacting. Signature: fails more on slow CI than locally; screenshots show the *previous* state; error is "element not found" / "expected X, got stale Y".
**Fix:** wait on *observable state*, never on time — web-first retrying assertions (`expect(locator).toBeVisible()`), wait for the specific network response or emitted event, then assert. Every `sleep(2000)` is a race you scheduled for a slower day. Depth: `quality-dev/principles/concurrency-and-async-testing.md`.

### 2. Shared state between tests
Two tests touch the same DB row, global singleton, static mutable, env var, or filesystem path. Signature: fails only in full-suite runs, never alone; failure pairs correlate with which tests share a worker.
**Fix:** hermetic data — every test creates its own uniquely-keyed entities (`user-${testId}-${Date.now()}`) and cleans up or uses per-test transactions/schemas. Grep your fixtures for hardcoded IDs and shared "test@test.com" accounts; each one is a collision waiting for parallelism.

### 3. Time and clock dependence
`Date.now()`, timezones, DST transitions, month boundaries, TTL expiry mid-test. Signature: fails at specific wall-clock times — the suite that "only fails in the nightly run" is often literally failing *at night* (a date-boundary bug), or in the last days of a month.
**Fix:** inject/fake the clock (`vi.useFakeTimers()`, Playwright `page.clock`); pin TZ in CI (`TZ=UTC`) *and* run one job in a non-UTC zone to catch TZ assumptions.

### 4. Order dependence
Test B passes only after test A ran (A seeds state B silently consumes) — or only when A *didn't* run. Signature: appears the week you enable parallelism or shuffling; bisectable by running pairs.
**Fix:** find the leaked state (run B alone; diff environment before/after A), make B self-sufficient. **Prevention that actually works:** run the suite in random order permanently (`--shuffle` / `sequence.shuffle: true`) so order bugs die young instead of accumulating for the day you shard.

### 5. Infrastructure & environment
CI resource contention (CPU-throttled containers stretch timings 5–10×), cold starts, DNS hiccups, out-of-disk, port collisions between parallel workers. Signature: failures cluster by CI node/time-of-day and cut *across* unrelated tests simultaneously.
**Fix:** fix the environment, not the tests — dedicated resources for timing-sensitive stages, dynamic port allocation, container health checks before the suite starts. Detection tip: when >5 unrelated tests fail in one run, suspect the runner before any test.

### 6. Genuine product non-determinism — the valuable kind
Race conditions, missing idempotency, unordered event delivery in the product itself. Signature: the failure state is *user-visible wrongness* (wrong total, duplicate record, missing email), not a locator timeout; reproducible under load/stress.
**Fix:** file a product bug and *keep the test failing-capable*. This is the checkout-email story above. If you can't distinguish signature 1 from 6, force the interleaving deliberately (see `quality-dev/principles/concurrency-and-async-testing.md`) — a test race disappears when you wait correctly; a product race gets *worse* when you add load.

## Quarantine vs fix-now — the decision tree

Quarantine (remove from merge-blocking, keep running & tracked) is a tourniquet, not a treatment.

1. **Does the failure signature look like taxonomy #6 (product race)?** → **Fix now.** Never quarantine; you'd be silencing a production-incident early warning.
2. **Does the test guard a money/credential path (checkout, auth, payout)?** → **Fix now**, today, whoever is on rotation. A flaky guard on a critical path is worse than none — it trains people to override it. I watched a team merge through a red checkout test ("it's the flaky one") the same week the red was real; the outage postmortem line item was "alarm fatigue, self-inflicted."
3. **Is the same root cause hitting multiple tests (shared fixture, infra)?** → **Fix the root cause now**; it's amortized across every affected test.
4. **Otherwise** → quarantine is acceptable **only with all four**: (a) named owner, (b) expiry date ≤2 weeks, (c) ticket with the failure signature captured (logs, trace, seed), (d) it keeps running non-blocking so you retain signal. On expiry: fixed or deleted — a quarantine list that only grows is a slow-motion suite deletion.

## Proving a fix actually worked

"Re-ran it, it's green" proves nothing — a 5%-flaky test passes 20 runs in a row 36% of the time. Do the arithmetic before declaring victory:

- To be ~95% confident you fixed a flake with failure rate *p*, you need *n* consecutive passes where (1−p)ⁿ ≤ 0.05 → **n ≈ 3/p**. A 5% flake needs ~60 clean runs; a 1% flake needs ~300.
- Run them cheaply: `npx playwright test <file> --repeat-each=60 --workers=4`, or `vitest --retry=0` in a loop. Minutes of machine time; do not skip.
- **Reproduce first, then fix.** If you can't make it fail on demand (stress the CPU: `taskset`/`cpulimit` or Playwright's `--headed` on a loaded machine; force the interleaving; restore the failing seed), you cannot know your fix touched the cause. A fix for an unreproduced failure is a hypothesis wearing a merge badge.
- Verify **in the conditions that failed**: same parallelism, same CI runner class, same shard mix. A test "fixed" locally on an M-series laptop has proven nothing about a 2-vCPU CI container.
- Record before/after failure rate in the ticket. This is also how you catch the fake fixes — the timeout extension "fixes" that resurface in a month.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Sleeps papering over races | grep for `waitForTimeout`, `sleep`, `setTimeout` in tests | Replace with event/predicate waits | Lint ban on sleep APIs in test dirs (ESLint `no-restricted-syntax`); PR bot flags additions |
| Shared test data collisions | Failures only in parallel/full runs; hardcoded IDs in fixtures | Unique per-test data, per-test transaction/schema | Fixture helpers that auto-generate keys; review rule: no literal IDs in tests |
| Order dependence accumulating | Enable shuffle in a canary CI job; watch what breaks | Make each failing test self-sufficient | Shuffle permanently on; new tests born into random order |
| Retry masking real signal | Retry-pass rate per test trending up | Diagnose top offenders via taxonomy above | Retries allowed (max 1) but every retry-pass is recorded and dashboarded; see `quality-dev/principles/ci-cd-integration.md` |
| Quarantine as graveyard | Quarantine list size over time | Expiry enforcement: fix or delete | Weekly report: quarantined count + age; SLA breach pages the owning team, not QA |
| Infra flake blamed on tests | >5 unrelated failures per run, clustering by node | Fix runner resources/ports/disk | Runner health dashboard; suite aborts early on environment preflight failure |

## Suite-wide flake work

Ranking *which* tests to attack first needs CI history mining — hundreds of runs, pass/fail per test per run, retry outcomes. That is bulk work that would drown a working context: dispatch the `ci-flake-history-scanner` subagent (`.claude/agents/ci-flake-history-scanner.md`) and act on its ranked report. For one known-flaky test, use the `flaky-test-diagnoser` skill instead — it walks exactly the taxonomy and proof-of-fix protocol above.
