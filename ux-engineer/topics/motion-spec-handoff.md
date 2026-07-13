# Motion-Design Specification for Handoff — Production Patterns & Common Pitfalls

**Tier:** extended (patterns + pitfalls only). **Scope:** the deliverable that carries a motion design into implementation. What the motion should *say* and how long it should take: `../principles/motion-behavior.md`. How it's implemented cheaply and safely (compositor, tokens, reduced-motion mechanics): `ui-engineer/principles/animation-motion.md`. This file owns the artifact between them. **Date:** 2026-07-13.

## The mental model in one paragraph

A motion design that exists only as a video (or a Figma Smart Animate prototype, or an After Effects comp) is a picture of *timing* the way a mock is a picture of *layout* — it shows one run of one case and is silent about everything an implementer must decide: exact durations, easing curves, which properties animate, what happens on interruption, what reduced-motion users get. "Make it like the video" hands those decisions to frame-scrubbing and guesswork, and every engineer scrubs differently. The deliverable that works is **video + table**: the video carries intent (humans read motion better than numbers), the table carries the contract (numbers, curves, behavior). Neither substitutes for the other.

## Production patterns

- **The motion spec table — one row per animated moment**, with these columns, none optional:

  | column | contents |
  |---|---|
  | Communicates | the sentence (causality/continuity/state/orientation) — `motion-behavior.md`'s test; an empty cell means cut the row |
  | Trigger | the exact event (user action or state change), tied to the state × event matrix cell it decorates (`../principles/spec-handoff.md`) |
  | Properties | what visually changes (position/opacity/scale) — stated as *effect*, letting implementation choose the compositor-friendly expression (`ui-engineer/principles/animation-motion.md` §1) |
  | Duration / Easing | **token names** (`motion.duration.fast`, `motion.easing.enter`), not raw ms/curves — raw values in a spec bypass the reduced-motion switch and the system vocabulary |
  | Interruption | what happens if the user acts mid-animation (retarget / complete / cancel) — the cell most often missing and most expensive to improvise |
  | Reduced-motion | the variant (crossfade / instant / unchanged-because-essential) — required, not appended later |
  | Stagger/sequence | ordering and offsets when multiple elements move, else "—" |

- **Spec in named patterns, not per-instance prose.** Define the flow's 3–5 motion patterns once (*step-advance*, *panel-reveal*, *confirm-pulse*, *dismiss* — `motion-behavior.md` §3), then rows mostly say "pattern: panel-reveal." One definition, no drift; a new pattern is a design conversation, not a new row.
- **Deliver a runnable reference for anything nontrivial.** For complex choreography (springs, gesture-driven, sequenced), a CodePen-grade coded snippet beats any table — it *is* the timing, inspectable and diffable. Twenty minutes of UX-engineer time saves days of scrub-and-compare. (This is the role's superpower applied to motion: the prototype as spec-adjunct.)
- **Acceptance criteria that are checkable:** durations/easings match the named tokens (mechanically verifiable — `ui-engineer`'s consistency-reviewer greps for raw literals); the interruption cell holds under the spam-click test; the reduced-motion variant renders under emulation; entrances don't displace settled targets (`motion-behavior.md` §4).
- **Review the handoff as a pair once per flow:** designer/UX engineer plays the reference, implementation engineer reads the table back — the motion equivalent of the spec walkthrough (`../principles/spec-handoff.md` §4).

## Common pitfalls

1. **"Like the video."** No durations, no curves, no interruption — the engineer scrubs frames, ships 380ms where the comp was 300ms with a custom bezier, and the review is a taste argument with no referent. *Prevention:* no motion handoff without the table; the video is intent, the table is the contract.
2. **Easing omitted.** Duration specified, curve left to default — and `ease` vs. `ease-out` vs. a spring reads as a *completely different* motion at identical duration. Easing is half the sentence; a row without it is unfinished.
3. **After Effects values shipped verbatim.** Comp-space coordinates, 60fps keyframe positions, exotic curves with no CSS/spring equivalent — the engineer transliterates badly or gives up. *Prevention:* the UX engineer translates comp → web-expressible spec (that translation is precisely this role's job); if a curve can't be expressed as cubic-bezier/spring parameters, redesign the curve, not the platform.
4. **No interruption row.** The design assumes every animation completes; users click mid-flight on day one; the improvised answer wedges the panel half-open (`ui-engineer/principles/animation-motion.md` §4) or drops the click (`motion-behavior.md` §4). *Prevention:* the column is mandatory; "retarget from current position" is the right default answer for state transitions.
5. **Reduced-motion bolted on after.** Shipped, audited, then a `reduce` variant is improvised that removes the *state feedback* along with the flourish (spinner deleted, user thinks it hung). Reduce ≠ remove — the state sentence must survive; the mechanics of honoring the preference centrally live in `ui-engineer/principles/animation-motion.md` §2.
6. **Raw values in the spec.** `240ms` typed into a row instead of `motion.duration.fast` — it compiles, it ships, and it silently exits the token system: the global reduced-motion switch and any future retiming no longer reach it. *Prevention:* token names in specs, literals only inside token definitions.

## Related

- What motion to design at all, timing judgment, flow coherence: `../principles/motion-behavior.md`.
- Implementation constraints and the token/reduced-motion machinery: `ui-engineer/principles/animation-motion.md`.
- The state × event matrix these rows attach to: `../principles/spec-handoff.md`.
