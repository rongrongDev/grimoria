# Glossary

Single source of terminology for every doc, skill, and subagent in this tree. If a doc uses a term differently than defined here, the doc is wrong — fix the doc. Terms owned by `web-dev/GLOSSARY.md` (hydration, CWV, CSR/SSR, flaky test…) are not duplicated; look there.

**APG (ARIA Authoring Practices Guide)** — W3C's pattern catalog for custom widgets (combobox, dialog, tabs…): expected keyboard behavior, roles, states. The spec you build against when no native element or headless library fits. See `principles/component-accessibility.md`.

**Baseline (web platform)** — Cross-browser availability status for platform features (*newly available* = all major engines; *widely available* = ~30 months mature). The vocabulary this KB uses for "can I use X"; see `topics/cross-browser.md`.

**Baseline (visual testing)** — The approved reference screenshot a visual regression run compares against. Context disambiguates the two senses.

**Blast radius** — The set of screens a change can visually affect. CSS and token changes have unbounded blast radius, which is why visual snapshots exist. See `principles/visual-regression-testing.md`.

**Breakpoint** — A viewport width at which page layout changes structurally. Kept few, named, and tokenized; contrast **container query**.

**Cascade layer (`@layer`)** — CSS mechanism declaring precedence between style groups explicitly, so layer order beats selector specificity. The modern end to specificity wars. See `principles/css-architecture.md`.

**Component API** — A component's public contract: props, slots/children, refs, emitted events. Treated with the discipline of any public API — hundreds of call sites you don't control. See `principles/component-api.md`.

**Component token** — Optional third token tier scoping decisions to one component (`button.primary.bg`), justified only when components re-theme independently of the semantic tier.

**Composability** — A component's capacity to be extended through composition (children, slots, compound parts) rather than through prop growth or forking.

**Compound component** — A component exposed as cooperating parts (`Dialog.Root`/`Dialog.Title`/`Dialog.Actions`) sharing implicit state; the structural escape hatch that prevents forks.

**Compositor property** — A CSS property the browser can animate off the main thread: `transform`, `opacity` (usually `filter`, `clip-path`). Everything else risks jank. See `principles/animation-motion.md`.

**Container query (`@container`)** — CSS querying an element's *container* size rather than the viewport; the mechanism that lets a component adapt to its slot without being told where it is.

**Design system** — The contract between a producing team and consuming teams: tokens + components + rules + governance. Not a synonym for "component library" — the library is one deliverable of it.

**Design token** — A named design decision (`color.action.primary`), not a named value (`#3B82F6`). Tiered raw → semantic → (component). See `principles/design-tokens.md`.

**Drift** — Gradual divergence between the design system's intent and the codebase's reality: hardcoded near-miss values, forked components, off-grid spacing. Measured by census, prevented by lint + review.

**DTCG format** — The W3C Design Tokens Community Group interchange format (`$value`, `$type`, `{alias}` references); the storage format token pipelines build from.

**FLIP** — First-Last-Invert-Play: measure an element before and after a layout change, apply the inverse as a transform, animate it away — layout-looking motion at compositor cost.

**Focus contract** — A component's documented answers to: where does focus go on open, what contains it while open, where does it return on close. Required for every overlay/disclosure. See `principles/component-accessibility.md`.

**Fork (component)** — A copy of a shared component maintained separately. The rational endpoint of a component that says "no" too often or can't be found; the central failure design-system governance exists to prevent.

**Headless component library** — A library shipping behavior and accessibility (APG-correct keyboard/focus/ARIA) with no visual opinion (Radix, React Aria, Headless UI, Melt); you supply the pixels via your tokens.

**Layout primitive** — A system component whose only job is arrangement (Stack, Inline, Grid) — it owns the spacing *between* children so content components stay margin-free.

**Logical properties** — Direction-relative CSS (`margin-inline-start`, `inset-inline-end`) that mirrors automatically under RTL; the physical equivalents (`margin-left`) don't. See `topics/i18n-layout.md`.

**Pseudo-localization** — A fake locale that pads/accents every string (and optionally mirrors direction) so expansion and RTL bugs surface before translation exists.

**Raw (primitive) token** — Bottom-tier token: a value inventory entry (`blue.500`, `space.4`) with no meaning attached. Only semantic tokens may be consumed by components.

**Reduced motion** — The OS-level `prefers-reduced-motion` preference; honored centrally in motion tokens (durations → 1ms, not 0 — completion events must still fire).

**Roving tabindex** — Composite-widget focus pattern: one child at `tabindex="0"`, the rest at `-1`, arrows move the zero. The APG mechanism behind menus, tab sets, listboxes.

**Semantic token** — Middle-tier token naming a *role* (`color.text.danger`, `space.inset.card`), aliasing a raw token. The only tier components may reference; the tier themes reassign.

**Snapshot (visual)** — A rendered screenshot compared pixel-wise against a baseline to detect unintended change. Distinct from DOM/serialization snapshots (`web-dev/principles/testing.md`).

**State parity** — The rule that every visually communicated component state has an accessibility-tree equivalent (`loading` ⇒ `aria-busy`, `error` ⇒ `aria-invalid`…).

**Stress story** — A component story exercising hostile-but-real content: 2× strings, empty, missing images, 1,000 items, pseudo-locale. The test fixture form of "the mock is the friendliest sample."

**Theming** — Reassigning semantic token values on a scope (mode, brand) without touching components. If theming requires editing a component, the token architecture is broken.

**Token census** — The mechanical count of raw values vs. token usage across a codebase; the drift metric. See `auditing-a-ui-codebase/README.md` phase 1.

**Utility-first CSS** — Styling via small single-purpose classes composed in markup (Tailwind). One of the two viable scoping disciplines at scale; see `principles/css-architecture.md` for the actual decision.

**Visual regression testing (VRT)** — The tripwire test class answering "did pixels change that nobody intended?" — coverage matching CSS's unbounded blast radius. See `principles/visual-regression-testing.md`.
