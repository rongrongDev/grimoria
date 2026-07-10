# Design Note — data-analyst knowledge base

**Version 1.0.0 · 2026-07-06 · Status: complete initial release**

This note explains what went where and why, so future maintainers extend the KB
instead of eroding it.

## The three primitives, and the rule I used

- **Principles/topics (plain markdown under `data-analyst/`)** hold *judgment*: the
  reasoning, the war stories, the decision trees. They are what you read to become
  the kind of analyst who doesn't need the checklist. Everything a reader must
  *understand* lives here — nothing procedural hides in a skill that a human reading
  the KB would miss.
- **Skills (`.claude/skills/<name>/SKILL.md`)** hold *procedures with a defined input
  and output* that get invoked repeatedly in-context: "here is a proposed A/B test,
  review it"; "here is a metric's SQL, audit it." A skill cites the topic docs for
  its reasoning; it never restates them at length. If a skill's rule can't point at a
  principles/topics section, the rule goes into a topic doc first.
- **Subagents (`.claude/agents/<name>.md`)** exist only where **context isolation** is
  the point: work that requires reading volumes of material (every dashboard in a BI
  project; a full analysis thread) where the raw material would poison the calling
  conversation, and only a compact verdict should return.

Decision rule applied throughout: **principles teach, skills do, subagents isolate.**
If a capability needed neither a repeatable procedure nor isolation, it stayed prose.
No legacy commands were created — nothing here is trivial enough to justify one.

## Why this tree shape

```
data-analyst/
├── README.md                  ← start here; 30-second router
├── GLOSSARY.md                ← single shared vocabulary
├── CHANGELOG.md
├── DESIGN.md                  ← this file
├── principles/
│   ├── core-principles.md             ← the ten judgments everything else derives from
│   └── multi-agent-orchestration.md   ← when/how to split analytics work across agents
├── topics/                    ← one file per technical area; flat, no subdirectories
│   ├── sql-correctness.md             (core tier)
│   ├── experiment-design.md           (core tier)
│   ├── statistical-pitfalls.md        (core tier)
│   ├── metric-design.md               (core tier)
│   ├── data-visualization.md          (core tier)
│   ├── stakeholder-communication.md   (core tier)
│   ├── dashboard-reliability.md       (core tier)
│   ├── bi-tools.md                    (core: Looker; Tableau deltas; extended: Power BI)
│   ├── spreadsheet-modeling.md        (core tier)
│   ├── python-r-analysis.md           (extended tier)
│   └── causal-inference.md            (extended tier)
└── guides/
    ├── build-analysis-from-scratch.md ← Capability A, end to end
    └── audit-existing-analytics.md    ← Capability B, time-budgeted
```

Topics are **flat files, not directories** — every technical area fits in one
self-contained doc, and a flat listing is scannable in seconds. A topic gets promoted
to a directory only when it needs supporting artifacts (datasets, templates) that
can't inline.

Every topic doc is independently readable: it opens with scope + version/date stamp,
carries its own failure-mode tables (failure → detection → fix → prevention), and
links out only for *depth*, never for *prerequisites*. A smaller model given one file
and its direct links can act on it. That was the acceptance test for each doc.

## Skill/subagent choices (and rejections)

| Capability | Primitive | Why |
| --- | --- | --- |
| `experiment-design-reviewer` | **Skill** | Bounded input (one experiment plan), repeatable checklist + power math, verdict must land in the calling conversation where the experiment is being discussed. No isolation benefit. |
| `metric-definition-auditor` | **Skill** | Bounded input (one metric's SQL + spec). Same reasoning. |
| `dashboard-reconciliation-scanner` | **Subagent** | Must read *every* dashboard/model/view in scope — hundreds of files of LookML/SQL that would flood the caller. Only the reconciliation verdict should return. Classic isolation case. |
| `analysis-narrative-drafter` | **Subagent** | Consumes a whole analysis thread (notebooks, query files, results tables) and returns one stakeholder document. The inputs are bulky; the output is small; drafting benefits from not inheriting the caller's conversational bias about what the answer "should" be. |
| ~~`dashboard-spec-drafter`~~ | **Rejected as skill** | Drafting a dashboard spec is judgment-heavy and input-light; the decision tree in `topics/data-visualization.md` §5 plus the template in `topics/metric-design.md` §2 covers it. A skill would just restate two docs. |
| ~~`sql-optimizer`~~ | **Rejected** | Optimization advice is warehouse-specific and lives in `topics/sql-correctness.md` §6; a generic skill would produce confident, wrong, engine-inappropriate advice. |

## Conventions

- **Stamps**: every doc carries `Version · date · applies-to` in its header. SQL docs
  state dialect assumptions (ANSI + BigQuery/Snowflake notes); BI docs state the tool
  generation (Looker as of 2026, LookML-first; Tableau 2024.x+; Power BI current-gen
  DAX/VertiPaq).
- **Failure-mode tables**: every §3 technical area uses the same four columns —
  *failure mode, detection, fix, prevention* — so auditors can diff coverage.
- **Cross-referencing is bidirectional**: topics name the skills/subagents that
  operationalize them ("to apply this, invoke…"); skills cite topic sections for
  every rule ("per `topics/experiment-design.md` §2…").
- **War stories are load-bearing**, not decoration: each appears once, in the topic
  that owns the lesson, and is referenced elsewhere by name.
