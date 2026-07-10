# `data-engineer/` — a principal data engineer's knowledge base

**Last verified:** 2026-07-06 · Built to be used without its author: by junior→staff data engineers and by AI models (Opus/Sonnet/Haiku) invoking the Skills/Subagents. Every doc stands alone; cross-references deepen, never gate.

## Find what you need in 30 seconds

| You are trying to... | Go to |
|---|---|
| **Build a new pipeline** (from zero, done right) | `guides/build-a-pipeline-from-scratch.md` |
| **Understand/audit an inherited platform** | `guides/analyze-existing-platform.md` |
| **Review a PR that changes a schema** | skill `schema-change-impact-reviewer` (unknown consumers? agent `lineage-blast-radius-scanner` first) |
| **Review a PR that adds/changes a pipeline** (retries? backfill-safe?) | skill `pipeline-idempotency-auditor` |
| **Decide what tests a table needs** | skill `dq-test-planner` |
| **Chase wrong numbers / a bad-data incident** | contain first (`principles/data-quality.md` §5), then agent `data-quality-incident-tracer` |
| **Plan a backfill** | `principles/pipeline-correctness.md` §3 + `principles/orchestration.md` §4 |
| **Cut warehouse/compute costs** | `principles/cost-and-performance.md` |
| **Handle late data / watermarks / restatements** | `principles/pipeline-correctness.md` §4–5 |
| **Model tables** (grain, star schema, SCDs) | `principles/data-modeling.md` |
| **Set up monitoring/SLAs/alerts** | `principles/observability-and-lineage.md` |
| **PII, masking, deletion compliance** | `principles/security-and-governance.md` |
| **Split DE work across AI agents safely** | `principles/multi-agent-orchestration.md` |
| **Tool-specific question** | `stacks/<tool>.md` (table below) |
| **A term you don't know** | `GLOSSARY.md` |

**New to the whole KB?** Read `principles/core-principles.md` first (10 minutes) — the twelve rules everything else elaborates, each with the incident that paid for it.

## Layout

```
principles/   the judgment: tradeoffs, decision trees, failure→detection→fix→prevention
stacks/       tool-specific patterns, version-stamped (they rot fastest — check the date)
guides/       end-to-end procedures for the two big jobs: build new, audit inherited
GLOSSARY.md   one shared vocabulary          CHANGELOG.md  revisions vs dated tool versions
DESIGN-NOTES.md  why docs vs skills vs subagents are split the way they are
```

### Principles (tool-agnostic, decay-resistant)

| Doc | Carries |
|---|---|
| `core-principles.md` | The 12 load-bearing rules + war stories |
| `pipeline-correctness.md` | Idempotency, delivery semantics, backfills, late data, watermarks |
| `schema-evolution.md` | Change taxonomy, compatibility, expand/contract, contracts |
| `data-modeling.md` | Grain, star schema, SCD decision tree, denormalization, batch+streaming |
| `data-quality.md` | Four-lens assertions, frameworks, drift detection, incident response |
| `orchestration.md` | DAG design, retries, catchup, backfill storms, cross-team dependencies |
| `observability-and-lineage.md` | SLAs, the three vital signs, lineage, alert design |
| `cost-and-performance.md` | Billing-unit thinking, query optimization, layout, materialization |
| `security-and-governance.md` | PII, column masking, retention/deletion patterns |
| `multi-agent-orchestration.md` | Agent topologies for DE work + agent-specific failure modes |

### Stacks

**Core tier (full depth):** `airflow.md` · `dbt.md` · `spark.md` (carries the distributed-processing area) · `snowflake.md` · `kafka.md`
**Extended tier (production patterns + pitfalls):** `prefect-and-temporal.md` · `redshift.md` · `flink-and-streaming-sql.md` · `lake-table-formats.md` (Iceberg/Delta/Hudi)

### Callable capabilities

| Name | Kind | One-liner |
|---|---|---|
| `schema-change-impact-reviewer` | Skill | Classify a schema diff against known consumers; verdict + expand/contract plan |
| `pipeline-idempotency-auditor` | Skill | Audit pipeline code for safe-rerun/backfill correctness |
| `dq-test-planner` | Skill | Produce a four-lens test suite (with consequences and owners) for one table |
| `lineage-blast-radius-scanner` | Subagent | Walk full lineage + access history; return ranked consumer impact (isolated context) |
| `data-quality-incident-tracer` | Subagent | Trace bad data upstream to the first wrong stage (isolated context) |

Skills run in your conversation (small input, output belongs where you're working); subagents isolate context-flooding reads and return only verdicts. Rationale: `DESIGN-NOTES.md`.

## The five-line version of the whole KB

1. Every pipeline reruns — make every write idempotent per window.
2. Schemas are APIs — expand/contract, never break in place; lineage before change.
3. Prefer loud failure to silent wrongness — gate, test meaning (not just shape), monitor freshness/volume/schema per table.
4. Grain first; late data is the normal case; backfills are scheduled incidents.
5. Cost is correctness — scan less, own your bill, and delete what nobody reads.
