# Handoff to Engineering — The Two-Engineer Test

**Scope:** interaction specs — the behavioral contract handed to implementation. The *visual* half of handoff (Figma → tokens/components, redlines, generated code) is owned by `ui-engineer/topics/design-handoff.md`; this doc owns behavior: states, transitions, timing, edge cases, and the wording that prevents divergent implementations. **Validated against:** WCAG 2.2 AA (spec columns for focus/announcements), Given/When/Then convention. **Date:** 2026-07-13.

## The mental model

An interaction spec is complete when it passes the **two-engineer test**: two engineers implementing it independently, without talking to you or each other, produce behavior a user can't tell apart. Every question an implementer would have to answer for themselves is a place two implementations can diverge — and *will*, because both engineers are competent people making reasonable-but-different choices. Divergence isn't an engineering failure; it's the spec leaking.

The second load-bearing idea: **the happy path is roughly a fifth of the behavior.** The mock shows one state with friendly data (`ui-engineer/topics/design-handoff.md` calls the mock "a picture of one state"); the product spends most of its life in the other states. The standing inventory — every view in the spec answers for each:

> **Empty** (first use, zero items, cleared) · **Loading** (initial, refresh, pagination — and what's interactive during) · **Error** (per failure class: validation, network, server, permission — and the recovery path with data intact) · **Partial** (some items failed, degraded service) · **Long/hostile content** (truncation, wrapping, 500 items) · **Offline / reconnecting** · **Concurrent change** (someone else edited/deleted it) · **Revisited** (back button, refresh mid-flow, deep link into the middle)

Engineers don't skip these states out of laziness — they *hit* them during implementation, at 6pm, with no designer in the room, and improvise. The spec's job is to have been in the room already.

## Failure modes

### 1. The happy-path spec

- **Failure:** the spec (or the Figma file standing in for one) covers the golden flow: valid input, fast network, populated data, patient user. Implementation ships; the edge states exist anyway — they're just *designed by whoever hit them*: a default browser alert for the network error, an empty white div for the zero state, a spinner that never resolves for the timeout, form data discarded on failed submit. Each individually small; together they're where the product feels cheap and where support tickets breed. Worst case, an improvised edge state is a real hazard: the "retry" an engineer added double-submits the payment (`interaction-design.md` §1).
- **Detection:** upstream — audit any spec against the state inventory above; every unanswered cell is a pending improvisation. Downstream — the implementation channel is the alarm: every "what should happen when…?" question from an engineer is a spec bug report, and they cluster where the spec is thinnest. Count them per feature; the count is your spec-completeness metric.
- **Fix:** answer the open cells *before* they're hit, in priority order: failure paths on money flows first (error + recovery with data intact), then empty and loading, then hostile content. Retrofitting after ship: harvest the actual improvised states from the built product, review them as if proposed, and spec the deltas.
- **Prevention:** the state inventory is a mandatory spec section — a spec without it doesn't enter implementation. The **state × event matrix** (below) makes missing cells visible instead of discoverable.

### 2. Ambiguity — one spec, two implementations

- **Failure:** the spec says "show an error if saving fails." Engineer A: red toast, 5 seconds, form stays editable. Engineer B: inline banner, persists until dismissed, form disabled pending retry. Both *implemented the spec*. Now the same operation behaves differently on the two surfaces it appears on, users who use both learn two systems (and per `journey-accessibility.md` §4, inconsistency inside a journey is also an accessibility failure), and the eventual reconciliation is a fight about whose interpretation was "right" — the wrong question; the spec underdetermined the behavior. Sibling flavor: relative words — "quickly," "briefly," "prominent" — which every reader resolves against their own taste.
- **Detection:** the two-engineer test as a review exercise: an engineer who didn't write the spec reads it and describes the behavior back; every "I assumed…" is a leak. Grep the spec for unfalsifiable adjectives (quick, smooth, clear, prominent, intuitive) — each is a divergence point. Cross-surface diff on shipped products: same operation, different behavior = an ambiguity found in production.
- **Fix:** respecify at the level of observable behavior with values: "on save failure: inline alert below the Save button (`role="alert"`), text names the cause and the fix, form remains editable with values intact, Save re-enabled, focus moves to the alert." Numbers where numbers exist: durations from the motion vocabulary (`motion-behavior.md` §3), latency budgets from `interaction-design.md` §3.
- **Prevention:** specs use the shared pattern vocabulary (this flow's named feedback patterns, motion patterns, terminology table) so most cells are *references to one definition* rather than fresh prose — one definition can't diverge. The Given/When/Then requirement format (`research-to-spec.md` template) forces observability sentence by sentence.

### 3. Pictures standing in for behavior

- **Failure:** "the spec" is a Figma link. Engineers reverse-engineer behavior from static frames: which parts are interactive, what transitions between frames mean, what happens between the drawn breakpoints, where focus goes, what the animation is. A screenshot of a dropdown *open* and *closed* says nothing about whether it closes on outside-click, Escape, selection, or blur — four behaviors, sixteen combinations, one picture. The visual layer is genuinely spec'd (tokens, spacing — `ui-engineer/topics/design-handoff.md` owns making *that* half lossless); the behavioral layer is a Rorschach test.
- **Detection:** if the deliverable contains no sentences — no state matrix, no event handling, no focus/announcement columns — it's a picture, not a spec, regardless of how many frames it has. Implementation-channel signal again: questions of the form "is this clickable?" and "what does it do when…?"
- **Fix / prevention:** the behavioral spec is a *text* artifact that travels with the visuals: the state × event matrix, the requirement blocks, the edge-state inventory. Prototype links help but don't substitute — a prototype demonstrates the paths its author built and is silent about the rest (`prototyping-fidelity.md` §4); the matrix says which cells the prototype demonstrates and answers the rest in prose. Division of labor at the seam: Figma carries *what it looks like* (with `ui-engineer`'s token/component mapping), this artifact carries *how it behaves*; each links to the other.

### 4. Specs with no verification path

- **Failure:** the spec ships, implementation ships, and no one can say whether the built thing matches the spec — or whether the spec achieved its purpose. QA tests their own reading of the feature (a third interpretation); the research finding that motivated the whole change (`research-to-spec.md`) is never re-measured; drift between spec and product accumulates silently until the spec is fiction nobody consults.
- **Detection:** ask, for a shipped feature: "which acceptance criteria were verified, by whom, and where's the a11y walkthrough result?" Silence = this failure. Also: analytics events named in specs that were never instrumented.
- **Fix:** each requirement's Given/When/Then criteria become literal test cases (many mechanize directly into E2E tests — the spec is executable in exactly the degree it's unambiguous); the flow-level gates run before ship: keyboard/SR task-completion (`journey-accessibility.md` decision tree, or the `journey-accessibility-reviewer` skill), the latency-budget check under throttling, the spam-click pass.
- **Prevention:** the spec's Verify lines (from the `research-to-spec.md` template) are assigned owners at handoff — this criterion → E2E suite, this one → a11y walkthrough, this one → next research round. Handoff isn't a document transfer; it's a 30-minute walkthrough where engineering asks the questions *now* instead of in the implementation channel later — the same highest-bandwidth-half-hour rule as `ui-engineer/topics/design-handoff.md` pitfall 5, applied to behavior.

## The state × event matrix

The core artifact. Rows = states, columns = events (user actions + system events), cells = *observable outcome, including feedback, focus, and announcement*. Abbreviated example for a save operation:

| state ↓ / event → | click Save | Escape | network fails | response ok | user edits field |
|---|---|---|---|---|---|
| **editing (valid)** | → `saving`; button shows spinner+"Saving…", disabled; fields stay editable | discard-confirm if dirty | — | — | stay; live-validate |
| **saving** | ignored (idempotent) | ignored | → `error`; inline `role="alert"` names cause+fix; values intact; focus → alert | → `saved`; button "Saved ✓" 2s (motion: *confirm-pulse*); SR announce "Draft saved" | allowed; → `editing (dirty-while-saving)`: banner "unsaved changes" |
| **error** | retry → `saving` | keep editing | stays `error`; alert updates ("still offline") | — | → `editing (valid?)`; alert clears on next attempt |

Three rules make it work: **every cell filled** (a dash is a decision — "impossible by construction" — not an omission); **focus and announcement live in the cells**, not in a separate a11y document nobody opens (`journey-accessibility.md` §2–3); **cells reference named patterns** (*confirm-pulse*, the flow's alert pattern) so the matrix stays terse and the definitions stay single-sourced.

## Decision tree — "is this spec ready to hand off?"

1. Does every view answer the eight-state inventory? Missing cells → not ready; those are scheduled improvisations.
2. State × event matrix present, cells filled, focus/announcement columns included? 
3. Two-engineer test passed — a non-author engineer read it back without an "I assumed"? Adjective grep clean (no unfalsifiable relative terms)?
4. Every requirement traceable (evidence or labeled preference — `research-to-spec.md` §4) and carrying its Verify line with an owner?
5. Timing values from the shared vocabularies (motion patterns, latency budgets), terminology from the flow's terminology table?
6. Visual half linked out to the Figma/token mapping (`ui-engineer/topics/design-handoff.md`), not restated?
7. All yes → book the 30-minute walkthrough and hand off. Any no → the gap you leave is the improvisation you'll review in a sprint.

## War story

A subscriptions product spec'd a plan-change flow — beautifully, for the happy path: pick plan, confirm proration, done. Two teams implemented it in parallel: web, and the account-management surface inside the mobile app. The spec said "confirm the change and show the updated plan." Web's engineer, hitting the unspec'd *downgrade-with-overage* case at implementation time, reasonably blocked the downgrade with an error. Mobile's engineer, hitting the same unspec'd case, reasonably allowed it and scheduled the overage charge. Same company, same operation, opposite behaviors — discovered not in QA (each team's QA tested their own reading) but by a customer who downgraded on mobile after being blocked on web, and then disputed the surprise overage charge. The dispute escalated to legal; the postmortem's root cause was five words: *the case wasn't in the spec*. The state × event matrix became mandatory that quarter. The unexpected benefit nobody predicted: spec authors started finding *design* problems while filling cells — "wait, what *should* happen here?" asked at spec time is a design question; asked at implementation time it's an improvisation; asked by a customer it's an incident. The matrix moves the question left. That's the whole trick.

## Related

- Where requirements come from and their traceability: `research-to-spec.md`. Feedback/latency/input values the cells reference: `interaction-design.md`. Focus/announcement columns: `journey-accessibility.md`. Motion cells: `motion-behavior.md` + `topics/motion-spec-handoff.md`.
- Visual half of handoff (tokens, component mapping, generated-code traps): `ui-engineer/topics/design-handoff.md`.
- The full sequence this doc terminates: `building-a-validated-flow/README.md`.
