# Accessibility & UI Correctness — TalkBack, Semantics, and the Device Matrix You Don't Own

> **Applies to:** API 24–36, Compose BOM 2026.06, TalkBack 14+ · **Last reviewed:** 2026-07-06
> **Related:** [testing.md](testing.md) · topic: [legacy-views-and-compose-interop.md](../topics/legacy-views-and-compose-interop.md)

## Why this is a correctness doc, not a compliance doc

Accessibility bugs and fragmentation bugs are the same species: **your UI encodes assumptions about the reader/renderer that some real environment violates.** TalkBack, a 5.5-inch 320 dpi budget phone, a foldable's inner display, font scale 2.0, an RTL locale — each is just another client your UI must be correct for. Teams that treat a11y as a checklist item ship UIs that also break at font-scale 1.3 — the assumptions fail together. Plus the regulatory reality: the EU Accessibility Act (in force since June 2025) makes this legally load-bearing for consumer apps in Europe.

## Compose semantics — the model in one paragraph

Compose UI is *drawn*, not described: without semantics, TalkBack sees nothing but what the framework infers. Foundation components (`Text`, `Button`, `Checkbox`…) contribute sensible semantics automatically; **every custom drawn/gesture component contributes nothing until you add `Modifier.semantics { }`**. The semantics tree, not the visual tree, is also what Compose *tests* interact with — which is the great alignment: making a component testable and making it accessible are the same work ([testing.md](testing.md)).

## Failure modes

### 1. The unlabeled interactive element

- **Failure:** `Icon(painter, contentDescription = null)` inside a clickable — TalkBack announces "unlabeled, button." An entire toolbar of them is a row of "unlabeled button, unlabeled button, unlabeled button." This is the #1 finding in every audit I've run, every year, on every codebase.
- **Detection:** Turn TalkBack on and use your own top-3 flows — 20 minutes, monthly, humbling every time. Automated: Compose UI lint warns on `contentDescription = null` in clickable contexts; Accessibility Scanner app; Espresso `AccessibilityChecks.enable()` / `enableAccessibilityChecks()` in Compose tests turns every existing UI test into an a11y test for free — the highest-leverage single line in this doc.
- **Fix:** `contentDescription` for informative images; explicitly `null` for *decorative* ones (an unlabeled decoration is correct — a chatty one is its own failure: TalkBack reading "gradient background image" is noise). Describe the *action*, not the asset: "Add to favorites," not "heart icon."
- **Prevention:** design-system components *require* a description parameter (no default) for interactive icons — make the safe thing the only compilable thing.

### 2. Semantics structure vs visual structure

- **Failure:** A list row visually one card but semantically six separate stops (icon, title, subtitle, price, badge, chevron) — TalkBack users swipe six times per row and hear fragments without relationships. Or the reverse: a whole form in one `mergeDescendants` blob announcing a paragraph.
- **Detection:** TalkBack linear navigation (swipe-through) of the screen; does each swipe land on one *meaningful* unit?
- **Fix:** `Modifier.semantics(mergeDescendants = true)` on the row container (clickable containers merge automatically); custom actions (`customActions`) for secondary actions in rows instead of separate stops; `clearAndSetSemantics` when the composed parts mislead.
- **Prevention:** list-item components in the design system come pre-merged; PR review of any new list row asks "how many swipes per row?"

### 3. Touch targets and state announcements

- **Failure:** 24 dp icon with a 24 dp touch area (Material minimum is 48 dp); toggles that change visually but never announce state (`selected`/`stateDescription` missing) so TalkBack users toggle blind.
- **Detection:** Accessibility Scanner flags touch targets; Compose material components auto-enforce `minimumInteractiveComponentSize` — violations concentrate in hand-rolled `Modifier.clickable` on small elements.
- **Fix:** `Modifier.minimumInteractiveComponentSize()` or padding-to-48dp with the visual kept small; `Modifier.toggleable(value, role = Role.Switch)` (gives state announcement free) instead of raw `clickable`; `stateDescription` for custom states.
- **Prevention:** ban raw `clickable` on icon-sized elements in the design system; use the role-carrying modifiers (`toggleable`, `selectable`, `triStateToggleable`).

### 4. Font scale and the fixed-size trap

- **Failure:** Layouts that truncate, overlap, or clip at font scale ≥1.3 (a third of users run non-default scale; API 34 allows up to 2.0 non-linear). Root causes: fixed `dp` heights on text containers, `maxLines = 1` on user-critical text, text in `sp` but its container in `dp`, and — the sneaky one — icons in `dp` beside text in `sp` misaligning into overlap.
- **Detection:** One CI screenshot-test variant at fontScale 1.5 catches nearly all of it mechanically (Paparazzi/Roborazzi make this a config line, not a device farm). Manual: quick-settings font-size tile while using the app.
- **Fix:** min-height not fixed-height; let text wrap; `Modifier.height(IntrinsicSize.Min)` patterns; test the *worst* real string (German, not lorem ipsum — German compound nouns are the font-scale stress test that English hides).
- **Prevention:** the screenshot-test variant, in CI, blocking.

### 5. OEM/density/form-factor fragmentation

- **Failure classes with real examples:** (a) *density buckets lie* — two devices at identical dp widths render differently because one OEM rounds density (a 411 dp-wide device reporting 420); never pixel-perfect-assert against one device. (b) *Display cutouts & edge-to-edge* — **targetSdk 35+ forces edge-to-edge**: apps that ignored `WindowInsets` shipped toolbars under the status bar the day they bumped targetSdk; every screen needs insets handling (`Modifier.safeDrawingPadding()` or scaffold-provided paddings — and *consume* what you apply, or nested scaffolds double-pad, the current era's most common visual bug). (c) *Foldables/tablets* — config change on fold/unfold ([lifecycle-and-state.md](lifecycle-and-state.md)); use `WindowSizeClass` buckets, never `isTablet` booleans from screen-inches heuristics. (d) *OEM system-UI quirks* — one OEM's gesture-nav pill overlapping bottom bars unless navigation-bar insets are respected; another's forced dark mode (pre-standard "force dark") inverting hardcoded colors — use theme attributes, never literal `Color(0xFF...)` in screens.
- **Detection:** screenshot tests across a small matrix (phone/foldable-inner/tablet × light/dark × 1.0/1.5 font scale ≈ 12 variants); Play pre-launch reports run on real OEM hardware — read them, they're free; Vitals filtered by device model for rendering-adjacent crash clusters.
- **Prevention:** `WindowSizeClass` from day one even in "phone-only" apps (edge-to-edge + split-screen means you're never really phone-only); insets handled in the app-level scaffold once, not per-screen ad hoc.

## The a11y review checklist (paste into PR templates)

1. Every interactive element: label describing the action? 2. Every custom component: role + state semantics? 3. List rows: one swipe per row, custom actions for secondaries? 4. Works at font scale 1.5 (screenshot test)? 5. Touch targets ≥ 48 dp? 6. TalkBack walk of the changed flow done by the author (not delegated)?

## Callable capabilities

- [testing.md](testing.md) — semantics-first test finders make a11y regressions fail tests.
- Skill `compose-recomposition-auditor` — flags `clearAndSetSemantics`/`semantics {}` misuse it encounters while auditing (shared tree-walk).
