# Accessibility Testing — what automation catches, and the majority it can't

**Applies to:** concept doc; examples use axe-core 4.10, WCAG 2.2 AA · **Last verified:** 2026-07-06
**Standalone:** yes. Definitions: *WCAG* = Web Content Accessibility Guidelines, the standard behind most legal requirements; *axe-core* = the de-facto automated rule engine (embedded in Playwright/Cypress integrations, Lighthouse, browser devtools); *AT* = assistive technology (screen readers, switch devices, magnifiers).
**Related:** `quality-dev/tools/axe-core.md` (integration mechanics), `quality-dev/principles/ci-cd-integration.md` (gating), `quality-dev/tools/playwright.md` (where scans hook in).

## The honest number, and the trap it exposes

Automated accessibility engines detect roughly **30–40% of WCAG failures** — the deterministically checkable ones. That number has been stable for years across studies and matches my field experience. The trap: teams wire axe into CI, see green, and report "accessible." I sat in the meeting where a legal demand letter arrived for a product with a *zero-violation axe dashboard*: keyboard users could not complete checkout because a custom dropdown swallowed focus. Axe had nothing to say — every element had a role, a name, and sufficient contrast. It was unusable and compliant with every automatable rule simultaneously.

So the discipline is a **boundary you write down**: automation is the regression floor; humans own everything requiring judgment. Claiming more for automation than 30–40% isn't optimism, it's future litigation.

## What automation (axe-core) reliably catches — make these regressions impossible

Deterministic, DOM-inspectable facts: missing accessible names (unlabeled buttons/inputs/images), color-contrast failures (computed styles), invalid ARIA (roles that don't exist, required attributes missing, broken `aria-labelledby` references), missing document language, duplicate IDs breaking label associations, missing landmarks/heading hierarchy violations, form fields without labels.

These are perfect CI material: objective, stable, fast (~1–2 s per scanned state). Policy that works (mechanics in `quality-dev/tools/axe-core.md`):

- Scan every distinct UI *state* your E2E suite already visits (per-page is not enough — open the modal, expand the menu, trigger the error banner, then scan).
- **Gate on new violations, baseline the old** — same ratchet as security scanning (`quality-dev/principles/security-testing.md`): existing debt is tracked and burned down; *new* violations block merge. Turning on a blocking gate with 300 pre-existing findings gets the gate deleted within a sprint.
- Zero tolerance for `critical`/`serious` on money paths (checkout, auth, account) — those block regardless of baseline.

## What automation cannot catch — and who does what instead

| Can't catch | Why | Who/how |
|---|---|---|
| Focus order that makes no sense | Order is valid DOM-wise; "sense" is judgment | Keyboard-only pass by the feature developer, per feature (5 min) |
| Keyboard traps in custom widgets | Requires *operating* the widget | Scripted keyboard E2E for owned widgets (Playwright `keyboard.press` sequences) + manual pass |
| Alt text that's *present but useless* (`alt="image123.jpg"`) | Quality of prose is judgment | Content review rule; spot-check in QA passes |
| Screen-reader comprehensibility (announcement order, live-region timing, context) | Engines check attributes, not experience | Scheduled SR sessions: NVDA+Firefox and VoiceOver+Safari, quarterly per critical flow |
| Cognitive load, error-message clarity, timing pressure | Human factors | Design review + usability testing with AT users |
| Motion/animation harm (vestibular) | Intent not inspectable | Design checklist: `prefers-reduced-motion` honored, verified once per feature |
| Whether the *task* can be completed with AT end-to-end | Composition of all of the above | Quarterly AT walkthrough of the 5–10 critical journeys — same journey list as your E2E smoke set |

The cheapest high-yield manual habit: **the keyboard pass** — unplug the mouse, complete the feature. Tab order, focus visibility, traps, and skip-links all surface in minutes. Make it a PR-template checkbox for UI changes; it catches more real-world blockers than any tool I've deployed.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| "Axe is green, we're accessible" | Accessibility verdicts citing only automated results | Publish the 30–40% boundary; stand up the manual cadence above | Readiness template has separate automated/manual sign-off lines |
| Regressions of automatable rules | New axe violations in CI | Fix at component level, not per-page | axe gate on new violations; scan shared component library in isolation so fixes propagate |
| Custom widget keyboard traps | Keyboard pass fails; user complaints | Implement roving tabindex/escape handling per ARIA Authoring Practices | Prefer native elements & vetted component libraries; custom-widget PRs require keyboard E2E |
| Baseline debt never shrinks | Baseline count flat across quarters | Scheduled burn-down with owners | Monthly report of baseline size + age, per team, like security findings |
| Only default states scanned | Violations found manually in modals/errors that CI never scanned | Scan post-interaction states in E2E flows | Convention: every E2E journey ends states with an axe check (helper fixture, `quality-dev/tools/axe-core.md`) |
| Accessibility tested only at audit time | Annual audit fire-drill with 200 findings | Shift left: component-level rules + PR keyboard pass | Design-review checklist includes a11y acceptance criteria before code exists |

## Cross-references

- Wiring axe into Playwright, filtering rules, baseline files: `quality-dev/tools/axe-core.md`
- Which journeys get quarterly AT walkthroughs: reuse the E2E smoke list from `quality-dev/principles/test-strategy.md`
- Gating semantics (blocking vs advisory): `quality-dev/principles/ci-cd-integration.md`
