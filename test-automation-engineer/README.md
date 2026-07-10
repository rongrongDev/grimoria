# Test Automation Engineering Knowledge Base

**Stamped:** 2026-07-06 · Verified against: Playwright 1.50, Selenium 4.27, Appium 2.12, GitHub Actions (current), Allure Report 2.32. See `CHANGELOG.md` for revisions.

Twenty years of automation-framework judgment, encoded for humans (junior SDET through staff) and for AI models invoking the skills/subagents. This KB owns **automation engineering** — how to architect, build, scale, and maintain the frameworks and infrastructure that execute tests. Test *strategy* (what to test, at what layer, flakiness root-cause taxonomy) belongs to `@quality-dev/` — this KB links out rather than duplicating.

## Find what you need in 30 seconds

| You want to... | Go to |
|---|---|
| Understand the non-negotiables before touching anything | `principles/core-principles.md` |
| Build a new automation framework from zero | `guides/build-framework-from-scratch.md` |
| Audit an unfamiliar automation suite (bounded time) | `guides/analyze-existing-suite.md` |
| Decide POM vs Screenplay vs component objects | `principles/framework-architecture.md` |
| Pick or fix selectors; kill selector churn | `principles/locator-strategy.md` |
| Kill sleeps / fix timing flakiness | `principles/waiting-and-synchronization.md` |
| Make the suite parallel-safe and shard it | `principles/parallelization-and-sharding.md` |
| Fix test data: fixtures, cleanup, order-dependence | `principles/test-data-management.md` |
| Wire tests into CI: budgets, retries, quarantine, caching | `principles/ci-cd-integration.md` |
| Decide the browser/device matrix | `principles/cross-platform-and-browser.md` |
| Decide refactor vs patch; upgrade tools safely | `principles/maintainability-and-tech-debt.md` |
| Make failure reports actually diagnosable | `principles/reporting-and-observability.md` |
| Split automation work across AI agents safely | `principles/multi-agent-orchestration.md` |
| Playwright specifics (primary web E2E stack) | `frameworks/playwright/README.md` |
| Selenium specifics (legacy / cross-browser grid) | `frameworks/selenium/README.md` |
| Appium specifics (mobile) | `frameworks/appium/README.md` |
| CI execution layer patterns | `frameworks/github-actions/README.md` |
| Reporting layer patterns | `frameworks/allure/README.md` |
| Cypress / visual regression / device farms / codeless | `frameworks/cypress.md`, `frameworks/visual-regression.md`, `frameworks/device-farms.md`, `frameworks/codeless-tools.md` |
| A term you don't recognize | `GLOSSARY.md` |

## Callable capabilities

| Name | Kind | Use when |
|---|---|---|
| `selector-fragility-reviewer` | Skill | Reviewing a new/changed test diff for brittle selectors and hard-coded waits, before merge |
| `suite-scaffolder` | Skill | Creating a new automation module/spec that must follow the framework's established patterns |
| `suite-wide-antipattern-scanner` | Subagent | Scanning an *entire* suite for sleeps, brittle selectors, shared-state hazards — too many files to read in-context |
| `ci-runtime-profiler` | Subagent | Profiling a full CI run's timing data to find the real critical path and sharding opportunities |

Rule of thumb: diff-sized work → skill (findings belong in your context); suite-sized work → subagent (reading belongs in someone else's context).

## Reading paths

- **New to the team/framework:** `core-principles.md` → your stack's framework doc → `suite-scaffolder` skill for your first test.
- **Inheriting a suite:** `guides/analyze-existing-suite.md`, dispatching `suite-wide-antipattern-scanner` and `ci-runtime-profiler` as directed there.
- **Suite is slow:** `ci-runtime-profiler` subagent → `principles/parallelization-and-sharding.md` → `principles/ci-cd-integration.md`.
- **Suite is flaky:** timing-caused → `principles/waiting-and-synchronization.md`; shared-state-caused → `principles/parallelization-and-sharding.md` + `test-data-management.md`; single-test diagnosis or suite-wide flake ranking → `@quality-dev/` (`flaky-test-diagnoser` skill, `ci-flake-history-scanner` agent).

## Structure rationale

See `DESIGN.md` for why content is split between principles (teach), skills (do), and subagents (isolate), and for the precise boundary with `@quality-dev/`.
