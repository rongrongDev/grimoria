# Contract & Integration Testing — verifying the seams without staging roulette

**Applies to:** concept doc; examples use Pact (pact-js 12+), supertest 7.x, Testcontainers · **Last verified:** 2026-07-06
**Standalone:** yes. Definitions: an *integration test* exercises real components together within one deployable (your handler + a real database), with external services faked at the network boundary. A *contract test* verifies that two independently deployed services agree on their interface without deploying either against the other. In *consumer-driven* contract testing (Pact), the consumer records the interactions it relies on; the provider replays them against its real code.
**Related:** `quality-dev/tools/pact.md` (mechanics), `quality-dev/tools/api-testing.md` (HTTP testing), `quality-dev/principles/test-strategy.md` (layer selection), `quality-dev/principles/flakiness.md` (shared-state root causes).

## Why contracts exist: the staging-E2E death spiral

The pattern I've watched kill velocity at three different companies: services multiply → cross-service bugs appear → team adds staging E2E tests → staging needs *every* service healthy at once → any team's bad deploy blocks everyone's pipeline → tests get retried-until-green → real breaks slip through anyway because the suite cried wolf daily. At the worst of these, a 40-service platform had a staging suite with a 9-hour wall time and a *37% first-pass rate*. Deploys queued for days.

Contract tests break the spiral because they verify the *agreement* between two services using only one service at a time: the consumer's CI produces a contract file; the provider's CI verifies it against real provider code. No shared environment, no cross-team blocking, and — the part that changes organizational physics — **the provider learns at PR time which consumer they're about to break, by name and field.**

## What goes where (decision tree)

1. Bug class is "my SQL/serializer/middleware is wrong" → **integration test in my repo** (real DB via Testcontainers; external services faked at HTTP boundary with WireMock/MSW/`nock`).
2. Bug class is "provider changed a field/status/shape I depend on" → **contract test** (Pact).
3. Bug class is "the business flow across services misbehaves even when every pairwise interface is honored" (saga ordering, eventual-consistency windows) → **a few journey E2E tests** in a real environment — this is the residue that genuinely needs one; keep it under a dozen.
4. Bug class is "provider's *semantics* changed but shape didn't" (same field, different meaning/units) → contracts won't catch it; you need provider-side integration tests pinning semantics, plus versioning discipline (below).

Corollary: **contract tests replace most cross-service E2E, not your own integration tests.** Teams that adopt Pact and delete their DB-level integration tests have traded one blind spot for another.

## Consumer-driven contracts: the parts teams get wrong

Mechanics live in `quality-dev/tools/pact.md`; the judgment lives here.

- **Contract only what you use.** The consumer test should declare the fields it actually reads — nothing more. Over-specified contracts (asserting the entire response) turn every harmless provider change into a cross-team fire drill. Use matchers (type/shape matching) not literal-value matching, except where the literal *is* the requirement (status codes, enum values).
- **Provider states are the hermetic seam.** "GET /users/42 returns the user" requires provider state `a user with id 42 exists` — a named hook the provider implements with its own test data. Provider states that hit shared staging databases reintroduce every flakiness mode contracts were meant to remove.
- **`can-i-deploy` is the point of the whole system.** The broker records which contract versions each deployed environment satisfies; a deploy proceeds only if the matrix says all its consumers/providers are compatible. Without the broker + `can-i-deploy` gate, Pact is a folder of JSON nobody reads. See `quality-dev/tools/pact.md`.
- **Contracts are not schemas.** OpenAPI validation ("response matches the spec") is *provider self-consistency*. Contracts are *consumer reliance*. Run both: schema-diff checks catch accidental spec drift cheaply; contracts catch "the spec changed legally but broke me specifically."

## Versioning strategy for breaking API changes

The only pattern that has never burned me: **expand → migrate → contract.**

1. **Expand:** add the new field/endpoint alongside the old. Both are served. Contract tests for old consumers stay green.
2. **Migrate:** consumers move over one by one; each updates its contract. The broker's matrix shows you *exactly* who still depends on the old shape — this replaces the all-hands "is anyone still using X?" email that someone always answers a week late.
3. **Contract (remove):** when the broker shows zero verified consumers relying on the old shape in any deployed environment, remove it. `can-i-deploy` blocks removal until that's true.

Hard version bumps (`/v2/`) are for when the *semantics* change so much that coexistence in one response is incoherent. They cost double maintenance for the whole migration window; prefer expand/contract for field-level change.

**Never** break-and-coordinate ("we'll deploy at the same time"). Simultaneous multi-service deploys fail partially, and the partial state is an outage. I have the incident reviews to prove it.

## Test environment & data management without flakiness

Shared mutable environments are the top flakiness factory in integration testing (taxonomy #2 in `quality-dev/principles/flakiness.md`). The war story: three teams' suites all used staging user `test@test.com`. One suite changed its plan tier as a side effect; the other two failed intermittently for *six weeks* depending on cross-team run timing. Total engineer time burned exceeded the cost of proper isolation by an order of magnitude.

Rules, in priority order:

1. **Own your dependencies in-test:** real DB/queue/cache as ephemeral containers (Testcontainers) per suite; migrations applied at start. Fidelity of a real engine, isolation of a sandbox.
2. **Unique data per test, created by the test:** keys like `order-${testRunId}-${n}`. No test reads state it didn't create. No fixture file of "well-known" IDs.
3. **Isolation mechanism, fastest that works:** per-test transaction rollback (fastest, hides commit-time behavior) → per-test schema/database (slower, honest about commits) → truncate-between-tests (last resort, serializes the suite).
4. **Fake external SaaS at the network boundary** (WireMock/MSW), and pin those fakes with a contract or recorded fixtures refreshed on a schedule — a fake nobody re-verifies drifts into fiction within a quarter.
5. **If a shared environment is unavoidable,** namespace everything by run ID and treat any test reading shared mutable state as a defect in review.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Provider breaks consumer silently | Production 500s/missing-field errors after provider deploy | Add consumer contract for the relied-on fields | Pact broker + `can-i-deploy` gate in *both* pipelines |
| Over-specified contracts (fire-drill per change) | Provider PRs routinely fail verification on fields no one reads | Rewrite with type matchers; contract only consumed fields | Review rule: every matched field must be traceable to consumer code |
| Provider states hitting shared data | Contract verification flaky; fails when staging data mutates | Implement states against per-test seeded data | Provider-state handlers may not reach shared envs (lint on connection strings in test config) |
| Mock drift (fakes diverge from real service) | Integration green, production integration broken | Refresh recorded fixtures; add contract with that provider | Scheduled job re-records/verifies fixtures monthly; drift diff alerts |
| Shared staging data collisions | Cross-team intermittent failures, unreproducible alone | Unique per-run data; remove well-known IDs | Namespacing helper mandatory in fixture lib; grep-gate for `test@test.com`-style literals |
| Simultaneous-deploy breaking change | Partial-deploy outage | Adopt expand→migrate→contract | `can-i-deploy` blocks removal while consumers exist; deprecation dashboard from broker matrix |

## Cross-references

- Running Pact end to end, broker setup, webhook wiring: `quality-dev/tools/pact.md`
- In-process HTTP integration testing patterns: `quality-dev/tools/api-testing.md`
- Planning which seams deserve contracts for a new feature: `.claude/skills/test-strategy-planner/SKILL.md`
- Auditing an inherited suite's integration layer: `quality-dev/playbooks/analyze-an-existing-test-suite.md`
