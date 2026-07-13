# Prototyping Fidelity — The Prototype Is the Experiment, Not the Draft

**Scope:** method-agnostic (paper → Figma → coded). **Validated against:** Figma prototyping (2025 feature set), current-generation coded-prototype practice (React 19 / SwiftUI / vanilla — the judgment is framework-independent). **Date:** 2026-07-13.

## The mental model

A prototype is **an apparatus built to answer a question**, not an early version of the product. Before building anything, write the question down: *"Will users understand that saving a draft doesn't publish it?"* is a question. *"Prototype the publishing flow"* is not — it's a task with no stopping condition and no way to choose fidelity.

Fidelity is not one dial. It's four, independent:

| Dial | Low | High |
|---|---|---|
| **Visual** | grayscale boxes, default type | production styling |
| **Content** | lorem ipsum, "Label" | real copy, real names, real prices |
| **Interaction** | linked static screens | real inputs, real state, real transitions |
| **Data** | one hardcoded happy path | realistic variation: long, empty, weird |

"High-fidelity prototype" without naming the dial is meaningless, and most prototyping mistakes are **dial mismatches**: the dial that matters for the question is low while an irrelevant dial is expensively high. Testing a checkout flow's logic needs high interaction + content fidelity and *benefits from low visual fidelity*; testing whether the brand feels trustworthy needs high visual + content fidelity and can be a static image. The cheapest valid apparatus wins, because prototype speed is the entire reason this role exists — a prototype that takes three weeks answers a question the team stopped asking two weeks ago.

Content fidelity is the chronically underrated dial. Real copy is nearly free and changes results more than any other dial: participants read "Delete workspace" and hesitate; they click through "Lorem ipsum" without seeing it. Lorem ipsum in a usability test means you are testing a product no one will ever use.

## Failure modes

### 1. The prototype that gets shipped

- **Failure:** the prototype's visual dial is turned to production polish (easy now — design-system components make pretty free), and stakeholders calibrate on what they *see*: it looks done, therefore it's nearly done. The demo ends with "great, can we ship this quarter?" and a coded prototype — hardcoded data, no error handling, no auth, no a11y, O(n²) list rendering — starts acquiring users. I have watched a demo built in four days become a two-year-old production feature whose "temporary" polling loop was still taking down staging. The cost isn't just the rewrite; it's that the team now believes features take four days.
- **Detection:** the question "when can we ship this?" at a prototype review is the alarm going off. Earlier signal: a prototype repo receiving feature requests, or being added to a release plan.
- **Fix:** re-set expectations *immediately and in writing* — a one-paragraph note on what the prototype proved, what it is (throwaway apparatus), and the honest estimate for the real build. Painful once; compounding if skipped.
- **Prevention:** (a) **State the fidelity contract before the demo**, in the invite: "coded prototype, real interaction, fake data, zero production code — it exists to answer X." (b) Keep the visual dial no higher than the question needs; a wireframe skin on a fully interactive prototype is a *feature* — it makes the unfinishedness legible. (c) Watermark it (`PROTOTYPE — not production code` in the corner costs one div). (d) Throwaway prototypes live in a separate repo that has no path to deploy. If the prototype is explicitly evolutionary — intended to grow into the product — then it follows production standards from day one and this doc's speed advice doesn't apply; the fatal pattern is *deciding it's evolutionary after the fact*.

### 2. Too rough to produce valid signal

- **Failure:** the fidelity dial the question depends on is too low, and the test measures the roughness instead of the design. Participants poke a grayscale wireframe and say "I guess I'd click this box?" — they're solving a puzzle about the prototype, not doing their task. Sessions produce polite guesses; the team reads them as preferences. Worst version: testing *trust* ("would you enter your card here?") on something that looks half-built — of course they wouldn't; you've measured the wireframe.
- **Detection:** session notes dominated by comments about the artifact ("is this clickable?", "I assume this would have real text") rather than the task. Participants asking permission before every action. Findings that feel like shrugs.
- **Fix:** identify which dial the question actually loads on and raise *only that one*. Confusion about what things are → content fidelity (real labels, real copy). Hesitation about what's tappable → interaction fidelity. Trust/appeal questions → visual fidelity, and consider whether a static hi-fi image answers it cheaper than an interactive prototype.
- **Prevention:** pilot the prototype with one colleague who hasn't seen it before the first real session (`usability-testing.md` §4 — the pilot also catches dead ends). If the pilot spends the session interrogating the artifact, the apparatus is broken; fix it before spending participants.

### 3. Fidelity mismatched to the question

- **Failure:** the classic pair. (a) Testing structure/IA with a polished prototype — participants comment on colors, spacing, and the logo, and *defer* to the polish ("looks like you've already decided"); the structural feedback you needed never comes. (b) Testing visual appeal or comprehension with lorem-ipsum wireframes — there is nothing there to appraise or comprehend. Both burn a research round, and research rounds are the scarce resource.
- **Detection:** feedback arriving on a dial you didn't intend to test. If half the session is visual commentary and your question was navigational, the mismatch is the finding.
- **Fix:** re-run with corrected dials. For IA questions specifically, drop out of prototypes entirely — tree testing (`information-architecture.md`) tests structure with *zero* visual fidelity by design and gives cleaner signal at a tenth the cost.
- **Prevention:** the decision tree below, applied when writing the question. A useful review habit: for each dial, say out loud why it's set where it is. "Because the design system made it easy" is not a reason; it's failure mode 1 loading.

### 4. Happy-path data fidelity

- **Failure:** the prototype works perfectly with the demo persona ("Anna Anderson", 3 tidy projects) and shatters on contact with reality: a participant types *their* email, pastes a 200-character company name, has zero projects. The prototype dead-ends mid-session — you lose the task's data and the participant's confidence. Subtler damage: layouts, truncation, and empty states are never *designed* because the prototype's data never exercised them, so the spec ships without them (`spec-handoff.md` §1) and engineering improvises.
- **Detection:** in-session dead ends; any prototype that only demos correctly when the author drives.
- **Fix:** seed the prototype with hostile data before testing: longest-realistic strings, empty collections, non-Latin names, 1-item and 500-item lists. In coded prototypes this is an hour of fixtures; in clickthrough prototypes, dedicate one screen-variant per stress case for the screens that matter.
- **Prevention:** the stress-data fixture set is part of the prototype definition-of-done whenever the question involves layout, comprehension, or data entry. (The same hostile-content mindset, applied to production components: `ui-engineer/principles/responsive-design.md`.)

## Decision tree — "what fidelity do I build?"

1. **Write the question.** No question → no prototype; you're decorating.
2. **Is the question structural?** ("Can users find X?", "Does this grouping make sense?") → tree test or first-click test (`information-architecture.md`), no prototype needed. Prototype only if the question involves *wayfinding in context*.
3. **Is the question about flow logic / comprehension?** ("Do users understand what happens when they submit?") → interaction: mid-high (clickthrough usually suffices), content: **high**, visual: low-mid, data: cover the paths the logic branches on.
4. **Is the question about input, typing, latency, gestures, or assistive tech?** → **coded prototype**; no clickthrough can answer these. Interaction + data: high. Test on the target device, at realistic latency (`interaction-design.md` §3).
5. **Is the question about visual appeal, trust, or brand?** → visual + content: high; interaction can be zero (static comps). Cheapest apparatus that shows the pixels.
6. **Is the question about a system that doesn't exist yet** (AI responses, voice, recommendations)? → Wizard of Oz: human plays the backend (`topics/voice-conversational.md`).
7. **Whatever you chose:** state the fidelity contract in the demo/session invite, and decide *now* whether the code is throwaway (separate repo, no deploy path) or evolutionary (production standards from line one).

## War story

A B2B team needed to know whether admins understood a new permissions model — pure comprehension question. The designer, proud of the new design system, built the test artifact at full production polish. Session 1: the participant spent forty minutes praising the visual refresh and *never once* articulated what "inherited role" meant, because polished interfaces don't invite "I don't understand this" — saying that to something finished-looking feels like admitting stupidity. We rebuilt in two days as a deliberately gray, obviously-unfinished coded prototype with **real permission names and real consequences in the copy**, and told participants "this is a rough experiment, nothing you can break." Sessions 2–6 produced the finding that shaped the feature: every single participant believed "inherited" meant *from the parent folder*, when the system meant *from the user's team*. Two words in a label, caught for the cost of a gray prototype — and only because the prototype was rough enough to argue with. The rule it left behind: **polish suppresses disagreement**. Set the visual dial to the minimum the question tolerates.

## Related

- What to do with what the prototype teaches you: `usability-testing.md` → `research-to-spec.md`.
- Latency honesty inside coded prototypes: `interaction-design.md` §3.
- Prototyping with design-system components without triggering failure mode 1: `topics/design-system-collaboration.md`.
- The full sequence this doc's choices slot into: `building-a-validated-flow/README.md`.
