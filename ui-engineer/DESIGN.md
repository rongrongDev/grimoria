# Design Note — How This Knowledge Base Is Organized, and Why

**Author:** Principal UI engineer (retiring). **Date:** 2026-07-13.
**Audience:** Whoever maintains this after me — human or model. Read this before restructuring anything.

## What this KB owns, and what it doesn't

This KB owns the **visual and component layer**: design tokens, component APIs, CSS architecture, responsive fidelity, motion, component-level accessibility, visual regression testing, and design-system governance. It deliberately does **not** own framework architecture, data fetching, testing philosophy, application security, or concurrency — the sibling `web-dev/` KB owns those, and every doc here links out rather than re-deriving them. The test for "does this belong here": *would the advice survive the team switching from React to Vue?* If yes, it's ours. If it's about how the framework renders, schedules, or fetches, it's `web-dev/`'s.

The one deliberate overlap: accessibility. `web-dev/principles/accessibility.md` owns design-time accessibility reasoning for whole pages and flows. Our `principles/component-accessibility.md` owns only the **component-construction delta** — focus management inside custom widgets, contrast as a token property, semantics lost to styling. It opens by linking to the web-dev doc and assumes it.

## The three primitives (same tests as web-dev/DESIGN.md)

1. **Principles doc** (`principles/`, `topics/`) — judgment to be read and reasoned with. Docs teach.
2. **Skill** (`skills/<name>/SKILL.md`) — a procedure with inputs, steps, and an output format, executed against a concrete artifact (a component PR, a token spec). Skills do.
3. **Subagent** (`agents/<name>.md`) — work whose intermediate noise is 10x its useful output (reading every component in a repo, screenshotting every breakpoint). Subagents isolate.

One topic legitimately appears in all three layers. Token misuse is *explained* in `principles/design-tokens.md`, *hunted in a PR* by the `design-system-consistency-reviewer` skill, and *surveyed across a repo* by the audit playbook and its subagents. Each executable layer cites the doc layer for the "why" and adds only its own "how."

## Why `principles/` has exactly these eight docs

Each maps to one technical area that must carry full failure-mode → detection → fix → prevention depth:

| Doc | The judgment it encodes |
|---|---|
| `design-tokens.md` | Token taxonomy (raw/semantic/component), the semantic-misuse trap, scaling to dark mode and multi-brand |
| `component-api.md` | Prop design, composition over configuration, the kitchen-sink death spiral, breaking-change discipline |
| `css-architecture.md` | Specificity strategy, style containment, bundle growth, theming beyond the happy path |
| `responsive-design.md` | Breakpoint strategy, fluid vs. fixed, real-content robustness (the #1 source of "it broke in prod") |
| `animation-motion.md` | Compositor vs. layout properties, reduced-motion as a token, framework-decoupled motion |
| `component-accessibility.md` | Focus management, contrast-in-tokens, semantics — the component-construction delta on web-dev's a11y doc |
| `visual-regression-testing.md` | The brittle/loose snapshot spectrum, what to screenshot and at which layer |
| `governance.md` | Discoverability, deprecation, contribution models — why systems fork and how to prevent it |

Splitting further (e.g., separate color/spacing/typography token docs) invites drift; merging (tokens + CSS architecture) buries the token judgment inside implementation detail. Eight is the number where each doc is one sitting's read and one area's ownership.

## Why the extended tier is `topics/`, one file each

Cross-browser fidelity, design-handoff tooling, multi-brand theming, and i18n layout get **production-patterns + common-pitfalls only** — each is one file with both sections, because at that depth a directory-per-topic is ceremony. If any of them ever needs full depth (multi-brand is the likely candidate), promote it to `principles/` and log the move in `CHANGELOG.md`.

## Why the capability guides are top-level directories

The Definition of Done names two end-to-end capabilities, and both are *sequences*, not reference material:

- `building-a-design-system/README.md` — capability A: token architecture → component library → visual regression wiring → adoption docs, followable start to finish with real code.
- `auditing-a-ui-codebase/README.md` — capability B: the bounded-time playbook producing four artifacts (token audit, duplication report, a11y/fidelity risk list, remediation plan). The two subagents are this playbook's fan-out arms.

They sit at top level (mirroring web-dev's `analyzing-existing-projects/`) because they're the two doors most readers arrive through.

## Why the skills are these two

- `design-system-consistency-reviewer` — reviewing a component PR against the system is the highest-frequency judgment task in design-system work, and the one where drift actually enters the codebase. It operationalizes `design-tokens.md`, `component-api.md`, and `component-accessibility.md` against a diff.
- `component-from-tokens-generator` — scaffolding a new component correctly (tokens wired, API shaped, states covered, a11y baseline) is the moment where an example is worth a thousand lint rules. It operationalizes the from-scratch guide's patterns for one component at a time.

Not skills: "audit the whole codebase" (context-poisoning → subagent), "explain token strategy" (that's a doc).

## Why the subagents are these two

- `duplicate-component-scanner` — finding the five near-identical Buttons means reading every component file in a repo; the evidence is hundreds of file-reads, the product is a one-page consolidation table. Read-only tools: a scanner that can "helpfully" consolidate is how you get a sixth Button.
- `responsive-fidelity-auditor` — auditing screens across breakpoints × content-stress cases is a screenshot-and-measure grind whose raw output (dozens of renders) must not pollute the parent. Needs Bash to drive a browser; still no Write/Edit — findings only.

## Map of the tree

```
ui-engineer/
├── README.md                       ← start here; 30-second routing table
├── DESIGN.md                       ← this file
├── GLOSSARY.md                     ← single source of terminology
├── CHANGELOG.md                    ← what changed, against which versions
├── principles/                     ← full-depth judgment, one doc per technical area (8)
├── topics/                         ← extended tier: cross-browser, design-handoff,
│                                     multi-brand-theming, i18n-layout
├── building-a-design-system/       ← capability A: from-scratch, followable
├── auditing-a-ui-codebase/         ← capability B: audit playbook (4 artifacts)
├── orchestration/                  ← multi-agent patterns for UI work
├── skills/design-system-consistency-reviewer/  component-from-tokens-generator/
└── agents/duplicate-component-scanner.md  responsive-fidelity-auditor.md
```

## Maintenance rules (non-negotiable)

1. Every doc carries a date and the tool/spec versions it was validated against (CSS features by Baseline status, Style Dictionary, Storybook/Chromatic/Playwright, DTCG format). Undated UI advice is actively harmful — "you can't style a `<select>`" was true for twenty years and then stopped being true.
2. New content passes the primitive test above before it gets a location.
3. Update `CHANGELOG.md` — and `GLOSSARY.md` if terminology is introduced — in the same change.
4. Skills and subagents never inline knowledge that exists in a doc — link it. When the doc improves, the skill improves for free.
5. Framework-level concerns route to `web-dev/`; if you're writing about data fetching or hydration in here, you're in the wrong KB.
