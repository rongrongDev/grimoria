---
name: journey-accessibility-reviewer
description: >
  Review one flow — not a component, not a whole product — for keyboard and
  screen-reader task completion against WCAG 2.2 AA at the journey level:
  focus continuity across steps, announcements for async updates, terminology
  and context continuity, plus an element-layer scan. Use when the user asks
  to "check this flow's accessibility", "can a keyboard/screen-reader user
  complete this", "a11y review of checkout/signup/onboarding", or as the
  Phase 3 a11y gate in building-a-validated-flow or Phase 1 of auditing-a-flow.
  Do NOT use for: component-construction review (focus traps, contrast,
  widget semantics — ui-engineer's design-system-consistency-reviewer and
  component-accessibility.md), sweeping many flows or a very long flow
  end-to-end in an isolated context (dispatch the flow-accessibility-auditor
  subagent), fixing the findings (main session implements; this skill reviews),
  or claiming WCAG conformance certification (this is an engineering review,
  not a formal conformance evaluation).
---

# Journey Accessibility Reviewer

**Validated against:** WCAG 2.2 AA, axe-core 4.x, NVDA/VoiceOver current. **Date:** 2026-07-13.

You are reviewing a single flow for **task completion** by keyboard-only and screen-reader users, applying `ux-engineer/principles/journey-accessibility.md` — read it first; you are executing its decision tree with evidence, not improvising criteria. The governing rule: **compliance is per-element, usability is per-task; your unit of review is the task.** An automated scan passing is reported as "element layer clean," never as "accessible."

## Inputs

The flow: a running app + the task ("complete checkout as a guest"), or a coded prototype, or — degraded mode — code + specs only. Establish before starting: the concrete task(s) in user terms, the steps/screens involved, and how to reach a real error state (you must test at least one recovery path). If you can only review code and specs without executing the flow, say so prominently and mark every dynamic check (focus behavior, announcements) as "inferred from code — needs live verification" rather than passed.

## Procedure

Work through `journey-accessibility.md`'s decision tree, producing evidence at each step. Use `checklist.md` (adjacent to this file) as the per-transition worksheet.

1. **Element-layer scan** (if tooling available: axe or equivalent, per step, *including error and loading states*). Route component-construction findings to `ui-engineer/principles/component-accessibility.md` patterns. A clean scan here proves the scannable layer only — proceed regardless of result.
2. **Keyboard task-completion pass** (doc §1): complete the task start to finish, keyboard only — including dismissing anything that appears, and one error recovery. Log: every stall (no keyboard path), every tab-order gauntlet (count the stops to the primary action), focus visibility (2.4.7) and obscured focus under sticky UI (2.4.11), hover-only affordances (parity rule, `interaction-design.md` §4).
3. **Focus-continuity pass at every seam** (doc §2): at each step/route transition, deletion, and overlay open/close — where did focus land? `document.activeElement === body` after any transition is a finding. Check focus order against visual order per step (2.4.3).
4. **Announcement pass** (doc §3): with a screen reader (NVDA or VoiceOver; state which) or, degraded, by auditing live-region wiring in code — for every async mutation and step change: what is announced? Silence after results-load, validation failure, save, or step advance is a finding (4.1.3). Check error summaries receive focus and link to fields.
5. **Continuity pass** (doc §4): timeout behavior mid-flow (2.2.1), redundant re-entry of collected data (3.3.7), one-verb terminology across steps (3.2.4), auth walls (3.3.8), and failure-path recovery with data intact.
6. **Reduced-motion walkthrough** if the flow animates (`motion-behavior.md` §4): OS preference on, anything still swooping is a finding; state feedback must survive the reduction.

## Output format

```
## Journey accessibility review: <flow> — <task>
**Verdict:** A keyboard-only user can/cannot complete this task [detail].
A screen-reader user can/cannot complete this task [detail].
**Element layer:** clean / N findings (routed to component fixes).
**Coverage:** steps walked, states forced, SR used, what could NOT be verified and why.

### Blocking (task cannot be completed, or requires workarounds no user would find)
- [step · element] <finding>. Evidence: <what happened>. WCAG: <SC> / journey class: <doc §>.
  Fix pattern: <one line> → ux-engineer/principles/journey-accessibility.md#<section>
### Major friction (completable but punishing: gauntlets, silent updates recoverable by exploration)
### Minor / element-layer
### Clean (what verifiably works — the next reviewer needs the passes, not just the failures)
```

Rules: every finding has step-level location, observed evidence, an SC or journey-failure class, and a fix *pattern* with doc link — you review, you don't implement. Severity honesty per the shared scale: a blocked population is Blocking, not "a11y-tier." "Couldn't verify" is a first-class result — never silently skip a check (`orchestration/README.md` failure 1 is this skill's raison d'être; don't reproduce it from inside).
