# Snowflake — warehouse sizing, cost, clustering, loading, governance features

**Applies to:** Snowflake as of mid-2026 (continuous release; feature notes dated inline — verify anything load-bearing against current docs, Snowflake ships weekly) · **Last verified:** 2026-07-06

Snowflake is the core-tier warehouse in this KB: the compute/storage separation is clean, the cost model is legible enough to teach cost discipline on, and it's what dbt-centric platforms most commonly sit on. BigQuery deltas are flagged where the *judgment* differs, not just the syntax.

---

## 1. The mental model

- **Storage and compute are separate and separately billed.** Data lives once (columnar micro-partitions on object storage, ~$23/TB/mo compressed); any number of **virtual warehouses** (compute clusters) query it concurrently without contention. Warehouses are the cost lever, micro-partitions are the performance lever, and the two never trade off against each other directly.
- **Micro-partitions** (~16MB compressed, immutable) carry min/max metadata per column. Every query prunes micro-partitions by metadata before scanning — **pruning is the entire performance game**, the equivalent of partition pruning elsewhere, except Snowflake decides partition boundaries by *ingestion order*. Data loaded in event-time order is naturally well-pruned on event time; data loaded shuffled is naturally pruned on nothing.
- **Warehouses bill credits per second while running** (60s minimum on resume), regardless of utilization. An idle running warehouse costs the same as a busy one — utilization is the waste metric (`data-engineer/principles/cost-and-performance.md` §1). *(BigQuery on-demand inverts this: you pay per byte scanned, no idle concept; the discipline shifts from "suspend and right-size" to "scan less." Both converge on pruning.)*

## 2. Warehouse strategy — the decisions that set your bill

- **Separate warehouses per workload class** (`ELT_WH`, `BI_WH`, `DS_WH`, per-team where accountability needs it): isolation (a BI stampede can't slow the ELT SLA), *attribution* (the bill decomposes by team — the precondition for anyone owning cost), and independent sizing.
- **Sizing:** each size doubles credits/hour *and* roughly doubles parallel throughput. A size is right when: queries aren't spilling (§4) and the queue is short. **Bigger is often cheaper for batch**: an XL that finishes in 15 minutes costs the same as an M running an hour — and finishes 45 minutes sooner. Size up for spill/runtime, size down for idle.
- **Auto-suspend:** 60s for batch/ELT warehouses (they finish and leave), 5–10 min for BI warehouses (cache warmth matters for humans clicking around — suspending dumps the local disk cache, and the resume+cold-cache cost can exceed the idle you saved). Auto-resume always on.
- **Multi-cluster warehouses** solve *concurrency queueing* (BI at 9am), not slow queries — scale-out adds parallel clusters for more simultaneous queries; a single slow query needs scale-*up* or a better query. Economy scaling policy unless queue latency is genuinely user-facing.
- **Resource monitors on every warehouse from day one** — credit quota + suspend action. This is the difference between "the runaway recursive CTE cost us $400 and an alert fired" and "we found out at invoice time." Set monitors at ~120% of expected so they trip on anomalies, not on Tuesdays.

## 3. Loading patterns

- **Batch: `COPY INTO` from a stage.** Idempotency built in: COPY tracks loaded file metadata for 64 days and skips already-loaded files — *by file path+etag*, so re-running a COPY is safe, but re-uploading a modified file under the same name is a silent skip (`FORCE=TRUE` overrides; better: immutable, uniquely-named landing files — `data/orders/ds=2026-07-05/batch-<uuid>.parquet`). File sizing sweet spot 100–250MB compressed; thousands of tiny files pay per-file overhead (the small-file tax again — `stacks/spark.md` §5).
- **Continuous: Snowpipe** (auto-ingest on file arrival) for minutes-latency; **Snowpipe Streaming** (2023+; row-level, sub-second, cheaper than classic Snowpipe for high-frequency small events — the default for Kafka→Snowflake via the connector since ~2024). Same idempotency caveats: Snowpipe dedups by file; Streaming offers exactly-once per channel via offset tokens — wire the Kafka connector's tokens through rather than trusting defaults (`stacks/kafka.md` §6).
- **Always land → stage → merge:** raw arrivals into an append-only landing table (grain: one row per received record, with `loaded_at` and source metadata), then the dedup/MERGE into modeled tables as a separate, idempotent, re-runnable step (`data-engineer/principles/pipeline-correctness.md` §1 pattern 3). Loading directly into modeled tables couples ingestion failures to modeling state — un-debuggable.

## 4. Query performance — reading the profile, not guessing

Query Profile (UI or `GET_QUERY_OPERATOR_STATS`) tells you which of the four classic problems you have:

1. **Poor pruning** ("partitions scanned ≈ partitions total" on a table with a time filter): the filter column doesn't align with micro-partition layout, or the filter is function-wrapped (`principles/cost-and-performance.md` §2 item 1). Fix: rewrite predicate; if the access pattern is legitimate and hot, add a **clustering key** — but read §5's cost warning first.
2. **Spilling** (bytes spilled to local/remote storage > 0): the operation outgrew memory — remote spill especially is a 10–100× slowdown. Fix: reduce the working set (prune earlier, pre-aggregate) or size up one notch and re-measure.
3. **Exploding join** (output rows ≫ input rows on a join operator): grain mismatch / fan-out (`principles/data-modeling.md` §1). Fix the join, not the warehouse.
4. **Queueing** (time in queue ≫ execution): concurrency, not query — multi-cluster or workload separation (§2).

That's the priority list for `QUERY_HISTORY`-driven cost triage too: rank by `credits_used_cloud_services + execution_time × warehouse size`, profile the top ten, fix by the list above. *(BigQuery: same triage on `INFORMATION_SCHEMA.JOBS` ranked by `total_bytes_billed`.)*

## 5. Clustering, Search Optimization, and materialized views — the paid accelerators

All three are recurring background *spend* that must be justified by measured query patterns, not installed as vitamins:

- **Clustering keys**: background service continuously re-sorts micro-partitions toward your key. Worth it on multi-TB tables with a dominant selective filter that ingestion order doesn't already serve. **Cost trap:** clustering a table with high churn (updates/deletes everywhere, or a key uncorrelated with arrival order) makes the service re-cluster *forever* — I've seen auto-clustering quietly become a five-figure monthly line item on a table whose queries it barely helped. Check `AUTOMATIC_CLUSTERING_HISTORY` credits vs. the query time saved, quarterly. Often the cheaper fix is *sorting at load time* (ORDER BY in the transform that writes the table).
- **Search Optimization** (point-lookup index-ish service): for needle-in-haystack equality lookups (support tooling, id lookups) on big tables. Same discipline: it bills storage + maintenance; justify per table+column.
- **Materialized views**: single-table, restricted-SQL, auto-maintained; refresh credits are invisible in your orchestrator (`principles/cost-and-performance.md` §4). Prefer dbt-managed incremental models where possible for visibility; MVs for the narrow always-fresh single-table aggregation case. **Dynamic Tables** (GA 2024) are the more general declarative option — target-lag-driven incremental refresh with real SQL; good fit for near-real-time marts, same "refresh spend is on the bill, watch it" caveat.

## 6. The governance features you should actually use

Mechanics for `data-engineer/principles/security-and-governance.md` — Snowflake has unusually complete implementations:

- **RBAC**: functional roles → access roles → objects; grants to roles only; `future grants` so new tables inherit. The trap: role explosion + direct-to-user grants creeping in during incidents — quarterly `SHOW GRANTS` diff against the designed model.
- **Object tags + tag-based masking policies**: tag columns `pii_type = 'email'` at ingestion; masking policy attached to the *tag* masks every current and future column so tagged (`security-and-governance.md` §2's "inherit on arrival"). Test with a CI probe role.
- **Row access policies** for tenant/region row filtering; **secure views/UDFs** when sharing (plain views can leak via optimizer push-down — use `SECURE` for anything crossing a trust boundary, accepting the optimization loss).
- **`ACCOUNT_USAGE.ACCESS_HISTORY`** (column-level read/write lineage from actual query execution): the ground-truth lineage source (`principles/observability-and-lineage.md` §3) and the evidence gate for expand/contract drops. Latency up to ~3h; joins to `QUERY_HISTORY` for who/when/what-warehouse.
- **Time Travel + Fail-safe**: 1–90 days of point-in-time recovery (`UNDROP`, `AT (TIMESTAMP => ...)`) — set retention per table tier; it's also *storage spend* on churny tables and **it's in scope for deletion compliance** (deleted PII persists through Time Travel + 7-day Fail-safe; size retention windows to your deletion SLA — `security-and-governance.md` §3).
- **Zero-copy cloning**: instant dev/test environments (`CREATE DATABASE dev CLONE prod`) — the enabler for CI-per-PR schemas (`stacks/dbt.md` §7). Remember clones carry the PII of their source: masked/synthetic policy still applies to dev roles (clones inherit masking policies, but dev role grants are where the leak happens).

## 7. Operational failure modes

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| **Idle-warehouse burn** — 24/7 running warehouses at single-digit utilization | `WAREHOUSE_METERING_HISTORY` credits vs `QUERY_HISTORY` activity per warehouse | Auto-suspend everywhere; consolidate ghost-town warehouses | Resource monitors + weekly utilization report per warehouse owner |
| **Runaway query / cartesian join burns a monitor's month in a day** | Resource monitor alert; single query dominating `QUERY_HISTORY` credits | Kill; fix the fan-out; post-incident add `STATEMENT_TIMEOUT_IN_SECONDS` on the warehouse | Statement timeouts on every warehouse (BI especially); monitors at 120% expected |
| **Silent skip on COPY re-load** — modified file, same name, 0 rows loaded, job green | Load-audit row counts per file vs manifest (control totals — `principles/data-quality.md` §2) | Re-load with `FORCE` after verifying no dup risk | Immutable uniquely-named landing files as a hard convention |
| **Auto-clustering money pit** | `AUTOMATIC_CLUSTERING_HISTORY` credit trend per table | Drop/suspend the key; sort at load instead | Clustering keys require a written query-pattern justification + quarterly re-check |
| **Spill-driven slow ELT** — jobs 10× slower than baseline, warehouse "too small" panic-upsized | Query Profile remote-spill bytes | Pre-aggregate/prune the offending step; then re-size deliberately | Spill bytes in the run-metadata log per job (`principles/observability-and-lineage.md` §5) |
| **Time-Travel storage surprise on churny tables** | `TABLE_STORAGE_METRICS` time-travel bytes | Lower retention on high-churn staging tables (1 day) | Retention tiering standard: staging 1d, marts 7–30d, per compliance needs |

---

**See also:** `data-engineer/principles/cost-and-performance.md` (the cost judgment §2/§5 implement) · `principles/security-and-governance.md` (what §6 enforces) · `stacks/dbt.md` (the transform layer on top) · `stacks/redshift.md` (when you inherit the other warehouse) · `data-engineer/guides/build-a-pipeline-from-scratch.md` (Snowflake as the worked example's warehouse).
