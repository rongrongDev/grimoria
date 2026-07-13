# Per-Transition Worksheet — Journey Accessibility Review

**Validated against:** WCAG 2.2 AA. **Date:** 2026-07-13.

Companion to `SKILL.md`. One row per *seam* (step change, overlay open/close, async mutation, deletion). The seams are where journeys break; per-element checks live in the scanner and in `ui-engineer/principles/component-accessibility.md`.

## Seam rows

For every transition in the flow, record:

| # | Seam (from → to, or action) | Trigger | Focus lands on | Announced (verbatim) | Order OK? | Verdict |
|---|---|---|---|---|---|---|
| 1 | step 1 → step 2 | "Continue" | | | | |
| 2 | submit fails → error state | server 422 | | | | |
| … | | | | | | |

Cell rules:

- **Focus lands on:** the actual element (`document.activeElement` or SR report). `<body>`, `null`, or a removed node = Blocking finding (doc §2). Overlay close must land on its trigger.
- **Announced:** what the SR actually said, verbatim, or "—silence—" (= finding if the visual channel changed, doc §3). For code-only review: the live region that *should* fire, marked "inferred."
- **Order OK?:** after the transition, does Tab from the landing point proceed in visual/logical order (2.4.3)? Is focus visible (2.4.7) and unobscured by sticky UI (2.4.11)?

## Task-level checks (once per task)

- [ ] Task completed keyboard-only, start to finish, including one error recovery and one dismissal
- [ ] Tab-stop count to primary action per step recorded (gauntlet threshold: flag > ~15 stops)
- [ ] No hover-only affordances on the task path (parity — `interaction-design.md` §4)
- [ ] Error summary: receives focus on failed submit, links each error to its field
- [ ] Timeout mid-task: warned, extendable by keyboard, data survives (2.2.1)
- [ ] No re-entry of already-collected data (3.3.7); no inaccessible auth wall (3.3.8)
- [ ] One verb per operation across all steps (3.2.4) — record the flow's verb table
- [ ] Reduced-motion on: nothing large still moves; state feedback (spinners/progress) survives
- [ ] Scanner run per step *and* per forced state (error, loading, empty) — element layer reported separately

## Evidence discipline

Every ✗ carries: step, element, what happened (or verbatim silence), and the SC or `journey-accessibility.md` section it violates. Every unverifiable cell says **"couldn't verify"** — an empty cell reads as a pass in review, and that lie compounds (`orchestration/README.md` failure 1).
