# Selenium — legacy web E2E production patterns & pitfalls (extended tier)

**Applies to:** Selenium 4.2x (W3C WebDriver, Selenium Manager, Grid 4) · **Last verified:** 2026-07-06
**Tier note:** extended — production patterns + pitfalls for *maintaining* Selenium estates. For new suites, use Playwright (`quality-dev/tools/playwright.md`); this doc exists because large Selenium suites are still load-bearing in 2026 and deserve competent stewardship, not fashion-driven rewrites.

## Production patterns

- **Explicit waits only.** The one rule that separates stable Selenium suites from the 11%-flake-rate estate I inherited (story in `quality-dev/principles/test-strategy.md`): every interaction goes through `WebDriverWait` + `ExpectedConditions` (element visible/clickable/stale). **Implicit waits set to zero, everywhere** — mixing implicit and explicit waits produces compounded, unpredictable timeouts (the driver polls inside the driver; your wait polls outside it). Selenium has no Playwright-style auto-waiting; discipline substitutes for the feature.
- **`Thread.sleep` is lint-banned** in test dirs, same rationale and mechanism as everywhere else in this KB (`quality-dev/principles/flakiness.md`). In review of an old suite, grep for it first — its density predicts the suite's flake rate better than any other single signal.
- **Selenium Manager (4.6+) ends the driver-binary wars:** no more hand-managed chromedriver versions; remove the homegrown driver-download scripts — they're now a breakage source with no benefit.
- **Grid 4 for parallelism**, or better, disposable containerized browsers (selenium/standalone-chrome images) per CI worker — a long-lived shared Grid accumulates zombie sessions and becomes the flakiest component in the estate. Fresh browser per test class; never share a driver across tests (session state is shared state, taxonomy #2).
- **Page objects with locator discipline:** centralize locators; prefer stable attributes (`data-testid`, IDs, names) over CSS chains and especially over XPath positional axes. Every `//div[3]/span[2]` is a reorg away from red.
- **Screenshots + page source + browser console logs on failure**, attached to CI artifacts. Selenium's error messages ("stale element reference") are symptoms, not diagnoses; artifacts make triage possible.
- **Migration judgment:** don't rewrite green suites. Migrate to Playwright when you hit: multi-tab/origin walls, parallelism infrastructure cost, or a flake plateau that explicit-wait discipline can't break (Selenium can't retry *assertions*, only waits — the check-once gap is structural). Migrate journey-by-journey, newest and flakiest first; the 1,400→300 test estate cut in `quality-dev/principles/test-strategy.md` was done during exactly such a migration.

## Common pitfalls

| Pitfall | Consequence | Instead |
|---|---|---|
| Mixing implicit + explicit waits | Compounded timeouts; "sometimes 2s, sometimes 40s" mysteries | Implicit = 0; explicit waits only |
| `Thread.sleep` scattering | Scheduled races; dead wall time | `WebDriverWait` + conditions; lint ban |
| Stale element re-use after DOM update | `StaleElementReferenceException` intermittents | Re-locate through the wait, don't cache `WebElement`s across actions |
| Shared driver/session across tests | Order-dependent state leaks | Fresh browser per class; container-per-worker |
| Long-lived shared Grid | Zombie sessions, node drift, mystery flakes | Disposable containerized browsers per run |
| XPath positional locators | Break on any layout change | data-testid/ID; page-object locator maps |
| Hand-managed driver binaries (pre-4.6 habit) | Version-mismatch breakage on browser auto-update | Selenium Manager |
| Assertion-after-read races (no retrying assertions exist) | Check-once flakes Playwright wouldn't have | Wrap assertion in a wait-on-condition; or accept this as a migration trigger |
| "Modernizing" by wrapping Selenium in more layers | Homegrown framework nobody can debug | Thin page objects only; put the effort into migration instead |
