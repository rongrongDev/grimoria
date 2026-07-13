# Building a Validated Flow from Scratch — The Full Sequence

**What this is:** the end-to-end playbook: user problem → research question → right-fidelity prototype → evaluation → findings → implementation-ready interaction spec. Followable start to finish by a human or an AI agent; each phase links the principles doc that carries the depth. **Validated against:** WCAG 2.2 AA; methods per the stamped principles docs. **Date:** 2026-07-13.

**Worked example threaded throughout:** a B2B scheduling product needs a flow for *rescheduling a multi-person meeting* — high stakes (other people's calendars), currently done by support ticket. It appears per phase as ▸.

---

## Phase 0 — Frame the decision (half a day; skipping this poisons everything after)

A prototype is an apparatus built to answer a question (`../principles/prototyping-fidelity.md`). Before anything is built, write down:

1. **The user problem, in behavior terms** — what users are trying to do and where the current path fails them. If this is unknown, stop: you need discovery research, not a prototype.
2. **The decision this work informs** — what will be built/changed/killed depending on the outcome. No downstream decision → no prototype; you're decorating.
3. **The riskiest assumption** — the belief that, if wrong, wastes the most downstream work. That's what the first prototype tests. Rank: *do users want this* > *can users understand/operate this* > *which variant is better*. Teams chronically test the third while the first is still open.
4. **The research question(s)**, falsifiable, per assumption: "Will users understand that rescheduling proposes times rather than moving the meeting?" — not "test the reschedule flow."

▸ *Riskiest assumption: organizers believe rescheduling **notifies and re-collects availability** rather than unilaterally moving the meeting. If they think it moves it instantly, the whole propose-times model needs rework. Question: "Do organizers correctly predict what happens to attendees when they confirm a reschedule?"*

## Phase 1 — Structure before screens (0–3 days, often zero prototype needed)

If the flow involves navigation, naming, or grouping, test the structure with zero UI first — it's cheaper and the signal is cleaner (`../principles/information-architecture.md`):

- New/unclear structure → open card sort (15–20 users) → draft tree.
- Proposed structure or entry point → tree test against goal-framed tasks; money tasks should clear ~70% success before you invest in screens.
- One disputed label → first-click or comprehension probe, 10 users, half a day.
- Existing product → mine search logs and analytics first; they're free and name the broken junctions.

Also settle the **terminology table** now (user word ⇄ internal word): every later artifact — prototype copy, session tasks, the final spec — draws from it, and vocabulary invented mid-prototype becomes vocabulary users get stuck on.

▸ *Tree test: can organizers find "reschedule" from where they'd naturally start (the meeting card, not settings)? First-click: 9/10 clicked the meeting card. Label probe: "Propose new time" beat "Reschedule" — organizers read bare "Reschedule" as instant-move, which was itself early evidence about Phase 0's assumption.*

## Phase 2 — Choose fidelity, then build (1–5 days)

Run the four-dial decision tree in `../principles/prototyping-fidelity.md` against the Phase 0 question. Compressed:

| Question type | Apparatus |
|---|---|
| Comprehension / flow logic | clickthrough, **real copy**, low-mid visual, branch-covering data |
| Input, typing, latency, gestures, AT | **coded prototype**, target device, throttled network |
| Visual appeal / trust | static hi-fi comps; interaction ≈ 0 |
| System that doesn't exist (AI/voice) | Wizard of Oz (`../topics/voice-conversational.md`) |

Build rules regardless of type:

- **State the fidelity contract** in writing before anyone sees it (what's real, what's fake, what question it answers, throwaway-or-evolutionary). This is the anti-"ship it" clause (`prototyping-fidelity.md` §1).
- **Real copy from the terminology table** — content fidelity is the cheap dial that changes results most.
- **Hostile data fixtures** if the question touches layout, comprehension, or entry: longest-realistic strings, empty, huge, non-Latin (`prototyping-fidelity.md` §4).
- **Coded prototypes**: throttle to realistic latency *as the default*, design the busy/failure states you now can't avoid seeing (`../principles/interaction-design.md` §3), and instrument dead-end clicks — they're perceived-affordance data.
- Use design-system components for interaction fidelity, de-polished deliberately; stand-ins for what the system lacks, logged as findings (`../topics/design-system-collaboration.md`).

▸ *Comprehension question → clickthrough. Real meeting names, real attendee counts, real consequence copy ("3 attendees will be asked for availability"). Visual: wireframe-gray theme. One coded fragment: the time-proposal picker, because it involves typing and was the interaction novelty.*

## Phase 3 — Evaluate (1 day prep, 2–3 days sessions, for a moderated round)

Choose the method with `../principles/usability-testing.md`'s decision tree:

- **Heuristic evaluation first** (hours, 2–3 independent evaluators) to clean out mechanical violations — missing feedback, inconsistent verbs, no exits — so participants aren't spent rediscovering them.
- **Moderated task-based test, n=5 per user group**, for comprehension/flow questions. Non-negotiables from that doc: goal-framed tasks in user vocabulary (never naming UI elements); moderator rescues nothing; rainbow spreadsheet during sessions; **pilot session the day before** (catches prototype dead-ends — `usability-testing.md` §4); `[PROTOTYPE GAP]` labeling discipline.
- **Include the a11y gate here, not after ship:** run the keyboard/screen-reader task-completion pass on the coded parts (`../principles/journey-accessibility.md` decision tree, or invoke the `journey-accessibility-reviewer` skill). If the flow's interaction novelty doesn't work by keyboard at prototype stage, that's a *design* finding, cheap now and a lawsuit-adjacent retrofit later.
- Comparing variants or measuring rates? That's unmoderated n≥20–40 per cell — different tool, and usually premature before one comprehension round.

▸ *Pilot caught two dead ends. Five organizers: 5/5 found the flow (Phase 1 paying off); 3/5 initially believed confirming would instantly move the meeting **despite** the consequence copy — they didn't read it; they predicted from the button's finality ("Confirm new time"). n=3/5, severity: blocks the mental model → the Phase 0 assumption is falsified as designed.*

## Phase 4 — Translate findings into requirements (1–2 days)

The chain, per `../principles/research-to-spec.md`: observations (rainbow spreadsheet, with n-of-N) → mechanism insights (the separate 20-minute insight review — no solution-jumping) → design decisions → requirement blocks in the template (Evidence, Insight, Priority from severity × frequency, Given/When/Then, Verify). Falsifiability pass ("could someone satisfy the words but not the intent?") and provenance pass (every requirement: evidence or `[decision — no research basis]`). Big pile or discipline wanted → invoke the `research-to-spec-translator` skill; a disputed failure needing root-cause → dispatch `agents/usability-failure-tracer.md`.

▸ *Mechanism (from the insight review): users predict consequences from **action labels**, not adjacent copy. Decision: the confirm step becomes an explicit consequence choice ("Ask 3 attendees for availability" vs. reserved instant-move for 1:1s). REQ-7: "Given a multi-attendee meeting, when the organizer confirms, then the primary action is labeled with the consequence ('Send availability request to 3 attendees') — Verify: next round, 5/5 correctly predict the outcome before confirming."*

**Iterate:** if Blocking findings changed the design, loop to Phase 2 at the same or lower fidelity — 3 rounds of 5 beats 1 of 15, and round two tests whether the fixes *worked*. Exit the loop when the money tasks run clean and the riskiest remaining assumption is one you're willing to carry to production instrumentation.

## Phase 5 — Complete and hand off the spec (1–2 days)

Requirements ≠ implementable spec. Complete it per `../principles/spec-handoff.md`:

1. **State × event matrix** per view — every cell filled, focus and announcement columns included (this is where Phase 3's a11y findings become permanent spec content).
2. **Eight-state inventory** answered per view: empty, loading, error(+recovery with data intact), partial, hostile content, offline, concurrent change, revisited/back.
3. **Timing and motion** from the shared vocabularies: latency budgets per action (`interaction-design.md`), motion rows via `../topics/motion-spec-handoff.md` (token names, interruption, reduced-motion cells filled).
4. **Prototype-only elements** mapped to system components or filed proposals (`../topics/design-system-collaboration.md` pitfall 4).
5. **Gates:** two-engineer read-back by a non-author; adjective grep; every Verify line assigned an owner (E2E test / a11y walkthrough / next research round / analytics event).
6. **The 30-minute handoff walkthrough** — engineering asks the matrix questions live, now, instead of in the implementation channel later. Visual half links out to the Figma/token mapping (`ui-engineer/topics/design-handoff.md`); don't restate it.

▸ *The matrix surfaced the case nobody had designed: an attendee responds to the availability request **while** the organizer is editing the proposal (concurrent change). Asked at spec time, it was a 20-minute design decision. Asked in production, it would have been an incident.*

## Phase 6 — Close the loop (ongoing)

Ship with the Verify lines live: instrumented task-success analytics, the a11y walkthrough on the built flow (prototype passes don't transfer automatically — invoke `journey-accessibility-reviewer` on the real thing), and the next research round's questions drawn from the requirements whose Verify said "measure after ship." A flow is *validated* when the shipped behavior has evidence, not when the prototype did.

---

## Compressed checklist

- [ ] Phase 0: problem, decision, riskiest assumption, falsifiable question — written
- [ ] Phase 1: structure tested with zero UI where applicable; terminology table settled
- [ ] Phase 2: dials set per question; fidelity contract stated; hostile data; throttled if coded
- [ ] Phase 3: pilot run; method per decision tree; rainbow spreadsheet; a11y gate on coded parts
- [ ] Phase 4: chain intact (observation→…→criterion); grid-derived priorities; provenance on every requirement
- [ ] Phase 5: matrix + eight states + timing/motion cells; two-engineer test; walkthrough held
- [ ] Phase 6: Verify owners live; built flow re-gated for a11y

## Related

Depth per phase: `../principles/prototyping-fidelity.md` · `../principles/information-architecture.md` · `../principles/interaction-design.md` · `../principles/usability-testing.md` · `../principles/journey-accessibility.md` · `../principles/research-to-spec.md` · `../principles/spec-handoff.md` · `../principles/motion-behavior.md`. Assessing a flow you *didn't* build: `../auditing-a-flow/README.md`. Running parts of this with agents in parallel: `../orchestration/README.md`.
