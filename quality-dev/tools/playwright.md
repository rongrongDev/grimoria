# Playwright — production patterns for E2E that stays green

**Applies to:** `@playwright/test` 1.4x–1.5x · **Last verified:** 2026-07-06 · Cypress 13–14 notes at the end.
**Standalone:** yes. Playwright is the 2026 default for browser E2E: real multi-browser engines, first-class parallelism, auto-waiting assertions, trace-based debugging.
**Related principles:** which journeys deserve E2E at all — `quality-dev/principles/test-strategy.md`; why waiting on time is banned — `quality-dev/principles/concurrency-and-async-testing.md`; flake triage — `quality-dev/principles/flakiness.md`.

## The mental model that prevents most Playwright flakiness

Playwright *auto-waits* inside two things: **actions** (`click` waits for visible/stable/enabled) and **web-first assertions** (`expect(locator).toBeVisible()` retries until timeout). Everything else — your own reads, counts, screenshots, non-locator expects — executes *immediately* against whatever the page happens to be. Nearly every flaky Playwright test I've triaged breaks this model in one of three ways: asserting on a value grabbed with `textContent()` instead of `toHaveText()`, sleeping (`waitForTimeout`) instead of waiting on state, or racing a navigation/response the test never awaited.

```ts
// FLAKY: check-once read, races the render
expect(await page.locator('.total').textContent()).toBe('$42.00');
// STABLE: retrying assertion — the assertion IS the wait
await expect(page.locator('.total')).toHaveText('$42.00');
```

## Locators — test what users perceive, survive refactors

Priority order: `getByRole` (accessible role+name — doubles as a passive a11y check: if `getByRole('button', { name: 'Pay' })` can't find it, a screen reader can't either) → `getByLabel`/`getByPlaceholder` for form fields → `getByTestId` for genuinely unnamed containers → CSS **last**, and never positional (`nth()`, `:first`) — positional selectors are order-dependence bugs wearing a selector costume.

Strictness is your friend: a locator matching 2+ elements throws instead of silently taking the first. When you hit it, disambiguate by *meaning* (`filter({ hasText })`, scoping within a parent locator), not by index.

## Fixtures & auth — hermetic state per test

- **Never** log in through the UI per test. Authenticate once in a setup project, save `storageState`, and inject it: dozens of minutes saved per run and one less flaky surface. One storageState file per role; the authz matrix (`quality-dev/principles/security-testing.md`) then runs as cheap parallel projects.
- Custom fixtures own the create-and-destroy of test data via API/DB seams (create the order via API, test the UI on it). UI-based setup is slow and couples every test to every screen it crosses.
- `test.describe.configure({ mode: 'parallel' })` and fully parallel workers should be the default; anything that breaks under it has hidden shared state — fix the state (see `quality-dev/principles/flakiness.md`, taxonomy #2), don't serialize the suite.

## Network control

- `page.route()` to fake *external third parties* (payments sandbox, analytics) — never your own backend in true E2E; faking your own API converts an E2E test into an expensive component test with a false label.
- To wait on your own backend's effects, wait for the *specific* response, then assert UI:

```ts
const orderCreated = page.waitForResponse(r => r.url().includes('/api/orders') && r.status() === 201);
await page.getByRole('button', { name: 'Place order' }).click();
await orderCreated;
await expect(page.getByRole('status')).toHaveText(/order confirmed/i);
```

Start the `waitForResponse` *before* the click (as above) or you race the response — starting it after is a classic 1-in-50 flake.

- `page.clock` (1.45+) fakes time in-page for debounce/TTL/countdown testing without living the delay.

## CI: projects, sharding, artifacts

- `--shard=i/n` with balanced timing; keep total E2E wall time ≤15 min (budget from `quality-dev/principles/ci-cd-integration.md`).
- `retries: 1` in CI only, `0` locally; every retry-pass is recorded (`trace: 'on-first-retry'`) and dashboarded — retries are data, not absolution.
- **Traces are the debugging currency.** `trace: 'on-first-retry'` + `playwright show-trace` gives you DOM snapshots, network, console at every step — triage from the trace, not from re-running. A team that triages by re-running is farming coordination out to luck.
- New tests pass `--repeat-each=20 --workers=4` before earning merge-blocking status (admission rule, `quality-dev/principles/ci-cd-integration.md`).

## Common pitfalls (each one is a war story compressed)

| Pitfall | Consequence | Instead |
|---|---|---|
| `page.waitForTimeout(n)` | The canonical scheduled race; too short = flake, too long = dead air | Web-first assertion / `waitForResponse` / `page.clock`; **lint-ban it** (`no-restricted-syntax`) |
| `networkidle` | Deprecated-in-spirit; SPAs with polling/websockets never idle → timeout flakes | Wait for the specific response or UI state |
| Assertions on `textContent()`/`count()` snapshots | Check-once read races render | `toHaveText` / `toHaveCount` retrying forms |
| `nth()`, index-based selection | Breaks on reorder; hides duplicate-element bugs strictness would catch | Role/label + `filter()` |
| UI login per test | Minutes of runtime + auth flakiness × every test | `storageState` per role via setup project |
| Faking own backend routes in E2E | Green suite, broken product; tests drift into fiction | Fake third parties only; own stack runs real |
| `test.only` reaching CI | Silently runs one test, reports green | `forbidOnly: !!process.env.CI` (set it; it's off by default locally) |
| Shared accounts/records across workers | Parallelism-induced intermittents | Unique per-test data via fixtures (`user-${testInfo.parallelIndex}-…`) |
| Screenshot/visual asserts on dynamic regions | Perma-flaky diffs | Mask dynamic areas; see `quality-dev/tools/visual-regression.md` |
| Testing through iframes/new tabs without `frameLocator`/`waitForEvent('popup')` | Intermittent "element not found" | Dedicated APIs exist; use them |

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Flaky E2E (any cause) | Retry-pass dashboard; `ci-flake-history-scanner` ranking | Triage via `quality-dev/principles/flakiness.md` taxonomy using the trace | Lint bans (sleep, `only`), admission `--repeat-each`, strict locators |
| Suite runtime creep | Stage wall-time trend | Shard rebalance; demote non-journey tests down-layer | E2E count budget per `quality-dev/principles/test-strategy.md` |
| Selector churn on refactor | PRs touching many spec files for one UI change | Role/label locators; page-object or locator-map layer for shared surfaces | Review rule: CSS selectors require justification |
| Green E2E, broken prod | Escaped defects in journeys "covered" by mocked-backend tests | Un-mock own backend; add real smoke on deploy | Route-mock allowlist reviewed; E2E defined as "real own-stack" in strategy doc |

## If you're on Cypress (13–14) instead

Same principles, different sharp edges: Cypress retries built-in assertions similarly (`should('have.text', …)`) — same check-once trap exists via `.then()` reads; no native parallel workers without Dashboard/3rd-party orchestration (sharding economics differ); single-tab architecture makes multi-tab/iframe journeys harder — if those journeys matter, that alone justifies Playwright. Do not migrate a working Cypress suite for fashion; migrate when you hit parallelism cost, multi-tab walls, or webkit coverage needs.
