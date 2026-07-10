# Locator Strategy

**Stamped:** 2026-07-06 · Applies to: Playwright 1.50, Selenium 4.27, Appium 2.12 (concepts tool-agnostic).

Selector churn — the rate at which locators must be edited because the app changed for reasons unrelated to behavior — is the #1 line item in E2E maintenance cost. I tracked it for two years on a 1,200-test suite: before the strategy below, ~35 selector fixes/week (≈ one engineer half-time doing nothing else). After: ~4/week. Nothing else in this KB has that ROI.

## The selector hierarchy

Use the highest entry that uniquely identifies the element. This is a decision tree, not a menu.

1. **Accessibility role + name** — `getByRole('button', {name: 'Submit order'})`. First choice for anything interactive. Survives full DOM/styling rewrites; only breaks when the *user-visible interface* changes — exactly when you *want* the test to break. Bonus: unlocatable elements are often genuine a11y defects.
2. **Label / placeholder** (form fields) — `getByLabel('Email address')`. Same properties as role for inputs.
3. **Test ID** — `getByTestId('order-row')` / `[data-testid=...]`. When roles don't discriminate (the 40th row in a grid, one card among many identical) or the element is non-interactive. Requires the app-team contract (below).
4. **Visible text** — `getByText('Order #1234')` for content assertions. Fine for asserting *content*; weak for *navigation* (copy changes with product whims; breaks per-locale — parameterize through your i18n source if you test multiple locales).
5. **Structural CSS** — `.order-list > li:first-child`. Last resort; only with a written justification comment; only anchored to a test ID container (`getByTestId('order-list').locator('li')`).
6. **Never:** XPath with positional indexing (`//div[3]/div[2]/span`), style-coupled classes (`.btn-primary.mt-4`), generated ids (`#ember1234`, `#radix-:r3:`, CSS-modules hashes like `.Button_root__x7Kq2`). These encode *how the page happens to be built today*. Churn rate in my tracking: positional XPath broke on 60%+ of app releases; role-based broke on <2%.

Mobile equivalents (`frameworks/appium/README.md` for depth): accessibility id ≻ resource-id/name ≻ class chain / UiSelector ≻ never XPath (10-100× slower on mobile *and* brittle).

### The test-ID contract with the app team

Test IDs only work as a *contract*: app engineers add `data-testid` to elements tests need, never rename without a deprecation window, and treat test-ID removal as a breaking change in code review. Get this agreed explicitly (I've done it as a one-page ADR). Naming: semantic, kebab-case, describing the element's role in the domain (`checkout-submit`, `order-row`), never its appearance (`blue-button`) or position (`third-card`). Where components are reused, suffix with instance context at the usage site.

Objection you will hear: "test IDs pollute production markup." Response that has always won: they're ~20 bytes each, they can be stripped at build time if anyone genuinely cares (nobody ever has), and the alternative is tests coupled to markup that engineers can no longer refactor safely — which is a real cost paid weekly, versus an aesthetic one.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Style-coupled selector (`.btn-primary`) breaks on redesign | Waves of `element not found` after a pure-CSS release | Re-anchor to role or test ID | Lint rule banning class-name selectors in specs (regex on `locator('.` + curated allowlist); `selector-fragility-reviewer` skill on every PR |
| Positional XPath breaks on layout change | Same symptom; also *silent wrong-element* selection when structure shifts but XPath still resolves | Rewrite to role/test ID; add an assertion on the element's identity if wrongness was silent | Ban `//` XPath outright in web suites; there is no legitimate use Playwright locators can't cover |
| Generated/hashed IDs break every build | Selectors contain framework tells: `ember`, `:r\d+:`, `__[A-Za-z0-9]{5}` suffixes | Test ID or role | Scanner regex in `agents/suite-wide-antipattern-scanner.md` catches these patterns suite-wide |
| Ambiguous locator resolves to wrong element | Playwright strict-mode violation (good — it tells you); Selenium `findElement` silently takes the *first* match (bad — wrong-element actions, "impossible" failures) | Tighten with role+name or scope under a container test ID | Keep Playwright strict mode on (default); in Selenium, assert `findElements().size() == 1` in your element helper |
| Selector duplicated across 30 tests | Grep during any churn incident finds the same string everywhere | Centralize in the page/component object | Architecture rule: selectors live only in page objects (`framework-architecture.md`); lint specs for raw `locator(`/`By.` outside that layer |

## Self-healing locators: the honest tradeoff

Tools (Healenium, and the "AI-powered" tier of most codeless platforms) that catch a locator failure and substitute the most-similar element found by attribute/position heuristics.

- **What you gain:** lower churn on suites that are *already* built on brittle selectors. On a legacy Selenium suite with thousands of XPath locators, a healing layer can cut selector-failure noise 50–70% while you migrate.
- **What you pay:** the failure mode inverts from *loud and false* (element not found — annoying but honest) to *silent and wrong* (test clicks the element the heuristic guessed, passes, verifies nothing). A passing test that tests the wrong thing is strictly worse than a failing one. You also add a component whose decisions you must audit — healing logs become a review queue, or the healing is unaudited.
- **Decision rule:** self-healing is a *migration bridge* for legacy suites, with healing events surfaced as CI warnings and a hard budget (healed locator must be fixed within N days, tracked like quarantine). It is never the strategy for a new suite — if you're writing new code, write resilient locators; healing a `getByRole` that broke means the *product* changed and a human should look.

## Maintenance economics at scale

The cost of a selector is not writing it — it's every future edit times the number of places it lives. Model: `annual cost ≈ churn_rate × instances × fix_time`. A `.submit-btn` used inline in 25 specs at a 30%/quarter churn rate ≈ 30 fixes/year; the same element as `getByRole('button', {name:'Submit'})` in one page object ≈ <1. This is why the hierarchy and the centralization rule are one strategy, not two: **resilient selectors, defined once.**

At 10× suite growth the only strategies that survive are the ones where selector count grows with *distinct UI surfaces*, not with test count. If adding a test adds selectors, the architecture is wrong — see `framework-architecture.md` §layering.

## Cross-references

- Review procedure for diffs: `skills/selector-fragility-reviewer/SKILL.md`
- Suite-wide scan: `agents/suite-wide-antipattern-scanner.md`
- Tool-specific locator APIs and pitfalls: `frameworks/playwright/README.md`, `frameworks/selenium/README.md`, `frameworks/appium/README.md`
- Whether a scenario should be an E2E test at all (fewer tests, fewer selectors): `@quality-dev/` test-strategy material
