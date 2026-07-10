# Core Principles — the judgment everything else assumes

**Applies to:** tool-agnostic · **Last verified:** 2026-07-06

This is the distillation of twenty years of pipelines. Every other doc in `data-engineer/` elaborates one of these; if you read nothing else before making a decision, read this. Each principle carries the incident that paid for it.

---

## 1. Every pipeline reruns. Design for the second run, not the first.

Retries, backfills, "just re-trigger it," an on-call engineer clearing a failed task at 3am — your code *will* execute more than once against the same input window. A pipeline that is only correct when run exactly once is not correct.

**The incident:** an hourly job `INSERT`ed into a fact table. A network blip failed the task *after* the insert committed; Airflow retried; the hour loaded twice. Revenue dashboards showed a 6% spike, the growth team celebrated, and a week of decisions was made on duplicated rows before anyone diffed the counts.

**The rule:** every write is either an overwrite of a deterministic partition (`INSERT OVERWRITE` / `DELETE WHERE ds = X` + insert), a `MERGE` on a true business key, or append with a dedup key downstream. `INSERT INTO` with no dedup story is a defect regardless of whether it has fired yet. Full treatment: `data-engineer/principles/pipeline-correctness.md` §1. Reviewing a PR for this is the `pipeline-idempotency-auditor` skill.

## 2. Schemas are promises. Break them the way you'd break an API.

A column type, a column's presence, an enum's value set, a table's grain — downstream consumers depend on all of it whether or not you documented it. Renaming a column is not a refactor; it is a breaking API change shipped without a version bump.

**The incident:** a producer team renamed `customer_id` → `account_id` in a "cleanup" PR. Three dashboards silently showed nulls for four days because the BI layer's `LEFT JOIN` didn't fail — it just stopped matching. Nobody was alerted because nothing *errored*.

**The rule:** additive changes only, by default; anything else goes expand → migrate consumers → contract, and gets an impact check first (`schema-change-impact-reviewer` skill; whole-warehouse sweep via the `lineage-blast-radius-scanner` agent). Details: `data-engineer/principles/schema-evolution.md`.

## 3. Silent wrongness is worse than loud failure. Bias every design toward loud.

A pipeline that crashes gets fixed in an hour. A pipeline that quietly loads garbage gets fixed after the quarterly board deck is wrong. When you have a choice — fail the task or load suspect data — fail the task, unless a human has explicitly decided that stale/partial data is acceptable for this consumer (and that decision is written down).

**Corollary:** `try/except: pass` around a parse step, `ON ERROR CONTINUE` in a load, a JOIN that silently drops unmatched rows — these convert loud failures into silent wrongness and are the single most common root cause in incidents I've traced. Detection playbook: `data-engineer/principles/data-quality.md` §4; tracing one after the fact: `data-quality-incident-tracer` agent.

## 4. Data quality tests assert *meaning*, not just shape.

`not_null` and `unique` catch mechanical breakage. They do not catch the feed that started sending every amount in cents instead of dollars (all values non-null, unique, and 100× wrong). Assert the things that make the data *usable*: row counts vs. a trailing window, sums against a control total, distribution of key categorical values, referential integrity to the dimensions you join.

**The rule of thumb:** for every table, one test that would catch *volume* wrongness, one for *value* wrongness, one for *relationship* wrongness, one for *freshness*. Planning these is the `dq-test-planner` skill; the reasoning is `data-engineer/principles/data-quality.md`.

## 5. Backfills are production incidents you schedule on purpose.

A backfill is a bulk rerun with all of the danger of principle #1 multiplied by history, plus cost. Treat every non-trivial backfill as a change that needs: an idempotent write path, a cost estimate *before* launch, a concurrency cap, and a validation query for after.

**The incident:** a "small" backfill of 18 months of an event table was launched with the DAG's normal parallelism. 540 concurrent tasks each spun warehouse compute; the month's bill doubled in a weekend, and because the job wasn't idempotent, the overlap with the live hourly runs double-loaded the seam days. Both failures were preventable with ten minutes of planning. Playbook: `data-engineer/principles/pipeline-correctness.md` §3 and `data-engineer/principles/orchestration.md` §4.

## 6. Late data is not an edge case. It is the case.

Mobile clients buffer offline. Vendors redeliver. Kafka consumers lag. If you compute "yesterday's revenue" the moment yesterday ends, you will systematically undercount, and the numbers will *change after people have read them* — which destroys trust faster than being wrong once. Decide explicitly: how late do you accept data, how do you reprocess when it arrives, and when do you declare a number final. Watermarks in streaming and lookback-window reprocessing in batch are the same decision wearing different clothes: `data-engineer/principles/pipeline-correctness.md` §4–5.

## 7. The grain of a table is its most important property. Write it down.

"One row per order" vs. "one row per order per day it was modified" is the difference between a correct sum and a 3× overcount. Half the bad numbers I've debugged were grain confusion — someone joined a one-per-customer table to a many-per-customer table and summed. Every table gets a stated grain in its docs and a `unique` test on the grain columns enforcing it. See `data-engineer/principles/data-modeling.md` §1.

## 8. Move compute to the data, and know what every query costs.

Warehouses bill for compute; the fastest query is the one that scans less. Partition/cluster on what consumers filter by, prune before you join, and never let a BI tool `SELECT *` a raw event table on a schedule. Cost is a correctness dimension: a pipeline that produces right answers at unsustainable cost gets shut off, which makes it wrong. `data-engineer/principles/cost-and-performance.md`.

## 9. Lineage before change. Always.

You cannot safely change what you cannot see the consumers of. Before altering any shared table, enumerate its downstream: views, models, dashboards, exports, ML features, the analyst's cron job nobody knows about. If the platform has no lineage tooling, the grep-based sweep in `data-engineer/principles/observability-and-lineage.md` §3 is the floor. This is exactly what the `lineage-blast-radius-scanner` agent automates.

## 10. Freshness, volume, and schema are the three vital signs. Monitor all three per table.

Most teams alert only on task failure. But the task succeeding tells you nothing about whether *data arrived*, whether *enough* arrived, or whether it still *looks right*. A feed that starts delivering zero rows "succeeds" all the way to the boardroom. Per-table freshness + row-volume + schema-drift monitors, alerting to the *owning* team, is the minimum observability bar: `data-engineer/principles/observability-and-lineage.md` §2.

## 11. Contracts beat heroics at team boundaries.

Inside one team, review culture can hold quality. Across teams, only contracts do: a schema registry with compatibility enforcement on streams, versioned schemas + CI checks on batch handoffs, and an agreed deprecation window. Every cross-team incident I've postmortemed reduces to "producer changed something consumer depended on, and no machine was positioned to say no." `data-engineer/principles/schema-evolution.md` §4.

## 12. Boring technology, exciting data.

Choose the tool your successors can hire for and debug at 3am. The pipeline's job is to be forgotten. Novelty budget is real: spend it on at most one component per platform, and never on the orchestrator or the warehouse — those are the components whose failure modes you most need the industry's collective scar tissue for.

---

## How to use this KB

- **Building something new** → `data-engineer/guides/build-a-pipeline-from-scratch.md`
- **Inheriting something old** → `data-engineer/guides/analyze-existing-platform.md`
- **Reviewing a change** → skills: `schema-change-impact-reviewer`, `pipeline-idempotency-auditor`
- **Investigating an incident** → agent: `data-quality-incident-tracer`; doc: `principles/data-quality.md` §4
- **Tool-specific question** → `data-engineer/stacks/<tool>.md`
- **Unfamiliar term** → `data-engineer/GLOSSARY.md`
