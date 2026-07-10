# Build an Automation Framework From Scratch

**Stamped:** 2026-07-06 · **Applies to:** Playwright 1.50 + TypeScript + GitHub Actions + Allure 2.32. Followable start-to-finish by a human or an AI agent; each step has a done-check. Total effort: ~3–5 engineer-days to step 8; the result is minimal but architecturally sound — every later scale-up (more tests, more browsers, more shards) is additive, not corrective.

Read `principles/core-principles.md` first (10 minutes). Everything below is those laws, in build order.

## Step 0 — Three decisions before any code

1. **Tool:** Playwright unless a disqualifier applies — JVM/.NET-only team or large existing Selenium estate (→ `frameworks/selenium/README.md`), mobile native (→ `frameworks/appium/README.md`). Don't relitigate this per team; write the one-paragraph ADR and move.
2. **What the blocking suite covers:** get the list of critical journeys from the risk analysis — this is strategy, `@quality-dev/` territory (`test-strategy-planner`). You're building the machine; get the cargo manifest from them. Target: the blocking set fits in 10 minutes wall-clock forever (core law 3).
3. **The two app-team contracts**, agreed in writing (a short ADR each) *before* you write tests, because they're 10× harder to retrofit:
   - **Test-ID/a11y contract** (`principles/locator-strategy.md` §contract): interactive elements get roles/names; `data-testid` where roles don't discriminate; removal = breaking change.
   - **Test-environment contract:** an environment you can hit with API calls to create data (`principles/test-data-management.md`), plus an app readiness signal if the app hydrates (`principles/waiting-and-synchronization.md` §race-1).

**Done-check:** two ADRs merged; journey list exists; tool chosen.

## Step 1 — Repo skeleton and layering

```
e2e/
├── playwright.config.ts
├── package.json
├── tests/                    # intent + assertions ONLY
│   └── checkout/checkout.spec.ts
├── pages/                    # page objects: locators + interactions
│   ├── components/           # shared widgets (grow into this)
│   └── checkout.page.ts
├── fixtures/
│   ├── index.ts              # the composed `test` every spec imports
│   ├── auth.setup.ts         # storage-state generation (setup project)
│   └── data.ts               # factory fixtures
├── api/                      # thin API client for data setup
│   └── client.ts
├── data/factories/           # makeUser(), makeOrder()...
└── lint/                     # custom rules (step 6)
```

The directory boundaries ARE the architecture (`principles/framework-architecture.md`): specs import from `fixtures/` and assert; `pages/` owns every locator; `api/` + `data/` own every entity. No file crosses lanes.

Config essentials (full reasoning in `frameworks/playwright/README.md`):

```ts
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  use: {
    baseURL: process.env.BASE_URL,
    trace: 'on-first-retry', screenshot: 'only-on-failure', video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'],
        storageState: '.auth/user.json' }, dependencies: ['setup'] },
  ],
});
```

**Done-check:** `npx playwright test` runs an empty suite green in CI and locally.

## Step 2 — Data factories and API client (before any test!)

Order matters: build the data layer first or your first test will hardcode "the test user" and you'll fight that pattern forever (`principles/test-data-management.md`).

```ts
// data/factories/user.ts
export const makeUser = (overrides: Partial<UserSpec> = {}): UserSpec => ({
  email: `user-${randomUUID().slice(0, 8)}@test.example`,   // unique BY CONSTRUCTION
  password: randomUUID(), name: 'Test User', plan: 'free',
  ...overrides,
});
// api/client.ts — creates entities through the app's real API
export class ApiClient {
  constructor(private ctx: APIRequestContext) {}
  async createUser(spec: UserSpec): Promise<User> { /* POST /api/users, assert 201 */ }
}
```

Cleanup strategy: unique data + scheduled GC of `@test.example`-domain entities older than 24h (strategy 1 in `principles/test-data-management.md` §cleanup — no synchronous teardown to flake).

**Done-check:** a script can create and GC a user via API against the test environment.

## Step 3 — Auth once, fixtures as the spine

`auth.setup.ts`: create a standing per-role user via API (or use a provisioned one for roles that are expensive), log in **via API request + storageState save** — the UI login form gets exactly one test of its own. Then compose everything specs need in `fixtures/index.ts` (worker-scoped `apiClient`, test-scoped fresh entities, page-object injection — the exact pattern with code is `frameworks/playwright/README.md` §fixtures).

**Done-check:** a trivial spec gets an authenticated page + a fresh user without any login/setup lines in the spec body.

## Step 4 — First page object + first real test

```ts
// pages/checkout.page.ts
export class CheckoutPage {
  constructor(private page: Page) {}
  readonly total = this.page.getByTestId('order-total');
  async open() { await this.page.goto('/checkout'); }
  async applyPromo(code: string) {
    await this.page.getByLabel('Promo code').fill(code);
    await this.page.getByRole('button', { name: 'Apply' }).click();
  }
}
// tests/checkout/checkout.spec.ts
test('promo code reduces the total', async ({ checkoutPage, proUser, cartWith }) => {
  await cartWith({ sku: 'annual-plan' });
  await checkoutPage.open();
  await checkoutPage.applyPromo('SAVE20');
  await expect(checkoutPage.total).toHaveText('$86.40');   // polling assertion = the wait
});
```

Every rule visible: role/label/test-id locators only; no waits (auto-wait + web-first assertion); data via factories; business assertion in the test, not the page object. This spec is your **worked example** — link it from the README; `skills/suite-scaffolder` stamps its siblings.

**Done-check:** test passes 20× consecutively at `--repeat-each=20 --workers=4` (flake check *before* the pattern replicates), and fails informatively when you break the app deliberately (change the promo logic locally — does the failure report read well? Core law 9.)

## Step 5 — CI pipeline

Copy the reference pipeline from `frameworks/github-actions/README.md` verbatim: build-once → 4 shards (`fail-fast: false`, browser cache, artifact download) → merge-reports (runs `if: !cancelled()`) → single report published, PR comment with failure summary + deep link. Add `concurrency` cancel-in-progress and `timeout-minutes` from day one. Wire Allure now if you know you'll be multi-framework/sharded-with-history; otherwise Playwright HTML report is fine until the trigger in `frameworks/allure/README.md` fires.

**Done-check:** a PR with a deliberately broken test shows: red check ≤ 10 min, one report link, trace downloadable, failure readable in 2 min by someone who didn't write the test.

## Step 6 — Enforcement (the step everyone skips, the step that keeps it sound)

Conventions unenforced are suggestions (core law 6). Minimum lint set, as CI-failing errors:

- Ban `waitForTimeout`, `page.$`, `element(handle)` in `tests/` and `pages/` (`no-restricted-properties`/`no-restricted-syntax`).
- Ban `expect(await …isVisible())` and instant-read assertion shapes (`agents/suite-wide-antipattern-scanner.md` has the regexes; encode as ESLint rules).
- Boundary rules: no `getBy`/`locator(` in `tests/` (selectors live in `pages/`); no `expect(` in `pages/`; no imports of `api/` from `tests/` except via fixtures.
- `describe.serial` and `.only` restricted (forbidOnly covers CI; lint covers review).

**Done-check:** each banned pattern, added deliberately, fails CI with a message pointing at the relevant principles doc.

## Step 7 — Order/parallel hazard detection + budget gate

Stand up the **nightly random-order max-parallelism run** (`principles/test-data-management.md` §order-dependence — it's the detector for the two hazards that review can't catch) and the **runtime budget gate** with attribution (`principles/ci-cd-integration.md` §budget). Both are small workflows; both prevent the two decay modes (hidden coupling, runtime creep) that killed every collapsed suite I've autopsied.

**Done-check:** nightly workflow exists and pages nobody (it's green); budget gate fails a branch where you add `test.slow()` × 50 as a drill.

## Step 8 — Flake telemetry and quarantine (lightweight now, automate later)

From day one: CI emits pass-on-retry events (Playwright's `flaky` status from the JSON reporter) to a simple store (a DB table; even a committed NDJSON file to start). The quarantine *bot* (`principles/ci-cd-integration.md` §quarantine) can wait until you have >100 tests; the *telemetry* cannot — you can't retrofit history.

**Done-check:** a deliberately flaky test (random fail 30%) shows up in the store with its signature after a day of runs.

## What you deliberately did NOT build

No cross-browser matrix (add WebKit/Firefox as *nightly* projects when journeys justify — `principles/cross-platform-and-browser.md`), no visual testing (trigger: `frameworks/visual-regression.md` §where-it-pays), no wrapper layers, no BasePage, no self-healing anything, no second reporting system. Each has a documented trigger; adding them early is how minimal frameworks become legacy frameworks before shipping their tenth test.

## Scale-up pointers (when N grows)

Suite > ~200 tests or > 10 contributors: re-read `principles/parallelization-and-sharding.md` (shard count math), split `fixtures/index.ts` by domain, adopt component objects (`principles/framework-architecture.md`), quarterly health review (`principles/maintainability-and-tech-debt.md` §four-metrics). The architecture above doesn't change — that's the point.
