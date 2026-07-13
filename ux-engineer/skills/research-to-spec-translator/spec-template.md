# Requirement Block Template

**Date:** 2026-07-13.

Canonical shape for requirements produced by the `research-to-spec-translator` skill; defined in `ux-engineer/principles/research-to-spec.md` (rationale per field lives there). Copy the block; fill every field; "N/A" is a decision, an empty field is a defect.

```
REQ-<id>: <one-sentence behavior statement — active voice, observable>

Evidence:   <study-ID / finding-IDs + observation with n of N>
            — or —  [decision — no research basis: <who decided, one-line why>]
Insight:    INS-<id> — <the mechanism this addresses, one sentence>
Priority:   Blocking | Should-fix | Consider
            (derivation: severity <blocked task / major / minor / cosmetic> × frequency <n/N, mechanism general/local>)
Behavior:   Given <state>, when <event>, then <observable outcome>
            Given <state>, when <event>, then <observable outcome>   (as many as needed;
            values concrete: durations as motion-token names, latency budgets, exact copy from the terminology table)
States:     <which of: empty · loading · error · partial · hostile-content · offline · concurrent · revisited
             this REQ implicates — answered here, or pointer to the flow's state × event matrix cell,
             or "OPEN QUESTION" if the evidence doesn't reach it>
A11y:       <focus + announcement behavior if this REQ touches a transition or async update — journey-accessibility.md §2–3>
Verify:     <the observable check that this worked: next-round task metric with target, analytics event,
             a11y walkthrough item, or E2E assertion> → owner: <suite / skill / study>
```

## Worked example

```
REQ-7: The confirm step's primary action states its consequence for attendees.

Evidence:   STUDY-2026-06-resched / F-3: 3/5 organizers predicted instant-move
            despite adjacent consequence copy; all 3 hesitated >10s or asked the moderator.
Insight:    INS-2 — users predict consequences from action labels, not adjacent copy.
Priority:   Blocking (severity: blocks correct mental model on money path × frequency: 3/5, mechanism general —
            label-over-copy prediction is not participant-specific)
Behavior:   Given a meeting with ≥2 attendees, when the organizer reaches the confirm step,
            then the primary action reads "Send availability request to <N> attendees" (terminology table v3).
            Given a 1:1 meeting, when the organizer reaches the confirm step,
            then the primary action reads "Move meeting" and the change applies immediately.
States:     loading (action disabled + in-place busy per interaction-design.md §1), error (see matrix cell E-4);
            concurrent (attendee responds during edit) — OPEN QUESTION, flagged for design.
A11y:       On step entry, focus → step heading; on send, announce "Availability request sent to N attendees" (polite).
Verify:     Next round: 5/5 participants state the outcome correctly before confirming → owner: STUDY-2026-Q3;
            label copy asserted in E2E → owner: checkout suite.
```

The **Evidence/Priority** fields carry counts verbatim — "3/5" never becomes "most." The **Verify** field is the loop-closer; a REQ without it is a bet nobody collects on.
