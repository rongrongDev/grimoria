# Cost & Performance — compute cost drivers, query optimization, storage layout, materialize vs compute-on-read

**Applies to:** warehouse-agnostic judgment; billing specifics: Snowflake (credits, 2026 pricing model), BigQuery (on-demand/slots), Spark clusters; deep dives in `data-engineer/stacks/snowflake.md` §5, `stacks/spark.md`, `stacks/redshift.md` · **Last verified:** 2026-07-06

Cost is a correctness dimension: a pipeline that produces right answers at a cost nobody will keep paying gets shut off, which makes it wrong (core principle #8). The good news: in warehouses, cost and performance are the *same* optimization — both reduce to "scan and shuffle less data with less idle compute."

---

## 1. Know your billing model's *unit of waste*

Each platform wastes money differently; optimize the unit that bills:

- **Snowflake:** credits × warehouse-seconds, per-second billing with a 60s minimum per resume. Unit of waste: **idle/oversized warehouses and anti-pruning queries**. A warehouse running 24/7 at 4% utilization costs the same as one at 96%. Auto-suspend (60–120s for interactive, immediate-ish for batch), right-size per workload, separate warehouses per workload class so BI spikes don't force-size your ELT.
- **BigQuery on-demand:** $ per TB *scanned*. Unit of waste: **bytes scanned** — `SELECT *` over an unpartitioned event table is the entire failure mode. Partition + cluster + column selection are directly money. Flat-rate/slots (editions) changes the unit to slot-hours: now it's about sustained utilization and workload isolation, closer to Snowflake logic.
- **Spark on cloud infra:** instance-hours. Unit of waste: **stragglers and idle executors** — one skewed task holding 400 executors at 2% utilization for an hour bills 400 instance-hours (`data-engineer/stacks/spark.md` §3). Autoscaling + skew handling are the levers.

**The recurring pattern across all three:** the bill is dominated by a handful of workloads. Query the billing/usage telemetry (Snowflake `ACCOUNT_USAGE`, BQ `INFORMATION_SCHEMA.JOBS`, cluster metrics), rank by cost, fix the top five. Every cost audit I've run: >60% of spend in <10 workloads, at least two of which nobody could name an owner for — and one of which was a dashboard auto-refreshing a full-scan query every 10 minutes for a team that had been disbanded.

## 2. Query optimization — the 80% that isn't engine-specific

In priority order (each item beats everything below it):

1. **Scan less: prune partitions.** Filters must hit the partition/cluster key *directly* — wrapping it in a function (`DATE(ts) = '2026-07-01'`, `CAST`, arithmetic) defeats pruning on most engines; rewrite as range predicates on the raw column (`ts >= '2026-07-01' AND ts < '2026-07-02'`). Verify with the engine's scan stats (partitions pruned / bytes scanned), don't assume.
2. **Scan less: prune columns.** Columnar formats make `SELECT *` a self-inflicted wound, and `SELECT *` in a *pipeline model* is also a schema-evolution landmine (new upstream column silently changes your output). Name the columns.
3. **Reduce before you join or window.** Filter and pre-aggregate the big side first; join at the coarsest grain that answers the question. The classic bill-killer: joining two raw event tables then aggregating, when aggregating both sides first shrinks the join a thousandfold. Same lesson in Spark shuffle terms in `stacks/spark.md` §2.
4. **Fix the fan-out before tuning anything.** A join multiplying rows (grain mismatch — `data-engineer/principles/data-modeling.md` §1) then deduping with `DISTINCT` at the end can inflate intermediate results by orders of magnitude. `DISTINCT`/`GROUP BY ALL` at the top of a slow query is usually a confession.
5. **Window/dedup patterns:** `QUALIFY ROW_NUMBER() = 1` beats self-joins for latest-per-key; make sure the partition key of the window matches the clustering so the engine doesn't re-sort the world.
6. Only *then* engine-specific tuning (clustering keys, materialized views, search optimization, distribution styles — the stack docs).

| | |
|---|---|
| **Failure mode** | Query cost/time grows superlinearly with data; dashboards time out; monthly bill spikes and everyone learns from finance, not from monitoring |
| **Detection** | Bytes-scanned per query vs table size (full scans on partitioned tables = pruning failure); billing telemetry ranked weekly; cost-per-run trend per pipeline in run metadata (`data-engineer/principles/observability-and-lineage.md` §5) |
| **Fix** | Top-N triage from billing data; apply the priority list above to each offender |
| **Prevention** | Cost budget alerts *per warehouse/project*, not one account-wide number (a 3× spike in a small team's spend disappears inside account-level noise); CI check or review rule against `SELECT *` and function-wrapped partition filters in pipeline SQL |

## 3. Storage layout — partitioning, clustering, file formats

Layout decisions are consumer-workload decisions: **lay data out by how it's read, not how it arrives.**

- **Partition/cluster by the dominant filter dimension.** For event/fact data that's nearly always event-date + one or two of (tenant, region, platform). Loading convenience (partition by load batch) optimizes the write you do once over the reads you do forever.
- **Cardinality bounds:** date × high-cardinality-ID partitioning creates millions of tiny partitions — metadata bloat and the small-file problem (below). Partition coarse (date), cluster/sort fine (ID). Engines differ in mechanism (Snowflake micro-partitions + clustering keys, BQ partitions + clustering, Hive-style dirs + Iceberg hidden partitioning) but the coarse/fine split is universal.
- **Small files:** streaming and over-parallel writers produce thousands of KB-scale files; every reader then pays per-file open/list overhead that can exceed the data-read time by 10×. Compaction is not optional hygiene — it's a scheduled job with a target file size (128MB–1GB depending on engine; `data-engineer/stacks/spark.md` §5, `stacks/lake-table-formats.md` §4).
- **Formats:** columnar + compressed (Parquet, or the engine's native) for anything analytical; row formats (JSON/CSV/Avro files) belong only in the landing zone, converted on first touch. Keeping a year of raw JSON "temporarily" queryable directly is a recurring five-figure line item — I've deleted petabytes of "temporary."
- **Retention as layout:** raw immutable history in cheap object storage with lifecycle tiers; hot serving tables trimmed to what consumers query (with the trim driven by measured query time-ranges from access history, not guesses). Also a compliance surface: `data-engineer/principles/security-and-governance.md` §3.

## 4. Materialize vs compute-on-read

The decision tree (same logic drives dbt `table` vs `view` vs `incremental`, warehouse MVs, and pre-aggregated marts):

- **Read often, computed expensively, tolerates staleness → materialize** (scheduled table / incremental model). The break-even is arithmetic: cost-to-build × build frequency vs cost-per-read × read frequency. A dashboard hit 500×/day on a 10-minute aggregation is not a judgment call.
- **Read rarely, cheap, or must be second-fresh → compute on read** (view). Views also stay correct-by-construction under upstream restatements — no staleness bug is possible.
- **Incremental materialization** (only rebuild changed windows) once full rebuilds are the cost problem: strictly append-only sources make it trivial; late/mutable data forces a lookback rebuild window matched to your measured lateness (`data-engineer/principles/pipeline-correctness.md` §4) — an incremental model without a lookback is an undercount machine.
- **Engine-managed materialized views**: powerful and opaque — refresh costs land on the bill without appearing in your orchestrator, and each engine restricts what's incrementally maintainable. Use for narrow high-value aggregations; keep the *logic* in version control regardless.
- **The trap: materialization sprawl.** Every materialized copy is a freshness obligation, a lineage node, and a bill. Quarterly, use access history to find materializations nobody read in 90 days and delete them (expand/contract applies — check readers first, `data-engineer/principles/schema-evolution.md` §3). Unread materializations are the dark matter of warehouse bills.

## 5. Cost observability

Same substrate as run metadata (`observability-and-lineage.md` §5), money lens: **cost per pipeline per run, trended, with an owner.** Tag/attribute compute to teams (warehouse-per-team, query tags, project labels) — untagged shared compute means the bill is nobody's problem, and nobody's problem grows 15% per quarter forever. Alert on trend breaks (this pipeline's cost-per-run doubled month-over-month), not just absolute ceilings — the doubling is a regression you can still trace while the diff is fresh (a new join, a lost pruning filter, a backfill left running). And put the *unit* economics in front of engineers: a PR comment saying "this model's run cost: $41/day → $96/day" changes behavior in a way no monthly finance report ever has.

| | |
|---|---|
| **Failure mode** | Spend grows quietly (sprawl, dead materializations, drift into full scans); discovered at invoice time, triaged in panic, "optimized" by breaking something consumers needed |
| **Detection** | Per-workload cost trend alerts; quarterly unread-object sweep; bytes-scanned regressions per named query |
| **Fix** | Rank, owner-ize, fix top offenders by the §2 priority list; delete unread objects via expand/contract |
| **Prevention** | Cost-per-run in run metadata from day one; team-level attribution; backfill cost estimates required before launch (`data-engineer/principles/pipeline-correctness.md` §3 step 2) |

---

**See also:** `data-engineer/stacks/snowflake.md` §5 (credits, clustering, warehouse sizing) · `stacks/spark.md` (shuffle/skew/small files — the compute-side twin of this doc) · `stacks/redshift.md` (distribution/sort keys) · `data-engineer/principles/orchestration.md` §4 (backfill storms, the acute cost incident).
