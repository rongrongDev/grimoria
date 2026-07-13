# Glossary

**Validated against:** WCAG 2.2 AA terminology. **Date:** 2026-07-13.

Single source of terminology for every doc, skill, and subagent in this tree. If a doc uses a term differently than defined here, the doc is wrong — fix the doc. Terms owned by `ui-engineer/GLOSSARY.md` (design token, component API, compositor property, focus contract, reduced motion…) are not duplicated; look there.

**Accessibility tree** — The parallel structure browsers expose to assistive technology: roles, names, states. What a screen reader actually reads — visually present but tree-absent content does not exist for AT users. See `principles/journey-accessibility.md`.

**Affordance (perceived)** — What an element *looks like it can do*. A perceived affordance with no matching behavior (flat text that looks like a button) or behavior with no affordance (clickable card with no cue) are both interaction bugs. See `principles/interaction-design.md`.

**Barge-in** — In voice interfaces, the user speaking over the system prompt. Supporting it is expected by experienced users; ignoring it forces them to listen to prompts they already know. See `topics/voice-conversational.md`.

**Card sorting** — IA research method: participants group content items into categories they name (open sort) or into given categories (closed sort). Generates structure hypotheses; **tree testing** validates them. See `principles/information-architecture.md`.

**Change blindness** — Users failing to notice a change outside their locus of attention (a cart count updating in the corner while they look at the button they clicked). The perceptual reason feedback must appear where attention is. See `principles/interaction-design.md`.

**Clickthrough prototype** — Linked static screens (Figma, etc.): real navigation, fake logic. Fast; cannot test input handling, latency, or data variation. Contrast **coded prototype**.

**Coded prototype** — A prototype built in code (throwaway or evolutionary). The only fidelity level that can test typing, latency, real data, and assistive technology. See `principles/prototyping-fidelity.md`.

**Fidelity (four dials)** — How closely a prototype resembles the product along four *independent* axes: visual (polish), content (real vs. lorem), interaction (what actually responds), and data (real vs. hardcoded). "High fidelity" without naming the dial is meaningless. See `principles/prototyping-fidelity.md`.

**Findability** — Whether users can locate content or functions they're looking for. Measured (tree tests, first-click, search-log analysis), not asserted.

**First-click testing** — Method measuring where users click first for a task. First click correct predicts eventual task success far better than chance (Bailey/Wolfson: ~87% success after a right first click vs. ~46% after a wrong one). See `principles/information-architecture.md`.

**Focus order** — The sequence keyboard focus moves through interactive elements. Must match reading/visual order and task logic (WCAG 2.4.3) — *per step and across step transitions*, which is where flows fail. See `principles/journey-accessibility.md`.

**Heuristic evaluation** — Expert review of an interface against established usability principles (canonically Nielsen's 10, 1994/rev. 2020). Cheap, fast, finds different problems than user testing — not a substitute for it. See `principles/usability-testing.md`.

**Information architecture (IA)** — The structure and labeling of content and functions: how things are grouped, named, and navigated. Good IA matches user mental models, not org charts. See `principles/information-architecture.md`.

**Information scent** — The cues (labels, snippets, context) users sniff to judge whether a path leads to what they want. Weak scent → pogo-sticking and abandonment.

**Interaction spec** — The behavioral contract for a flow or feature: states, transitions, feedback, timing, edge cases, and acceptance criteria. Complete when two engineers implementing independently produce indistinguishable behavior. See `principles/spec-handoff.md`.

**Live region (`aria-live`)** — A DOM region whose changes are announced by screen readers without focus moving. The mechanism behind announcing async results, validation errors, and status (WCAG 4.1.3). Polite vs. assertive matters; see `principles/journey-accessibility.md`.

**Mental model** — What the user believes about how the system works and where things live. IA and interaction design succeed by matching it, and research exists to discover it — teams cannot introspect their way to it.

**Moderator bias** — A usability-test moderator shaping results: leading task wording, rescuing struggling participants, probing only expected problems. See `principles/usability-testing.md`.

**Optimistic UI** — Showing an action's result before the server confirms, reconciling on failure. Right for high-success/low-stakes actions; wrong for payments and destructive operations. See `principles/interaction-design.md`.

**Pogo-sticking** — Repeatedly entering and backing out of sections while hunting for content — the behavioral signature of weak information scent or wrong categorization.

**Rainbow spreadsheet** — Observation grid from usability sessions: rows = observed behaviors, columns = participants, cells = who exhibited what. Makes frequency visible and keeps interpretation separate from observation. See `principles/usability-testing.md`.

**Research-to-spec chain** — The traceable path *observation → insight → design decision → requirement → acceptance criterion*. Any requirement that can't walk the chain backward to evidence is opinion wearing a spec's clothes. See `principles/research-to-spec.md`.

**Screen reader** — AT that renders the accessibility tree as speech/braille (NVDA, JAWS, VoiceOver, TalkBack). Testing means completing *tasks* with one, not spot-checking labels.

**Severity × frequency grid** — Prioritization for usability findings: how badly a problem hurts task completion × how many participants (and, projected, users) hit it. The antidote to loudest-finding-wins. See `principles/usability-testing.md`.

**State × event matrix** — Spec table with every UI state as rows and every possible event as columns; each cell says what happens. Empty cells are the edge cases engineering would otherwise improvise. See `principles/spec-handoff.md`.

**Task success rate** — Percentage of participants who complete a task correctly. The primary quantitative signal in usability testing; meaningful only alongside *how* failures happened.

**Think-aloud protocol** — Participants narrate their reasoning while working. High signal for *why*; distorts timing data — don't measure time-on-task during think-aloud.

**Tree testing** — IA validation method: participants find items in a bare text hierarchy (no visual design), measuring success and directness. Isolates structure from styling. See `principles/information-architecture.md`.

**WCAG success criterion (SC)** — A single testable requirement in the Web Content Accessibility Guidelines, numbered (e.g., 2.4.3 Focus Order) and leveled (A/AA/AAA). This KB targets **WCAG 2.2 AA**. Journey application: `principles/journey-accessibility.md`; component application: `ui-engineer/principles/component-accessibility.md`.

**Wizard of Oz prototype** — A prototype whose "system" responses are secretly produced by a human operator. The cheapest way to test interactions whose backend doesn't exist yet (voice, AI, recommendations). See `principles/prototyping-fidelity.md`, `topics/voice-conversational.md`.
