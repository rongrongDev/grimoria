# quality-dev — A Principal SDET's Exit Brief

**What this is:** 20+ years of test-strategy and automation judgment, encoded for humans (junior → staff QA/SDET) and AI models (Haiku → Opus) to use without the author in the room. Every doc stands alone; every skill and subagent is invokable; every strong claim is backed by a failure that actually happened, not vibes.

**Last full revision:** 2026-07-06 · verified against Playwright 1.5x, Vitest 3.x, Stryker 8.x, Pact 12+, k6 1.x (full table in `CHANGELOG.md`).

**The one-sentence philosophy:** a test earns its place by its ability to fail for exactly the reason it claims to test — coverage measures execution, flakiness measures honesty, and mutation testing measures whether anyone would notice.

## Find what you need in 30 seconds

| You are trying to... | Go to |
|---|---|
| Understand how this KB is organized (or extend it correctly) | `DESIGN.md` |
| Look up any term (flakiness, mutation score, provider state, coordinated omission...) | `GLOSSARY.md` |
| **Design a test strategy for a new feature/service, start to finish** | `playbooks/build-a-test-strategy-from-scratch.md` — or invoke the `test-strategy-planner` skill |
| **Judge an unfamiliar/inherited test suite in a bounded time budget** | `playbooks/analyze-an-existing-test-suite.md` — or invoke the `test-suite-auditor` skill |
| Decide pyramid vs trophy, what to test at which layer, when E2E is worth it | `principles/test-strategy.md` |
| Diagnose a flaky test / decide quarantine vs fix-now / prove a fix worked | `principles/flakiness.md` — single test: invoke the `flaky-test-diagnoser` skill |
| Rank the flakiest tests across whole-suite CI history | dispatch the `ci-flake-history-scanner` subagent |
| Understand what a mutation score means / triage survived mutants | `principles/mutation-testing.md`; bulk triage: dispatch the `mutation-gap-analyzer` subagent |
| Set up contract testing / version a breaking API change / fix test-data chaos | `principles/contract-and-integration-testing.md` |
| Test races deliberately, kill sleeps, test retry/backoff/idempotency | `principles/concurrency-and-async-testing.md` |
| Know what security testing QA owns vs hands off; wire SAST/DAST/SCA gates | `principles/security-testing.md` |
| Design a load test whose "pass" actually means production-ready | `principles/performance-and-load-testing.md` |
| Draw the automated-vs-manual accessibility boundary | `principles/accessibility-testing.md` |
| Architect CI stages, sharding, retry/quarantine policy, merge gates | `principles/ci-cd-integration.md` |
| Run multiple AI agents on quality work without them gaming the suite | `orchestration/README.md` |
| Use a specific tool well | `tools/<name>.md` (table below) |

## Tool coverage

**Core tier** (full depth, version-stamped):

| Tool | Covers | Doc |
|---|---|---|
| Playwright 1.4x–1.5x (+ Cypress notes) | Browser E2E that stays green | `tools/playwright.md` |
| Vitest 3.x / Jest 29–30 | Unit & integration mechanics, mocking discipline, fake timers | `tools/jest-vitest.md` |
| StrykerJS 8.x | Mutation testing ops: config, two-track gating, triage | `tools/stryker.md` |
| supertest 7 / Postman / Bruno | In-process API tests, schema validation, the authz matrix | `tools/api-testing.md` |
| Pact 12+ / Broker | Consumer-driven contracts, provider states, can-i-deploy | `tools/pact.md` |
| k6 1.x (+ JMeter notes) | Executors, open-model profiles, thresholds | `tools/k6.md` |

**Extended tier** (production patterns + pitfalls only): Appium 2.x — `tools/appium.md` · Selenium 4.2x — `tools/selenium.md` · axe-core 4.10 — `tools/axe-core.md` · Percy/Chromatic — `tools/visual-regression.md`

## Skills & subagents (in `.claude/`)

| Callable | Kind | One-line trigger |
|---|---|---|
| `test-strategy-planner` | Skill | "How should we test X?" → risk-ranked plan with layers, tools, CI gates |
| `flaky-test-diagnoser` | Skill | One intermittent test → root cause class, fix, statistical proof protocol |
| `test-suite-auditor` | Skill | Unfamiliar suite → verification-quality report + prioritized remediation |
| `ci-flake-history-scanner` | Subagent (isolated) | Mines 100s of CI runs → ranked flake clusters; never run in main context |
| `mutation-gap-analyzer` | Subagent (isolated) | Runs Stryker on a module → classified, ranked verification gaps |

Each carries explicit do-NOT-use guidance in its description — respect it; the boundaries encode where each one fails.

## How to read this KB

- **Humans, new to the domain:** `principles/test-strategy.md` → `principles/flakiness.md` → the playbook matching your task. Those three carry most of the judgment.
- **Humans, experienced:** go straight to the routing table; every doc is standalone.
- **AI agents:** invoke the skill matching the task; skills embed their procedure and link deeper only for rationale. If orchestrating multiple agents, `orchestration/README.md` is mandatory reading first — it exists because agents can turn a test suite green by making it worthless.
- **Maintainers:** `DESIGN.md` for placement rules, `CHANGELOG.md` for the revision protocol. Date-stamp anything you touch.
