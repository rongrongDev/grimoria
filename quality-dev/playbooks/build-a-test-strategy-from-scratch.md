# Playbook A — Build a Test Strategy From Scratch

**Applies to:** any new feature/service; worked example uses Vitest 3.x, Stryker 8.x, Pact 12+, Playwright 1.5x, k6 1.x · **Last verified:** 2026-07-06
**Standalone:** yes — followable start-to-finish with no other context. Deeper rationale per step is linked, never required.
**Agent-invokable version:** `.claude/skills/test-strategy-planner/SKILL.md` executes this playbook with a defined output contract.

You are designing the test strategy for a new feature or service. Work the seven steps in order; each produces a written artifact. Total effort for a mid-sized service: about a day, most of it step 1 — which is the step teams skip, and the reason their suites test what was easy instead of what was dangerous.

## Step 1 — Risk inventory (the step that decides everything else)

List what the feature can get *wrong*, ranked by likelihood × impact. Interrogate the spec with four questions:

1. **Where does money, credential, or irreversible data change hands?** (payment, entitlement, deletion, email-out)
2. **What computes?** (branching logic, math, thresholds, state machines — bug habitat)
3. **What crosses a boundary?** (other services, third parties, DB, queues — where wiring bugs and drift live)
4. **What happens concurrently?** (double-submits, retries, webhooks racing user actions — every "exactly once" claim goes on this list explicitly)

Artifact: a ranked table — `risk | where it lives | likelihood (H/M/L from churn/novelty/complexity) | impact (H/M/L from blast radius/reversibility)`. Aim for 10–25 rows. Anything H/H is a named test target by the end; L/L rows get consciously *not* tested — write that down too, it's a decision.

## Step 2 — Layer allocation

For each risk row, assign the *lowest* layer that can catch the failure (cheapest, fastest, least flaky — rationale: `quality-dev/principles/test-strategy.md`):

| The failure is in... | Layer |
|---|---|
| Computation/branching | Unit |
| SQL/serialization/middleware/authz enforcement | Integration (real DB) |
| Agreement with another of *our* services | Contract (Pact) |
| Third-party behavior | Fake at boundary + recorded-fixture refresh |
| Race/exactly-once | Concurrency test at unit or integration seam (`quality-dev/principles/concurrency-and-async-testing.md`) |
| The composed user journey (money/credential path only) | E2E — budget: this feature adds 0–2 E2E journeys, not more |
| Appearance | Visual (only if design-system/brand surface) |
| Capacity/latency | Load profile (only if the feature changes traffic shape or adds a hot path) |

Sanity check the resulting shape: if E2E count > integration count, you've inverted the pyramid — re-allocate (the maintenance-trap math: `quality-dev/principles/test-strategy.md`).

## Step 3 — Tooling (2026 defaults; skip debate unless constrained)

Unit/integration: **Vitest** (+ Testcontainers for real DB) — `quality-dev/tools/jest-vitest.md`, `quality-dev/tools/api-testing.md`. Verification strength: **Stryker** incremental on this feature's core paths — `quality-dev/tools/stryker.md`. Cross-service: **Pact** + broker — `quality-dev/tools/pact.md`. E2E: **Playwright** — `quality-dev/tools/playwright.md`. Load: **k6** — `quality-dev/tools/k6.md`. A11y: **axe** hooks in the E2E journeys — `quality-dev/tools/axe-core.md`.

## Step 4 — Data & environment plan

Decide *before writing tests*, because retrofitting hermeticity is 10× the cost: every test creates its own uniquely-keyed data; per-test transaction rollback or unique rows (hierarchy: `quality-dev/principles/contract-and-integration-testing.md`); third parties faked at the network boundary with a scheduled fixture-refresh; no merge-gating test may touch a shared environment. One paragraph, written into the strategy doc.

## Step 5 — CI gating policy

Fill in the stage table (full rationale: `quality-dev/principles/ci-cd-integration.md`): Stage 1 PR ≤10 min — unit + impacted integration + contract (this service) + incremental mutation (break-even gate) + new-violation axe if UI. Stage 2 merge queue — full integration + E2E smoke + `can-i-deploy`. Stage 3 scheduled — full E2E matrix, full mutation trend, load/soak, `--repeat-each=20` admission runs for this feature's new E2E tests. Retry policy: max 1, recorded; auto-quarantine threshold per the standard policy.

## Step 6 — Concurrency & abuse cases (the two lists everyone forgets)

From step 1's question 4: write the N-way concurrent test for every "exactly once" claim (`Promise.all` invariant pattern — `quality-dev/principles/concurrency-and-async-testing.md`). If the feature touches money/auth: abuse cases (negative quantities, replay, state-skipping) and authz-matrix rows (`quality-dev/principles/security-testing.md`, `quality-dev/tools/api-testing.md`).

## Step 7 — Definition of done for the strategy

The strategy doc is complete when: every H/H risk names its test(s) and layer; not-testing decisions are written; the data plan exists; the CI table is filled; E2E additions ≤2 journeys; mutation scope named; someone else (or a reviewing agent) can implement the suite from the doc alone.

---

## Worked example — "Discount Code" service

New microservice: `POST /redemptions` applies a discount code to a cart; codes have expiry, usage caps (global + per-user), minimum-subtotal thresholds; consumed by `checkout-web`; calls `pricing-api` for cart subtotals.

**Step 1 — risks (top rows):**

| # | Risk | Lives in | L | I |
|---|---|---|---|---|
| 1 | Code redeemed past its usage cap under concurrent requests | redemption txn | H | H |
| 2 | Threshold boundary wrong (≥ vs >) — cart at exactly $100 | `eligibility.ts` | H | H |
| 3 | Expiry evaluated in wrong TZ / at midnight boundary | `eligibility.ts` | M | H |
| 4 | `checkout-web` breaks when our response shape changes | API seam | M | H |
| 5 | `pricing-api` timeout mid-redemption → double-apply on retry | client + txn | M | H |
| 6 | Wrong discount math (rounding, stacking) | `discount.ts` | H | M |
| 7 | User A redeems against user B's cart | authz | L | H |
| 8 | Redemption endpoint melts under launch-day promo traffic | capacity | M | M |

**Steps 2+6 — allocation (abridged to show the pattern):**

- Risk 2, 3, 6 → **unit**, `test.each` boundary tables: subtotals `[99.99, 100.00, 100.01]`; expiry at `23:59:59.999Z`/`00:00:00Z` with faked clock (`vi.useFakeTimers`); rounding table incl. half-cent cases. **Mutation scope:** `src/eligibility/**`, `src/discount/**` — these are exactly the `ConditionalBoundary` habitat (`quality-dev/tools/stryker.md`).
- Risk 1 → **integration concurrency test**: seed code with cap 1; `Promise.all` 10 redemptions; assert exactly one 200, nine 409s, one DB row. Runs against real Postgres (Testcontainers) because the fix under test *is* the DB constraint/locking.
- Risk 5 → **integration fault-injection**: fake `pricing-api` succeeds-then-times-out; retry fires with same idempotency key; assert single redemption row. If this test can't be written, the design lacks idempotency keys — that finding goes back to the design, which is the strategy working.
- Risk 4 → **Pact**: `checkout-web` consumer test matching only fields it reads (`discountedTotal`, `code.status`); broker + `can-i-deploy` in both pipelines.
- Risk 7 → **authz matrix rows** in the integration suite (deny cells assert 404 + non-leaky body).
- Journey → **one Playwright E2E**: apply code at checkout, see discounted total, complete purchase (real backend, fake payment provider), axe scan on the states it visits. Admission: `--repeat-each=20` first night.
- Risk 8 → **k6** `ramping-arrival-rate`: derive peak from checkout traffic × promo multiplier 3×; thresholds `p(95)<250ms`, error rate <0.1%; overload + recovery stages; scheduled, not merge-gating.

**Resulting shape:** ~40 unit / ~15 integration / 1 pact / 1 E2E / 1 load profile — pyramid-shaped because the risk lived in computation; a pure-CRUD service would have come out trophy-shaped, and either is correct *when derived from step 1* rather than from ideology.

**Step 5/7 artifacts:** CI table as above with mutation break-even gate on the two core paths; not-testing note: "no visual tests (no brand surface), no Appium (no mobile client), L/L rows 9–14 accepted untested, revisit at first incident."
