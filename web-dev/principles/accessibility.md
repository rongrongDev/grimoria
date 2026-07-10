# Accessibility — Reasoning at Design Time, Not Auditing at Ship Time

**Scope:** framework-agnostic. Target: WCAG 2.2 AA as the floor (it's also increasingly the legal floor — EU Accessibility Act in force since June 2025, ADA case law in the US). **Date:** 2026-07-06.

## The mental model

Accessibility fails as a checklist because checklists run *after* design, when the expensive decisions are already made. It works as a habit of asking, at design time, one question: **"how does this work for someone who experiences the page as a sequence, not a picture?"** — a keyboard user, a screen-reader user, a screen-magnifier user seeing 10% of the viewport. Most WCAG failures are downstream of never having asked it.

The second load-bearing habit: **use the platform element.** A `<button>` is focusable, keyboard-activatable, announced correctly, and works with voice control — for free. A `<div onClick>` starts at zero and every property must be rebuilt by hand (`tabindex`, `role`, key handlers for both Enter *and* Space, focus styles), and in twenty years I have never once seen the hand-rebuilt version complete. Same for `<a href>`, `<label>`, `<select>`, `<dialog>`, `<fieldset>`. Custom widgets are a *last resort* with a spec (ARIA Authoring Practices Guide patterns), not a default.

## Design-time reasoning, by decision

**Choosing an interaction pattern:** before approving a design, walk it as a sequence. Where does focus start? Tab through it — is the order the reading order? When the modal/drawer/toast appears, where does focus go, and where does it *return* on close? Can every action reachable by mouse be reached by keyboard? If the designer can't answer, the design isn't done. This ten-minute walkthrough at design review is worth more than any audit tool.

**Choosing colors:** contrast is a design-token decision, not a per-screen fix. Bake AA contrast (4.5:1 text, 3:1 large text/UI components) into the palette itself and the whole app inherits it. Also decide now: color is never the *only* channel (error = red + icon + text).

**Choosing motion/feedback:** every async action needs non-visual feedback available (loading and success/error states exposed via `aria-live` regions — sparingly, `polite`, one region reused). Respect `prefers-reduced-motion` in the animation tokens, not per-component.

**Choosing form behavior:** every input has a real `<label>` (placeholder is not a label — it vanishes on input and fails contrast anyway). Errors: associated to the field (`aria-describedby`), announced on submit failure (move focus to the first invalid field or an error summary), never conveyed by border color alone. Client-side validation must not trap (WCAG 2.2 adds redundant-entry and accessible-authentication requirements — don't block paste in password fields, don't demand re-entry of known data).

**Choosing content structure:** headings are an outline (`h1→h2→h3`, no skipping for styling reasons — style with CSS, structure with levels); landmarks (`main`, `nav`, `header`) let screen-reader users skip; page `<title>` and focus handling on client-side route change (SPA routers don't announce navigation by default — see framework docs).

## The SPA-specific failure modes

These are where modern web apps specifically break, beyond static-page WCAG:

1. **Route changes are silent.** No page load = no announcement, focus stays on a removed element = screen reader is lost. Fix: on navigation, move focus to the new main heading (or a route-level `tabindex="-1"` container) and update `document.title`. Most frameworks need you to wire this (one-time cost in the router layout).
2. **Focus not managed across dynamic UI.** Modal opens, focus stays behind it (keyboard user tabs through the invisible page). Deleted list item leaves focus on nothing. Fix: `<dialog>`/`showModal()` (native focus trap + `Escape` + inert background) or a maintained primitive (Radix, Headless UI, Vue/ARIA equivalents); on delete, move focus to a neighbor.
3. **Custom components from scratch.** The hand-rolled dropdown/combobox/tab-set. Fix: headless component libraries that implement APG patterns; write your own only with the APG page open and a screen reader running.
4. **Toast/async updates unannounced.** Fix: one persistent `aria-live="polite"` region owned by the toast system.
5. **Infinite scroll / virtualization traps.** Keyboard users can't reach the footer; screen readers see 10,000 rows. Fix: "load more" affordance reachable by keyboard, sensible `aria-rowcount`/`aria-setsize` on virtual lists.

## Failure → detection → fix → prevention (the operational loop)

- **Failure:** the audit-at-the-end model itself. A team ships for a year, an audit lands 400 findings, remediation is a quarter of grind and half the fixes are "rebuild the component." I've lived this cycle twice; the second time is why this doc leads with design-time reasoning.
- **Detection, layered by cost:**
  - *Automated (catches ~30–40% of issues — the objective ones):* axe-core. Run as `jest-axe`/`vitest-axe` in component tests for key states, and `@axe-core/playwright` on key pages in e2e. eslint-plugin-jsx-a11y (and framework equivalents) at write time.
  - *Semi-manual (catches most of the rest):* keyboard-only walkthrough of every new flow (part of PR review for UI features — 5 minutes); screen-reader pass (VoiceOver is on every Mac; NVDA is free) on the money paths per release.
  - *Real:* paid testing with disabled users for the flows that matter most, at least annually. Nothing else finds the "technically WCAG-passing but actually unusable" class.
- **Fix:** prioritize by *task-blocking* severity (can't complete checkout ≫ decorative image missing alt), not by finding count.
- **Prevention:** the design-time walkthrough above; platform elements by default; headless primitives for the rest; axe in CI so regressions on covered states fail the build; a11y acceptance criteria in feature tickets ("keyboard path defined, focus behavior specified") so it's scoped and estimated like any requirement, not discovered after.

## Decision tree — "we need a custom <thing>"

1. Does a native element do this? (`<dialog>`, `<details>`, `<select>`, `<input type=…>`, `popover` attribute) → **use it**, style it. Native selects got fully stylable; check before assuming you can't.
2. Does a maintained headless library implement the APG pattern? (Radix/React Aria/Headless UI/Melt) → **use it**, skin it.
3. Neither? → build against the specific APG pattern page, test with a keyboard and one screen reader before merge, and add the component to the "audit annually" list. This should be rare enough to name each instance.

## War story

A client's rebuilt checkout raised conversion in every segment except one that cratered: keyboard/AT users. The culprit was a beautiful custom address autocomplete — `<div>`-based, mouse-only, focus lost on selection. It passed automated scans (the divs had roles sprinkled on). Support tickets said "checkout is broken" but reproduced for nobody, because nobody reproducing used a keyboard. Six figures of quarterly revenue, found only when one engineer did the five-minute keyboard walkthrough this doc prescribes. The fix took two days (swap to a headless combobox). The lesson isn't "test more" — it's that the *scan passing* had created false confidence. Tools verify attributes; only a sequence-walk verifies experience.
