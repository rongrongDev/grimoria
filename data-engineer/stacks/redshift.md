# Redshift — extended tier: production patterns + common pitfalls

**Applies to:** Amazon Redshift (RA3 node types + Redshift Serverless, as of mid-2026) · **Last verified:** 2026-07-06 · Depth tier: **extended**. Core warehouse judgment: `data-engineer/stacks/snowflake.md` and `principles/cost-and-performance.md` — this doc covers where Redshift *differs*.

You mostly meet Redshift by inheritance: an AWS-native estate built 2016–2022. It's a solid engine whose sharp edges are exactly where Snowflake/BigQuery intuitions mislead — Redshift makes you do manually what the others do automatically, and punishes you physically for logical-design mistakes.

## The model difference that drives everything

Redshift is **cluster-resident, distribution-keyed MPP**: data physically lives on nodes according to per-table `DISTSTYLE`/`DISTKEY`, sorted by `SORTKEY`. Compute and storage are only partially separated (RA3 managed storage helps; Serverless abstracts it further). Consequences: capacity is more fixed (concurrency contention is a real daily constraint — WLM queues, not "spin another warehouse"), and **physical layout is a schema decision you make per table and revisit as workloads change** — nobody re-sorts or redistributes for you.

## Production patterns

- **Distribution:** `DISTKEY` on the biggest join key (co-located joins avoid network redistribution — the Redshift spelling of "don't shuffle", `stacks/spark.md` §2); `DISTSTYLE ALL` for small dimensions (the broadcast join, materialized); `EVEN`/`AUTO` otherwise. Check `SVL_QUERY_REPORT`/system views for `DS_BCAST_INNER`/`DS_DIST_*` steps — redistribution in hot queries means wrong keys.
- **Sort keys** = pruning (zone maps skip blocks by sort-key range): sort on the dominant filter (almost always event date) — the micro-partition-pruning equivalent, except *you* chose it and *you* maintain it.
- **Maintenance is yours:** `VACUUM` (reclaim deleted space + restore sort order — Redshift deletes are logical until vacuumed) and `ANALYZE` (stats for the planner) on a schedule sized to churn. Auto-vacuum/auto-analyze exist and help but trail heavy-churn reality; the classic inherited-cluster finding is months of un-vacuumed churn: 2× storage, degraded scans, a planner working from fiction.
- **Loading:** `COPY` from S3, parallel (file count a multiple of slice count, 100MB–1GB each); never row-wise `INSERT` loops (each is a commit — the classic "why is loading 100k rows taking an hour"). Idempotency is **not** built in (no COPY file-dedup like Snowflake's): load to staging + `MERGE` (native since 2023) or delete+insert per window (`principles/pipeline-correctness.md` §1), with a load-ledger table keyed on file/window.
- **WLM/queues:** separate queues (or Serverless workgroups) for ELT vs BI with concurrency + memory allocation — the workload-isolation judgment from `stacks/snowflake.md` §2 implemented as queue config. Turn on SQA (short query acceleration) so dashboards don't queue behind ELT.
- **Spectrum/external tables** for cold data in S3; increasingly, Iceberg on S3 queried from Redshift is the archival pattern (`stacks/lake-table-formats.md`), keeping the cluster for hot marts.

## Common pitfalls

| Pitfall | Symptom | Fix / prevention |
|---|---|---|
| Snowflake instincts about elasticity — "just size up for the backfill" | Backfill saturates the same cluster serving BI; everyone's morning is late | Schedule heavy loads off-peak; concurrency scaling for bursts; Serverless workgroup isolation; the backfill discipline of `principles/pipeline-correctness.md` §3 with *cluster capacity* as the scarce resource |
| Wrong/absent DISTKEY on the big join | Every join redistributes the fact table across nodes | Check dist steps in query reports; re-CREATE the table with correct keys (it's a rebuild — plan it like one) |
| Un-vacuumed high-churn tables | Storage 2×, scans slow, "Redshift is just slow" folklore | Scheduled vacuum/analyze keyed to churn; monitor `SVV_TABLE_INFO` unsorted% and deleted rows |
| Interleaved sort keys applied as a vitamin | Vacuum-reindex cost explodes; little query benefit | Compound sort keys by default; interleaved only for genuinely mixed selective filters, with the maintenance cost accepted in writing |
| Commit-heavy ELT (row inserts, many tiny transactions) | Commit queue serializes the whole cluster's writes | Batch: COPY + set-based transforms; one transaction per logical step |
| Leader-node overload (giant `UNLOAD ... PARALLEL OFF`, huge result sets to BI, catalog-heavy queries) | Whole-cluster slowness that per-query metrics don't explain | Keep results set-sized; parallel UNLOAD; catalog hygiene (drop the 40k dead temp tables) |

**Failure-mode framing** (per the KB convention): most Redshift incidents are **capacity contention** (detection: queue wait times in `STL_WLM_QUERY`; fix: isolation + scheduling; prevention: WLM design + off-peak ELT) or **layout decay** (detection: `SVV_TABLE_INFO` sort/skew/stats columns; fix: vacuum/rebuild; prevention: scheduled maintenance + quarterly layout review against actual query patterns from `STL_QUERY`).

---

**See also:** `stacks/snowflake.md` (the core-tier warehouse; shared judgment lives there) · `principles/cost-and-performance.md` §1 (Redshift's unit of waste: contended cluster-hours and layout decay) · `stacks/lake-table-formats.md` (the S3/Iceberg escape valve for cold data).
