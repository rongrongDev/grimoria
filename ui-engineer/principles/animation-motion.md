# Animation & Motion — Cheap on the Compositor, Honest About Purpose

**Scope:** framework-agnostic. **Validated against:** Web Animations API (Baseline), View Transitions API (same-document: Baseline 2025; cross-document: Chromium + Safari 18, check Firefox), scroll-driven animations (Chromium; progressive enhancement elsewhere), `@starting-style` + `transition-behavior: allow-discrete` (Baseline 2024), Motion (Framer Motion successor) 12.x. **Date:** 2026-07-13.

## The mental model

Two questions decide every animation, in order:

1. **Why does this motion exist?** Legitimate answers: continuity (where did this panel come from), causality (my click did that), state feedback (saving, saved), orientation (I moved forward in a flow). "The mock had it" and "it feels premium" are not answers — decorative motion is the first thing cut when it janks and the first thing users disable. If you can't name the information the motion conveys, don't build it.
2. **Can the browser run it off the main thread?** `transform` and `opacity` (and, usually, `filter`/`clip-path`) can be animated by the **compositor** — steady 60/120fps even while the main thread chews on JS. Everything else — `width`, `height`, `top`/`left`, `margin`, `padding`, `box-shadow`, anything triggering layout or paint — runs on the main thread, competes with your framework, and janks exactly when the app is busy, i.e. exactly when things are animating. (Pipeline details: `web-dev/principles/performance.md`.)

The craft, compressed: motion in a design system is **tokens** (durations, easings) + **a small vocabulary of named patterns** (fade, slide, expand, page transition), not per-feature freestyle. Durations: ~100–200ms for micro-feedback, ~200–350ms for panels/pages; over 400ms users feel the UI resisting them. Easing: ease-out for entrances, ease-in for exits, never linear for movement. Animate entrances more than exits; a user dismissing something wants it *gone*.

## Motion tokens

```json
{ "motion": {
    "duration": { "instant": "100ms", "fast": "200ms", "moderate": "300ms" },
    "easing":   { "enter": "cubic-bezier(0,0,0.2,1)", "exit": "cubic-bezier(0.4,0,1,1)" } } }
```

Two payoffs: consistency (every dropdown feels like every other dropdown), and a **single reduced-motion switch** — see failure 2. Like all tokens, semantic names, one source of truth (`design-tokens.md`).

## Failure modes

### 1. Jank from animating expensive properties

- **Failure:** a drawer animates `width: 0 → 320px`. Every frame relayouts the drawer, its contents, and everything the drawer displaces — text rewraps 60 times a second. On the dev's M-series laptop it's fine; on a mid-range Android during app hydration it's a 15fps stutter. Variants: accordion animating `height`, list reorder animating `top`, `box-shadow` transitions on hover over a whole card grid.
- **Detection:** DevTools Performance panel with 4–6× CPU throttling (your users' hardware, not yours) — long purple Layout blocks inside the animation are the signature; "paint flashing" for paint storms. In review: any `transition`/`animation`/keyframe touching a non-compositor property is a finding.
- **Fix:** re-express in transforms — the drawer is `transform: translateX(-100%) → 0` (position offscreen at final size, slide in); expand/collapse uses `grid-template-rows: 0fr → 1fr` (cheap, and it's the modern idiom) or FLIP (measure First and Last, apply the inverted transform, play it back) for genuinely layout-driven moves; shadows crossfade a pseudo-element's `opacity` instead of interpolating `box-shadow`.
- **Prevention:** the design system's motion patterns are compositor-only *by construction*, so feature teams composing them can't jank; stylelint rule flagging transitions on layout properties; perf pass with throttling in the PR checklist for any new animation (`design-system-consistency-reviewer` skill checks the property list).

### 2. Ignoring `prefers-reduced-motion`

- **Failure:** parallax hero, springy list reorders, a full-screen route zoom. For users with vestibular disorders this is not a preference — it's nausea, dizziness, migraine. It's also a WCAG 2.2 AA issue (2.3.3 Animation from Interactions) waiting for an audit, and the users it hurts mostly won't file a bug; they'll leave.
- **Detection:** flip the OS setting (macOS: Reduce Motion; Windows: animation effects off) and walk the app — anything still moving beyond trivial fades is a finding. Automatable: run the visual/E2E suite with `prefers-reduced-motion: reduce` emulated and assert the big movers are static.
- **Fix:** honor the query **centrally, in the tokens** — one rule, whole system:

  ```css
  @media (prefers-reduced-motion: reduce) {
    :root { --motion-duration-instant: 1ms; --motion-duration-fast: 1ms; --motion-duration-moderate: 1ms; }
  }
  ```

  (1ms, not 0 — `transitionend`/`animationend` still fire, so JS that awaits them doesn't hang. This bug ships every time someone uses `0s`.) Reduced motion means **reduce, not remove**: crossfade instead of slide, instant instead of zoom; state feedback (spinners, progress) stays. JS-driven motion checks `matchMedia('(prefers-reduced-motion: reduce)')` or the library's built-in (Motion's `reducedMotion: "user"`).
- **Prevention:** because durations are tokens, per-component handling is never needed — the prevention *is* the token architecture; reduced-motion emulation as a standing visual-regression variant for motion-heavy surfaces; the a11y checklist in `component-accessibility.md`.

### 3. Animation logic coupled to a framework's lifecycle

- **Failure:** enter/exit animations implemented via a specific library's mount/unmount choreography (`AnimatePresence` trees, `<transition>` wrappers, manual `setTimeout(remove, 300)` chains) threaded through feature code. The framework majors, or the team migrates, or the component moves — and the motion breaks in the way that's worst to debug: elements that never unmount (leak), or unmount before the exit plays (flicker), or a timeout racing the actual transition.
- **Detection:** grep for `setTimeout` adjacent to class-toggles/unmounts (the raciest pattern — the timeout and the CSS duration *will* drift apart); animation imports spread across feature code rather than concentrated in system components.
- **Fix / prevention:** put motion where it survives refactors, in order of preference: (1) **CSS-only** — `@starting-style` + `transition-behavior: allow-discrete` now covers the classic "animate in from `display:none` / animate out before removal" cases with zero JS; (2) **Web Animations API** — `element.animate()` returns a Promise (`animation.finished`) so exit-then-remove is `await`, not a timeout; (3) **View Transitions API** for route/page morphs — the browser snapshots old/new and animates between them, decoupled from your rendering by design (progressive enhancement: absent support, you get an instant swap, which is a fine fallback); (4) a motion library **wrapped inside design-system components only** — feature code says `<Collapse open={x}>`, never touches the library, so swapping it is a system-internal change. Framework-specific lifecycle mechanics live in `web-dev/frameworks/<x>/`.

### 4. Motion without contract: layout shift and interruption bugs

- **Failure (two flavors):** entrance animations that move *other* content (a banner sliding in pushes the page down mid-read — that's CLS, a Core Web Vital, `web-dev/principles/performance.md`); and animations that assume they'll finish — user clicks "open" then "close" mid-animation and the panel wedges half-open because the state machine only handled endpoints.
- **Detection:** CLS in field data attributes shifts to their causing element; for interruption, QA habit: *double-click every toggle, spam-click every accordion* — thirty seconds per component, finds it every time.
- **Fix / prevention:** entering elements either occupy reserved space or float above (`position: fixed`/overlay) — never push settled content; drive open/close with CSS transitions on state classes (interruption-safe for free — the browser retargets from the current position) rather than fire-and-forget keyframes; JS-driven motion must handle "animate from wherever you currently are," which WAAPI and Motion both do if you don't fight them.

## Decision tree — "we want to animate X"

1. What does the motion communicate? No answer → don't build it.
2. Expressible as `transform`/`opacity` (directly, via `0fr/1fr` grid, or via FLIP)? → CSS transition with motion tokens. Done.
3. Enter/exit from `display: none`? → `@starting-style` + `allow-discrete` before reaching for JS.
4. Route/page-level transition? → View Transitions API as progressive enhancement.
5. Needs orchestration (sequencing, springs, gestures, interruption choreography)? → WAAPI or Motion, **wrapped in a design-system component** — feature code never imports the motion library.
6. Inherently layout-animating and can't FLIP? → budget it: throttled-CPU profile before merge, and it ships behind the reduced-motion guard like everything else.

## War story

A fintech dashboard had a "delightful" number-ticker that animated portfolio values on every data tick — each digit a spring, each tick a layout pass, 40 tickers on the dense view. On the team's machines: charming. On the p75 customer device: input latency spikes to 400ms *while the user is trying to trade*, and — the detail that made it a compliance incident — reduced-motion users, several of whom had explicitly set it for vestibular reasons, got the full circus because the ticker was a bespoke JS spring loop that had never heard of the media query. The fix: values update instantly (the honest behavior for financial data), a single compositor-only `opacity` pulse indicates freshness, durations moved to tokens, and the reduced-motion token switch turned the pulse off for free. Nobody missed the springs. The review question we institutionalized: *"what does this motion tell the user, and what does it cost the slowest device?"* Most proposed animations fail the first half and never get to the second.

## Related

- Motion tokens: `design-tokens.md`. Reduced-motion as an a11y obligation: `component-accessibility.md` and `web-dev/principles/accessibility.md`.
- Rendering pipeline, CWV, and profiling depth: `web-dev/principles/performance.md`.
- Animations in visual tests (disable or freeze them — the #1 flake source): `visual-regression-testing.md` §flake.
