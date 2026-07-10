# GLOSSARY.md — Terms of art used across this KB

**Last verified:** 2026-07-06. Single source of truth for terminology. If a doc in this KB uses a term differently, the doc is wrong — fix the doc.

**Arrange-Act-Assert (AAA)** — The three-phase shape of a well-formed test: set up state, perform the one behavior under test, verify observable outcomes. Tests with multiple act/assert cycles are usually several tests welded together and fail with ambiguous diagnostics.

**Assertion-free test** — A test that executes code but verifies nothing (or only that no exception was thrown). Inflates coverage while catching almost no bugs. The primary reason "100% coverage" suites still ship critical defects.

**Contract test** — A test verifying that two independently deployed services agree on their interface. In consumer-driven contract testing (Pact), the *consumer* records the requests/responses it relies on; the *provider* replays them against its real implementation. Replaces most cross-service E2E tests. See `quality-dev/principles/contract-and-integration-testing.md`.

**Coordinated omission** — A load-testing measurement error where the load generator waits for slow responses before sending the next request, so the slowest periods get *fewer* samples and reported latency looks far better than reality. Avoided with open-model (arrival-rate) load generation. See `quality-dev/tools/k6.md`.

**Consumer / Provider** — In contract testing: the service that calls (consumer) and the service that serves (provider).

**Determinism** — A test is deterministic when the same code produces the same result on every run, regardless of machine, time, parallel neighbors, or ordering. The opposite is *non-determinism*, the raw material of flakiness.

**E2E (end-to-end) test** — Exercises the deployed system through its real interface (browser, mobile app, public API) across real service boundaries. Highest fidelity, highest cost, slowest feedback, most flake-prone. Reserve for critical user journeys.

**Equivalent mutant** — A code mutation that changes syntax but not behavior, so no test could ever kill it. Shows up as "survived" in mutation reports; must be recognized and ignored, not chased. See `quality-dev/principles/mutation-testing.md`.

**Fixture** — Reusable setup/teardown that provides a test with the state it needs (a logged-in page, a seeded DB row). Good fixtures create *fresh, isolated* state per test; shared fixtures are a top-three flakiness cause.

**Flakiness** — A test that both passes and fails against the same code. Every flaky test is either a broken test or a broken product; "just flaky" is not a diagnosis. See `quality-dev/principles/flakiness.md`.

**Hermetic test** — A test that brings everything it needs (data, services, clock) and shares nothing with other tests. Hermeticity is what makes parallelization and retries safe.

**Idempotency** — The property that performing an operation twice has the same effect as once. Tested by firing duplicate/concurrent requests and asserting a single effect. See `quality-dev/principles/concurrency-and-async-testing.md`.

**Integration test** — Verifies real components working together (your code + a real database, your handler + a real HTTP stack) but within one deployable unit, usually with external *services* faked at the network boundary. The middle of the trophy.

**Killed / Survived mutant** — Mutation testing outcomes. *Killed*: some test failed when the code was mutated (good — the suite noticed). *Survived*: all tests passed despite the mutation (a gap, dead code, or an equivalent mutant).

**Line/branch coverage** — The percentage of lines/branches *executed* during tests. Measures reach, not verification. A necessary floor, a meaningless ceiling.

**Load profile** — The shape of traffic a load test applies: arrival rate over time, endpoint mix, payload sizes, think time. Realistic profiles are derived from production telemetry, not invented.

**Mutation score** — Killed mutants ÷ (total mutants − equivalent/ignored). Measures whether your tests would *notice* if the code changed — i.e., verification strength, which coverage cannot measure.

**Mutation testing** — Tooling (e.g. Stryker) that makes small deliberate changes ("mutants") to production code and reruns your tests. Tests that stay green against mutated code aren't verifying that code.

**Non-determinism** — Any source of run-to-run variation: wall clocks, random seeds, network timing, thread/event-loop scheduling, iteration order of unordered collections, shared mutable state.

**Open vs closed workload model** — Closed: a fixed pool of virtual users each waits for a response before sending again (throughput self-throttles when the system slows — hides overload). Open: requests arrive at a set rate regardless of response times (models real users, exposes overload). Default to open for capacity questions.

**Order dependence** — A test that passes only when run after (or not after) another test, because one leaks state the other consumes. Surfaces when suites are parallelized or shuffled.

**Provider state** — In Pact, a named precondition ("user 42 exists") the provider must set up before verifying an interaction. The mechanism that keeps contract verification hermetic.

**Quarantine** — Removing a flaky test from the merge-blocking set while keeping it running and tracked, with an owner and an expiry. Quarantine without expiry is deletion with extra steps. See `quality-dev/principles/flakiness.md`.

**Race condition** — Behavior that depends on the relative timing of concurrent operations. In tests, the usual shape is *assert before the system reached steady state*. In products, the usual shape is *two writers, no coordination*.

**Risk-based prioritization** — Ordering test effort by (likelihood of failure × cost of failure), using change frequency, code complexity, and blast radius as inputs — not by what's easiest to automate.

**Shift-left** — Moving a class of verification earlier (cheaper, faster) in the pipeline: contract tests instead of staging E2E, SAST at PR time instead of pentest at release.

**Smoke test** — A minimal fast subset of E2E verifying the system is alive and its money paths work. Runs on every deploy; failure means stop the line.

**Snapshot test** — Asserts output equals a stored artifact. Cheap to write, cheap to blindly re-record; treats every change as equally suspicious, so teams learn to approve diffs reflexively. Use only for genuinely stable serialized output.

**Test data management** — The discipline of giving every test unique, self-created, self-cleaning data. Shared seed data ("test@test.com") is a flakiness and false-confidence factory.

**Test double** — Umbrella term: *stub* (returns canned answers), *mock* (asserts on interactions), *fake* (working lightweight implementation, e.g. in-memory repo), *spy* (records calls). Over-mocking turns tests into mirrors of the implementation.

**Test impact analysis** — Selecting which tests to run based on what changed. Speeds pre-merge feedback; must be backstopped by a full run post-merge because dependency graphs lie.

**Test pyramid** — Strategy shape: many unit tests, fewer integration, few E2E. Optimizes for logic-heavy systems. See *testing trophy* for the alternative and `quality-dev/principles/test-strategy.md` for when each wins.

**Testing trophy** — Strategy shape: integration tests as the bulk, units for pure logic, thin E2E on top, static analysis at the base. Optimizes for wiring-heavy systems (typical web apps/CRUD services).

**Think time** — Simulated user pause between actions in a load scenario. Omitting it makes every virtual user a scripted DoS attack rather than a customer.

**Virtual user (VU)** — A load generator's simulated client. VU count is an *input* in closed models and an *output* (resource) in open models.

**Web-first assertion** — An assertion that retries until the condition holds or a timeout expires (Playwright's `expect(locator).toBeVisible()`), replacing check-once assertions on inherently async UI. The single biggest structural flakiness reducer in browser testing.
