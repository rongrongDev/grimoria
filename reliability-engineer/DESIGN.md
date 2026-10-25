# DESIGN.md — Why this KB is shaped the way it is

**Last verified:** 2026-07-14 · Applies to the whole `reliability-engineer/` tree, including its `skills/` and `agents/` subdirectories.

This is the design note required before any content: what goes where, and why. If you are extending this KB, read this first so you put new material in the right primitive.

## The three primitives, and the test for each

**Principles teach. Skills do. Subagents isolate.** Concretely:

| Question to ask about new content | If yes → |
|---|---|
| Is it judgment a reader must *internalize* to make their own calls — SLO tradeoffs, severity decision trees, postmortem war stories, failure taxonomies? | `reliability-engineer/principles/` (core tier) or `reliability-engineer/topics/` (extended tier) — plain markdown |
| Is it a *repeatable procedure* an agent or human executes on demand, with defined inputs and a defined deliverable? | `reliability-engineer/skills/<name>/SKILL.md` |
| Does the procedure ingest *large raw material* (weeks of alert history, gigabytes of incident logs, a whole postmortem corpus) whose content is worthless after aggregation, while its useful result is a short report? | `reliability-engineer/agents/<name>.md` (subagent) |
| Is it a trivial one-liner with no auto-invoke need? | a slash command — we deliberately have none; everything here earned Skill status or stayed a doc |

The subagent test is the one people get wrong. A subagent is not "a big skill." It is justified only when the *ratio of raw material read to conclusion returned* is extreme — and, for this domain specifically, when the work must not contaminate an incident channel or a responder's working context with noise.

## The tree

```
reliability-engineer/
├── README.md                        ← start here; 30-second routing table
├── DESIGN.md                        ← this file
├── GLOSSARY.md                      ← every term of art, one place
├── CHANGELOG.md                     ← dated revisions
├── principles/                      ← core tier: full-depth judgment
│   ├── slos-and-error-budgets.md
│   ├── observability.md
│   ├── incident-management.md
│   ├── alerting.md
│   ├── postmortems.md
│   └── capacity-planning.md
├── topics/                          ← extended tier: production patterns + common pitfalls only
│   ├── chaos-engineering.md
│   ├── disaster-recovery.md
│   ├── toil.md
│   └── multi-region.md
├── playbooks/                       ← end-to-end procedures, start-to-finish
│   ├── build-a-reliability-program-from-scratch.md
│   └── assess-an-existing-systems-reliability.md
├── orchestration/
│   └── README.md                    ← multi-agent patterns for reliability work
├── skills/                          ← agent-invokable procedures
│   ├── slo-validity-reviewer/SKILL.md
│   ├── alert-actionability-auditor/SKILL.md
│   └── reliability-posture-assessor/SKILL.md
└── agents/                          ← isolated subagents
    ├── incident-timeline-reconstructor.md
    ├── alert-noise-auditor.md
    └── postmortem-quality-reviewer.md
```

**Installation note.** Skills and subagents *live* in this KB so they version with the docs they reference. They are not auto-invokable from here: a consuming project or user must copy or symlink them into `.claude/skills/` and `.claude/agents/` for the harness to discover them. All cross-references in this KB use the source-of-truth `reliability-engineer/...` paths.

## Specific placement decisions, with reasoning

**Core vs extended split is `principles/` vs `topics/`.** The six core areas (SLOs, observability, incidents, alerting, postmortems, capacity) get full failure-mode → detection → fix → prevention depth because they are the daily job. The four extended areas (chaos, DR, toil, multi-region) get production patterns and pitfalls only — enough to not hurt yourself, with pointers to where depth lives. Mixing tiers in one directory tempts maintainers to let extended docs bloat or core docs thin out; the directory boundary is the budget.

**Playbooks are docs, not skills — but the assessment playbook has a skill counterpart.** The two mandated capabilities (build a reliability program; assess an existing system's posture) are long, ordered procedures with judgment at each step. A human follows the playbook. An agent invokes `reliability-posture-assessor`, a compressed executable rendering of the assessment playbook with an explicit output contract. The build-from-scratch playbook deliberately has *no* skill counterpart: standing up a reliability program is weeks of meetings, negotiation, and organizational change — an agent "executing" it produces documents nobody agreed to, which is worse than nothing. That asymmetry is a design decision, not an omission.

**Why `alert-actionability-auditor` is a skill and `alert-noise-auditor` is a subagent.** Same domain, opposite context profiles. Reviewing one proposed alert reads one rule definition and returns a verdict *into the conversation where the author is working* — the review must land where the decision is being made. Auditing an entire alerting config against weeks of paging history reads hundreds of rules and thousands of alert events, and the caller needs two pages: the noise ranked, the coverage gaps listed. The skill keeps context; the agent shields it.

**Why `incident-timeline-reconstructor` is a subagent.** Reconstructing an incident timeline means reading logs, metric annotations, deploy records, and chat scrollback across many services — megabytes in, one timeline out. Run it in the main context and you poison the very conversation the responders or postmortem author are using. It is also explicitly **read-only and forbidden from taking remediation action** — see `reliability-engineer/orchestration/README.md` for why an agent with a pen during a live incident is a failure mode, not a feature.

**Why `postmortem-quality-reviewer` is a subagent, not a skill.** Reviewing a draft's prose could be a skill — but the review that matters checks the draft *against the corpus of past postmortems* (repeat causes, repeat action items that were never done, patterns the org keeps rediscovering). That means reading dozens of past documents per review. Corpus in, two-page review out: subagent.

**Subagent tool allowlists are minimal by design.** All three subagents are read-only by contract (Read/Grep/Glob, plus Bash restricted by instruction to read-only queries for the timeline reconstructor, which must run `kubectl logs`, `gh`, and observability CLIs). None can write files. The timeline reconstructor's instructions additionally forbid *any* state-changing command during a live incident — the highest-consequence failure mode in this KB's domain is an automated actor "helpfully" restarting something mid-incident.

**One GLOSSARY, at the root.** Smaller models resolve terms by exact link. Per-directory glossaries drift. I have watched two teams inside one company mean different things by "SEV2" for a year; the resulting escalation misfires are exactly what a single glossary prevents.

**Every doc standalone.** Each doc restates the two or three definitions it depends on rather than assuming the reader arrived via README. Cost: mild repetition. Benefit: a Haiku-class model given a single file can act correctly. Deliberate and non-negotiable; do not "DRY up" the docs.

**Scope boundary with `devops-engineer/`.** That KB (a sibling pack; may not be installed everywhere) owns getting code and infrastructure into production correctly — pipelines, IaC, deployment strategy, rollback mechanics. This KB owns knowing whether the system is healthy and what to do when it is not. Concretely: *how* to do a canary deploy is theirs; *whether the canary's error rate constitutes an SLO-relevant regression, and whether to page* is ours. Docs here link out with `devops-engineer/...` paths rather than duplicating; if that pack is absent, the link still tells you what this KB deliberately does not cover.

## Conventions

- Every doc header carries `Applies to:` (tooling/version context where relevant, or "tool-agnostic") and `Last verified:` (date). Undated advice is folklore.
- Failure-mode content follows the chain **failure mode → detection → fix → prevention**, where prevention names a mechanism (alert rule, dashboard check, process gate), not a resolution to be careful.
- Decision trees over "it depends." Where a judgment could not be turned into branches, the doc lists the *inputs* to the judgment instead.
- Cross-references are relative paths from repo root, e.g. `reliability-engineer/principles/alerting.md`. Skills reference docs; docs reference skills. Both directions, always.
- Related-memory-style links between docs are plain markdown links, not wiki syntax.
