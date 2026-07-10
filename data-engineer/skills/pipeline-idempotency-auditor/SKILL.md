---
name: pipeline-idempotency-auditor
description: Audit a pipeline PR, DAG, dbt model, or job definition for safe-rerun and backfill correctness — non-idempotent writes, wall-clock windowing, exact-watermark late-data drops, side effects that duplicate on retry, and catchup/backfill hazards. Use when reviewing any PR that adds/changes a pipeline task, incremental model, or consumer; before configuring retries or launching a backfill on an existing job; or per-pipeline inside a platform audit (guides/analyze-existing-platform.md Phase 2). Do NOT use for schema-shape changes (use schema-change-impact-reviewer), for tracing an incident that already duplicated/lost data (dispatch the data-quality-incident-tracer agent — this skill reviews code, that one reads runs), or for OLTP migration DDL safety (migration-safety-reviewer).
---

# Pipeline Idempotency Auditor

You are reviewing pipeline code as the engineer who has watched a retried hourly load double a revenue dashboard and a "small" backfill duplicate every seam day. The core question for every write and side effect in the diff: **what happens when this executes twice for the same window?** — because it will (retries, backfills, catchup, 3am re-triggers). The judgment is `data-engineer/principles/pipeline-correctness.md` §1–3 and `principles/orchestration.md` §1; cite sections in findings.

## Inputs you need

1. The diff or files: DAG/flow code, dbt models + configs, consumer code, SQL jobs. Review what's *in* the change, plus the write path of anything it triggers.
2. Context worth 30 seconds of asking/inferring: is the table time-windowed or entity-keyed? Is the job retried/backfilled today, or about to be? If unknown, **review as if retries and backfills are enabled** — they will be eventually, and say you assumed so.

## The checklist

Walk every write, window, and side effect. Checks 1–3 are where the money is.

**Check 1 — Write idempotency (the core):** classify every write against the three sanctioned patterns (`pipeline-correctness.md` §1):
- Partition overwrite (delete+insert / `INSERT OVERWRITE` / `insert_overwrite` strategy) scoped to the logical window → OK; verify the scope column matches the window column *exactly* (a delete on `loaded_date` with an insert filtered on `order_date` re-runs dirty).
- MERGE/upsert → verify the key is **truly unique at source grain** (non-unique merge keys silently collapse rows nondeterministically — `data-engineer/stacks/dbt.md` §8 row 1) and there's a recency guard for out-of-order redelivery.
- Append → require the dedup story: stable dedup key + where downstream dedup happens. "Append, no dedup key anywhere" = **BLOCKER**, whether or not a retry has fired yet.
- Spark `INSERT OVERWRITE`: verify `partitionOverwriteMode=dynamic` — static mode truncates the whole table (`data-engineer/stacks/spark.md` §6) = **BLOCKER**.

**Check 2 — Window determinism:** any `NOW()`, `CURRENT_DATE`, `datetime.now()`, `GETDATE()` deriving a processing window = **BLOCKER**; windows come from the orchestrator's logical interval (`data_interval_start`, dbt `event_time` batches, an explicit window parameter). A retry must process the *same* slice as the original run. (Wall-clock in *logging* is fine — flag only window/filter derivation.)

**Check 3 — Late-data handling:** incremental predicates of the form `> (SELECT MAX(ts) ...)` or `>= yesterday` with no lookback drop late arrivals permanently (`pipeline-correctness.md` §4) = **HIGH** (BLOCKER on money/event tables). Require a lookback ≥ measured lateness, or dbt microbatch with `lookback`, or an explicit sealed-window + quarantine policy stated in the model docs.

**Check 4 — Side effects on retry:** emails, API calls, Kafka publishes, file deliveries, notifications inside a retryable task — each needs an idempotency key, a sent-ledger gate, or relocation out of the retried path = **HIGH** otherwise. The table load being idempotent does not make the task idempotent.

**Check 5 — Orchestration config coherence** (`principles/orchestration.md` §1–4):
- Retries configured on tasks failing checks 1–4 = the checks' severity escalates (retries *weaponize* non-idempotency).
- `catchup`/backfill posture vs write pattern mismatch (catchup ON + append-only; catchup OFF + no lookback on a gap-sensitive table) = **HIGH**.
- Backfill-relevant: concurrency caps/pools present for anything that fans out over history? Cost estimate for wide backfills mentioned? (`pipeline-correctness.md` §3 — WARN if absent on a job that will obviously be backfilled.)
- Timeouts + alerting on final-failure-only; `depends_on_past` used deliberately, not residually.

**Check 6 — Rerun blast radius:** does re-running this window leave downstream consistent (aggregates rebuilt, ready-signals re-emitted or idempotent themselves)? A perfectly idempotent fact rebuild that never re-triggers the summary table produces layer inconsistency = **WARN**, HIGH if the summary feeds tier-1 consumers.

## Output format

```
## Idempotency & Rerun-Safety Audit: <pipeline/files>
Assumptions: <retry/backfill posture assumed; window column identified>

### Verdict: SAFE TO RERUN / SAFE WITH CHANGES / UNSAFE (do not enable retries/backfill)

| # | Location (file:line / model) | Finding | Check | Severity | Fix (specific pattern to apply) |
|---|------------------------------|---------|-------|----------|--------------------------------|

### The rerun test (always include)
<the concrete drill: run window W twice, diff `SELECT <window>, COUNT(*), SUM(<measure>) GROUP BY 1` —
per guides/build-a-pipeline-from-scratch.md Phase 5. If the team can run it now, the verdict upgrades from reviewed to proven.>
```

Severity: **BLOCKER** = a single retry/backfill corrupts data (checks 1–2 failures, static overwrite mode); **HIGH** = systematic loss/duplication under normal operations (late-data drops, unguarded side effects, catchup mismatch); **WARN** = missing guardrails (pools, cost estimates, downstream propagation); **NOTE** = hygiene.

**Evidence rule:** quote the offending line(s) for every finding. If a check passes because of something you verified (a unique constraint, a dedup model downstream, dynamic overwrite set in the session config), name where — verified-safe is a different claim than didn't-look, and the report must distinguish them.
