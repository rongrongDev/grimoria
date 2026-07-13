# Interaction Design — Every Action Gets an Acknowledgment

**Scope:** platform-agnostic behavior (web/mobile/desktop); web examples. **Validated against:** WCAG 2.2 AA (2.5.x input modality criteria), response-time thresholds per Card/Miller/Nielsen (0.1s / 1s / 10s — perceptual research, stable for 50+ years). **Date:** 2026-07-13.

## The mental model

Every interaction is a loop: the user **perceives** what's possible (affordance), **acts**, the system **acknowledges** within perceptual thresholds, and the result becomes the next state the user perceives. Interaction bugs are breaks in this loop, and the three response-time thresholds govern the acknowledgment:

- **< 0.1s** — feels like direct manipulation. The budget for the *first* acknowledgment of any action (pressed state, ripple, key echo). Not the budget for the result — for the receipt.
- **< 1s** — flow is preserved; the user notices the wait but their train of thought survives. No progress indicator needed; one appearing-and-vanishing spinner here is worse than nothing (flicker).
- **< 10s** — attention's outer limit. Beyond ~1s, show determinate or indeterminate progress; beyond ~10s, the user *will* task-switch — design for it (background the work, notify on completion, make it resumable).

The second pillar: **every control is a state machine, and every state must be visibly represented.** A button is at least idle → pressed → busy → succeeded/failed. If two of those states render identically, the user cannot distinguish them, and they will act on the wrong belief — the root of almost every "is it broken?" moment. When designing any interaction, enumerate states first, then draw them; drawing first is how states get missed. (The full states inventory for specs: `spec-handoff.md`.)

## Failure modes

### 1. Missing or ambiguous action feedback

- **Failure:** the double-payment classic. User clicks **Pay**; the request takes 900ms; the button renders identically the whole time; at 600ms the user concludes the click didn't register and clicks again. Two charges, one support ticket, one trust dent. Same anatomy everywhere: silent "Add to cart" (did it add?), form submit with no receipt, toggle that saves async but flips instantly with no reconciliation on failure.
- **Detection:** the spam-click test — double- and triple-click every action in the flow; anything that fires twice is a finding. Then the throttle test (below): feedback gaps invisible at 50ms latency are unmissable at 800ms. In usability sessions, watch for repeated clicks and "did that work?" — participants almost never *report* missing feedback; they just re-click.
- **Fix:** three layers, all cheap: acknowledge within 100ms (pressed/active state — visual only, no logic needed); on submit, disable the control *and* show progress in place (`aria-busy`, spinner replaces label — disabling alone looks frozen); make the operation idempotent server-side anyway, because feedback reduces double-fires but nothing eliminates them.
- **Prevention:** the feedback contract is spec content, not implementation detail — every action in an interaction spec names its acknowledgment, its busy representation, and its success/failure representation (`spec-handoff.md` §2). Design-system buttons should make the busy state a prop, so the lazy path is the correct path (`ui-engineer/principles/component-api.md`).

### 2. State transitions that are technically correct but disorienting

- **Failure:** the system does exactly the right thing and the user doesn't perceive it. Flavors: **teleporting content** — click "Apply filter," the list silently re-renders, user can't tell if anything changed (change blindness: updates outside the locus of attention don't register); **context loss** — a wizard advances steps and scroll position/focus land somewhere arbitrary, so the user re-orients from scratch each step; **success reported where the user isn't looking** — toast in the corner while their eyes are on the button they clicked; **layout shift as feedback** — content pushes down and the user's target moves under their cursor mid-click.
- **Detection:** in usability tests, the signature is a pause followed by "…did it do it?" or the user re-doing an action that already succeeded. Heuristic pass: for each transition, ask *where are the user's eyes when the change lands, and does anything within 2° of that spot change?*
- **Fix:** put feedback **at the locus of attention** — confirmation on/next to the control acted on, not only in a global toast; use motion to carry causality when content moves or appears (`motion-behavior.md` §2 — a 200ms transition that shows *where the panel came from* is information, not decoration); on step/route changes, explicitly manage scroll (top of new content) and focus (step heading — this is also the a11y fix, `journey-accessibility.md` §2); when a list updates in place, animate the delta (items entering/leaving) or state the result in text ("14 results, filtered from 96").
- **Prevention:** transitions are spec'd, not left to whatever the framework does on re-render — the spec's state matrix includes *how* each transition manifests. Review question for every async mutation: "what does the user see change, and where?"

### 3. Latency assumptions baked in at prototype speed

- **Failure:** the prototype runs on localhost with hardcoded data; every response is instant; the interaction design implicitly assumes it. Production adds 300–3000ms of network and the design collapses: no busy states exist because none were ever visible; the "type-ahead search" fires per keystroke and results arrive out of order (the race nobody designed for — results for "ca" landing after results for "cart"); the snappy multi-step flow becomes spinner purgatory because each step does a round trip the prototype didn't have. The interaction was never tested under the conditions it will actually run in.
- **Detection:** throttle *during design*, not after: run every coded prototype and staging build at a realistic profile (DevTools "Fast 4G", or better, the p75 latency from your real API metrics) as the default, not the exception. If the prototype only feels good un-throttled, the design is incomplete.
- **Fix:** decide the waiting strategy per action, deliberately: **optimistic UI** (render success immediately, reconcile on failure) for high-success-rate, low-stakes, easily-reversible actions — likes, toggles, reorderings — with a designed failure reconciliation (the undo-toast, the item snapping back with an error); **pessimistic with busy states** for payments, destructive and legal actions; **stale-while-revalidate presentation** for reads (show last known + freshness indicator). For races: cancel or discard stale responses by design — the spec says "results reflect the latest input, always."
- **Prevention:** the spec carries a **latency budget** per action ("acknowledge <100ms; result <1s at p75; >1s shows X; >10s becomes background job with notification") so engineering knows what to guarantee and QA knows what to test. Prototype fidelity rule: if the question involves *feel*, latency is part of the apparatus (`prototyping-fidelity.md` decision tree §4).

### 4. Input handling that assumes one kind of user and hardware

- **Failure:** interactions designed for the author's setup: hover-revealed actions (touch devices have no hover; the actions simply don't exist for half your users); drag-and-drop or swipe as the *only* path to an operation (excludes keyboard, switch access, and many motor-impaired users — WCAG 2.5.7 requires a single-pointer alternative for dragging); tap targets sized for a stylus (WCAG 2.5.8 minimum 24×24 CSS px); custom gestures with zero discoverability that demo well and are never found organically.
- **Detection:** the parity walkthrough — complete the flow three times: mouse only, keyboard only (`journey-accessibility.md` owns the full version), touch only (real device, thumbs). Every operation reachable in one mode must be reachable in all. Grep-level signal in code review: `:hover` selectors revealing interactive content, drag handlers without button equivalents.
- **Fix:** hover as *enhancement* only — whatever hover reveals must also be reachable by tap/focus (row actions visible on focus-within, or an explicit overflow menu); every gesture gets a visible-control equivalent (drag-to-reorder ⇄ move up/down buttons; swipe-to-delete ⇄ delete button in a menu); gestures that survive must be conventional for the platform, not invented (`topics/cross-platform-consistency.md`).
- **Prevention:** input parity is a row in the spec's acceptance criteria per operation, and the three-mode walkthrough is in the flow's definition-of-done. Component-level mechanics (focus styles, target sizing) belong to `ui-engineer/principles/component-accessibility.md`.

## Decision tree — "what feedback does this action need?"

1. Local, synchronous, reversible (toggle a panel, select an item)? → the state change *is* the feedback; make it land within 100ms at the locus of attention. Done.
2. Async, low-stakes, high-success, reversible (like, rename, reorder)? → optimistic UI + designed failure reconciliation (undo pattern beats confirm dialog — let them act, make it revocable).
3. Async, high-stakes or irreversible (pay, delete, send, publish)? → pessimistic: acknowledge <100ms, disable + in-place busy state, explicit success receipt, idempotent backend. Confirmation *before* only if truly irreversible — and prefer undo-after where possible.
4. Longer than ~10s (import, export, generation)? → don't hold the user hostage: background it, show progress somewhere revisitable, notify on completion, design the "what if they navigate away" case — because they will.
5. Whatever the answer: enumerate the states, spec the transition's visible manifestation, and assign the latency budget. If you can't fill those in, the interaction isn't designed yet.

## War story

A fleet-management product had a dispatch screen where clicking "Assign driver" fired an async call averaging 1.4s with — nothing. No pressed state (custom div-button, so not even the browser's default), no busy state, row updated on response. In usability sessions on office wifi it was merely awkward. In the field, on depot networks, dispatchers learned that clicking twice "made it work" (the second click landed after the first response repainted the row). Then a retry-on-timeout was added server-side without idempotency keys, and double-assignments began overwriting each other's *different* drivers — drivers dispatched to jobs that had been silently reassigned under them. The incident review traced a physical-world failure (a driver at the wrong site at 6am) back through a race, back through a retry, back to **a button with no pressed state**. The fix took a day: acknowledge, disable, busy label, idempotency key. The lesson took permanent residence: feedback isn't polish — it's the mechanism that keeps the user's model synchronized with the system's, and every gap between them is a place users will *act on a false belief*. We never again shipped an action whose spec didn't name its acknowledgment.

## Related

- Motion as the carrier of transition feedback, and timing coherence: `motion-behavior.md`.
- Keyboard/AT completion of the same interactions: `journey-accessibility.md`.
- Writing all of the above into an unambiguous spec: `spec-handoff.md`.
- Component-level state props, focus styles, target sizes: `ui-engineer/principles/component-api.md`, `ui-engineer/principles/component-accessibility.md`.
