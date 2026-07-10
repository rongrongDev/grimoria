# Visual Regression — Percy/Chromatic production patterns & pitfalls (extended tier)

**Applies to:** Percy & Chromatic SaaS (current as of date), Playwright `toHaveScreenshot` for self-hosted · **Last verified:** 2026-07-06
**Tier note:** extended — production patterns + pitfalls. Where visual testing fits strategy: it verifies *appearance*, which functional tests structurally cannot — and it fails toward the same ritual-approval trap as snapshot tests (`quality-dev/tools/jest-vitest.md`), so its discipline section matters more than its setup section.

## When it earns its keep (and when it doesn't)

Worth it: design systems/component libraries (one component regression = every consumer), marketing/brand-critical surfaces, CSS-refactor safety nets, cross-browser rendering of layout-critical UI. Not worth it: rapidly-iterating product UI (every intentional change costs a review), data-dense internal tools, or as a substitute for functional assertions — a screenshot asserting a number is a functional test with the worst possible diff output.

## Production patterns

- **Component-level first (Chromatic/Storybook model):** snapshot components in isolated, controlled states; page-level shots only for a handful of critical composed views. Component diffs localize the change; page diffs implicate everything above the fold.
- **Kill nondeterminism before it kills you.** Every dynamic region is a perma-flaky diff: freeze time (fake clock for dates/countdowns), seed or stub data, mask what can't be frozen (avatars, ads, maps), disable animations/carets (`animations: 'disabled'` in Playwright; Percy/Chromatic do this by default), wait for fonts/images loaded before capture (web-first assertion on a load-complete condition, not a sleep — `quality-dev/principles/flakiness.md` applies to pixels too).
- **Pin the rendering environment.** Browser version, viewport set, device scale factor, OS font stack — a Chrome update or a missing CJK font shifts anti-aliasing and produces hundred-shot "regressions." SaaS renderers (Percy/Chromatic) exist largely to solve exactly this; self-hosted `toHaveScreenshot` estates must pin browser + container image and regenerate baselines on deliberate upgrades only (log in `quality-dev/CHANGELOG.md`).
- **Review discipline is the actual product.** The failure arc mirrors snapshots: diff queue grows → approvals become reflexive → a real regression gets rubber-stamped. Rules that keep signal: UI-owning engineer/designer reviews (not whoever merged), diffs auto-assigned per component owner, a **diff budget** — if >~20 shots change in a PR that intended one visual change, the PR is wrong or the baselines are stale; investigate before approving anything.
- **Threshold tuning is a last resort,** not a flake fix: raising `maxDiffPixelRatio` to silence anti-aliasing noise also silences 1-pixel-border regressions. Fix the nondeterminism source instead; keep thresholds near-zero on brand-critical surfaces.
- **Baselines follow branches:** update on merge to main only; PR runs compare against main's baseline. Hand-updating baselines on feature branches is how wrong pixels become the reference.

## Common pitfalls

| Pitfall | Consequence | Instead |
|---|---|---|
| Unmasked dynamic content (dates, avatars, feeds) | Perma-flaky diffs; review fatigue by week two | Freeze/seed/mask hierarchy above |
| Reflexive approval culture | Real regressions rubber-stamped with an audit trail saying "approved" | Owner-routed review + diff budget |
| Page-level-only coverage | Diffs implicate everything; triage cost explodes | Component-level shots; few composed pages |
| Unpinned browser/fonts (self-hosted) | Mass false diffs on environment drift | Pin + deliberate baseline regeneration |
| Visual tests as functional assertions | Worst-of-both: brittle AND vague failures | Functional asserts for values; pixels for appearance |
| Loosened thresholds as flake fix | Real 1-px regressions pass | Root-cause the nondeterminism; thresholds near-zero |
| Baselines updated from red feature branches | Wrong pixels become truth | Baseline updates on main merges only |
| Screenshotting before fonts/images settle | Intermittent layout-shift diffs | Capture gated on load-complete conditions |
