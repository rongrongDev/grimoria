# Testing — What to Test, Where, and Why

**Scope:** framework-agnostic. Framework deltas: `frameworks/<x>/testing.md`. **Date:** 2026-07-06.
**Operationalized by:** the `test-strategy-planner` skill (plans a strategy for a feature) and `react-code-reviewer` (checks tests in diffs).

## The one-sentence philosophy

Tests exist to let you **change code with confidence**, not to prove you wrote it. Every test you add is a bet that its failure will someday tell you something true; a test that fails when the code is fine (brittle) or passes when the code is broken (hollow) is negative-value inventory.

## Layer boundaries — where a given check belongs

Use this decision tree, not a coverage target:

1. **Is it pure logic** (given inputs → outputs, no I/O)? → **Unit test.** Pricing math, date logic, parsers, reducers, validation rules. Fast, exhaustive, edge-case-heavy. Tools: Vitest / Jest.
2. **Is it behavior a user or caller observes across several of your units** (component + state + fetch layer; route handler + db)? → **Integration test.** Render the component and interact with it (Testing Library); call the route with a real (containerized) database (Testcontainers). This is where most of your budget goes — it's the layer with the best defect-detection-per-maintenance-dollar.
3. **Is it a money-path workflow across the deployed stack** (signup, checkout, login)? → **E2E test.** Playwright (default) or Cypress. Keep the count small — single digits to low tens. Every e2e test is a standing tax: slow, flaky-prone, environment-hungry.
4. **Is it an agreement between separately-deployed services** (frontend ↔ backend team, service ↔ service)? → **Contract test.** Pact, or OpenAPI/GraphQL schema validated in both repos' CI. E2E across team boundaries is how you get "staging is down so nobody can merge."

**The stance:** closer to the trophy than the pyramid — integration-heavy — but the real rule is *test at the lowest layer that can actually catch the failure mode you're worried about*. A rounding bug can't be caught cheaper than a unit test; a "button doesn't actually submit because the handler was never wired" bug can't be caught by any unit test at all.

### What belongs where — quick table

| Concern | Layer | Why not elsewhere |
|---|---|---|
| Edge cases in business logic | Unit | E2E per edge case is O(minutes) each |
| Component renders + responds to interaction | Integration (Testing Library) | Snapshot tests assert markup, not behavior |
| API handler auth/validation/status codes | Integration (real HTTP, containerized DB) | Mocked-db tests pass while SQL is broken |
| "Checkout works" | E2E | Only layer that catches wiring/config/deploy issues |
| Backend didn't break the mobile app | Contract | E2E across teams couples deploys |
| A11y regressions | Integration (jest-axe / axe-core in Playwright) | Manual audits don't run on every PR |

## Failure modes → detection → fix → prevention

### 1. Hollow suite (high coverage, catches nothing)
- **Failure:** 90% line coverage; a real bug ships anyway. Tests execute code but assert little ("renders without crashing"), or mock so much they test the mocks.
- **Detection:** **Mutation testing — Stryker Mutator.** Run it on your core business-logic packages. It mutates your code (`>=` → `>`, delete statement) and checks whether tests notice.
- **What score is meaningful:** Mutation score on *core logic* (pricing, auth, state machines) should be 85%+; below ~60% your suite is decorative there. Whole-repo mutation score is a **vanity metric** — don't chase it across UI glue and config; the runtime cost is brutal and surviving mutants in trivial code are noise. Scope Stryker to the directories where bugs cost money.
- **Fix:** Rewrite the worst offenders to assert observable behavior (what the user/caller sees), not implementation calls.
- **Prevention:** CI gate: Stryker on core packages (incremental mode on changed files to keep it fast). Review rule: a test with no meaningful assertion is a change request.

### 2. Flaky tests
- **Failure:** Suite fails ~5% of runs on unchanged code. Team learns to click "re-run" — at which point the suite catches *nothing*, because every real failure is assumed flaky. This is the war story: I watched a team ship a broken payment flow because the e2e failure that caught it had been red intermittently for three weeks and everyone's thumb was trained on retry.
- **Detection:** Track retry rates in CI (most CI systems report this). Any test retried >1% of runs goes in quarantine *with an owner and a deadline*.
- **Fix:** Flakiness is an unhandled ordering assumption. The big four: real timers (use fake timers or Playwright's auto-waiting, never `sleep(500)`), real network (mock at the network boundary with MSW, not at the module boundary), shared state between tests (fresh db schema/transaction rollback per test), animations (disable in test config).
- **Prevention:** Ban `sleep`/arbitrary waits in review. New e2e tests must pass 10x locally (`playwright test --repeat-each=10`) before merge.

### 3. Mock rot
- **Failure:** Tests mock `api.getUser` to return a shape the real API stopped sending a year ago. Suite green, production broken.
- **Detection:** A production incident your suite "covered." Grep for hand-written response fixtures older than the API's last breaking change.
- **Fix/Prevention:** Generate mocks from the source of truth: MSW handlers typed from the OpenAPI/GraphQL schema, or contract tests (Pact) that verify fixtures against the real provider in *its* CI. Rule: **mock at the network boundary, not the module boundary** — module mocks couple tests to your import graph and rot invisibly.

### 4. Test-induced design damage
- **Failure:** Code contorted for testability — everything injectable, interfaces with one implementation, tests asserting private call sequences. Refactors break 40 tests while behavior is unchanged.
- **Detection:** Ratio check: if renaming a private method breaks tests, they're asserting implementation.
- **Fix:** Test through public seams (HTTP, rendered DOM, exported functions). Delete tests that only re-state the implementation.
- **Prevention:** Review question: "would this test still pass if we rewrote the internals correctly?" If no, push back.

## Contract testing for APIs — the 20% that gives 80%

Full Pact broker setups are heavy; most teams get the value cheaper:

1. Single source of schema truth (OpenAPI spec, GraphQL schema, or shared Zod schemas in a monorepo package).
2. Provider CI validates responses against the schema (e.g., express-openapi-validator in test mode; GraphQL does this natively).
3. Consumer generates types *and MSW mocks* from that same schema (openapi-typescript + msw-auto-mock, or GraphQL codegen).
4. Breaking-change detection on the schema file in CI (`oasdiff` / `graphql-inspector`) — a breaking diff fails the build unless explicitly versioned.

Reach for real Pact when consumers and providers deploy independently across teams *and* the schema alone can't capture the semantics you rely on (e.g., "this field is only null before activation").

## CI gates — the minimum set

- Unit + integration on every PR, < 10 minutes wall clock or people stop waiting for it.
- E2E money paths on every PR if < 5 min, else on merge to main + hourly on a schedule against staging.
- Stryker incremental on changed core-logic files.
- One `axe` pass per key page/component state (see `principles/accessibility.md`).
- Coverage: use as a *ratchet against decline* (fail if a PR drops coverage), never as a target to climb — targets breed hollow tests (failure mode #1).
