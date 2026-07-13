# Component-Level Accessibility — The Construction Delta

**Scope:** what building *components* adds to accessibility. This doc assumes `web-dev/principles/accessibility.md` (design-time reasoning, WCAG 2.2 AA floor, SPA route/announcement patterns, the audit-at-the-end trap) — read that first; nothing there is repeated here. **Validated against:** WCAG 2.2 AA, ARIA Authoring Practices Guide (APG), `<dialog>`/`popover`/`inert` (all Baseline), Radix/React Aria/Headless UI current majors, axe-core 4.x. **Date:** 2026-07-13.

## Why the design system is the accessibility chokepoint

In a component-driven app, **accessibility is inherited**. One accessible Select, used 300 times, is 300 accessible selects; one broken Select is 300 lawsuits' worth of broken selects — and 300 places a product team will *not* fix it locally. The design system is therefore where accessibility is cheapest to get right and costliest to get wrong, and a system component's a11y bar must be higher than any feature code's: platform semantics, complete keyboard contract, managed focus, contrast guaranteed by tokens, states announced. Feature teams then inherit correctness by default — which is the only distribution model that has ever scaled.

The web-dev doc's two habits apply with extra force here: **walk it as a sequence** (keyboard-first), and **use the platform element** — a system component that wraps `<button>` inherits two decades of platform work; one that rebuilds it on a `<div>` starts at zero *and multiplies the zero by every consumer*.

## Failure modes

### 1. Missing focus management in custom components

- **Failure:** the custom Modal opens; focus stays on the trigger behind it. A keyboard user tabs through the invisible page beneath; a screen-reader user doesn't know anything happened. On close, focus lands on `<body>` and the user is teleported to the top of the document. Same family: the Dropdown whose arrow keys don't move through options, the deleted list row that leaves focus on nothing, the Toast that steals focus from a half-filled form (over-management is a failure too).
- **Detection:** the five-minute keyboard walkthrough per component state — open it, Tab, Shift-Tab, arrows, Escape, activate, close; at each step ask *where is focus, and can I see it?* Automated checks catch almost none of this (axe verifies attributes, not behavior) — this is the manual slice that cannot be skipped. In review, the `design-system-consistency-reviewer` skill requires a stated focus contract for any component that shows/hides/moves content.
- **Fix:** every overlay/disclosure component defines its **focus contract**: where focus goes on open (the surface or its first logical control), what contains it while open (`<dialog>.showModal()` gives trap + `Escape` + backdrop natively; `inert` on the background for hand-rolled cases), where it *returns* on close (the trigger, unless the trigger is gone — then the nearest logical ancestor). Roving tabindex or `aria-activedescendant` for composite widgets (menus, listboxes, tab sets) per the relevant APG pattern. On destructive actions, move focus to a neighbor before the element unmounts.
- **Prevention:** the decision tree below — native/headless first, so the contract comes pre-implemented; the focus contract written into the component's docs and asserted in its interaction tests (Testing-library/Playwright can assert `document.activeElement` cheaply — do it for open/close/delete paths).

### 2. Color-contrast failures introduced by a token change

- **Failure:** design refreshes the palette; `gray.500` gets 8% lighter for "airiness." Every `text.secondary` in the product now sits at 3.9:1 against white — a silent, system-wide WCAG failure shipped by a one-line token edit that looked like a design tweak, passed code review (the diff was one hex value), and no per-component test could have caught, because no component changed.
- **Detection & prevention (same mechanism):** **contrast is a property of token *pairs*, enforced in the token pipeline.** Declare the legal combinations (`text.secondary` on `surface.default`, `text.on-action` on `action.primary`, …) next to the tokens and run a WCAG-ratio check (a 30-line script or a Style Dictionary action) in CI — a palette edit that breaks a pair fails the build with the exact pair named. axe-core in component tests is the backstop for hardcoded one-offs that bypassed tokens (which are *also* the drift failure in `design-tokens.md` §1).
- **Fix when it ships anyway:** fix the *token*, never the component — a component-local color override "for contrast" forks the token system and will be wrong again after the next palette change. Non-text UI (borders, icons, focus rings) needs 3:1 (WCAG 1.4.11) — pair-check those too; focus rings are the most commonly missed.

### 3. Semantic HTML lost to div-soup in the name of pixel control

- **Failure:** the designer wants a select that can render rich option rows; native `<select>` couldn't be styled (for twenty years, true), so the system ships `<div class="select" onClick>`. Now: no keyboard support, no type-ahead, no mobile-native picker, invisible to screen readers, forms can't submit it — and every one of those must be rebuilt by hand and *kept* rebuilt forever. The same trade happens smaller a hundred times: `<div onClick>` "because button default styles fight the design," a `<div>` grid "because `<table>` is hard to style," placeholder-as-label "because the design has no label."
- **Detection:** grep-able heuristics that feed the audit (`auditing-a-ui-codebase/README.md` artifact 3): `onClick` on non-interactive elements, `role="button"`, tabular data outside `<table>`, inputs without associated labels; `eslint-plugin-jsx-a11y` (or framework equivalent) catches most at write time. The honest test: unplug the mouse and use the component; then listen to it in VoiceOver/NVDA.
- **Fix / prevention — the decision tree (2026 edition, updated because the facts changed):**
  1. **Native element, styled.** Check before assuming you can't: `appearance: none` + modern CSS covers most form controls; customizable `<select>` (Chromium 135+, progressive enhancement) covers rich options; `<dialog>`, `<details>`, `popover` cover overlays and disclosures. Twenty years of "can't style it" intuition is now mostly stale — re-verify per control, per `topics/cross-browser.md`.
  2. **Headless library implementing the APG pattern** (Radix, React Aria, Headless UI, Melt): full behavior, your pixels. This is the design-system default for combobox/menu/tabs/tooltip-class widgets.
  3. **Hand-rolled against the specific APG pattern page** — with keyboard + screen-reader testing before merge and a standing entry on the annual audit list. Rare enough to name each instance in the system's docs.

### 4. State communicated visually but not programmatically

- **Failure:** the Button's loading state swaps the label for a spinner (a screen reader hears the button *vanish*); the invalid input turns red (nothing is announced, `aria-invalid` absent); the toggle looks pressed but is a styled div with no `aria-pressed`; the disabled-looking button is CSS-only and still fires.
- **Detection:** for each visual state in the component's stories, ask "what changed for the accessibility tree?" — if the answer is nothing, that's the finding. axe catches some (missing `aria-invalid` patterns); the screen-reader pass catches the rest.
- **Fix / prevention:** state parity is part of the component's API contract: `loading` sets `aria-busy` and keeps an accessible name; `error` wires `aria-invalid` + `aria-describedby` to the message; toggles use real `aria-pressed`/`aria-checked` semantics or native inputs. Encode it once in the system component and every consumer inherits it — the chokepoint principle again. Live-region announcements for async outcomes follow the toast pattern in `web-dev/principles/accessibility.md` (one polite region, owned by the system).

### 5. Zoom and text-resize breakage

- **Failure:** at 200% browser zoom (a WCAG 1.4.4/1.4.10 requirement and how a large population actually uses the web) the fixed-height header clips its own nav; at OS font-scale the `px`-locked line-height crops descenders.
- **Detection:** run the visual suite at 200% zoom / 320px-equivalent reflow width for key screens; it's one more matrix variant (`visual-regression-testing.md`).
- **Fix / prevention:** this is `responsive-design.md`'s content-response discipline wearing an a11y hat — `rem` type, min- not fixed heights, reflow not horizontal scroll. One discipline, two docs' worth of reasons.

## The component a11y definition-of-done (paste into your component template)

- [ ] Semantics: native element or APG pattern named in the docs; accessible name for every state
- [ ] Keyboard: full contract documented (Tab/arrows/Escape/activation) and covered by an interaction test
- [ ] Focus: open/close/removal contract stated and asserted; `:focus-visible` styles at 3:1 against every legal surface
- [ ] Contrast: all color pairs drawn from the token pair-list (never raw values)
- [ ] States: every visual state has an accessibility-tree equivalent
- [ ] Motion: durations from motion tokens (inherits reduced-motion — `animation-motion.md` §2)
- [ ] Verified: axe clean in component tests; keyboard walkthrough done; screen-reader pass for any new widget pattern

## War story

A design-system team I advised shipped a beautiful custom combobox — hand-rolled, because in 2019 that's what you did. It behaved for mouse users and was a void for everyone else: no roving focus, no announcements, Escape closed the *page's* modal instead of the listbox. It was consumed by 40 teams. The remediation math is the whole lesson: fixing it centrally was a six-week APG-faithful rebuild behind the same props API (plus visual snapshots proving pixel parity, which is what made 40 teams accept the swap sight-unseen) — versus the alternative universe where 40 teams each learned combobox accessibility. Nothing else in this KB has that leverage ratio. Spend your a11y depth on the system components; it's the only place the multiplication works *for* you.

## Related

- Foundation (read first): `web-dev/principles/accessibility.md`. Token pair-checking: `design-tokens.md`. Reduced motion: `animation-motion.md`.
- Zoom/reflow mechanics: `responsive-design.md`. Enforced per-PR by the `design-system-consistency-reviewer` skill; scaffolded into new components by `component-from-tokens-generator`; audited repo-wide via `auditing-a-ui-codebase/README.md` artifact 3.
