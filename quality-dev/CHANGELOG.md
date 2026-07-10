# CHANGELOG.md — quality-dev knowledge base

Revisions are pinned to the tool versions they were verified against. When a tool ships a breaking release, revise the affected `tools/` doc, bump its header stamp, and record it here. Principles docs change rarely; record when they do and why.

## 2026-07-06 — Initial release (v1.0)

Full initial build of the knowledge base by the retiring principal SDET. Everything below is new.

**Verified against:**

| Tool | Version verified |
|---|---|
| Playwright | 1.4x–1.5x (`@playwright/test`) |
| Cypress (referenced as alternative) | 13–14 |
| Vitest | 3.x |
| Jest | 29–30 |
| StrykerJS | 8.x |
| Pact (pact-js) | 12.x+, Pact Broker / PactFlow current SaaS |
| supertest | 7.x |
| k6 | 1.x (post-1.0) |
| Appium | 2.x (UiAutomator2 / XCUITest drivers) |
| Selenium | 4.2x |
| axe-core | 4.10 (+ `@axe-core/playwright`) |
| Percy / Chromatic | current SaaS as of date |

**Added — structure & scaffolding:** `README.md`, `DESIGN.md`, `GLOSSARY.md`, this file.

**Added — principles (9):** test-strategy, flakiness, mutation-testing, contract-and-integration-testing, concurrency-and-async-testing, security-testing, performance-and-load-testing, accessibility-testing, ci-cd-integration.

**Added — tools:** core tier (playwright, jest-vitest, stryker, api-testing, pact, k6); extended tier (appium, selenium, axe-core, visual-regression).

**Added — playbooks:** build-a-test-strategy-from-scratch, analyze-an-existing-test-suite.

**Added — orchestration:** multi-agent patterns for quality work.

**Added — skills:** `test-strategy-planner`, `flaky-test-diagnoser`, `test-suite-auditor` (`.claude/skills/`).

**Added — subagents:** `ci-flake-history-scanner`, `mutation-gap-analyzer` (`.claude/agents/`).

## Maintenance protocol

1. On a breaking tool release: update the `tools/<name>.md` doc, its `Applies to:` header, and add an entry here with the date and version delta.
2. Principles docs: revise only when the *judgment* changes (a pattern proved wrong in practice), never to chase tool syntax — that belongs in `tools/`.
3. Never edit `GLOSSARY.md` definitions silently; log the change here, since skills and subagents depend on exact meanings.
4. If a skill/subagent's trigger or output contract changes, log it here — downstream automations may parse those outputs.
