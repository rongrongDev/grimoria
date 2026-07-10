# Design Note — How This Knowledge Base Is Organized, and Why

**Author:** Principal web engineer (retiring). **Date:** 2026-07-06.
**Audience:** Whoever maintains this after me — human or model. Read this before restructuring anything.

## The organizing principle

Knowledge bases die two deaths: duplication (the same advice in five places, four of them stale) and burial (the right doc exists but nobody finds it in the moment they need it). Every structural decision below is a defense against one of those deaths.

The three primitives, and the test for each:

1. **Principles doc** (`principles/`, `frameworks/<name>/`) — the content is _judgment to be read and reasoned with_. Test: "would a smart engineer read this once and be permanently better at decisions?" If yes, it's a doc. Docs teach.
2. **Skill** (`.claude/skills/<name>/SKILL.md`) — the content is a _procedure to be executed against a concrete artifact_ (a diff, a codebase, a feature spec). Test: "does this have inputs, steps, and an output format?" If yes, it's a skill. Skills do.
3. **Subagent** (`.claude/agents/<name>.md`) — the work would _poison the context_ of whoever dispatched it: reading 500 files, grepping every dependency, producing pages of intermediate noise for one page of conclusions. Test: "is the intermediate work 10x larger than the useful output?" If yes, subagent. Subagents isolate.

Corollary: **one topic legitimately appears in all three layers.** Race conditions in React effects are _explained_ in `frameworks/react/concurrency.md`, _hunted in a diff_ by the `react-code-reviewer` skill, and _surveyed across a whole legacy repo_ by the `legacy-project-onboarder` subagent. That is not duplication — each layer references the doc layer for the "why" and adds only its own "how."

## Why the six technical areas live in `principles/`, not per-framework

Testing philosophy, security reasoning, concurrency theory, async patterns, performance budgets, and accessibility thinking are 80% framework-independent. Writing them per-framework means five copies that drift. So:

- `principles/<area>.md` holds the full depth: failure modes, detection, fix, prevention, war story, decision tree.
- `frameworks/<x>/<area>.md` holds only the **delta**: what this framework adds, breaks, or renames. Each one opens with a link back to the principles doc and states its framework version and date.

If you find yourself writing general advice in a framework file, you're in the wrong file.

## Why React gets the fully-followable from-scratch guide

The Definition of Done requires one build guide complete enough to follow start to finish. React's virtual-DOM-plus-hooks core is the highest-leverage choice: it teaches reconciliation, closures-over-render-state, and the scheduling model — the concepts behind half the bugs in `concurrency.md` for _every_ component framework. The other core frameworks get from-scratch guides that are honest about being guided sketches: complete architecture, key code, and a step list, but you'll write more glue yourself.

## Why the skills are these three

- `react-code-reviewer` — reviewing diffs is the highest-frequency judgment task; it operationalizes the React docs.
- `security-auditor` — security review has a checklist shape (OWASP mapping) but requires judgment to avoid false-positive noise; ideal skill material.
- `test-strategy-planner` — "what do I test and at what layer" is the question juniors ask most and get the vaguest answers to; the skill forces a concrete, layered answer. **Ownership note:** this repo hosts sibling knowledge bases (`quality-dev/`, `security-dev/`, …) and a `test-strategy-planner` skill already exists, owned by `quality-dev/`. Per rule 4 below (never duplicate what exists), web-dev _references_ that skill instead of shipping a competing copy — its layer-allocation judgment is compatible with `principles/testing.md`; use our framework `testing.md` docs for the stack-specific harness choices.

Not skills: anything that's really just "read the doc" (that's a doc), and anything whose output is dominated by exploration noise (that's a subagent).

## Why the subagents are these two

- `legacy-project-onboarder` — reading an unfamiliar repo end-to-end is the canonical context-poisoning task. It follows `analyzing-existing-projects/README.md` and returns the three artifacts (architecture summary, risk list, remediation plan) without the 300 file-reads that produced them.
- `dependency-security-scanner` — lockfile and advisory analysis is exhaustive and noisy; conclusions fit in a page. Read-only tools: an auditor that can edit is an incident waiting to happen.

## Map of the tree

```
web-dev/
├── README.md                      ← start here; 30-second routing table
├── DESIGN.md                      ← this file
├── GLOSSARY.md                    ← single source of terminology
├── CHANGELOG.md                   ← what changed, against which versions
├── principles/                    ← full-depth cross-cutting judgment (6 areas)
├── frameworks/
│   ├── react/ nextjs/ vue-nuxt/ svelte-sveltekit/ node/     ← core tier: 6 docs each
│   └── angular/ solid/ astro/ remix-react-router/           ← extended tier: 2 docs each
├── analyzing-existing-projects/   ← bounded-time audit playbook (capability B)
└── orchestration/                 ← deploying agent teams on web-dev work
├── skills/react-code-reviewer/ security-auditor/ test-strategy-planner/
└── agents/legacy-project-onboarder.md dependency-security-scanner.md
```

## Maintenance rules (non-negotiable)

1. Every framework doc carries a version stamp and a date. **Undated advice is actively harmful** — a reader can't tell React 16 wisdom from React 19 wisdom, and they are sometimes opposite.
2. New content goes through the primitive test above before it gets a location.
3. Update `CHANGELOG.md` and, if terminology is introduced, `GLOSSARY.md` in the same change.
4. Skills and subagents must never inline knowledge that exists in a doc — link it. When the doc improves, the skill improves for free.
