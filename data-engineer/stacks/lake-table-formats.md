# Lake Table Formats (Iceberg / Delta Lake / Hudi) — extended tier: production patterns + common pitfalls

**Applies to:** Apache Iceberg 1.5+ (format spec v2 standard, v3 features landing 2025–26), Delta Lake 3.x/4.x (incl. UniForm), Apache Hudi 0.15/1.x, as of mid-2026 · **Last verified:** 2026-07-06 · Depth tier: **extended**.

Table formats turn a directory of Parquet files into a *table*: atomic commits, snapshot isolation, schema evolution, time travel, and safe concurrent writers. They fix, at the storage layer, three chronic lake failure modes this KB fights elsewhere — non-atomic directory writes (`stacks/spark.md` §6), by-name/by-position schema fragility, and DIY partition hygiene. If you are building on object storage in 2026 and not using one, you are re-implementing one badly.

## Choosing

- **Iceberg — the default.** The industry's convergence point: first-class support across Spark/Flink/Trino/Snowflake/BigQuery/Redshift/DuckDB, catalog standardization (REST catalog), hidden partitioning, mature spec. Choose it absent a strong reason otherwise.
- **Delta Lake — when you're Databricks-centered.** Deepest integration there (and fine OSS support elsewhere; UniForm exposes Delta tables as Iceberg-readable to hedge). Choose it because your platform is Databricks, not because of a feature checklist — the formats have substantially converged.
- **Hudi — when the workload is genuinely CDC-upsert-heavy at high frequency** (its merge-on-read machinery and record-level index were built for exactly that) *and* you have the ops appetite; it's the most knobs-per-feature of the three. Otherwise its niche has narrowed as Iceberg/Delta absorbed upsert patterns.
- **Interop reality check:** "any engine can read it" is true at the *format* level; in production it's **catalog** level — engines must agree on one catalog (REST/Glue/Unity...). Pick the catalog as deliberately as the format; migrating catalogs later is the painful part.

## Production patterns

- **Copy-on-write vs merge-on-read** (the one tuning decision that matters most): CoW rewrites files on update — slower writes, fastest reads; MoR writes deltas/deletes merged at read — faster writes, slower reads until compaction. Batch-analytics tables: CoW. High-frequency CDC/streaming upserts: MoR **with compaction actually scheduled** (below). Iceberg v2 position/equality deletes = MoR semantics; equality deletes are the read-amplification trap — monitor delete-file counts.
- **Hidden partitioning (Iceberg):** partition by *transform* (`days(event_ts)`, `bucket(16, user_id)`) — queries filter on the raw column and prune correctly; no `WHERE ds = ...` convention to teach, and **partition evolution** (changing the scheme for future data without rewriting history) replaces the "re-lay-out the whole table" migration. This deletes the function-wrapped-filter pruning bug class (`principles/cost-and-performance.md` §2) at the design level.
- **Schema evolution is by column ID, not name/position** — renames are finally *not* data-destroying at the storage layer. The *contract* discipline still applies unchanged: downstream SQL, BI, and consumers break on renames exactly as before (`principles/schema-evolution.md` §1 — the format protects the files, not the consumers).
- **Maintenance is a scheduled production job, not hygiene-when-remembered.** The four tasks: **compaction** (rewrite small files — streaming ingestion makes this mandatory, `stacks/spark.md` §5), **snapshot expiration** (old snapshots pin every file they reference — unexpired snapshots mean storage grows forever *and* deleted data isn't deleted), **orphan-file cleanup** (failed-write debris), **manifest rewrite** (metadata itself fragments under frequent commits). Schedule all four per table tier, monitor their success like any pipeline.
- **Streaming ingestion:** commit interval ≥ 1 minute (each commit = a snapshot + files; per-second commits melt metadata), compaction downstream, and the exactly-once story comes from the engine's transactional commit (Flink/Kafka Connect Iceberg sinks — `stacks/kafka.md` §6).
- **Time travel is an ops tool, not an archive:** snapshot-diff debugging ("what did this table say yesterday") and incident rollback (`RESTORE`/rollback to snapshot — the fastest undo for a bad load) are legitimate; retaining months of snapshots as a compliance archive conflicts with deletion obligations (below) and storage sanity. Retention: days-to-weeks, tiered by table.

## Common pitfalls

| Pitfall | Symptom | Fix / prevention |
|---|---|---|
| No maintenance jobs | Reads slow over months (small files + delete files + manifest sprawl); storage grows monotonically | The four maintenance tasks scheduled from table creation; file-count/snapshot-count monitors per table |
| MoR chosen, compaction forgotten | Write metrics great, read latency decays weekly; "the lake is slow" folklore | Compaction SLA paired to the MoR decision — they are one decision, not two |
| Concurrent writers fighting (two jobs, or agent-driven parallel backfills, committing to one table) | Commit conflicts/retries; with partition-overlapping writes, throughput collapses | Optimistic concurrency handles disjoint partitions well — serialize same-partition writers at the orchestrator (`principles/orchestration.md` §5; `principles/multi-agent-orchestration.md` §4's ledger) |
| "Deleted" data alive in old snapshots | GDPR deletion "done" while every pre-deletion snapshot still serves the rows | Snapshot expiration window ≤ deletion SLA; verification probe queries old snapshots too (`principles/security-and-governance.md` §3) |
| Catalog as afterthought (per-engine catalogs, hive-metastore leftovers, hand-registered paths) | Engines see different table states; "works in Spark, stale in Trino" | One catalog of record (REST-based), all engines through it; catalog choice in the design doc |
| Treating the format as a database (row-level OLTP updates, per-record commits) | Metadata explosion; costs dwarf an actual database | Batch mutations into windowed MERGEs (`principles/pipeline-correctness.md` §1); OLTP workloads go to a database |

**Failure-mode framing:** table-format incidents are overwhelmingly **metadata decay** (small files / snapshots / manifests / delete-files accumulating; detection: per-table file & snapshot metrics trending; fix: run the maintenance backlog; prevention: maintenance-as-scheduled-pipeline) — the format's honesty is that it turns silent directory rot into *measurable* metadata you can alert on. Wire those metrics into the vital-signs layer (`principles/observability-and-lineage.md` §2).

---

**See also:** `stacks/spark.md` §5–6 (the write/compaction mechanics) · `stacks/kafka.md` §6 (streaming landing) · `principles/security-and-governance.md` §3 (snapshots vs deletion) · `principles/cost-and-performance.md` §3 (layout judgment the formats implement).
