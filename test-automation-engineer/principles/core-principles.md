# Core Principles — The Ten Laws

**Stamped:** 2026-07-06 · Tool-agnostic; examples reference Playwright 1.50 / Selenium 4.27. Read this before anything else in the KB.

These are the rules I stopped debating a decade ago. Each one was paid for. When a framework decision is hard, check it against these in order.

## 1. The suite is a product, and developers are its users

An automation framework that only its author can extend is dead framework walking — it just doesn't know it yet. Every design choice must survive the question: *can a mid-level product engineer add a correct, non-flaky test in under an hour without asking anyone?* If the answer is no, you've built a bottleneck, not a framework. This is why we bias toward boring patterns (see law 4) and why `skills/suite-scaffolder` exists: the golden path must be stamped, not described.

**War story:** the best framework I ever inherited had a Screenplay implementation of stunning elegance. Zero product engineers wrote tests. Every test went through the two SDETs who understood it, with a 2-week queue. We replaced it with plain page objects and a scaffolder; within a quarter, 60% of new E2E tests were written by product engineers. The elegant framework tested less software.

## 2. Flakiness is a framework defect until proven otherwise

When a test fails intermittently, the *default assumption* is that the framework let it happen: a timing assumption (`waiting-and-synchronization.md`), shared state (`parallelization-and-sharding.md`, `test-data-management.md`), or environment drift. Only after those are excluded do you treat it as a product bug or a test-logic bug — and root-causing test *logic* is `@quality-dev/` territory (their `flaky-test-diagnoser` skill has the six-cause taxonomy). Our job is to make the framework structurally incapable of the timing and state classes.

Do the math before dismissing "occasional" flakes: at a 0.5% per-test flake rate and 400 tests per run, P(false-red build) = 1 − 0.995⁴⁰⁰ ≈ 87%. Nearly every build lies. Engineers respond rationally: they stop reading failures. That's how suites die — not from missing tests, from ignored ones.

## 3. Speed is a feature with a budget, and budgets are enforced or fictional

Decide the suite's wall-clock budget (my rule: **10 minutes for the merge-blocking set**, because that's the edge of "wait for it" vs "context-switch away"), then enforce it in CI as a failing check, not a dashboard. Unenforced budgets creep 30 seconds per week forever. The 90-minute suite I cut to 8 minutes (see `parallelization-and-sharding.md` for the itemized breakdown) got to 90 minutes exactly this way: no single change added more than a minute.

## 4. Abstraction must clarify intent, never hide it

The test body should read as *what the user does and what must be true* — nothing else. Two failure directions:

- **Under-abstraction:** raw selectors and waits in test bodies. Every UI change touches fifty tests.
- **Over-abstraction:** `runStandardFlow(config)` where you need a debugger to learn what was tested. Worse than under-abstraction, because it also destroys failure diagnosis.

The test: cover the test body and ask a new engineer what it verifies. If they can't say, the abstraction hides intent. Full treatment in `framework-architecture.md`.

## 5. Every test is hermetic and order-independent — no exceptions for convenience

A test creates or acquires everything it needs, collides with nothing running concurrently, and passes in any order. This is not a style preference; it's the *precondition for parallelism*, and parallelism is where all large-suite speed comes from (law 3). One test that "just reuses the admin account" costs you nothing today and the entire parallelization project later. Enforcement: run the suite in random order and at high worker counts in a nightly job — order-dependence is found by execution, not review. See `test-data-management.md`.

## 6. Selectors are a contract with the application, so make the application sign it

Resilient selection isn't a testing technique, it's an *app-development* agreement: interactive elements get accessibility roles/names (which you should have anyway) and stable `data-testid`s where roles don't discriminate. The selector hierarchy, churn math, and self-healing tradeoffs live in `locator-strategy.md`. The enforcement lives in lint and the `selector-fragility-reviewer` skill — a convention that isn't machine-enforced is a suggestion.

## 7. Never wait for time; wait for the condition you actually need

Every `sleep(3000)` is a bet that 3 seconds is simultaneously enough (or it flakes) and necessary (or it wastes). Both sides of the bet lose at scale: 200 tests × 3s of padded sleeps = 10 minutes of pure waste, *and* the flakes still happen on slow CI days. Wait on the observable condition the next step depends on. Full decision tree in `waiting-and-synchronization.md`. Prevention is a lint ban, not a code-review reminder.

## 8. Retries hide; quarantine contains; only fixes cure

Auto-retry makes red builds green without making tests true — and it masks *real* intermittent product bugs, which look exactly like flakes (that race condition your retry swallowed ships to customers). Retries are acceptable only as a *detection instrument*: retry once, record every pass-on-retry as a flake event, alert on the trend. Known-flaky tests go to quarantine with an owner and an expiry date. Policy details in `ci-cd-integration.md`; suite-wide flake ranking is `@quality-dev/`'s `ci-flake-history-scanner`.

## 9. A failure report must answer "test bug or product bug?" in two minutes

The economics of a big suite are triage economics. If diagnosing a failure means re-running locally, each failure costs 30 engineer-minutes and people start clicking re-run instead. The report must carry: failing step in intent-level language, screenshot at failure, trace/video, app + framework versions, and the last-known-green comparison. What to attach vs what's noise: `reporting-and-observability.md`.

## 10. Deletion is a maintenance strategy

Suites only grow unless deletion is deliberate. A test that has never failed in a year, covers a path five other tests cross, and costs 40 seconds per run is not an asset — it's runtime and maintenance debt with no information yield. Review the bottom of the value-per-cost ranking quarterly. (Which tests *should* exist is strategy — `@quality-dev/`'s `test-suite-auditor`. That they must earn their runtime is engineering — ours.)

---

## How the laws interact

Speed (3) requires parallelism, which requires hermeticity (5), which requires the data discipline in `test-data-management.md`. Trustworthiness (2) requires condition-based waiting (7) and honest retry policy (8). Maintainability (1, 4, 6) is what keeps the other laws affordable as the suite grows 10×. When two laws conflict — e.g., a hermetic per-test data setup (5) that blows the runtime budget (3) — the resolution is almost always *engineering the setup to be cheap* (API-based seeding, worker-scoped reuse of immutable data), not abandoning either law. Details: `test-data-management.md` §fixtures-vs-factories.
