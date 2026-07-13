# CHANGELOG.md — quality-dev knowledge base

Revisions are pinned to the tool versions they were verified against. When a tool ships a breaking release, revise the affected `tools/` doc, bump its header stamp, and record it here. Principles docs change rarely; record when they do and why.

## 2026-07-13 — Audit remediation, P0 (re-verification pass + path fixes)

Resolves the two P0 items from `audits/2026-07-13-kb-audit.md`:

**1. Every `tools/` doc re-verified against current releases and honestly re-stamped** (web verification 2026-07-13; changelogs/migration guides consulted per tool). Version deltas:

| Tool | Was claimed | Verified 2026-07-13 | Content changes |
|---|---|---|---|
| Playwright | 1.4x–1.5x | **1.61** (2026-06) | Added "What changed in 1.59–1.61": Test Agents (planner/generator/healer) + healer-diffs-pass-the-reviewer-gate rule, `retain-on-failure-and-retries` video mode, virtual WebAuthn authenticator, storage APIs |
| Cypress (alt notes) | 13–14 | **15.x** (15.0 2026-05) | Node 18/23 + TS4 dropped, Firefox BiDi-only; judgment unchanged |
| Vitest | 3.x | **4.1** | Added Vitest 4 section: browser mode stable (separate provider packages), built-in visual regression, `restoreAllMocks` semantics change, coverage-denominator gotcha (`coverage.include`), pool options moved top-level |
| Jest | 29–30 | 30.x | No change needed |
| StrykerJS | 8.x | **9.6** | Added 9.x notes: Node 20+, vitest-runner needs Vitest 2+, `disableTypeChecks` defaults true, percentage `concurrency`, `--testFiles`; all documented config fields re-checked, valid in 9.x |
| pact-js | 12.x+ | **16.x** | Header note: Node 20+; `PactV4`/`MatchersV3` now the default `Pact`/`Matchers` exports, old V2 classes renamed; V4 builder API unchanged |
| supertest | 7.x | 7.2 | Stamp only |
| zod (api-testing header) | 3.x | **4.x** | Header only |
| k6 | 1.x | **2.1** (2.0 2026-05) | Added 2.0 notes: `externally-controlled` executor + pause/resume/scale/status CLI removed; extension module path `go.k6.io/k6/v2`; all documented executors unchanged |
| Appium | 2.x | **3.5** (3.0 2025-08) | Added 2→3 migration bullet: Node 20.19+/npm 10, JSONWP removed, TouchAction→W3C Actions, `--allow-insecure` scope prefixes, `pressKey` removed |
| Selenium | 4.2x | **4.46** | Stamp + range; stewardship patterns re-checked, unchanged |
| axe-core | 4.10 | **4.12.1** | Stamp + range; pinning advice re-affirmed |
| Percy/Chromatic | "current as of date" | current | Stamp reworded to a real date |
| Node (concurrency doc) | 22 | **24 LTS** | Header only |

Also updated: `README.md` header line + tool table to the verified versions.

**2. All 18 broken `.claude/skills|agents/` cross-references fixed** across 14 files — rewritten to the real `quality-dev/skills/` and `quality-dev/agents/` paths; `DESIGN.md`'s tree corrected and an installation note added (README + DESIGN): skills/subagents live in the KB and become invokable by copying/symlinking into a consumer's `.claude/` directories. README's "every skill and subagent is invokable" claim qualified accordingly.

P1/P2 backlog items from the audit remain open — see the audit report for per-item status.

## 2026-07-13 — KB audit

Full audit by incoming principal: `audits/2026-07-13-kb-audit.md`. Top-line finding: judgment content is strong and depth standards are genuinely met, but every "Last verified: 2026-07-06" stamp is unreliable — all core-tier tools are a major version behind current releases (Playwright 1.61, Vitest 4.1, StrykerJS 9.6, pact-js 16.5, k6 2.1, Appium 3.5) — and all 18 `.claude/skills|agents/` cross-references are broken (actual location: `quality-dev/skills|agents/`). See the audit's P0 backlog before trusting version-sensitive guidance.

## 2026-07-06 — Initial release (v1.0)

Full initial build of the knowledge base by the retiring principal SDET. Everything below is new.

**Verified against** (⚠ the 2026-07-13 audit found these claims reflected ~mid-2025 releases, not the state of 2026-07-06 — kept here as the historical record; see the remediation entry above for corrected versions):

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

**Added — skills:** `test-strategy-planner`, `flaky-test-diagnoser`, `test-suite-auditor` (`quality-dev/skills/`).

**Added — subagents:** `ci-flake-history-scanner`, `mutation-gap-analyzer` (`quality-dev/agents/`).

## Maintenance protocol

1. On a breaking tool release: update the `tools/<name>.md` doc, its `Applies to:` header, and add an entry here with the date and version delta.
2. Principles docs: revise only when the *judgment* changes (a pattern proved wrong in practice), never to chase tool syntax — that belongs in `tools/`.
3. Never edit `GLOSSARY.md` definitions silently; log the change here, since skills and subagents depend on exact meanings.
4. If a skill/subagent's trigger or output contract changes, log it here — downstream automations may parse those outputs.
