# Building a Design System From Scratch — A Followable Guide

**What you'll have at the end:** a token pipeline (DTCG JSON → CSS custom properties + TS constants), a themed, accessible, composable starter component library (Button, Stack, Text, Dialog — the four that teach every pattern), visual regression testing wired into CI, and the adoption docs that make other teams actually use it.

**Validated against:** Style Dictionary 4.x, Storybook 9, Playwright 1.5x, TypeScript 5.x, React 19 for component examples (the *patterns* — tokens, CSS, a11y contracts, testing — are framework-agnostic; swap the component layer per `web-dev/frameworks/<x>/`). **Date:** 2026-07-13.

**Prerequisites:** a working package/monorepo setup and build tooling — `web-dev/` owns that layer. This guide starts at "empty `packages/design-system` directory."

**Before you start, the judgment check:** a design system is worth building when ≥3 teams/surfaces will consume it. Below that, a well-kept `tokens.css` and a components folder with good review habits is the honest answer — a system is a product with a maintenance bill (`../principles/governance.md`), not a folder rename.

---

## Step 1 — Token source of truth

Why first: every later step consumes tokens; retrofitting them is the quarter-long migration in `../principles/design-tokens.md` §3. Read that doc's tier model before proceeding — this step is its implementation.

`tokens/raw.json` — the palette. No meanings, non-linear scales with gaps:

```json
{
  "color": {
    "gray":  { "50": {"$value":"#F9FAFB","$type":"color"}, "100": {"$value":"#F3F4F6","$type":"color"},
               "400": {"$value":"#9CA3AF","$type":"color"}, "600": {"$value":"#4B5563","$type":"color"},
               "900": {"$value":"#111827","$type":"color"}, "950": {"$value":"#030712","$type":"color"} },
    "blue":  { "500": {"$value":"#3B82F6","$type":"color"}, "600": {"$value":"#2563EB","$type":"color"},
               "300": {"$value":"#93C5FD","$type":"color"} },
    "red":   { "600": {"$value":"#DC2626","$type":"color"}, "300": {"$value":"#FCA5A5","$type":"color"} },
    "white": { "$value": "#FFFFFF", "$type": "color" }
  },
  "space": { "1": {"$value":"0.25rem","$type":"dimension"}, "2": {"$value":"0.5rem","$type":"dimension"},
             "3": {"$value":"0.75rem","$type":"dimension"}, "4": {"$value":"1rem","$type":"dimension"},
             "6": {"$value":"1.5rem","$type":"dimension"},  "8": {"$value":"2rem","$type":"dimension"} },
  "font": {
    "size":   { "100": {"$value":"0.875rem","$type":"dimension"}, "200": {"$value":"1rem","$type":"dimension"},
                "300": {"$value":"1.125rem","$type":"dimension"}, "500": {"$value":"1.5rem","$type":"dimension"} },
    "weight": { "regular": {"$value":"400","$type":"fontWeight"}, "semibold": {"$value":"600","$type":"fontWeight"} }
  },
  "radius": { "sm": {"$value":"0.25rem","$type":"dimension"}, "md": {"$value":"0.5rem","$type":"dimension"} },
  "motion": { "duration": { "fast": {"$value":"200ms","$type":"duration"} },
              "easing":   { "enter": {"$value":"cubic-bezier(0,0,0.2,1)","$type":"cubicBezier"} } }
}
```

`tokens/semantic.json` — the decisions. Role names, aliases only, **per theme**:

```json
{
  "color": {
    "text":    { "primary":   { "$value": "{color.gray.900}", "$extensions": { "theme": { "dark": "{color.gray.100}" } } },
                 "secondary": { "$value": "{color.gray.600}", "$extensions": { "theme": { "dark": "{color.gray.400}" } } },
                 "on-action": { "$value": "{color.white}" },
                 "danger":    { "$value": "{color.red.600}",  "$extensions": { "theme": { "dark": "{color.red.300}" } } } },
    "surface": { "default":   { "$value": "{color.gray.50}",  "$extensions": { "theme": { "dark": "{color.gray.950}" } } },
                 "raised":    { "$value": "{color.white}",    "$extensions": { "theme": { "dark": "{color.gray.900}" } } } },
    "action":  { "primary":         { "$value": "{color.blue.600}", "$extensions": { "theme": { "dark": "{color.blue.500}" } } },
                 "primary-hover":   { "$value": "{color.blue.500}" } },
    "border":  { "focus":    { "$value": "{color.blue.500}", "$extensions": { "theme": { "dark": "{color.blue.300}" } } } }
  },
  "space": { "inset": { "control": { "$value": "{space.2}" }, "card": { "$value": "{space.4}" } },
             "stack": { "sm": { "$value": "{space.2}" }, "md": { "$value": "{space.4}" }, "lg": { "$value": "{space.6}" } } }
}
```

(The `$extensions.theme` shape is one workable convention for theme overrides — Style Dictionary 4 lets a custom format read it; multi-file-per-theme is an equally good convention. Pick one, document it, stay consistent. For brand × mode matrices see `../topics/multi-brand-theming.md`.)

`build-tokens.mjs` — Style Dictionary emits both consumption formats:

```js
import StyleDictionary from 'style-dictionary';

const sd = new StyleDictionary({
  source: ['tokens/*.json'],
  platforms: {
    css: { transformGroup: 'css', buildPath: 'dist/',
           files: [{ destination: 'tokens.css', format: 'css/variables',
                     options: { selector: ':root' } }] },
    ts:  { transformGroup: 'js', buildPath: 'dist/',
           files: [{ destination: 'tokens.ts', format: 'javascript/esm' }] }
  }
});
await sd.buildAllPlatforms();
```

Then generate the dark block (custom format or a small post-step) so `dist/tokens.css` ends up shaped like:

```css
:root  { --color-text-primary: #111827; --color-surface-default: #F9FAFB; /* … */ color-scheme: light dark; }
[data-theme="dark"] { --color-text-primary: #F3F4F6; --color-surface-default: #030712; /* … */ }
@media (prefers-reduced-motion: reduce) { :root { --motion-duration-fast: 1ms; } }
```

Note the last line: reduced-motion is handled **here, once**, per `../principles/animation-motion.md` §2 (1ms, not 0 — transition events must still fire).

**Gate before moving on — the contrast pair-check** (`../principles/component-accessibility.md` §2). `tokens/pairs.json` lists legal combinations; a ~30-line CI script resolves each pair per theme and fails under WCAG ratios:

```json
[ { "fg": "color.text.primary",   "bg": "color.surface.default", "min": 4.5 },
  { "fg": "color.text.secondary", "bg": "color.surface.raised",  "min": 4.5 },
  { "fg": "color.text.on-action", "bg": "color.action.primary",  "min": 4.5 },
  { "fg": "color.border.focus",   "bg": "color.surface.default", "min": 3.0 } ]
```

**✅ Step done when:** `npm run build:tokens` emits `tokens.css` + `tokens.ts`; both themes render; the pair-check runs in CI and you've verified it fails by temporarily lightening a gray.

## Step 2 — Styling discipline (one hour that saves the war)

Per `../principles/css-architecture.md`: declare the cascade layers once in the package's base stylesheet, and lint from day one — the rules are free at zero violations.

```css
/* base.css */
@layer reset, tokens, base, components, utilities;
@import url("./reset.css") layer(reset);
@import url("./tokens.css") layer(tokens);
@layer base { body { background: var(--color-surface-default); color: var(--color-text-primary);
  font-size: var(--font-size-200); } }
```

`.stylelintrc` essentials: `declaration-no-important`, a strict-value rule rejecting raw color/length literals in component styles (token custom properties only), no bare-element descendant selectors in component files, logical properties (`../topics/i18n-layout.md`). Component styles use CSS Modules (or your framework's scoped equivalent) in the `components` layer.

**✅ Step done when:** lint passes on the empty package and fails on a test file containing `color: #333` and `!important`.

## Step 3 — The starter components (each teaches a pattern class)

Read `../principles/component-api.md` first; these four are its patterns made concrete. Build them in this order — each is used by the next.

**3a. `Text` — the token-consumption pattern.** Maps semantic props to tokens; nobody else in the app should ever set a font size directly.

```tsx
// Text.tsx
import styles from './Text.module.css';
import type { ComponentProps, ElementType } from 'react';

type TextProps = {
  as?: ElementType;                       // h1..h6, p, span — semantics chosen by the consumer
  size?: 'body-sm' | 'body' | 'heading';  // intent names, not px (component-api.md §1)
  tone?: 'primary' | 'secondary' | 'danger';
} & ComponentProps<'p'>;

export function Text({ as: Tag = 'p', size = 'body', tone = 'primary', className, ...rest }: TextProps) {
  return <Tag className={[styles.text, styles[size], styles[tone], className].filter(Boolean).join(' ')} {...rest} />;
}
```

```css
/* Text.module.css — every value a token; note: no margins (css-architecture.md §2 — parents own spacing) */
.text { margin: 0; }
.body-sm  { font-size: var(--font-size-100); }
.body     { font-size: var(--font-size-200); }
.heading  { font-size: var(--font-size-500); font-weight: var(--font-weight-semibold); }
.primary   { color: var(--color-text-primary); }
.secondary { color: var(--color-text-secondary); }
.danger    { color: var(--color-text-danger); }
```

**3b. `Stack` — the layout-primitive pattern.** Owns spacing *between* children so components stay margin-free:

```tsx
export function Stack({ gap = 'md', as: Tag = 'div', className, ...rest }: StackProps) {
  return <Tag className={[styles.stack, styles[`gap-${gap}`], className].filter(Boolean).join(' ')} {...rest} />;
}
```
```css
.stack { display: flex; flex-direction: column; min-width: 0; } /* min-width: 0 — responsive-design.md §2 */
.gap-sm { gap: var(--space-stack-sm); } .gap-md { gap: var(--space-stack-md); } .gap-lg { gap: var(--space-stack-lg); }
```
(Build `Inline` as the horizontal twin with `flex-wrap: wrap` — ten minutes, same shape.)

**3c. `Button` — the full API + a11y pattern.** Enums not booleans, platform vocabulary spread, state parity:

```tsx
type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'danger';   // enum from day one (component-api.md §2)
  size?: 'sm' | 'md';
  loading?: boolean;
} & ComponentProps<'button'>;                      // accepts aria-*, data-*, onFocus… for free (§3)

export function Button({ variant = 'primary', size = 'md', loading = false,
                         disabled, children, className, ...rest }: ButtonProps) {
  return (
    <button
      className={[styles.button, styles[variant], styles[size], className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}            /* state parity: component-accessibility.md §4 */
      {...rest}
    >
      {loading && <Spinner aria-hidden />}
      <span className={loading ? styles.dimmed : undefined}>{children}</span>  {/* name never vanishes */}
    </button>
  );
}
```

```css
.button {
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: var(--space-inset-control) var(--space-4);
  border: none; border-radius: var(--radius-md);
  font: inherit; font-weight: var(--font-weight-semibold); cursor: pointer;
  transition: background var(--motion-duration-fast) var(--motion-easing-enter); /* compositor-safe + inherits reduced-motion */
}
.button:focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 2px; }
.button:disabled { opacity: 0.5; cursor: not-allowed; }
.primary { background: var(--color-action-primary); color: var(--color-text-on-action); }
.primary:hover:not(:disabled) { background: var(--color-action-primary-hover); }
/* secondary, danger: same shape, their own semantic tokens */
```

**3d. `Dialog` — the compound/focus-contract pattern.** Native `<dialog>` (focus trap, Escape, backdrop free — `../principles/component-accessibility.md` §1), layered API (`../principles/component-api.md`): a configured `<Dialog title actions>` for the 80% case, compound `Dialog.Root/Title/Actions` as the fork-preventing escape hatch. Write the focus contract into its doc comment: *opens → focus to panel; closes → focus returns to trigger.* This is the component to spend real time on — it's the template for every overlay you'll build after.

**✅ Step done when:** all four render in both themes with zero raw values (lint proves it); Button's keyboard walkthrough passes; Dialog's focus contract is asserted in an interaction test (`document.activeElement` on open/close).

## Step 4 — Stories, including the ugly ones

Storybook (or equivalent): every component gets every state as a story — variants, disabled, loading, **and the stress stories** (`../principles/responsive-design.md` §2): 2×-length label, empty content, pseudo-locale string, narrow-container render. Stories are the catalog (governance §discoverability), the dev sandbox, and the visual-test fixtures — one artifact, three jobs. A component without stress stories isn't done; that's the definition-of-done, not advice.

## Step 5 — Visual regression wiring

Per `../principles/visual-regression-testing.md` — the determinism checklist is mandatory, the sampling rules keep it reviewable:

```ts
// visual.spec.ts — Playwright against the built Storybook (pinned browser in CI's container)
import { test, expect } from '@playwright/test';
import stories from '../storybook-static/index.json';   // Storybook 9 story index

const themes = ['light', 'dark'];
for (const story of relevantStories(stories))            // all stories, default theme; themed states × both — VRT doc §matrix
  for (const theme of themesFor(story, themes))
    test(`${story.id} [${theme}]`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });          // animations off
      await page.goto(`/iframe.html?id=${story.id}&globals=theme:${theme}`);
      await page.evaluate(() => document.fonts.ready);               // fonts before capture
      await expect(page.locator('#storybook-root')).toHaveScreenshot(
        { animations: 'disabled', maxDiffPixelRatio: 0.001 });       // near-zero threshold
    });
```

CI: build tokens → lint → contrast pair-check → interaction tests → build Storybook → visual suite. Baselines live in the repo, updated in the same PR as the change, **reviewed by the system's owners** (the intended-change workflow, VRT doc §3).

**✅ Step done when:** a deliberate one-line token change fails CI with a readable diff image, and updating the baseline in-PR makes it pass.

## Step 6 — Adoption docs (the system is a product; this is its onboarding)

Minimum shippable set, in the package README / catalog:

1. **Install + one-screen quickstart** — tokens.css import, theme attribute, a Button on screen in <5 minutes.
2. **The token vocabulary with usage descriptions** ("`surface.default`: page background — never for text"), because misuse is a vocabulary gap (`../principles/design-tokens.md` §2).
3. **The rules of the game:** no raw values (lint enforces), no margins on components (Stack/Inline own spacing), how to request a token or propose a component **and the SLO you're committing to** (`../principles/governance.md` — same-day tokens, one-week triage; don't publish an SLO you can't staff).
4. **Per-component pages = the stories + the focus/keyboard contract + do/don't.**
5. **The escape-hatch doctrine, in writing:** "if the component can't do what you need, here is the compound layer, and here is where to tell us — forking is never the supported path, and we'll always give you a faster one."

**✅ System v1 done when:** an engineer outside the team builds a themed, keyboard-accessible screen from docs alone — watch one try, fix what they trip on, *then* announce. That test finds more than any checklist.

## What to build next (in observed order of need)

Input/Field (label + error wiring — state parity §4), Card (subgrid alignment — responsive §2), Select/Menu (headless library skinned with your tokens — a11y decision tree step 2; do **not** hand-roll), Toast (the one live-region — `web-dev/principles/accessibility.md`), page-layout primitives. Each new component: scaffold with the `../skills/component-from-tokens-generator/` skill, review with `../skills/design-system-consistency-reviewer/`.
