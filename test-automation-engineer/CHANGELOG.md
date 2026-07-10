# Changelog

All notable changes to this knowledge base. Each entry records the tool versions content was verified against, because automation APIs churn fast and readers must know what to re-verify.

## 2026-07-06 — Initial release

Full KB authored as a retirement handoff. Verified against:

| Tool | Version | Notes |
|---|---|---|
| Playwright | 1.50 (Node) | Monthly release cadence; locator/fixture APIs stable since ~1.27, expect churn in trace viewer + merge-report tooling |
| Selenium | 4.27 | W3C WebDriver protocol only (legacy JSON Wire long dead); Selenium Manager handles drivers |
| Appium | 2.12 | Appium 2 driver-plugin architecture; UiAutomator2 + XCUITest drivers; Appium 3 not yet assumed |
| GitHub Actions | current SaaS | Runner features drift without version numbers — date is the version |
| Allure Report | 2.32 | allure-playwright / allure-pytest adapters |
| Cypress | 13.x | |
| Percy / Chromatic | current SaaS | |

Contents:
- `DESIGN.md`, `README.md`, `GLOSSARY.md`
- `principles/` — 11 docs (core principles + 9 technical areas + multi-agent orchestration)
- `frameworks/` — 5 core-tier full-depth docs, 4 extended-tier pattern/pitfall docs
- `guides/` — build-from-scratch (Capability A), analyze-existing-suite (Capability B)
- `skills/` — selector-fragility-reviewer, suite-scaffolder
- `agents/` — suite-wide-antipattern-scanner, ci-runtime-profiler

### Revision protocol for future maintainers

1. When a tool ships a breaking change to an API this KB references (e.g., Playwright removes a locator method, Appium 3 changes driver install), update the framework doc, bump its `Applies to:` line, and add an entry here.
2. Principles docs should rarely change — if a principle turned out to be wrong, record *why* here, don't silently rewrite.
3. Never delete a war story; they're the payload.
