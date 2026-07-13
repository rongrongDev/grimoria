# Motion & Feedback Timing — What the Motion Says, and When

**Scope:** motion *meaning and timing* at the experience level — what a transition communicates, how long it should take, coherence across a flow. Implementation (compositor properties, motion tokens, `prefers-reduced-motion` mechanics, framework decoupling) is owned by `ui-engineer/principles/animation-motion.md` — this doc decides *what to build*; that doc makes it cheap and safe to run. **Validated against:** WCAG 2.2 AA (2.2.2, 2.3.3), perceptual timing thresholds (0.1s/1s — see `interaction-design.md`). **Date:** 2026-07-13.

## The mental model

Motion is a **communication channel**, and every animation is a sentence in it. The legitimate sentences: *causality* ("your tap did this"), *continuity* ("this panel came from there — you haven't lost your place"), *state* ("working on it… done"), *orientation* ("you moved forward; back is the other way"). If you cannot write the sentence an animation speaks, cut the animation — silence is better than babble, and babble is expensive: it costs time on every use, battery, vestibular comfort, and the user's trust that motion *means* something in your product. (`ui-engineer/principles/animation-motion.md` opens with the same test from the implementation side; the two docs agree by design.)

Timing rules of thumb, and — more important — what scales them:

- Micro-feedback (pressed states, toggles, small reveals): **100–200ms**. Panels, drawers, step transitions: **200–350ms**. Above ~400ms the UI is making the user wait for *your* sentence — only full-context changes (page-level) earn it.
- **Scale duration down with frequency.** A 350ms flourish is fine on a once-a-session dialog and infuriating on a dropdown opened 60 times a day. Frequency of use is the strongest single input to duration, and it's the one you can't feel in a demo — demos happen once.
- **Scale duration with distance and size.** Small element, short hop → fast; full-screen transition → slower. A tooltip that eases in over 300ms feels broken; a page transition at 120ms feels like a glitch.
- Asymmetry: **enter slower than exit.** The user asked for the dismissal — give it to them nearly instantly (exit ≈ 2/3 of enter, or just cut). Making a user watch a long exit animation is holding the door closed while they push it.

One flow, one timing language: the same *kind* of transition takes the same duration and easing everywhere in the journey. Users don't consciously hear it, but they absolutely hear it break.

## Failure modes

### 1. Timing that reads as sluggish or jarring

- **Failure:** durations chosen in a demo context and shipped into a repetition context. The 500ms modal entrance that delighted the design review is opened twenty times an hour by real users, each of whom now waits half a second, twenty times an hour, for information they requested. Opposite pole: instant hard cuts on large context changes — content teleports (`interaction-design.md` §2's change blindness), and users feel the interface "flickering" without knowing why. Both poles read as *quality problems* to users, who will describe the product as "slow" or "janky" while pointing at nothing specific.
- **Detection:** the **repeated-use test**: perform the flow's core loop twenty times in a row — any motion you start wishing dead by round five is a finding (your users are on round five thousand). For jarring: watch session recordings at the transition moments — the user hesitation after a hard cut is visible. Never evaluate timing from a one-shot demo; evaluate from rehearsal.
- **Fix:** re-derive each duration from frequency × size (rules above); for the sluggish pole usually this means halving durations on high-frequency surfaces; for the jarring pole, add a *short* transition (150–250ms) that carries the continuity sentence, no more.
- **Prevention:** durations live in a small named vocabulary, not per-feature invention — which is exactly the motion-token system `ui-engineer/principles/animation-motion.md` §tokens specifies; this doc's contribution is the *assignment rule* (frequency × size → which token), written into the motion spec (`topics/motion-spec-handoff.md`).

### 2. Decorative motion where communicative motion was needed (and vice versa)

- **Failure:** the channel used for the wrong message. Flavor one: a bouncing logo "loading" animation that communicates nothing about progress — pure decoration in the one moment the user urgently needs *state* (is it working? how long?). Flavor two: motion where the honest answer is text or stillness — animated number tickers on financial data (the `ui-engineer/principles/animation-motion.md` war story), festive confetti on a routine save, a "delightful" wiggle that fires so often it becomes the product's nervous tic. Flavor three — the dishonest one: fake progress bars that crawl to 90% and park, motion actively *lying* about state. Users learn your motion channel is noise, and then they stop reading it — including the times it matters.
- **Detection:** for every animation in the flow, write its sentence (causality/continuity/state/orientation). Can't? Decoration — justify it against its per-use cost or cut it. Says something false? Cut it *now*. Also: spinner-only feedback beyond ~10s is decoration-by-exhaustion; the user needed progress, an estimate, or a "we'll notify you" (`interaction-design.md` decision tree §4).
- **Fix:** replace decoration-at-state-moments with honest state (determinate progress when knowable; staged status text — "uploading… processing…" — when not); delete or demote the tics (once-per-milestone, not once-per-action); never animate a lie.
- **Prevention:** the motion spec's first column is "what this communicates" — a spec row that can't fill it doesn't get built. Celebration/delight motion is budgeted: rare, tied to genuinely rare user achievements, and skippable.

### 3. Inconsistent timing and easing across a flow

- **Failure:** step 1's panel slides in over 300ms ease-out; step 2's (different author, different sprint) fades in over 150ms linear; step 3's modal springs. Each is individually defensible; the *sequence* reads as three different products, and users experience it as an unplaceable cheapness — "it feels off" with nothing to point at. Perceived coherence is a flow-level property, and it's destroyed at the seams no single-screen review ever sees.
- **Detection:** walk the full journey in one sitting attending only to motion (the consistency pass in `auditing-a-flow/README.md`); inventory every transition's duration/easing/direction into one table — the outliers announce themselves. In code: grep for raw duration/easing literals vs. token references (`ui-engineer`'s consistency-reviewer skill flags these mechanically).
- **Fix:** define the flow's motion vocabulary — 3–5 named patterns (e.g., *step-advance*, *panel-reveal*, *confirm-pulse*, *dismiss*) each with fixed duration/easing/direction — and re-map every transition onto the nearest pattern. Deviations must argue for themselves.
- **Prevention:** the vocabulary lives in the interaction spec and in motion tokens; new transitions pick from it, and "this needs a new pattern" is a design-review conversation, not a CSS commit (`topics/motion-spec-handoff.md` carries the handoff format).

### 4. Motion that blocks, traps, or harms

- **Failure:** motion the user must *outlast*: a 600ms non-interruptible step transition during which clicks are dropped (fast users — your best users — click into the void every step); carousels/auto-advancing content with no pause (WCAG 2.2.2); parallax and large zooms with no reduced-motion variant — for vestibular-disorder users this is nausea and migraine, not preference (WCAG 2.3.3); and the subtle one, **input-shift**: content animating into place *moves the thing the user was about to tap* mid-reach.
- **Detection:** spam-click and mid-animation-click every transition (the interruption test — same discipline as `ui-engineer/principles/animation-motion.md` §4); flip OS reduced-motion on and walk the journey — anything still swooping is a finding; watch for taps landing on the wrong target in session recordings right after entrances.
- **Fix:** interactive-during-animation as the default contract — animation is presentation, never a lock (drive transitions from state so interrupting retargets, doesn't wedge); everything auto-moving gets pause/stop; reduced-motion variants degrade to crossfade/instant *while keeping state feedback* (reduce, don't remove — the mechanics and the central token switch are `ui-engineer/principles/animation-motion.md` §2's, and doing it there means this failure is prevented product-wide in one place); entrances never displace settled interactive targets.
- **Prevention:** the motion spec row includes interruption behavior and the reduced-motion variant as required cells (`topics/motion-spec-handoff.md`); reduced-motion walkthrough is part of the flow's a11y pass (`journey-accessibility.md` decision tree).

## Decision tree — "should this moment have motion, and how much?"

1. Write the sentence (causality / continuity / state / orientation). No sentence → no motion.
2. Is the sentence *state* during a wait? → honest progress per `interaction-design.md`'s latency tree, not decoration.
3. How often will one user see it per session? Daily-loop frequency → fast end of the range (100–200ms) or none; rare/milestone → the fuller treatment is affordable.
4. How big is the change? Element-level → 100–200ms; panel/step → 200–350ms; full context → up to ~400ms, once per context change, never nested.
5. Pick from the flow's existing motion vocabulary. Nothing fits → design-review conversation, then a new named pattern — not an inline one-off.
6. Fill the non-negotiable cells: interruption behavior, reduced-motion variant, exit timing (≤ enter). Then hand off via `topics/motion-spec-handoff.md`; implementation constraints (compositor-only properties, tokens) per `ui-engineer/principles/animation-motion.md`.

## War story

A ticketing product's agent console got a motion polish pass before a big release: every panel eased, every list item cascaded in with a 40ms stagger, the reply editor unfurled over 400ms. The design review loved it — seen once, it was gorgeous. Support agents live in this screen: forty tickets an hour, editor opened for each. Within a week, the power users had found and shared an undocumented way to break the animations (resizing the window mid-transition skipped them) and were *deliberately jiggling their windows* to make the product usable. Total added wait per agent per day, when we finally measured it: about eleven minutes — of pure choreography. The cascade also caused mis-taps: list items animated into position, and agents' muscle-memory clicks landed on the ticket that was still sliding into the slot (§4's input-shift, at industrial scale). The fix: high-frequency surfaces dropped to 100–150ms or zero motion, the stagger was deleted, milestone moments (ticket resolved) kept a single short confirmation pulse. CSAT among agents recovered in a month. The rule it burned in: **motion is priced per repetition, and the design review sees exactly one repetition.** Measure from the twentieth.

## Related

- Implementation half — tokens, compositor cost, reduced-motion mechanics, interruption-safe patterns: `ui-engineer/principles/animation-motion.md`.
- Feedback thresholds and latency budgets motion must fit inside: `interaction-design.md`.
- Handing a motion design to engineering without "make it like the video": `topics/motion-spec-handoff.md`.
- Reduced-motion and pause/stop as journey-level a11y checks: `journey-accessibility.md`.
