# Selenium — Full-Depth Reference

**Stamped:** 2026-07-06 · **Applies to:** Selenium 4.27 (Java examples; concepts identical in Python/C#), Selenium Grid 4. W3C WebDriver protocol only.

Selenium's honest position in 2026: the right tool when you *inherit* a large Selenium estate, when you need the broadest real-browser/grid ecosystem (real Safari, exotic browsers, in-house device labs), or when the org's language is JVM/.NET and Playwright's language bindings don't fit the team. For a *new* web suite with no such constraint, start with Playwright (`frameworks/playwright/README.md`) — Selenium gives you a driver, and you must build the framework disciplines (waiting, retry, reporting) that Playwright ships built-in. Most "Selenium is flaky" complaints are actually "we didn't build those disciplines" complaints. This doc is those disciplines.

## Architecture (`principles/framework-architecture.md`)

The three layers apply verbatim, but Selenium demands a real driver/infra layer because raw WebDriver is too low-level to call from page objects safely:

- **One element-interaction helper module** — the *single* place that combines locate + wait + act. Not a wrapper around the whole API (`framework-architecture.md`'s wrapper-layer warning); a narrow set: `click(By)`, `type(By, text)`, `text(By)`, `waitUntil(condition)`. Every one takes a `By`, never a `WebElement`, and resolves at action time — this is how you get Playwright-style lazy semantics and kill `StaleElementReferenceException` (the #1 Selenium flake class; caused by holding element references across re-renders, not by the app).
- **Driver lifecycle owned by the harness** (JUnit5 extension / pytest fixture / TestNG listener): one driver per test by default (hermetic, parallel-safe), thread-local when parallelizing in-process. The killer bug: driver or `WebDriverWait` instances shared across threads — symptoms are session-mixed actions that look supernatural. `ThreadLocal<WebDriver>` or per-test injection, no statics, ever.
- **Page objects** hold `By` constants + intent methods calling the helper. Assertions stay in tests. No `BasePage` towers.

## Locators (`principles/locator-strategy.md`)

Hierarchy lands as: `By.cssSelector("[data-testid=x]")` and role-equivalents. Selenium 4 has no native role/name locator engine as rich as Playwright's — approximate with a11y-oriented CSS (`button[aria-label=...]`, `[role=dialog]`) or adopt a thin helper library; in practice **test IDs carry more weight in Selenium suites** than Playwright ones. Two Selenium-specific hazards:

- **`findElement` silently returns the first match.** No strict mode. Ambiguity = wrong-element actions with green tests. Your helper should assert uniqueness (`findElements(by).size()==1`) — the ~10ms cost is nothing against the debugging cost of silent wrongness.
- **XPath habit.** Legacy Selenium estates are XPath swamps. Ban `//` positional XPath in new code (lint on `By.xpath`); migrate the worst offenders by churn ranking, not alphabetically (`agents/suite-wide-antipattern-scanner.md` produces the ranking; the churn math is in `principles/locator-strategy.md`).

## Waiting (`principles/waiting-and-synchronization.md`) — where Selenium suites live or die

- **Implicit wait = 0, permanently.** Set it explicitly in driver setup so nobody "helpfully" adds it back; implicit+explicit interaction is undefined and produces compound mystery timeouts (full reasoning in the principles doc).
- **All waiting through `WebDriverWait` + `ExpectedConditions`, inside the helper layer.** Tests and page objects never construct waits ad hoc — the helper applies the right condition per action (`elementToBeClickable` before click, `visibilityOfElementLocated` before read).
- **Build the polling-assertion primitive Playwright has and Selenium lacks:** an `Awaitility`-style `assertEventually(supplier, matcher, timeout)` used for every assertion against async UI. A Selenium suite whose assertions are instant `getText()` reads *will* flake; this one helper, retrofitted plus mechanical conversion, cut a client's suite flake rate from 4.1% to 0.6% in a month — no test logic changed.
- `Thread.sleep` is lint-banned (Checkstyle/ArchUnit rule scoped to test sourceSets). No exceptions; the "just this once" sleep is how estates get 340 of them.

## Parallelization & Grid (`principles/parallelization-and-sharding.md`)

In-process parallelism via the runner (JUnit5 `junit.jupiter.execution.parallel`, TestNG `parallel=methods`, pytest-xdist) with thread-local drivers; scale-out via Grid or CI sharding. Grid 4 specifics:

- **Grid is a service you operate** — hub/router + nodes, session queue, autoscaling (K8s + KEDA on queue depth is the modern pattern; static VMs rot). If you don't want to operate it, containerized single-node (`selenium/standalone-chrome` per CI shard) gives isolation with zero grid ops — my default recommendation for CI: **prefer N disposable standalone containers over one big grid**; the grid earns its ops cost only for real-browser labs and cross-team sharing.
- **Grid-specific failure signatures** to separate from app failures in triage: `SessionNotCreatedException` (node capacity/version mismatch), session timeout mid-test (node died/recycled), slow-create (queue depth). Tag these as *infra* in reporting (`frameworks/allure/README.md` categories) or they poison your flake stats.
- **Version skew:** browser auto-updates on nodes vs pinned driver = Tuesday-morning suite-wide breakage (Chrome ships overnight). Selenium Manager now resolves drivers automatically, but *pin browser versions in node images* and roll deliberately with the weekly canary (`principles/maintainability-and-tech-debt.md`).

## Test data, CI, reporting

Nothing Selenium-specific about data discipline — factories + API setup per `principles/test-data-management.md` (use a real HTTP client; don't drive data setup through the UI). CI: same budget/retry/quarantine policy (`principles/ci-cd-integration.md`) but you implement flake-event emission yourself (listener that records pass-after-rerun; JUnit5 doesn't distinguish `flaky` natively the way Playwright does). Reporting: **Selenium produces no artifacts by default** — your harness must capture on failure: screenshot (`TakesScreenshot`), page source, browser console (CDP logs, Chromium only), and video if the container records (Grid/standalone images support it). Budget a week to build this properly; without it every failure is "re-run locally," which at scale means failures get ignored (`principles/reporting-and-observability.md`).

## Selenium-specific failure modes

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| `StaleElementReferenceException` waves | Exception name in failure clusters, worst on SPA screens | Re-locate at action time via `By`-taking helper; never store `WebElement`s | Helper-layer architecture; lint against `WebElement` fields in page objects |
| Implicit/explicit wait interaction | Timeouts taking implicit+explicit time; "why did this take 40s to fail" | Implicit=0 in driver factory | Driver construction only via the factory; grep for `implicitlyWait` elsewhere |
| Silent first-match on ambiguous locator | "Impossible" wrong-element behavior; passes locally, wrong element under different data | Uniqueness assertion in helper | Helper enforces; scanner flags raw `findElement` outside helper |
| Shared driver across threads | Session-mixed chaos only under parallel runs | Thread-local/per-test drivers | No static driver refs — ArchUnit rule |
| Browser/driver version skew | Suite-wide `SessionNotCreated` after browser auto-update | Pin browser in node/container images | Weekly canary absorbs version rolls deliberately |
| Missing failure artifacts | Triage requires local re-run | Failure-capture listener (screenshot/source/logs/video) | Part of framework definition-of-done |
| Grid infra failures counted as flakes | Flake stats dominated by session-create signatures | Separate infra category in reporting; fix grid ops | Signature-based auto-categorization (`frameworks/allure/README.md`) |

## Cross-references

- Deciding Selenium vs Playwright for a new suite: this doc's opening + `guides/build-framework-from-scratch.md` step 0
- Migrating an estate to Playwright: `principles/maintainability-and-tech-debt.md` §big-bang + `principles/multi-agent-orchestration.md` §fan-out
- Cross-browser matrix policy (where Grid actually earns its keep): `principles/cross-platform-and-browser.md`
