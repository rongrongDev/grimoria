# Test Data Management

**Stamped:** 2026-07-06 · Tool-agnostic; code sketches in TypeScript. Companion to `parallelization-and-sharding.md` — data discipline is where hermeticity is won or lost.

Test data is where automation suites rot fastest, because the failure is invisible at write time: the test that reads "the" seeded user works perfectly for six months, then the parallelization project arrives and 300 tests are discovered to be secretly one test with 300 assertions against shared state. I've led that excavation twice. Cheaper to never dig the hole.

## Fixtures vs factories vs seeded databases

```
What kind of data is it?
├─ Immutable reference data the app needs to function
│  (countries, currencies, plan catalog, permission definitions)
│    → SEED it, once, versioned with the app's migrations.
│      Tests may READ it freely, never mutate it.
├─ Entities the test reads AND mutates (users, orders, carts, documents)
│    → FACTORY, unique per test. Non-negotiable for parallel safety.
├─ Large realistic datasets for search/pagination/reporting tests
│    → seeded snapshot, treated as immutable + factory-created marker
│      records for anything the test asserts on specifically
│      (assert on YOUR needle, not on properties of the shared haystack)
└─ Static fixture files (JSON blobs checked into the repo)
     → smallest role: request/response payloads, upload artifacts.
       NEVER as "the test user" — fixed values are shared state.
```

**Factory rules that make the difference:**

- **Unique by construction:** `makeUser()` bakes in a UUID/timestamp: `user-8f3a2@test.example`. Uniqueness isn't a convention to remember; it's impossible to violate.
- **Sensible defaults, explicit overrides:** `makeUser({plan: 'pro'})` — the test states only what it *cares about*. This is also documentation: reading the call tells you exactly which attributes matter to this test.
- **Create through the app's own API** (or service layer), not raw SQL inserts. Raw inserts bypass invariants and silently rot when the schema evolves — the data is subtly illegal and you debug "impossible" app behavior. Raw SQL is a last resort for data no API creates, and it lives in one audited module. (Exception that proves the rule: bulk-seeding 100k rows for a pagination test via the API is too slow — use SQL, but validate the shape against the API-created equivalent in the factory's own test.)
- **Factories are code with an owner.** When the domain adds a required field, the factory absorbs it in one place. That's the entire point.

## Cleanup discipline: prefer never needing it

Ranked strategies — each one strictly harder to operate than the last:

1. **Unique data + periodic garbage collection.** Tests create uniquely-named entities and *don't clean up synchronously*; a scheduled job purges test entities older than 24h (identifiable by construction: the `@test.example` domain, a `test-` prefix, a tagging field). Pros: no teardown to flake, no ordering constraints, crashes leave no poison. This is my default and I defend it against tidiness instincts: teardown code is code that runs at the worst moment (after a failure, on a broken page/session) and its failures cascade into the *next* test's mysterious one.
2. **Transactional rollback** — gold standard where it applies (API/integration tests owning the DB connection). Rarely applicable to E2E through a real app.
3. **Explicit teardown** — when the entity is globally visible and harmful if leaked (a webhook subscription that fires on shared infra, a DNS record, a live payment method). Must be: idempotent, failure-tolerant (`try/finally` semantics — Playwright fixture teardown, `afterEach` that can't throw past itself), and *assumed to sometimes not run* (crashed runner) — so pair it with GC anyway.
4. **Reset-the-world** (DB restore between tests/suites) — serializes everything; only for small suites or single-tenant desktop apps.

**Environment hygiene corollary:** if your shared staging env has years of test debris, pagination/search tests are already asserting against garbage. GC + unique-marker assertions (assert on your needle) is the way out; "let's wipe staging" never survives contact with the other six teams using it.

## Hermetic vs shared-environment dependencies

Full hermeticity (test owns app instance + DB + mocked third parties) is the ideal from `core-principles.md` law 5; a shared staging environment with other teams deploying mid-run is the common reality. The engineering posture:

- **Own your data always** (factories) — achievable in any environment.
- **Mock third parties at the network boundary** for the blocking suite (Playwright `page.route`/HAR, WireMock/MSW at the backend edge): payment, email, geolocation. Real-integration coverage is a separate, smaller, *non-blocking* suite — third-party sandbox flakiness must not gate merges. (Which risks deserve real-integration coverage: `@quality-dev/` strategy territory.)
- **Ephemeral environments** (per-PR containerized app+DB) are the endgame and have gotten cheap; if your platform team offers them, take them. The suite design above (factories, GC, boundary mocks) ports unchanged — that's deliberate. Design for hermetic even while running on shared.

## Test-order dependence

The failure: test B passes only because test A ran first (A created the data / warmed the cache / left the right page open). It's invisible until you shuffle, shard, or delete test A — then B fails "for no reason," usually in someone else's PR.

- **Detection is execution:** nightly **random-order, max-parallelism** run (same one as `parallelization-and-sharding.md` — it catches both hazards). `fullyParallel: true` in Playwright makes even same-file tests independent-or-die. When the nightly reds arrive, each is an order dependence with a specific missing setup — fix by giving the test its own data, not by pinning order.
- **Never fix with execution order** (`test.describe.serial`, alphabetical naming tricks, "run smoke first"). Serial mode is for genuinely-sequential *journeys* (multi-step wizard where steps are the scenario), not for data dependencies. Every serial block is a parallelism tax; budget them.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Shared "the test user" | Grep for hardcoded emails/IDs/credentials in specs; flakes correlate with parallelism | Factory per test; account pool for expensive identities | Factories are the only sanctioned entity source; scanner flags literal credentials (`agents/suite-wide-antipattern-scanner.md`) |
| Teardown flake cascade | Failure clusters where test N's failure poisons N+1 (worker-serial neighbors); teardown exceptions in logs | Convert to unique-data + GC; make remaining teardown idempotent and exception-safe | Prefer strategy 1 by default; review gate on new `afterEach` cleanup code |
| Order dependence | Random-order nightly fails; test fails when its file is sharded apart | Self-sufficient setup via factories | `fullyParallel` on; serial blocks require justification tag |
| Raw-SQL data rot | "Impossible" app states in traces; factory data missing new required fields | Route factory through API; single audited SQL module | Factory unit-tests compare SQL-path vs API-path shape |
| Shared-sandbox collision (Stripe, email) | Rate-limit errors; cross-test email assertions | Unique idempotency keys, `test+{uuid}@` recipients, per-worker keys | Boundary mocks in blocking suite; real integrations quarantined to non-blocking |
| Staging data drift breaks assumptions | Tests assert on counts/contents of shared collections | Assert on test-created markers only | Review rule: no assertions on aggregate properties of data the test didn't create |

## Cross-references

- Concurrency hazards this feeds: `parallelization-and-sharding.md`
- Fixture mechanics (Playwright `test.extend`, worker-scoped data): `frameworks/playwright/README.md`
- Which layer should own a given verification (maybe it's not E2E at all): `@quality-dev/` test-strategy material
