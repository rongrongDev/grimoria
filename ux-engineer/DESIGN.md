# Design Note — How This Knowledge Base Is Organized, and Why

**Author:** Principal UX engineer (retiring). **Date:** 2026-07-13.
**Audience:** Whoever maintains this after me — human or model. Read this before restructuring anything.

## What this KB owns, and what it doesn't

This KB owns the **interaction and experience layer**: prototyping fidelity, interaction and micro-interaction behavior, accessibility at the user-journey level, usability-testing collaboration and translation, information architecture, motion *meaning and timing*, and the specs that carry all of it into engineering. It deliberately does **not** own the visual/component layer — design tokens, component APIs, CSS architecture, visual fidelity mechanics, component-level accessibility — the sibling `ui-engineer/` KB owns those, and every doc here links out rather than re-deriving them.

The test for "does this belong here": *is this about what the user experiences and how we validated it, or about how the pixels and components are built?* The first is ours. The second is `ui-engineer/`'s. The two roles routinely work the same screen — a dropdown's token usage and focus trap are `ui-engineer/`; whether a dropdown is the right control for this step of this journey, and whether a keyboard user can complete the *task* it sits in, are ours.

Two deliberate seams, both documented at the seam:

- **Accessibility.** `ui-engineer/principles/component-accessibility.md` owns the component-construction half (focus management inside widgets, contrast, semantics). Our `principles/journey-accessibility.md` owns the journey half — task completion across steps, focus continuity between screens, announcements for flow-level state. Each doc opens by naming the other. A flow of individually compliant components can still be uncompletable; that gap is precisely our half.
- **Motion.** `ui-engineer/principles/animation-motion.md` owns cost and implementation (compositor properties, motion tokens, reduced-motion mechanics). Our `principles/motion-behavior.md` owns meaning and timing (what the motion communicates, how long it should take at this point in the journey, coherence across a flow). Same screen, different questions.

## The three primitives (same tests as ui-engineer/DESIGN.md)

1. **Principles doc** (`principles/`, `topics/`) — judgment to be read and reasoned with. Docs teach.
2. **Skill** (`skills/<name>/SKILL.md`) — a procedure with inputs, steps, and an output format, executed against a concrete artifact (a flow, a pile of session notes). Skills do.
3. **Subagent** (`agents/<name>.md`) — work whose intermediate noise is 10x its useful output (walking every step of every flow with a screen reader script, reading a whole codebase to trace one failure). Subagents isolate.

One topic legitimately appears in all three layers. Journey accessibility is *explained* in `principles/journey-accessibility.md`, *checked on one flow* by the `journey-accessibility-reviewer` skill, and *swept across a product* by the `flow-accessibility-auditor` subagent. Each executable layer cites the doc layer for the "why" and adds only its own "how."

## Why `principles/` has exactly these eight docs

Each maps to one technical area that must carry full failure-mode → detection → fix → prevention depth:

| Doc | The judgment it encodes |
|---|---|
| `prototyping-fidelity.md` | Fidelity as four independent dials matched to the question; the too-polished trap (stakeholders ship it) and the too-rough trap (no valid signal) |
| `interaction-design.md` | Feedback within perceptual thresholds, state-machine completeness, latency honesty, input parity |
| `journey-accessibility.md` | Task completion over element compliance; focus continuity, announcements, and WCAG 2.2 applied at flow level |
| `usability-testing.md` | Getting valid signal from small n; severity×frequency judgment, moderator bias, prototype-caused failures |
| `information-architecture.md` | User mental models over org charts; card sorting, tree testing, findability evidence |
| `motion-behavior.md` | Motion as communication; timing scaled to frequency and distance; flow-level coherence |
| `research-to-spec.md` | The traceable chain from observation to testable requirement; killing "make it more intuitive" |
| `spec-handoff.md` | The two-engineer test; state × event matrices; edge cases as spec content, not improvisation |

`research-to-spec.md` and `spec-handoff.md` stay separate despite being neighbors: the first is about *deriving* requirements from evidence (the input is research), the second about *completing* them for implementation (the input is a design decision). Merging them buried the translation judgment inside a template document twice in draft; I split them and both got sharper.

## Why the extended tier is `topics/`, one file each

Design-system collaboration, motion-spec handoff, voice/conversational interfaces, and cross-platform consistency get **production-patterns + common-pitfalls only** — each one file with both sections. At that depth a directory-per-topic is ceremony. If one outgrows its tier (cross-platform is the likely candidate as the org adds platforms), promote it to `principles/` and log the move in `CHANGELOG.md`.

## Why the capability guides are top-level directories

The Definition of Done names two end-to-end capabilities, and both are *sequences*, not reference material:

- `building-a-validated-flow/README.md` — capability A: user problem → fidelity choice → prototype → evaluation → findings → implementation-ready spec, followable start to finish with a worked example.
- `auditing-a-flow/README.md` — capability B: the bounded-time playbook producing four artifacts (journey-accessibility risk assessment, IA clarity review, interaction-consistency audit, prioritized remediation plan). The subagents are this playbook's fan-out arms.

They sit at top level (mirroring `ui-engineer/building-a-design-system/`) because they're the two doors most readers arrive through.

## Why the skills are these two

- `journey-accessibility-reviewer` — reviewing one flow for keyboard/screen-reader task completion is the highest-leverage recurring check in UX-engineering work, and the one automated scanners structurally cannot do. It operationalizes `journey-accessibility.md` against a single concrete flow, inline, before it ships.
- `research-to-spec-translator` — converting raw usability findings into an implementation-ready interaction spec is the seam this whole role exists at, and the step where most value is lost in practice ("users were confused" arrives; nothing implementable leaves). It operationalizes `research-to-spec.md` + `spec-handoff.md` with a template.

Not skills: "audit every flow in the product" (context-poisoning → subagent), "explain fidelity tradeoffs" (that's a doc), "review component a11y construction" (ui-engineer's half).

## Why the subagents are these two

- `flow-accessibility-auditor` — walking an entire multi-step flow against WCAG 2.2 journey-level criteria means driving a browser step by step, capturing focus order, accessibility trees, and announcements at every transition. The evidence is hundreds of tool calls; the product is a findings table. Read-only plus Bash-for-browser: an auditor that can "helpfully" fix focus order is how audits stop being trustworthy.
- `usability-failure-tracer` — tracing "3 of 5 participants abandoned at step 4" back to the specific interaction or IA decision that caused it means reading the flow's code, specs, and analytics until the causal chain closes. High noise, one-page verdict, and it must not inherit the parent's pet theory — isolation is the point.

## Map of the tree

```
ux-engineer/
├── README.md                       ← start here; 30-second routing table
├── DESIGN.md                       ← this file
├── GLOSSARY.md                     ← single source of terminology
├── CHANGELOG.md                    ← what changed, against which versions
├── principles/                     ← full-depth judgment, one doc per technical area (8)
├── topics/                         ← extended tier: design-system-collaboration,
│                                     motion-spec-handoff, voice-conversational,
│                                     cross-platform-consistency
├── building-a-validated-flow/      ← capability A: problem → prototype → evaluation → spec
├── auditing-a-flow/                ← capability B: audit playbook (4 artifacts)
├── orchestration/                  ← multi-agent patterns for UX work
├── skills/journey-accessibility-reviewer/  research-to-spec-translator/
└── agents/flow-accessibility-auditor.md  usability-failure-tracer.md
```

## Maintenance rules (non-negotiable)

1. Every doc carries a date and the spec/tool versions it was validated against (WCAG version above all — this KB is written against **WCAG 2.2 AA**; when 3.0 leaves draft, re-validate `journey-accessibility.md` first, everything else second). Undated accessibility advice is actively harmful.
2. New content passes the primitive test above before it gets a location.
3. Update `CHANGELOG.md` — and `GLOSSARY.md` if terminology is introduced — in the same change.
4. Skills and subagents never inline knowledge that exists in a doc — link it. When the doc improves, the skill improves for free.
5. Visual/component concerns route to `ui-engineer/`; if you're writing about tokens, CSS, or component props in here, you're in the wrong KB.
6. Research-method claims (test n, method validity) cite their basis. "Five users find most problems" has conditions attached; docs that state the rule must state the conditions.
