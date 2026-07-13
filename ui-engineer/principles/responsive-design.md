# Responsive Design Systems — Design for Content You Don't Control

**Scope:** framework-agnostic. **Validated against:** container queries + `cqi` units (Baseline 2023), `clamp()` (Baseline 2020), CSS Grid/Flexbox `min()`/`minmax()`, `dvh`/`svh` units (Baseline 2022), `text-wrap: balance` (Baseline 2024). **Date:** 2026-07-13.

## The mental model

The mock is a **single sample from a distribution**, and it is always the friendliest sample: English strings of average length, professionally cropped photos, three items in every list, a name like "Ana Lee." Production draws from the whole distribution: a 47-character German compound word on a button, a user with no avatar, zero items, 4,000 items, a surname that breaks your `nowrap`. **Layouts don't break at breakpoints; they break at content.** Responsive design as practiced — matching mocks at three viewport widths — verifies the samples and ships the distribution untested.

So the discipline has two halves, and the second is the one teams skip:

1. **Viewport response** — layout adapts to screen size (breakpoints, fluid sizing, container queries).
2. **Content response** — layout survives real data: long strings, missing images, empty and huge lists, translation expansion (`topics/i18n-layout.md`), user font-size overrides.

## Layout defaults that survive contact with production

- **Fluid by default, breakpoints for structure.** Fluid techniques (`flex-wrap`, `grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr))`, `clamp()` for type and space) handle *sizing* continuously; media/container queries are reserved for *structural* changes (sidebar collapses to drawer, table becomes cards). If you're writing a breakpoint to nudge a padding, a fluid expression was the answer.
- **Few, semantic, tokenized breakpoints.** 3–4 named breakpoints (`sm/md/lg/xl`) defined once as tokens and consumed everywhere — see failure 1. Name them by layout regime, not device ("md = two-column becomes one-column"), because the device landscape you'd name them after changes yearly.
- **Container queries for components, media queries for page layout.** A Card in a sidebar and the same Card full-width need different layouts *at the same viewport width*. Pre-container-queries, components grew `variant="sidebar"` props — layout leaked into APIs (`component-api.md` failure 1). Now: the component queries its container (`@container (inline-size > 24rem)`), the page owns viewport-level structure, and the component works in any slot without being told where it is. Default for any shared component in 2026.
- **Min sizes, not fixed sizes; `rem`, not `px`, for type and thresholds.** Fixed heights are where overflow bugs live — content defines height, `min-height` defines the floor. `rem`-based media queries and type respect the user's font-size setting (a fifth of users change it; a `px`-locked layout ignores them — see `component-accessibility.md`).
- **Mobile-first authoring** (`min-width` queries, base styles = smallest layout): the narrow layout is the one with no room for error, and additive overrides read better than subtractive ones.

## Failure modes

### 1. Breakpoint logic duplicated inconsistently across components

- **Failure:** the header collapses at `768px`, the sidebar at `750px` (someone tweaked it for an edge case), the grid at `48em`, a JS `matchMedia` somewhere says `767px`. Between 750 and 768px the page is half-collapsed — desktop nav with mobile sidebar. Every value was locally reasonable; the sum is a layout with seams, and no one owns the seam.
- **Detection:** grep the repo for `@media` and `matchMedia` and histogram the values — more distinct widths than named breakpoints is the finding (`auditing-a-ui-codebase/README.md` artifact 3 includes this census).
- **Fix:** consolidate onto tokenized breakpoints (build-time constants into media queries; the same constants exported to JS so `matchMedia` can't drift); delete per-component bespoke widths, converting genuinely component-shaped ones to container queries.
- **Prevention:** breakpoints exist *only* as tokens (`design-tokens.md`); stylelint `media-feature-name-value-allowed-list` (or a custom rule) rejecting raw widths in `@media`; component-level responsive needs default to container queries so they never invent viewport breakpoints at all.

### 2. Layouts that break under real content

- **Failure (the compound classic):** the pricing card is pixel-perfect. Then: a plan name wraps to two lines and the three cards' buttons misalign; a user story title of 300 characters pushes the actions off-canvas; the avatarless user shows a broken-image icon; an empty project list shows a 900px white void; a price of "$1,234,567" overflows its badge. None of these were bugs in the CSS — they were bugs in what the CSS was ever asked to handle.
- **Detection:** **content-stress testing** as a first-class practice. In the component workshop, every component gets stress stories: longest realistic string (rule of thumb: 2× the English mock, or real German), empty string, no image, 0 / 1 / 1,000 items, maximum numbers, user font-size 200%. The `responsive-fidelity-auditor` subagent automates the sweep breakpoints × stress cases. In review: "show me this with the longest string that can occur" is the single highest-yield question.
- **Fix patterns (the standard arsenal):** `min-width: 0` on flex children so they can actually shrink (the #1 mystery-overflow cause — flex items default to `min-width: auto`); decide *per text element* wrap vs. `truncate` (ellipsis + `title`/tooltip for identifiers, wrapping for prose, `overflow-wrap: anywhere` as the URL-in-a-comment safety net); alignment groups (`grid-template-rows: subgrid`, or auto-margin push) so sibling cards align on shared rails regardless of content height; designed empty states and image fallbacks as *component states*, not afterthoughts.
- **Prevention:** stress stories are part of a component's definition of done and feed the visual-regression matrix (`visual-regression-testing.md`); the design handoff checklist asks "empty/overflow/loading?" of every screen (`topics/design-handoff.md`); component templates from the `component-from-tokens-generator` skill include the stress stories scaffold.

### 3. Text-expansion breakage under translation

- **Failure:** German is +35% on average and worse on short strings ("Save" → "Speichern", +125%); a tab bar sized to English wraps into two rows, a fixed-width button clips "Anmeldung abschließen." The layout was *tested* responsive — against English.
- **Detection & fix:** pseudo-localization in dev builds (accented, padded strings) makes expansion visible without waiting for translators; the full treatment — expansion math, RTL mirroring, CJK line-breaking — lives in `topics/i18n-layout.md`.
- **Prevention:** no fixed widths on text containers, ever; stress stories include the pseudo-locale; if the product will localize, review layouts in the pseudo-locale *before* the design freezes, because "make room for German" is cheap in Figma and expensive in a shipped grid.

### 4. The viewport-only mental model (`100vh` and friends)

- **Failure:** `height: 100vh` on mobile Safari puts the CTA under the browser chrome; a hover-only affordance strands touch users; a `position: fixed` toolbar floats over the on-screen keyboard.
- **Detection:** real-device pass on the money flows (emulators don't reproduce dynamic viewports or keyboard behavior); the auditor subagent flags `100vh`, hover-without-focus/touch-equivalent, and fixed-position elements for manual verification.
- **Fix / prevention:** `100dvh`/`svh` for full-height layouts; every hover affordance has a focus/touch path (`@media (hover: none)` to adapt); test bottom-anchored UI with the keyboard open. Treat "works on iOS Safari" as part of done, not as QA's surprise — Safari is the fidelity long pole (`topics/cross-browser.md`).

## Decision tree — "how should this element size itself?"

1. Type or spacing that should scale smoothly with viewport/container? → `clamp(min, fluid, max)` with tokenized endpoints.
2. A repeating grid of items? → `repeat(auto-fill, minmax(<min-item-size>, 1fr))` — zero breakpoints, handles any count.
3. A component that changes layout by available width? → container query against its own container.
4. Page-level structure change (nav pattern, column count)? → media query at a **named token breakpoint** — the only case that gets one.
5. Anything with a fixed width/height containing text? → redesign it; that's failure 2 or 3 on a delay timer.

## War story

A dashboard product I audited had 41 distinct media-query widths (histogram from a one-line grep) and a "responsive" bug backlog of 60+ tickets, almost none actually about viewport size: they were long client names in fixed-width table cells, a currency column that overflowed past a million, empty states that looked broken. We spent one sprint on tokens-and-consolidation (41 widths → 4), one on content-stress stories for the twelve shared components — which surfaced 30 of those backlog bugs as reproducible snapshots — and the fix sprint closed them with the arsenal above (`min-width: 0` alone closed nine). The durable change wasn't the CSS; it was that "show me the ugliest data" became a standard review question and stress stories became part of component done.

## Related

- Breakpoint/spacing/type tokens: `design-tokens.md`. Where responsive styles live: `css-architecture.md`.
- Text expansion and RTL in depth: `topics/i18n-layout.md`. Safari/legacy quirks: `topics/cross-browser.md`.
- Snapshot matrix for breakpoints × stress cases: `visual-regression-testing.md`. Automated sweep: `agents/responsive-fidelity-auditor.md`. Zoom/text-resize requirements: `component-accessibility.md`.
