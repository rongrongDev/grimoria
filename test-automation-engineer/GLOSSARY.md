# Glossary

**Stamped:** 2026-07-06. Single shared vocabulary for the whole KB. Terms are defined the way *this KB uses them* — some have looser meanings in the wild.

**Actionability checks** — Playwright's built-in pre-action verification (element visible, stable, enabled, receives events) that runs before every click/fill. The reason "click then assert" rarely needs explicit waits in Playwright.

**Auto-wait** — A framework behavior where actions and assertions automatically poll until their preconditions hold or a timeout expires. Playwright and Cypress have it; Selenium does not (you build it with explicit waits).

**Brittle selector** — A locator coupled to something that changes for reasons unrelated to the behavior under test: styling classes, DOM position, generated IDs. See `principles/locator-strategy.md`.

**Component object** — A page-object-style wrapper around a reusable UI component (date picker, data grid) rather than a whole page. Composes into page objects.

**Critical path (CI)** — The longest chain of dependent CI work that determines wall-clock time regardless of how much else is parallelized. Cutting anything *not* on the critical path changes nothing.

**Data factory** — Code that builds test data programmatically with unique values per invocation (`makeUser({plan: 'pro'})`), as opposed to a fixture file's fixed values.

**Explicit wait** — A wait on a specific named condition (`waitUntil(orderStatus).is('shipped')`). The correct primitive. Contrast *implicit wait* and *hard wait*.

**Flake rate** — Fraction of test runs that fail on code that is actually correct. Measured per-test (from re-run history) and per-suite (probability a green change gets a red build). A 0.5% per-test flake rate across 400 tests ≈ 87% of builds have at least one false failure — that's why per-test rates that sound small are catastrophic.

**Fixture (data)** — Pre-defined test data, typically static files or DB seeds. **Fixture (Playwright)** — a dependency-injected setup/teardown unit (`test.extend`); the framework's composition mechanism. The KB disambiguates in context.

**Hard wait / sleep** — `sleep(5000)`, `page.waitForTimeout()`, `Thread.sleep()`. Waiting for *time* instead of a *condition*. The single most common automation anti-pattern; banned by lint in any suite I've run.

**Headless** — Browser execution without a visible window. Faster and CI-friendly; rendering differences vs headed are rare since headless Chrome switched to the unified "new headless" mode, but they exist (fonts, GPU).

**Hermetic test** — A test that brings or creates everything it needs (data, state, ideally backend responses) and shares nothing mutable with other tests. Hermetic tests are the prerequisite for safe parallelism.

**Implicit wait (Selenium)** — A global setting that makes every element lookup poll for up to N seconds. Interacts badly with explicit waits and hides missing-element bugs; set it to 0 and never touch it.

**Locator** — A framework object representing *how to find* an element, resolved lazily at action time (Playwright `Locator`, Selenium `By`). Lazy resolution is what makes retry/auto-wait possible.

**Page Object Model (POM)** — Pattern encapsulating page structure (locators) and interactions behind an API expressing user intent (`loginAs(user)`), so UI changes are absorbed in one place.

**Quarantine** — Moving a known-flaky test out of the merge-blocking path (still runs, results tracked, doesn't block) with an owner and an expiry. Containment, not cure. See `principles/ci-cd-integration.md`.

**Race condition (test)** — Test proceeds on an assumption about app state that hasn't materialized yet (asserting on a list before the fetch resolves). The dominant cause of timing flakiness.

**Retry (test-level)** — Automatically re-running a failed test. Masks real intermittent product bugs and hides flake debt; use only with flake-tracking. See `principles/ci-cd-integration.md`.

**Screenplay pattern** — Actor/task/question-based test design (actors *attempt* tasks, *ask* questions). More composable than POM at high complexity, much higher onboarding cost. See `principles/framework-architecture.md`.

**Selector churn** — Rate at which selectors must be edited due to app changes. The core maintenance-cost metric for locator strategy.

**Self-healing locators** — Tooling that auto-substitutes an alternative locator when the primary fails, based on element similarity. Trades silent wrongness risk for reduced churn. See `principles/locator-strategy.md`.

**Sharding** — Splitting one suite across N machines, each running a subset. Distinct from *parallelism within* a machine (workers). Both require test independence.

**Test ID** — A dedicated attribute (`data-testid`) placed in the app for the sole use of tests. A contract between app and suite: styling may change freely, test IDs may not.

**Test independence / order-independence** — A test passes regardless of which tests ran before it, in what order, or concurrently. Verified by running in random order and in parallel, not by assertion.

**Trace (Playwright)** — A recorded artifact (DOM snapshots, network, console, screencast per action) viewable in the trace viewer. The single highest-value failure artifact in modern web automation.

**Worker** — One parallel executor process. Playwright: workers within a machine × shards across machines.
