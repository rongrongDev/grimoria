# Pipeline Correctness — idempotency, delivery semantics, backfills, late data, watermarks

**Applies to:** tool-agnostic (examples use ANSI SQL, Airflow 2.x/3.x, Kafka 3.x/4.x, Spark 3.5/4.x semantics) · **Last verified:** 2026-07-06

A pipeline is *correct* when running it any number of times, in any order the orchestrator can actually produce (retries, backfills, catchup, overlapping schedules), converges to the same right answer. This doc covers the five mechanisms that make that true. Operational review of a diff against these rules is the `pipeline-idempotency-auditor` skill; this doc is the why behind its checks.

---

## 1. Idempotency: safe re-runs

**The property:** running task T for input window W twice produces the same state as running it once. Not "probably fine" — bit-identical table state (allowing for load timestamps).

### The three idempotent write patterns, in order of preference

1. **Partition overwrite** (best for time-windowed batch): the task owns a deterministic slice — usually a date/hour partition — and replaces it wholesale.
   ```sql
   -- warehouse: transactional delete+insert scoped to the window
   BEGIN;
   DELETE FROM fct_orders WHERE order_date = :ds;
   INSERT INTO fct_orders SELECT ... WHERE order_date = :ds;
   COMMIT;
   ```
   Spark: `INSERT OVERWRITE` with **dynamic partition overwrite mode** (`spark.sql.sources.partitionOverwriteMode=dynamic`) — static mode wipes *every* partition, which has destroyed whole tables (see `data-engineer/stacks/spark.md` §6). dbt: `incremental` with `insert_overwrite` strategy.
   **Requirement:** the window must be derived from the *logical* run date (Airflow `data_interval_start`), never `NOW()` — wall-clock windows make retries process a different slice than the original run.

2. **MERGE / upsert on a business key** (for CDC and mutable entities):
   ```sql
   MERGE INTO dim_customer t USING staged s ON t.customer_id = s.customer_id
   WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE SET ...
   WHEN NOT MATCHED THEN INSERT ...;
   ```
   The `updated_at` guard makes it safe under *out-of-order* redelivery, not just duplicate delivery. A MERGE without a recency guard silently regresses rows when an old record is redelivered — I've watched a re-consumed CDC topic roll a week of address changes backwards.

3. **Append + downstream dedup** (when the sink can't delete — e.g., raw landing zones, immutable logs): append freely but carry a stable dedup key (`event_id`, or hash of the natural key + payload), and make the *first* transformation layer deduplicate with `ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY loaded_at DESC) = 1`. The dedup must be *in the pipeline*, not in each consumer's query — consumers forget.

### Failure mode → detection → fix → prevention

| | |
|---|---|
| **Failure mode** | Plain `INSERT INTO` (or file append, or producer send) re-executed by retry/backfill → duplicated rows; or non-deterministic window (`WHERE ts > NOW() - INTERVAL '1 hour'`) → gaps and overlaps between runs |
| **Detection** | Grain uniqueness test fails; row count for a window ≈ 2× trailing average; sum-based metrics step up after an incident+retry; `GROUP BY key HAVING COUNT(*)>1` on the grain |
| **Fix** | Rebuild the affected windows with an idempotent write (dedup-then-overwrite); do **not** hand-delete duplicates without also fixing the write path, or it recurs on the next retry |
| **Prevention** | `unique` test on table grain in CI (dbt `unique`/GE `expect_compound_columns_to_be_unique`); PR review via `pipeline-idempotency-auditor`; ban `NOW()`-relative windows in task code (lint for it) |

**Idempotency extends beyond the SQL.** A task that also sends emails, calls a vendor API, or publishes to Kafka must gate those side effects (dedup table keyed on `(task, window)`, or idempotency keys on the API call). "The table load is idempotent but the retry re-sent 40k emails" is a real postmortem.

## 2. Exactly-once vs. at-least-once

Genuine exactly-once *delivery* across arbitrary systems doesn't exist; what you can build is **effectively-once processing**: at-least-once delivery + idempotent/transactional application of effects. Decide per pipeline which side pays:

- **At-least-once + idempotent sink** (default; simplest to reason about): consumers/tasks may see duplicates; the write pattern (§1) absorbs them. This should be your answer ~90% of the time.
- **Transactional exactly-once within one system's boundary**: Kafka transactions give exactly-once for *Kafka-in → process → Kafka-out* (`read_committed` consumers, transactional producer — see `data-engineer/stacks/kafka.md` §4); Flink checkpoints + two-phase-commit sinks extend it to supported sinks. The boundary is the fine print: the moment data leaves the transactional domain (to a warehouse, an API), you're back to at-least-once and need §1 again.
- **At-most-once** (fire-and-forget) is only acceptable for data you'd willingly drop: sampled telemetry, best-effort caches. Choosing it implicitly, by acking before processing, is a bug.

**Decision tree:**
- Effects land only in a warehouse/lake table → at-least-once + idempotent write. Done.
- Kafka-to-Kafka stream processing with strict no-dup requirements (billing, ledgers) → Kafka EOS or Flink 2PC, *and still* put a dedup key in events, because someday someone will replay the topic.
- Effects hit an external API → at-least-once + idempotency key on the API call; if the API has no idempotency support, add a sent-log table and check-before-send (accepting the small race) — and say so in the runbook.

| | |
|---|---|
| **Failure mode** | Consumer commits offsets *before* processing (silent loss on crash) or processes before commit without dedup (duplication on rebalance); or "exactly-once" assumed across a boundary it doesn't cover |
| **Detection** | Loss: gaps in event sequence numbers per key; reconciliation count source-vs-sink drifts down. Duplication: dedup-key collision rate > 0 downstream; sums drift up after consumer-group rebalances (check rebalance timestamps against metric steps) |
| **Fix** | Loss: replay from source offsets/backup for the gap window. Duplication: dedup rebuild of affected windows (§1 pattern 3) |
| **Prevention** | Reconciliation job comparing source and sink counts per window (`data-engineer/principles/data-quality.md` §2); consumer code review rule: *the offset commit is the last thing that happens*; chaos-test by forcing a rebalance in staging |

## 3. Backfill safety — cost and correctness

A backfill is a scheduled incident (core principle #5). Run this checklist *before* launching any backfill bigger than a day:

1. **Idempotency proof.** Will re-running a window converge (§1)? If the job is append-only, fix that first or the backfill itself creates duplicates where it overlaps existing data. The seam days — the boundary between backfilled and live-loaded ranges — are where duplicates concentrate; check them explicitly afterwards.
2. **Cost estimate, written down.** (windows × per-window scan/compute cost). One dry-run window, measured, multiplied out. If the number is embarrassing, redesign: coarser windows (monthly instead of daily where the logic allows), a dedicated one-off job that processes the whole range in one scan instead of N window-scans, or a cheaper warehouse tier. The N-windows-of-a-2-year-backfill pattern is how a "small" backfill doubles a bill.
3. **Concurrency cap.** Orchestrator-level limit (Airflow `max_active_runs` / pool; see `data-engineer/stacks/airflow.md` §5) so the backfill can't stampede the warehouse or starve production DAGs. Default cap: 2–4 concurrent windows, off-peak.
4. **Logic anachronism check.** Today's code applied to 2023's data: FX rates, tax rules, product hierarchies, enum values that didn't exist then. Decide explicitly whether the backfill should reproduce *what we knew then* or *what we know now* — both are legitimate; mixing them silently is not. This is the same as-of discipline as SCD2 joins (`data-engineer/principles/data-modeling.md` §2).
5. **Downstream propagation plan.** Rebuilding a fact table does not rebuild the aggregates, extracts, and ML features derived from it. Enumerate them (lineage — `lineage-blast-radius-scanner` if the graph is big) and schedule their rebuilds, or you've replaced wrong data with an inconsistency between layers.
6. **Validation query, prepared in advance.** Row counts and one business sum per backfilled window, compared to source or to the pre-backfill values with an explanation for every delta.

| | |
|---|---|
| **Failure mode** | Backfill duplicates seam windows; stampedes shared compute; silently applies present-day logic to historical data; leaves downstream aggregates stale |
| **Detection** | Seam-window row counts 2×; warehouse cost alert / queue depth during the backfill; historical metrics change without an announced restatement; aggregate ≠ re-summed fact |
| **Fix** | Stop; fix write idempotency; rebuild affected windows; then rebuild downstream in dependency order |
| **Prevention** | The 6-step checklist above as a PR-template for backfill requests; orchestrator pools; cost alert with a per-day budget; `pipeline-idempotency-auditor` on the job before it's ever backfilled |

## 4. Late-arriving data

Data is late whenever event time < the time you already closed the books for. Sources: offline clients (mobile can be *days* late), vendor redelivery, consumer lag, timezone bugs upstream. Strategy is a **policy decision** — write it per table:

- **Lookback reprocessing (batch default):** every run rebuilds the trailing N windows, not just the newest. N comes from measuring your actual lateness distribution: compute `P99(loaded_at − event_time)` and round up. Typical: 3 days for server events, 7+ for mobile. Idempotent overwrite (§1) makes this free of correctness risk; cost scales with N, which is the tradeoff.
- **Late partition + restatement:** load late rows into the window they *belong to* (event time), and publish a "data may restate for N days" freshness contract to consumers. Never load late rows into "today" to avoid restating — that's choosing convenient-but-wrong totals per day; it double-counts nothing but misattributes everything.
- **Sealed windows:** after N days, the window is final; later arrivals go to a `late_arrivals` quarantine table with a count monitor. Finance-facing marts usually need this — auditors hate numbers that move. The monitor matters: a quarantine that silently grows to 4% of volume means your N is wrong.

**Never** silently drop late data. Every option above is defensible; a filter `WHERE event_date = CURRENT_DATE` that discards stragglers is undetectable systematic undercounting.

| | |
|---|---|
| **Failure mode** | Metrics change after publication (trust damage) or late rows silently dropped (systematic undercount, worst for mobile/offline-heavy products) |
| **Detection** | Track restatement: snapshot key metrics at publish time, diff against current values. Track lateness: histogram of `loaded_at − event_time`. Quarantine volume monitor |
| **Fix** | Choose a policy above; reprocess the lookback window; communicate the restatement window to consumers explicitly |
| **Prevention** | Lateness histogram as a standing monitor (alert when P99 lateness grows — it means an upstream buffering change); policy stated in each table's docs; freshness SLA reflects the seal point, not the first load |

## 5. Watermarks in streaming

A watermark is the stream's formalization of §4: a moving claim that "all events with event time ≤ W have (probably) arrived," used to decide when a window can close and emit. Everything in the batch section maps over: watermark delay ↔ lookback window; allowed-lateness output ↔ restatement; dropped-past-watermark ↔ the quarantine decision.

Judgment that transfers across engines (Flink, Spark Structured Streaming, Kafka Streams — engine syntax in their stack docs):

- **Set the delay from the measured lateness distribution**, not vibes. Too short → real data dropped or windows emit then restate; too long → latency and unbounded state growth (every open window holds state until the watermark passes it).
- **Per-partition skew is the classic trap:** the watermark is the *minimum* across partitions/sources. One stalled partition (a quiet source, a paused producer) freezes the watermark, windows never close, state grows until the job OOMs. Configure idleness handling (e.g., Flink `withIdleness`) and monitor watermark lag as a first-class metric.
- **Late events past the watermark** need the same explicit policy as §4: drop with a counted metric (never drop uncounted), side-output to a late topic, or widen allowed lateness and let downstream absorb restatements.
- **Processing-time windows are not a fallback.** If you can't get usable event times, fix the producer; processing-time aggregation reshuffles history every time you have consumer lag, which is precisely when you're debugging and least able to trust it.

| | |
|---|---|
| **Failure mode** | Stalled partition freezes watermark → no output + state OOM; watermark too aggressive → silent drops; restatements downstream nobody planned for |
| **Detection** | Watermark-lag metric (current time − watermark) alarms; dropped-late-events counter > baseline; sink stops receiving closed windows while input continues |
| **Fix** | Idleness config for quiet sources; re-derive delay from lateness P99; replay the affected window range from the source topic |
| **Prevention** | Watermark lag + dropped-events counters on every streaming job's dashboard as launch criteria; load test with one artificially stalled partition before production |

---

**See also:** `data-engineer/principles/orchestration.md` (making the orchestrator produce only safe run patterns) · `data-engineer/principles/data-quality.md` (the tests that catch violations) · `pipeline-idempotency-auditor` skill (applying §1–3 to a diff) · `data-engineer/GLOSSARY.md` for terms.
