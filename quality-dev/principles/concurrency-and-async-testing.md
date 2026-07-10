# Concurrency & Async Testing — forcing the race instead of fearing it

**Applies to:** concept doc; examples use Vitest 3.x fake timers, Playwright 1.5x, Node 22 · **Last verified:** 2026-07-06
**Standalone:** yes. Definitions: a *race condition* is behavior that depends on the relative timing of concurrent operations. *Deterministic waiting* means a test proceeds when an observable condition holds, never after a fixed delay. *Idempotency* means doing an operation twice has the same effect as once.
**Related:** `quality-dev/principles/flakiness.md` (race conditions as flake cause #1 and #6), `quality-dev/tools/jest-vitest.md` (fake timers mechanics), `quality-dev/tools/playwright.md` (web-first assertions).

## The stance: races are test subjects, not test hazards

Most teams treat concurrency as something tests must *survive*. The senior move is to treat it as something tests must *provoke*. A race your suite never forces is a race production will force for you — under load, at 2 a.m. The double-submit story that trained me: a payments form guarded by a `disabled` flag set in the click handler. Every test clicked once. A user with a laggy connection double-clicked between render and re-render, and two charges went out. The fix took an hour. Finding it in production took a chargeback dispute. A test that *deliberately* fires the action twice concurrently would have cost five lines.

## Part 1 — Deterministic waiting: never sleep, wait on state

Arbitrary sleeps (`sleep(2000)`, `waitForTimeout`, `setTimeout`-then-assert) are the single most common test defect I've seen across two decades. Each one encodes the claim "this operation always finishes within N ms on every machine forever." CI containers with 2 throttled vCPUs falsify that claim weekly. And the failure tax is double: too short = flaky, too long = every run pays the full delay even when the system was ready in 50 ms. A suite with 400 one-second sleeps burns ~7 minutes of pure dead air per run.

**The replacement hierarchy — use the highest one available:**

1. **Retrying (web-first) assertions:** `await expect(locator).toBeVisible()` / `toHaveText(...)` — polls until the condition holds or times out. The assertion *is* the wait.
2. **Wait for the triggering event, not its echo:** await the specific network response (`page.waitForResponse(r => r.url().includes('/api/orders') && r.status() === 201)`), the emitted domain event, the promise the action returns — then assert.
3. **Poll a predicate with timeout** when no event surface exists: `await waitFor(() => queue.depth() === 0)`. Bounded, condition-based, self-documenting.
4. **Fake the clock** when the delay is *the code's own logic* (debounce, TTL, retry backoff): advance virtual time (`vi.advanceTimersByTime(30_000)`) instead of living it. A 30-second backoff test should run in milliseconds.

**Rule with no exceptions worth honoring:** a sleep in a test is either a missing event surface in the product (fix the product: expose a signal/health/status), or laziness. Lint-ban sleep APIs in test directories (`no-restricted-syntax`) so the debate never re-litigates per PR — this matters double for AI-written tests; see `quality-dev/orchestration/README.md`, failure mode #2.

## Part 2 — Testing races deliberately

You cannot assert the absence of races by running once. You force the interleaving:

**Force concurrent execution at the API seam.** The cheapest, highest-yield race test: fire the same operation N ways at once and assert the invariant —

```ts
const results = await Promise.all(
  Array.from({ length: 10 }, () => api.redeemCoupon(userId, 'SAVE20'))
);
expect(results.filter(r => r.ok)).toHaveLength(1);        // exactly one wins
expect(await db.redemptions.count({ userId })).toBe(1);   // and only one effect
```
Run this against every "exactly once" claim in the system: coupon redemption, seat booking, balance deduction, unique-username registration. In new codebases this test fails on first run more often than not.

**Control interleavings with barriers.** When "concurrent-ish" isn't enough, hold both operations at the critical point and release deliberately: gate the mocked dependency on a manually-resolved promise (a one-line latch), start operation A, start operation B, release in the order that exposes the bug (B's read before A's write). This turns "fails 1 in 40 runs" into "fails every run" — which is the precondition for both fixing it and proving the fix (`quality-dev/principles/flakiness.md`, proof-of-fix protocol).

**Test the eventual-consistency window, not just the destination.** For async pipelines (event → projection → notification), assert both that the system converges (poll predicate with timeout) *and* that the intermediate state is acceptable — the checkout-email bug in `quality-dev/principles/flakiness.md` lived entirely in the window between two commits.

**UI double-fire tests.** Click submit twice fast (no waiting between), assert one request left (`page.route` counting) and one side effect exists. Same for Enter-key + click combos. Five lines each; catches the whole double-submit family.

## Part 3 — Retry, backoff, and idempotency

Retry logic is code that runs rarely and fails expensively, which is exactly the profile that deserves tests — and it's untestable without fake clocks and fault injection.

- **Backoff schedule:** with fake timers, make the dependency fail twice then succeed. Assert the attempt count *and the actual delays* (capture timestamps of calls in virtual time; expect 1s, 2s, 4s ± jitter bounds). A suite that asserts "eventually succeeded" but not the schedule will happily ship a retry storm — I've seen an unjittered 100 ms fixed retry take down the dependency it was retrying, turning a blip into an outage.
- **Retry gives up:** assert that after max attempts the operation surfaces a terminal error and *stops*. Infinite-retry bugs hide because the happy path always rescues the test.
- **Retries are only safe if the operation is idempotent** — so test that pair together: make the dependency succeed but *report* failure (timeout after commit — the classic), let the retry fire, assert the effect happened once. This requires an idempotency key mechanism; if the test can't be written, the production design is missing one, and that's the finding.
- **Non-determinism in the product's own randomness** (jitter, sampling): inject the RNG seed. Unseeded randomness in code under test is unfalsifiable behavior.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Sleeps encoding timing assumptions | grep `waitForTimeout|sleep\(|setTimeout` in test dirs; suite dead-air time | Replace via hierarchy above | ESLint `no-restricted-syntax` ban in test paths; CI grep-gate |
| "Exactly once" never tested concurrently | No `Promise.all`-style race test on redemption/booking/dedup paths | Add N-way concurrent invariant test per claim | Strategy checklist: every uniqueness/exactly-once requirement names its race test (`.claude/skills/test-strategy-planner`) |
| Real time in backoff/TTL tests | Test wall time > 1s; timeouts in CI | Fake timers + virtual-time advancement | Test-time budget lint (fail tests exceeding 2s locally); review flag on `new Date()`/`Date.now()` in logic under test without injection |
| Retry storm shipped | Retry tests assert success only, never schedule/give-up | Assert delays, jitter bounds, terminal behavior | Code review pairing rule: retry PRs require schedule assertions |
| Double-submit family | No UI test fires an action twice | Add double-fire tests on all money/mutation buttons | Component-library-level guard (idempotent submit hook) + one test per money form |
| Convergence assumed, window untested | Async pipeline tests only assert final state | Add intermediate-state assertions/window tests | Design review question: "what is visible mid-flight, and who sees it?" |

## Cross-references

- Was that flake a test race or a product race? Taxonomy and signatures: `quality-dev/principles/flakiness.md` (#1 vs #6); single-test workup: `.claude/skills/flaky-test-diagnoser/SKILL.md`.
- Fake-timer sharp edges (microtasks vs macrotasks, `advanceTimersByTimeAsync`): `quality-dev/tools/jest-vitest.md`.
- Playwright's auto-waiting model and its limits: `quality-dev/tools/playwright.md`.
