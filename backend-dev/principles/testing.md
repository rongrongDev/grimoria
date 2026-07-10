# Testing Backend Systems — Confidence Per Minute of CI

**Last reviewed:** 2026-07-06. Tooling verified against: Testcontainers 1.20+/4.x (Java/others), Pact 4.x, Stryker 8.x, mutmut 3.x, PIT 1.17+.
**Related:** [data-layer.md](data-layer.md) (what to test about transactions), [concurrency.md](concurrency.md) (hammer tests), stack docs for per-runtime tooling.

The purpose of a test suite is not coverage; it's **the ability to deploy on a Friday afternoon without watching the graphs.** Optimize for confidence per minute of CI time. Most backend suites I've inherited had the opposite shape: thousands of mock-heavy unit tests that pass while production burns, because the bugs live precisely in the seams the mocks papered over.

---

## 1. The boundary decision tree — unit vs integration vs contract vs e2e

**The defining question: what breaks in *your* systems, and which test tier is the cheapest one that catches it?** Backend bugs cluster in: SQL semantics, transaction boundaries, serialization, queue behavior, and cross-service contract drift. Note what's *not* on that list: pure in-process logic. Budget accordingly.

- **Unit tests** (in-process, no I/O, milliseconds): for *logic* — pricing rules, state machines, parsers, permission calculators. If a function is worth unit-testing, it's worth extracting so it needs no mocks: pull decisions out of I/O-doing code ("functional core, imperative shell"). **A unit test with five mocks is a test of your mocking library.** The classic failure: `mockRepo.save.mockResolvedValue(ok)` — test green, while the real `save` violates a unique constraint. Mocks encode your *assumptions* about a dependency; they can never falsify them.
- **Integration tests** (real DB, real queue, real cache via Testcontainers — see §2): for everything that touches I/O. This is the **workhorse tier for backend** — repository methods against real Postgres, handler + middleware + serialization through a real HTTP layer, consumer idempotency against a real broker. Target: every endpoint has at least happy-path + main-error-path here.
- **Contract tests** (Pact or equivalent, §3): for the seams *between* separately-deployed services. They answer "can consumer v47 talk to provider v112?" without spinning up either fleet.
- **End-to-end** (whole system deployed): a **handful** of critical journeys (signup, checkout, the money path). E2E suites grow until they're a flaky 45-minute tax nobody trusts; when an e2e test fails three times for infra reasons per real catch, people click re-run on real failures too. Cap the count; treat flakes as P1 defects of the suite itself.

Mock **only**: third-party SaaS you can't containerize (use their sandbox in a nightly run + a recorded/verified fake in CI), clocks, randomness, and genuinely slow/expensive things. Never mock what Testcontainers can give you for real.

## 2. Testcontainers — real infrastructure per test run

Run the *actual* Postgres/Redis/Kafka/LocalStack image your production uses, started by the test framework, destroyed after. This is the single biggest upgrade most backend suites can make, because it makes an entire bug class *testable*:

- Does this migration actually apply? (Run all migrations in CI against the container — this is your migration test, and it catches the `NOT NULL` on a column with existing nulls before production does.)
- Does `ON CONFLICT` do what the ORM promised? Does the unique constraint fire? Does the transaction actually roll back?
- Does the consumer handle a *real* redelivery from a real broker?

Practices that keep it fast and honest:
- **Pin the image version to production's** (`postgres:16.4`, not `postgres:latest`). A suite that's green on PG17 while prod runs PG15 is testing a different database.
- One container per suite (not per test), cleaned between tests by truncation or per-test schemas — container startup is seconds, truncation is milliseconds.
- **Do not wrap each test in a rolled-back transaction if the code under test manages transactions** — you'll mask commit/rollback bugs and `SERIALIZABLE` behavior, and code that opens its own transaction inside yours behaves differently. Truncate instead; it's honest.
- Seed data through the same code paths production uses (factories calling real repositories), not raw fixture SQL that drifts from the schema.

## 3. Contract testing — the tier that replaces "integration environment" pain

The problem it solves: provider team changes a field, consumer team finds out in staging (or production) a week later. The shared staging environment where everyone integrates is perpetually broken and tells you nothing about *which* pair of versions is incompatible.

Consumer-driven contracts (Pact model): the **consumer** writes tests declaring the requests it makes and the response shape it relies on → generates a contract file → the **provider's CI replays** those against the real provider code and fails the build on violation. With a broker + `can-i-deploy`, "is it safe to deploy provider v112 while consumers v47 and v48 are live?" becomes a queryable fact instead of a meeting.

Hard-won guidance:
- Contract tests verify **shape and semantics of the seam** ("given order 42 exists, GET returns id/status/total of these types") — not provider business logic. Keep provider states few and coarse; a hundred fine-grained states means you've re-written the provider's unit suite in the consumer's repo.
- The consumer should assert only fields it **actually uses** (loose matchers on the rest), or every benign provider addition breaks contracts and the whole program collapses into "we stopped running Pact because it was always red" — the most common way contract testing dies (usually within a year; guard against it in quarterly suite review).
- If one team owns both services, skip Pact; a shared OpenAPI spec + schema-validation tests + `oasdiff` in CI ([api-design.md](api-design.md)) gives 80% of the value at 20% of the ceremony. For gRPC, `buf breaking` is the analogue.
- Event/queue seams need contracts too (Pact supports message pacts; schema registry with compatibility rules is the Kafka-native equivalent — [stacks/messaging.md](../stacks/messaging.md)).

## 4. Mutation testing — auditing the auditors

Coverage measures *execution*, not *verification*: `expect(fn(x)).toBeDefined()` after calling everything = 90% coverage, zero assertions of consequence. Mutation testing seeds real bugs (flip `<` to `<=`, delete a statement, negate a condition) and checks your tests **fail**. Surviving mutants = code where a bug would ship undetected.

- Tools: **Stryker** (JS/TS), **mutmut** or cosmic-ray (Python), **PIT** (JVM), `go-mutesting`/community tools (Go, weakest ecosystem here).
- **What score means something:** don't chase a global number. Meaningful use: (a) run on the *critical modules* (money, authz, state machines) and drive **those** toward 85–95% killed; (b) run on the diff in CI (Stryker/PIT incremental modes) so new code meets a bar; global runs are too slow for CI and too noisy for goals. A global score of 60% is neither good nor bad — a *payments module* at 60% is a finding.
- Read survivors as a code review of your tests: each one is a specific missing assertion. The first run on a "well-tested" codebase is humbling — schedule it before the incident does.

## 5. What backend tests must cover that they usually don't

The gap list I check first on any codebase (the `analyze-existing-service` guide uses this):

1. **Concurrency:** every invariant-bearing endpoint gets a hammer test — 50 parallel requests, assert the invariant held (no oversell, no double-spend). See [concurrency.md](concurrency.md). Sequential tests cannot catch the bug class that causes the worst incidents.
2. **Idempotency/redelivery:** deliver every consumer message twice (and kill the worker mid-handler once); assert single effect. [async-work.md](async-work.md).
3. **Crash windows:** kill the process between the two writes of any dual-write (or verify the outbox makes the window not exist).
4. **Failure paths of dependencies:** what does the handler return when the DB is down, the cache times out, the downstream 503s? Inject failure (Testcontainers pause, toxiproxy) and assert *designed* degradation, not a stack trace to the user. ([observability.md](observability.md) on what "designed" means.)
5. **Migration reversibility:** CI applies `up`, runs the *previous* release's test suite against the new schema (expand/contract compliance — [data-layer.md](data-layer.md) §1).
6. **AuthZ matrix:** for each route × role × ownership combination, assert allow/deny — table-driven, generated from the route list so a new unannotated route fails the test ([security.md](security.md) §1).
7. **Clock edges** where relevant: injected clock, tests at DST transitions, month ends, leap years. `datetime.now()` hard-calls are a test-design smell.

## 6. Suite operations

- **Flaky tests are defects with a deadline:** quarantine within a day (visibly, with a ticket), fix or delete within a sprint. A suite people re-run is a suite people ignore, and it will eventually ignore a real regression at the worst time. Track re-run rate as a suite health metric.
- Total CI budget: keep the *blocking* path under ~10 minutes (unit + integration on the diff + contracts); push mutation runs, full e2e, and nightly sandbox tests off the blocking path.
- Tests are code: reviewed for readability, deduplicated via builders/factories, deleted when the behavior they pin is deleted. A test nobody can understand is a test somebody will delete blindly during the incident when it finally fires.

## Failure-mode index

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Green suite, prod bug in the seam | Bugs cluster in DB/queue interactions | Move tier: mock → Testcontainers integration | "Never mock what you can containerize" as review rule |
| Contract drift between services | Consumer breaks on provider deploy | Pact/`oasdiff`/`buf breaking` in provider CI | `can-i-deploy` gate before provider release |
| High coverage, no verification | Mutation run: survivors in critical modules | Add the missing assertions mutants point to | Incremental mutation gate on diffs to critical paths |
| Race bugs unreachable by tests | Only fires in prod at peak | Hammer tests; `-race`/ThreadSanitizer where applicable | Concurrency test required for any invariant endpoint (review checklist) |
| Flake-blind team | Re-run rate climbing | Quarantine + fix SLA | Flake dashboard; re-run button removed from culture |
| Test DB ≠ prod DB | Version-specific behavior differences | Pin container image to prod version | Image version sourced from the same config as prod |
