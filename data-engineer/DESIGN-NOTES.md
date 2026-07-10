# Design Notes — `data-engineer/` Knowledge Base

**Last verified:** 2026-07-06 · Written before content generation, per the master prompt (`../data-engineer.md`).

## Where the line between doc, Skill, and Subagent falls

**Principles teach. Skills do. Subagents isolate.** Concretely:

- **`principles/*.md` (plain docs)** hold *judgment*: decision trees, tradeoffs, war stories, failure→detection→fix→prevention tables. They exist to be read — by a human before a design review, or loaded by a model that needs the *why* behind a rule. Nothing in `principles/` is a procedure you "run"; if I found myself writing numbered review steps, I moved them to a Skill and left the reasoning behind in the doc.
- **`stacks/*.md` (plain docs)** hold tool-specific knowledge that decays fastest — every one is version-stamped and date-stamped at the top. Flat files, not per-stack directories: every sibling KB in this repo (`backend-dev/stacks/`) uses flat files and cross-file `path §N` citations depend on stable, short paths.
- **`.claude/skills/<name>/SKILL.md`** hold *repeatable procedures with a defined input and output format* — review a schema-change diff, audit a pipeline PR for rerun safety, plan a DQ test suite. A Skill runs in the calling conversation because its output must land where the developer is working, and its input (a diff, a model file) is small. Each skill cites the principles doc it operationalizes, so a human can audit the rule.
- **`.claude/agents/<name>.md`** are reserved for work whose *input volume would poison the calling context*: walking an entire warehouse's lineage graph, or reading hours of pipeline logs to trace an incident. The agent reads widely and returns only a verdict. If the input fits in a few files, it's a Skill, not a Subagent — isolation has a real cost (the agent starts cold, re-derives context, can't ask questions mid-flight).
- **Commands** — none. Nothing here is trivial enough to be a command and important enough to exist.

## Chosen tree

```
data-engineer/
├── README.md                  ← start here; routing table to everything
├── GLOSSARY.md                ← single shared vocabulary
├── CHANGELOG.md               ← dated against tool versions
├── DESIGN-NOTES.md            ← this file
├── principles/
│   ├── core-principles.md     ← the judgment everything else assumes
│   ├── pipeline-correctness.md│  idempotency, delivery semantics, backfills, late data, watermarks
│   ├── schema-evolution.md    │  compatibility, breaking-change detection, contracts
│   ├── data-modeling.md       │  dimensional modeling, SCDs, denormalization, batch+streaming
│   ├── data-quality.md        │  what to assert, drift detection, contracts-as-tests
│   ├── orchestration.md       │  DAG design, retries, backfill orchestration, cross-team deps
│   ├── observability-and-lineage.md
│   ├── cost-and-performance.md
│   ├── security-and-governance.md
│   └── multi-agent-orchestration.md  ← how to split DE work across AI agents (not a restatement)
├── stacks/
│   ├── airflow.md             ← core tier: full depth
│   ├── dbt.md                 ← core tier
│   ├── spark.md               ← core tier (also carries the distributed-processing depth area)
│   ├── snowflake.md           ← core tier
│   ├── kafka.md               ← core tier
│   ├── prefect-and-temporal.md      ← extended tier: production patterns + pitfalls only
│   ├── redshift.md                  ← extended tier
│   ├── flink-and-streaming-sql.md   ← extended tier
│   └── lake-table-formats.md        ← extended tier (Iceberg / Delta Lake / Hudi)
└── guides/
    ├── build-a-pipeline-from-scratch.md   ← Capability A: zero → sound pipeline
    └── analyze-existing-platform.md       ← Capability B: bounded-time platform audit

.claude/skills/
├── schema-change-impact-reviewer/SKILL.md
├── pipeline-idempotency-auditor/SKILL.md
└── dq-test-planner/SKILL.md

.claude/agents/
├── lineage-blast-radius-scanner.md
└── data-quality-incident-tracer.md
```

## Core-tier picks and why

- **Airflow over Dagster**: it is what the reader will inherit. ~80% of the platforms I've audited run Airflow; the judgment transfers to Dagster, the muscle memory doesn't. Dagster's asset-oriented ideas appear where they matter (in `principles/orchestration.md` as a design lens), and Prefect/Temporal get extended-tier docs.
- **Snowflake over BigQuery**: pairs with dbt in the most common modern deployment, and its cost model (credits × warehouse-seconds) produces the sharpest cost war stories. BigQuery deltas are called out inline where the judgment genuinely differs (slots vs. credits, partition pruning semantics).
- **Distributed processing lives in `stacks/spark.md`** rather than a principles doc: skew, shuffle, OOM, and small files are inseparable from Spark's execution model. The stack doc carries the full failure→detection→fix→prevention depth for that area.

## Primitive assignments for the required capabilities

| Capability | Primitive | Why |
|---|---|---|
| Review a schema change for downstream breakage | **Skill** (`schema-change-impact-reviewer`) | Small input (a diff), procedure with severity rubric, output belongs in the PR conversation. |
| Audit a pipeline PR for idempotency / backfill safety | **Skill** (`pipeline-idempotency-auditor`) | Same shape: diff in, findings out, must land in-context. |
| Plan a data-quality test suite for a table/model | **Skill** (`dq-test-planner`) | Procedure over a schema + profile; produces a concrete test list. |
| Trace full lineage blast radius of a change | **Subagent** (`lineage-blast-radius-scanner`) | Input is an entire manifest/lineage graph — hundreds of models. Reading it inline destroys the caller's context; only the impact report matters. |
| Trace a bad-data incident to its source stage | **Subagent** (`data-quality-incident-tracer`) | Input is logs + run history across many pipeline stages; same isolation argument. |

## Conventions every file follows

1. **Header stamp**: `**Applies to:** <tool versions> · **Last verified:** 2026-07-06` on every doc. Content that will rot fastest (SQL syntax, config keys) sits closest to a stamp.
2. **Failure-mode tables**: every technical area presents *failure mode → detection → fix → prevention* explicitly, because that ordering is how you meet incidents in real life.
3. **Standalone readability**: each doc opens with enough context that a small model given only that file can act. Cross-references are additive (`see X §N` deepens, never gates).
4. **Cross-referencing is bidirectional**: skills/agents cite the principles docs that justify their rules; principles docs name the skill/agent that operationalizes them.
5. **War stories are compressed to their lesson** — two sentences of incident, one sentence of rule — and are real classes of incident (anonymized), not invented drama.
6. Paths in prose use `data-engineer/...` from repo root, matching how sibling KBs cite themselves.
