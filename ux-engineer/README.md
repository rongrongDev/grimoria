# ux-engineer — A Principal UX Engineer's Exit Brief

**What this is:** 20+ years of judgment from the seam between design and engineering — prototyping fidelity, interaction behavior, journey-level accessibility, usability-testing translation, information architecture, and the specs that carry research into shipped code — encoded for humans (junior → staff) and AI models (Haiku → Opus) to use without the author in the room. Every doc stands alone; every skill and subagent is invokable; every claim is backed by a failure mode, not vibes.

**Scope:** the interaction and experience layer. The visual/component layer — design tokens, component APIs, CSS architecture, component-level accessibility, motion *implementation* — lives in the sibling **`ui-engineer/`** KB; docs here link out rather than re-derive. Accessibility guidance is written against **WCAG 2.2 AA**.

**Last full revision:** 2026-07-13. Check `CHANGELOG.md` for what moved since.

## Find what you need in 30 seconds

| You are trying to... | Go to |
|---|---|
| Understand how this KB is organized (and extend it correctly) | `DESIGN.md` |
| Look up a term used anywhere in here | `GLOSSARY.md` |
| **Take a user problem to a validated, spec'd flow** (prototype → test → spec) | `building-a-validated-flow/README.md` |
| **Assess an unfamiliar flow for UX risk** (a11y, IA, consistency, remediation plan) | `auditing-a-flow/README.md` |
| Pick the right prototype fidelity; stop demos from getting shipped | `principles/prototyping-fidelity.md` |
| Make every action acknowledge the user; survive real latency | `principles/interaction-design.md` |
| Make a *flow* (not just its components) keyboard/screen-reader completable | `principles/journey-accessibility.md` |
| Run or interpret a usability test without fooling yourself | `principles/usability-testing.md` |
| Fix navigation users can't find things in; test IA before building it | `principles/information-architecture.md` |
| Decide what motion means, how long it takes, and when to cut it | `principles/motion-behavior.md` |
| Turn "users were confused" into testable requirements | `principles/research-to-spec.md` |
| Write specs engineers can't implement two different ways | `principles/spec-handoff.md` |
| Prototype with (or against) the design system without causing drift | `topics/design-system-collaboration.md` |
| Hand motion design to implementation unambiguously | `topics/motion-spec-handoff.md` |
| Design voice / conversational interactions that survive real users | `topics/voice-conversational.md` |
| Keep one flow coherent across web, mobile, and desktop | `topics/cross-platform-consistency.md` |
| Review one flow for keyboard/screen-reader task completion | invoke the `journey-accessibility-reviewer` skill |
| Convert raw usability findings into an interaction spec | invoke the `research-to-spec-translator` skill |
| Audit an entire multi-step flow against WCAG 2.2, end to end | dispatch the `flow-accessibility-auditor` subagent |
| Root-cause a usability-test failure to the decision that caused it | dispatch the `usability-failure-tracer` subagent |
| Run multiple AI agents on UX work without conflicting specs or fake audits | `orchestration/README.md` |
| Anything about tokens, component APIs, CSS, visual fidelity | wrong KB — `ui-engineer/README.md` |

## Where to start, by situation

- **New to UX engineering?** Read `principles/prototyping-fidelity.md` and `principles/interaction-design.md` — the two ideas (a prototype is an experiment apparatus, every action needs acknowledgment) everything else builds on. Then build along `building-a-validated-flow/README.md`.
- **Inheriting an unfamiliar product?** `auditing-a-flow/README.md` on the top three money paths, this week. The findings change every conversation that follows.
- **Research keeps arriving vague and nothing changes?** `principles/research-to-spec.md`, then run the `research-to-spec-translator` skill on the last study's notes.
- **A usability test just failed for a keyboard or screen-reader user?** `principles/journey-accessibility.md` — and know that an automated scan passing is not a defense.
- **A specific failure?** The routing table above; every principles doc is organized failure-mode-first, so scan its § headings.

## How the docs are built

Every `principles/` doc: mental model → failure modes (each with **failure → detection → fix → prevention**) → decision tree → war story → related links. Every `topics/` doc: production patterns + common pitfalls only. Every doc carries a date and the spec/method versions it was validated against (WCAG 2.2 AA throughout).

## Rules for AI models using this KB

- Each doc is self-sufficient given itself + its direct links. Don't load the whole tree.
- Skills fire on the situations named in their `description` and cite the docs they apply. Don't invoke a skill to *learn* — read the doc. Don't walk twelve flows step-by-step in the main context — dispatch the subagent.
- **An automated accessibility scan passing is never evidence a journey is accessible.** It is evidence the scannable ~third of the problem is clean. Journey-level verification requires walking the task (`principles/journey-accessibility.md` explains why; `orchestration/README.md` names this as the #1 agent failure).
- Never present a prototype as more finished than its fidelity contract says. If asked to "polish" a prototype, check what question it exists to answer first (`principles/prototyping-fidelity.md`).
- Research claims are stamped. Method advice (test n, task design) has conditions attached — quote the conditions, not just the rule.
