# Playwright — Full-Depth Reference

**Stamped:** 2026-07-06 · **Applies to:** Playwright 1.50 (Node/TypeScript). Locator/fixture/assertion APIs stable since ~1.27; verify trace-viewer and report-merging details against current docs if you're far past 1.50. Playwright ships monthly — stay current (`principles/maintainability-and-tech-debt.md` §upgrades).

Playwright is this KB's primary web E2E stack, and the from-scratch build (`guides/build-framework-from-scratch.md`) uses it. This doc covers how each principle lands in Playwright, plus the tool-specific traps. It assumes the principles docs; each section links up.

## Architecture: fixtures are the framework (`principles/framework-architecture.md`)

Idiomatic Playwright composes via `test.extend()`, not base classes. The three layers map as: tests → page/component objects (plain classes, no inheritance) → fixtures (the driver/infra layer: auth, data, page-object construction).

```ts
// fixtures.ts — the only file tests import `test` from
type AppFixtures = {
  checkoutPage: CheckoutPage;
  proUser: User;                    // test-scoped: fresh per test
};
type WorkerFixtures = {
  apiClient: ApiClient;             // worker-scoped: built once per worker
};

export const test = base.extend<AppFixtures, WorkerFixtures>({
  apiClient: [async ({}, use, workerInfo) => {
    await use(new ApiClient(config.apiUrl, workerAuth(workerInfo.workerIndex)));
  }, { scope: 'worker' }],
  proUser: async ({ apiClient }, use) => {
    await use(await apiClient.users.create(makeUser({ plan: 'pro' })));  // unique per test
  },
  checkoutPage: async ({ page }, use) => { await use(new CheckoutPage(page)); },
});
```

Key properties to exploit: fixtures are **lazy** (a test that doesn't use `proUser` doesn't pay for it), **composable** (fixtures depend on fixtures), and **teardown-ordered** (reverse of setup, runs even on failure — put unavoidable cleanup here, per `principles/test-data-management.md` §cleanup). **Worker scope** is the tool for expensive setup shared safely: one API client, one auth state, one DB schema *per worker* — parallel-safe by construction because workers don't share memory.

**Auth pattern (the big one):** authenticate once via API in a setup project, save `storageState` to a file per role (or per worker for mutation-heavy suites — `principles/parallelization-and-sharding.md` §session-invalidation), inject via `test.use({ storageState })`. UI login is one test, not a per-test tax. This is the standard first fix in any slow Playwright suite.

**Trap — `test.describe.configure({ mode: 'serial' })`:** serial mode makes later tests skip on earlier failure and defeats parallelism. Legitimate only for true multi-step journeys; every use is a parallelism tax to budget (`principles/test-data-management.md` §order-dependence).

## Locators (`principles/locator-strategy.md`)

The hierarchy maps directly: `getByRole` > `getByLabel`/`getByPlaceholder` > `getByTestId` > `getByText` > scoped `locator()` css > never XPath. Playwright specifics:

- **Strict mode is your friend — keep it.** A locator resolving to 2+ elements throws instead of silently acting on the first (Selenium's classic silent-wrong-element bug, designed out). When you hit a strict-mode violation, *tighten the locator* (role+name, or scope: `page.getByTestId('order-list').getByRole('button', {name: 'Remove'})`); reaching for `.first()` is usually encoding DOM position — allowed only when "first" is genuinely the semantic ("most recent notification"), with a comment.
- **Locators are lazy** — resolved at action time, auto-retrying, immune to stale-element. Corollary: **never** extract with `elementHandle()`/`$` (eagerly-resolved handles reintroduce staleness); handles are for the rare CDP/evaluate edge.
- **`getByTestId` default attribute is `data-testid`**; change via `use.testIdAttribute` if the app team standardized differently — one config line, not per-call.
- **Filtering beats structure:** `rows.filter({ hasText: 'Order #1234' })` instead of nth-child math.
- **Custom-matcher rule:** `page.getByRole` requires real accessibility semantics in the app. When the app renders div-soup, the fix is in the app (it's an a11y bug too — leverage per `principles/locator-strategy.md` §contract), with `getByTestId` as the fallback, *not* clever CSS.

## Waiting (`principles/waiting-and-synchronization.md`)

Playwright's auto-wait covers actionability (visible/stable/enabled/receives-events) before actions, and **web-first assertions** (`await expect(locator).toHaveText(...)`) poll until pass or timeout. The consequences:

- **Explicit waits are almost always redundant** — `waitForSelector` before a click is noise; the click waits. A suite full of `waitForSelector` was ported from Selenium mentally.
- **The assertion IS the wait.** Banned pattern: `expect(await locator.isVisible()).toBe(true)` and `expect(await locator.textContent()).toBe(...)` — instant, non-retrying reads racing the app (the #1 Playwright flake source in my triage logs). Same-shaped `toBeVisible()`/`toHaveText()` retry. The `agents/suite-wide-antipattern-scanner.md` regex for this: `expect\(await .*\.(isVisible|textContent|innerText|count)\(`.
- **What auto-wait does NOT cover:** hydration gaps (visible-but-handler-not-attached — the top residual flake class; fix via app readiness signal, see the principles doc's race catalog), data-settling behind an already-rendered skeleton (use polling assertions on the *content*), and non-DOM conditions (jobs, emails — `expect.poll(async () => api.getStatus(id)).toBe('done')`).
- **`waitForTimeout` is banned by lint** (it exists in the API; that's not an endorsement). `waitForLoadState('networkidle')` is officially discouraged and flaky on websocket/polling apps — wait for your element instead.
- **Timeouts:** defaults (5s expect / 30s test) are right. Override *at call sites* with a comment; a raised global default is a silenced slowness signal.

## Parallelism (`principles/parallelization-and-sharding.md`)

Two multiplied layers: `workers` (processes per machine; default cores/2, tune to 3–4 on 4-vCPU CI runners) × `--shard=i/N` (machines). Enable `fullyParallel: true` so same-file tests parallelize — it's also the order-dependence detector. Within a machine Playwright assigns longest-first automatically; across machines, `--shard` splits by file count, so a whale spec file skews shards — split whale files, or drive shard contents yourself from the timing store. **Projects** (browser × config combos) multiply the matrix — govern per `principles/cross-platform-and-browser.md` tiers: `chromium` project on PRs; `webkit`/`firefox` projects on nightly; remember Playwright WebKit ≠ real Safari for certification purposes.

## Test data (`principles/test-data-management.md`)

Factories live behind fixtures (above). Third-party boundary mocking: `page.route()` for request interception (payment, analytics) — cleaner than proxy tools; HAR replay (`routeFromHAR`) for heavy read-only third-party payloads. Keep route mocks in fixtures, not test bodies (layering). API-first data setup uses Playwright's `request` fixture — same auth machinery, no extra HTTP client.

## CI & reporting (`principles/ci-cd-integration.md`, `principles/reporting-and-observability.md`)

- **Config posture:** `retries: process.env.CI ? 1 : 0` (flakes visible locally, measured in CI); `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`. `forbidOnly: !!process.env.CI` (a stray `.only` silently skipping the suite in CI is a classic silent-coverage-loss incident).
- **Sharded reporting:** `blob` reporter per shard → `merge-reports` job → single HTML/Allure report. Sixteen partial reports = missed failures; the merge step is not optional. Wiring: `frameworks/github-actions/README.md`.
- **Browser caching:** cache `~/.cache/ms-playwright` keyed on Playwright version; run `npx playwright install --with-deps` only on cache miss (OS deps still need `install-deps` on bare runners — the classic "works cached, breaks on new runner image" gotcha).
- **The trace viewer is the triage tool** — time-travel DOM, network, console per action. Train every engineer on it; it's what makes the two-minute triage (`principles/reporting-and-observability.md`) real. `npx playwright show-trace trace.zip` on the artifact.

## Playwright-specific failure modes

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| `expect(await x.isVisible())` instant-read races | Flake with "expected true, received false", screenshot shows loading state | Web-first assertion | Lint rule + scanner regex above |
| Stray `.only` skips suite in CI | Suite "passes" in seconds; test count cratered | Remove; check what merged meanwhile | `forbidOnly` in config |
| `.first()`/`.nth()` encoding DOM position | Strict-mode workarounds in review; wrong-element actions after reorders | Tighten with role/testid/filter | Review checklist in `skills/selector-fragility-reviewer` |
| Serial-mode overuse | `describe.serial` count grows; parallelism gains stall | Hermetic data per test; unwind serial | Serial requires justification comment; budget tracked |
| Handle-based staleness (`$`, `elementHandle`) | `Element is not attached` errors | Convert to locators | Lint-ban `page.$` in specs |
| Worker-count contention flakes | p95 degrades as workers rise; timeout cluster on heavy specs | Drop workers or bigger runners | Duration-vs-workers check in `agents/ci-runtime-profiler.md` |
| Uncached browser install ×16 shards | Shard setup ≫ 60s on install step | Version-keyed browser cache / prebaked image | Profiler setup:test ratio alert |

## Cross-references

Build a framework on this stack end-to-end: `guides/build-framework-from-scratch.md`. Scaffolding templates: `skills/suite-scaffolder`. Migrating *from* Selenium: read this doc's architecture + waiting sections, then `principles/maintainability-and-tech-debt.md` §big-bang-migrations.
