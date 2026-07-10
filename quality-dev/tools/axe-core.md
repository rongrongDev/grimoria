# axe-core — automated accessibility scanning production patterns & pitfalls (extended tier)

**Applies to:** axe-core 4.10, `@axe-core/playwright` · **Last verified:** 2026-07-06
**Tier note:** extended — production patterns + pitfalls. The boundary of what automation can and cannot catch (the 30–40% reality, the keyboard pass, screen-reader cadence) is the principle doc: `quality-dev/principles/accessibility-testing.md` — read it before wiring anything, or you'll ship a green dashboard and an unusable product.

## Production patterns

- **Scan states, not pages.** Hook axe into E2E journeys you already run (`quality-dev/tools/playwright.md`) and scan after each meaningful state change — modal open, error banner shown, menu expanded. Default-state-only scanning misses most real violations because most UI lives behind interaction:

```ts
import AxeBuilder from '@axe-core/playwright';

const scan = (page: Page, context: string) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze()
    .then(r => attachAndAssert(r, context));   // shared helper: baseline filter + report artifact

await page.getByRole('button', { name: 'Delete account' }).click();
await expect(page.getByRole('alertdialog')).toBeVisible();
await scan(page, 'delete-confirmation-dialog');
```

- **Component-library-first:** scan shared components in isolation (Storybook axe integration or component-test harness). One fix at the component level propagates everywhere; per-page fixes of the same button repeat forever.
- **Baseline + ratchet gating** (same mechanism as SAST, `quality-dev/principles/security-testing.md`): existing violations recorded in a baseline file with owners; **new** violations block merge; `critical`/`serious` on money paths block regardless. Turning on a zero-tolerance gate over 300 legacy findings gets your gate deleted within a sprint — I've watched it happen.
- **Pin the ruleset:** `withTags` explicitly, and pin the axe-core version — rule additions in minor versions otherwise fail builds for changes nobody made. Upgrade deliberately; log in `quality-dev/CHANGELOG.md`.
- **Rule exclusions need receipts.** `disableRules(['color-contrast'])` on a flagged brand color is a decision by design+legal, recorded next to the exclusion with a comment and a ticket — not a developer convenience. An exclusion file without justifications is where compliance goes to die quietly.
- **Report artifacts:** persist the JSON results per scan context; the trend (violations by rule, by component, over time) is your burn-down dashboard.

## Common pitfalls

| Pitfall | Consequence | Instead |
|---|---|---|
| Treating green axe as "accessible" | Keyboard traps, useless alt text, SR chaos ship — with a compliance-looking dashboard (the demand-letter story: `quality-dev/principles/accessibility-testing.md`) | Publish the 30–40% boundary; manual cadence alongside |
| Scanning only default page states | Modals/errors/menus never checked | Scan post-interaction states in journeys |
| Zero-tolerance gate on legacy debt | Gate disabled within weeks | Baseline + ratchet; block only new + critical-on-money-paths |
| Unpinned axe version | Builds fail on rule additions, trust erodes | Pin; upgrade deliberately with changelog entry |
| Undocumented rule exclusions | Silent compliance holes | Exclusion = comment + owner + ticket |
| Per-page fixes of shared components | Same violation whack-a-moled forever | Component-level scans and fixes |
| iframe content silently unscanned | False confidence on embedded flows (payments!) | axe scans same-origin frames by default — verify cross-origin embeds separately with their owner |
| Scanning before hydration/render completes | Nondeterministic violation counts (flaky a11y checks) | Scan after a web-first assertion confirms the state (`quality-dev/tools/playwright.md`) |
