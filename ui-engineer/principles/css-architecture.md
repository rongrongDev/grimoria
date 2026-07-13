# CSS Architecture at Scale — The Cascade Is a Shared Mutable Global

**Scope:** framework-agnostic. **Validated against:** cascade layers `@layer` (Baseline 2022), `:has()` (Baseline 2023), container queries (Baseline 2023), native CSS nesting (Baseline 2024), CSS Modules, Tailwind CSS 4.x, vanilla-extract 1.x. **Date:** 2026-07-13.

## The mental model

CSS at scale fails the way any shared mutable global state fails (`web-dev/principles/concurrency.md` readers will recognize the shape): every rule can affect every element, order matters, and nothing is ever safe to delete. A CSS architecture is whatever discipline you adopt to get **locality** back — the guarantee that a component's styles affect that component and nothing else, and that deleting the component deletes its styles. Every methodology of the last fifteen years (BEM, CSS Modules, CSS-in-JS, utility-first, scoped styles) is a different purchase of that same guarantee.

What actually matters, regardless of methodology:

1. **Scoping is non-negotiable.** Styles are authored per-component and cannot leak. Build-time scoping (CSS Modules, Svelte/Vue scoped styles, vanilla-extract, Tailwind's "scoped by being inline") beats runtime CSS-in-JS on performance and SSR simplicity; runtime style injection is a legacy pattern in 2026 — if you're on styled-components/Emotion, plan the migration, don't grow it.
2. **Specificity stays flat and layered.** Components use single-class-level selectors; the *order* of precedence between resets, tokens, base styles, components, and utilities is declared once with `@layer` instead of fought with selector weight. `!important` is banned outside a documented handful of utility overrides — see failure 1.
3. **Tokens are the only values.** Components consume CSS custom properties from the semantic tier (`design-tokens.md`); a stylesheet full of hex codes is the drift census waiting to happen.

## Utility-first vs. component-scoped: the actual decision

This is a staffing and system question, not a taste question.

- **Utility-first (Tailwind 4)** wins when: markup and styling are edited by the same people, the team is medium-to-large with mixed CSS skill (utilities are a *constraint vocabulary* — juniors physically can't write a 5-deep descendant selector), and you want dead-style elimination for free (delete the markup, the styles are gone). Its cost: class-string soup in complex components, and design-system components still need a layer above raw utilities (`cva`-style variant functions) or every call site re-invents the Button.
- **Component-scoped (CSS Modules / scoped styles / vanilla-extract)** wins when: there's a dedicated systems team with strong CSS craft, heavy dynamic/stateful styling, or design requirements (complex grids, print, motion) that fight utility vocabularies. Its cost: naming discipline, and nothing stops a determined engineer from writing global selectors — you need the lint rules utilities give you implicitly.
- **Either way**: tokens via custom properties underneath, `@layer` order on top, and one choice per codebase — the hybrid where half the app is Tailwind and half is Modules gives you both costs and neither benefit. If you inherit the hybrid, converge on whichever half the *shared components* use.

## Theming (the mechanics; strategy in `design-tokens.md` and `topics/multi-brand-theming.md`)

A theme is a **reassignment of semantic custom properties on a scope** — nothing else:

```css
:root { --color-surface-default: var(--gray-50); --color-text-primary: var(--gray-900); }
[data-theme="dark"] { --color-surface-default: var(--gray-950); --color-text-primary: var(--gray-100); }
```

Rules that keep it working: honor OS preference *and* user override (`prefers-color-scheme` for the default, the `data-theme` attribute set before first paint to avoid the flash); set `color-scheme: light dark` so native controls, scrollbars, and form elements follow; themes redefine **semantic tokens only** — a theme file that mentions a raw palette value or a component selector is a bug. Test every theme, not just the default — see failure 4.

## Failure modes

### 1. Specificity wars and `!important` creep

- **Failure:** a page style overrides a component with `#app .card .btn`; the component team wins it back with something heavier; six months later a header color change requires `!important` and prayer. Each escalation is rational; the sum is a codebase where **no one can predict what any rule does**, which is the definition of unmaintainable CSS.
- **Detection:** count `!important` and max selector specificity over time (stylelint `declaration-no-important`, specificity graphs). More honest: ask an engineer to change a color and watch how many attempts it takes.
- **Fix:** declare the layer order — `@layer reset, tokens, base, components, utilities, overrides;` — and move styles into layers mechanically. Layers beat specificity *by design* (an unlayered or later-layer single class outranks an earlier layer's ID selector), which ends the war without rewriting the selectors first; then flatten selectors opportunistically.
- **Prevention:** flat selectors in components (scoping makes this natural); stylelint specificity ceiling in CI; page-level overrides of system components are a *design-system bug report*, not a thing to write — if a product team needs to override, the component's variant API is missing something (`component-api.md` failure 3, same disease).

### 2. Style leakage across component boundaries

- **Failure:** `.card h2 { margin-top: 0 }` — and every h2 that ever renders inside a card, including the ones in a dropdown portaled into it, inherits a mystery. The authoring team can't see the blast radius; the debugging team can't find the source. Descendant selectors on generic elements are spooky action at a distance.
- **Detection:** stylelint bans on bare element descendant selectors in component files; bug reports of the form "X looks wrong only when inside Y" are this failure by definition.
- **Fix:** style what you own — the component styles its *own* elements via scoped classes; spacing between siblings belongs to layout components (Stack/Inline patterns) or parent-owned gap, not to children's margins ("margin is the component reaching outside its own box" — make components margin-free and let parents own arrangement).
- **Prevention:** build-time scoping everywhere; layout primitives in the system so parents have a supported way to space children; for genuinely embedded third-party or user content, isolate with a container and `contain: content` rather than defensive selector arms races.

### 3. Unbounded CSS bundle growth

- **Failure:** CSS only ever gets added — nobody deletes a rule because nobody can prove it's unused (the class might be composed at runtime, referenced by a CMS, or hit by that one page). I audited an eight-year-old app whose CSS was 2.1MB; the team's founding stylesheet was still shipped in full, styling a marketing page deleted in year two. Every byte blocks first render (`web-dev/principles/performance.md` on the critical path).
- **Detection:** CSS size per route in the perf budget; coverage tooling (DevTools coverage, project-level unused-CSS reports) for the census — treat its output as leads, not proof.
- **Fix:** the only durable fix is **coupling styles to components** so deletion is automatic — migrating orphan global CSS into scoped files is the audit's remediation backlog. One-off purges (PurgeCSS over legacy CSS) buy space but not the invariant.
- **Prevention:** scoped styles (again — this is the third failure the same discipline prevents); route-level code-splitting of CSS following the JS splits; a size budget in CI that fails the build, because "we'll clean it up later" has never once happened.

### 4. Theming that only handles the happy path

- **Failure:** dark mode ships; it was built by toggling and eyeballing the main screens. Unthemed: the error toast (hardcoded white), focus rings (invisible on dark), disabled states (contrast collapse), the date picker (third-party), scrollbars and form controls (no `color-scheme`), the loading skeleton (light-gray shimmer on near-black). Users meet the broken 20% precisely in the stressed states — errors, edge flows — where trust matters most.
- **Detection:** enumerate states × themes in the component workshop (Storybook) and snapshot **all of them** — visual regression across themes is the only detection that scales (`visual-regression-testing.md` §matrix). Grep for raw color values as the leading indicator (a hardcoded color is by definition unthemed).
- **Fix:** for each broken state, the fix is a missing semantic token or a bypass of one — same remediation as `design-tokens.md` failures 1–2. Wrap unthemeable third-party widgets and map their theming API to your tokens in one place.
- **Prevention:** the definition of done for any theme includes: every component state, every status color, focus-visible styles, `color-scheme` set, third-party surfaces inventoried; the theme × state snapshot matrix in CI so the *next* component can't ship half-themed.

## Decision tree — "where does this style go?"

1. A value (color/space/type/shadow/radius/motion)? → a semantic token consumed via custom property; never a literal (`design-tokens.md`).
2. Intrinsic to one component's look? → that component's scoped styles, flat selectors, own elements only.
3. Arrangement/spacing *between* components? → the parent: layout primitive (Stack/Grid/Inline) or parent-owned gap. Never a child's margin.
4. A cross-cutting document default (typography base, reset)? → `base` layer, owned by the design system, changed via its governance — not sprinkled per feature.
5. A page needs a system component to look different? → stop; that's a variant request to the design system (`component-api.md` decision tree), not an override to write.

## War story

The `@layer` rescue: a 2022-era codebase I consulted on had a `overrides.css` of 1,900 lines, mostly `!important`, appended over four years as the fastest way to win specificity fights with an old framework theme. Nobody had dared delete a line in two years. We introduced five cascade layers, put the legacy theme in the *lowest* layer and existing app CSS above it unchanged — which instantly made ~70% of the `!important`s unnecessary because layer order now guaranteed what specificity had been fighting for. Three sprints of mechanical cleanup later, `overrides.css` was 60 lines with a comment explaining each. No visual regressions — because every deletion ran against the snapshot suite first. Layers don't fix bad CSS; they end the arms race so you *can* fix it.

## Related

- Token strategy and tiers: `design-tokens.md`. Multi-brand mechanics: `topics/multi-brand-theming.md`. Legacy-browser constraints on the features cited here: `topics/cross-browser.md`.
- Responsive layout and container queries: `responsive-design.md`. Performance of the CSS critical path: `web-dev/principles/performance.md`.
- Enforced in PRs by the `design-system-consistency-reviewer` skill; audited repo-wide via `auditing-a-ui-codebase/README.md`.
