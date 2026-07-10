# Build a Pipeline From Scratch — zero to architecturally sound

**Applies to:** Airflow 2.9+/3.x, dbt Core 1.9+, Snowflake, S3-compatible object storage · **Last verified:** 2026-07-06

This guide takes you from nothing to a minimal but *sound* daily pipeline: idempotent ingestion → schema-validated, tested transformation → orchestration with retries and gates. It is deliberately boring (core principle #12) and deliberately complete — every step includes the part teams skip and regret. A reader (or an agent) following start-to-finish, substituting their own source, ends with a defensible production pipeline.

**The worked example:** a vendor drops order data as files (API-pulled or delivered) daily; the business needs an `fct_orders` mart, fresh by 08:00, trustworthy enough for finance.

---

## Phase 0 — Decisions before code (30 minutes that save quarters)

Write these six answers at the top of the repo README. Every later step consumes them:

1. **Grain of the target:** one row per *order* (not order-line — confirm with the consumer; this is core principle #7 and you cannot proceed without it).
2. **Logical window:** daily, keyed by `order_date` (event time, UTC). All code windows on the orchestrator's logical date — never wall clock (`principles/orchestration.md` §1).
3. **Lateness policy:** vendor redelivers corrections up to 3 days late → every run reprocesses a **4-day lookback**; numbers final at T+4, and that's what the freshness SLA says (`principles/pipeline-correctness.md` §4).
4. **Idempotent write pattern:** delete+insert per `order_date` window in the warehouse (`principles/pipeline-correctness.md` §1, pattern 1).
5. **SLA + tiering:** mart complete by 08:00, tier-1 (money-bearing → full vital signs + paging; `principles/observability-and-lineage.md` §1).
6. **Sensitivity classification:** orders carry customer identifiers → PII tags at ingestion, masking policy on landing + staging, minimization check ("do we even need the email column?" — `principles/security-and-governance.md` §1).

## Phase 1 — Landing zone: files → immutable raw

Layout (S3 or equivalent):

```
s3://company-data-landing/orders/ds=2026-07-05/batch-<uuid>.parquet
```

Rules doing the load-bearing work:
- **Immutable, uniquely-named files** under a date-partitioned prefix. Never overwrite a landed file — a re-pull writes a new `batch-<uuid>`. This makes every downstream load idempotent-by-dedup and makes "what did we receive?" answerable forever. (It also dodges Snowflake COPY's modified-file silent skip — `stacks/snowflake.md` §3.)
- **The extractor is windowed and re-runnable:** pull `orders WHERE order_date = {window}` from the vendor API; a retry re-pulls the *same* window and lands a new file; dedup happens at load. If the vendor offers a manifest/control totals (row count, sum of amounts), land it alongside — it becomes your best test (`principles/data-quality.md` §2).
- Convert to Parquet at landing if the source is JSON/CSV; raw row formats don't get queried directly (`principles/cost-and-performance.md` §3).

## Phase 2 — Warehouse load: raw → landing table (idempotent)

```sql
CREATE TABLE raw.orders_landing (
  order_id      TEXT,           -- as-delivered; typed in staging
  order_date    DATE,
  customer_id   TEXT,
  amount_cents  NUMBER,         -- unit in the NAME (schema-evolution.md §1)
  status        TEXT,
  _source_file  TEXT NOT NULL,
  _loaded_at    TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

COPY INTO raw.orders_landing (order_id, ..., _source_file)
FROM @landing_stage/orders/ds={{ ds }}/
FILE_FORMAT = (TYPE = PARQUET) MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;
```

- Append-only landing + `_source_file`/`_loaded_at` lineage columns: one row per *received* record — duplicates from re-pulls are *expected here* and resolved in staging (land → stage → merge, `stacks/snowflake.md` §3).
- **Schema validation at the boundary:** the COPY names its columns; a vendor adding/renaming columns fails or is ignored *here*, loudly, not silently downstream. Pair with the load-audit row (below).
- **Load audit:** after each COPY, insert (window, file, rows_loaded, loaded_at) into `audit.load_log`, and compare to the vendor manifest when present. This table is the first thing the `data-quality-incident-tracer` agent asks for.

## Phase 3 — Transformation: dbt project with layers, tests, contracts

Project shape (rationale: `stacks/dbt.md` §1):

```
models/
├── staging/vendor_orders/
│   ├── _vendor_orders__sources.yml     # source + freshness config
│   └── stg_vendor_orders.sql           # rename, type, dedup — nothing else
└── marts/finance/
    ├── fct_orders.sql
    └── fct_orders.yml                  # grain, tests, contract
```

**Staging — dedup lives here:**

```sql
-- stg_vendor_orders.sql
with ranked as (
  select
    order_id, order_date, customer_id,
    amount_cents::number(18,0)          as amount_cents,
    lower(status)                        as status,
    row_number() over (
      partition by order_id
      order by _loaded_at desc, _source_file desc   -- deterministic winner
    ) as _rn
  from {{ source('vendor_orders', 'orders_landing') }}
)
select * exclude (_rn) from ranked where _rn = 1
```

**Source freshness** in `_vendor_orders__sources.yml` (`loaded_at_field: _loaded_at`, `error_after: 26 hours`) — wired as the first orchestration gate so staleness stops the run instead of propagating (`stacks/dbt.md` §6).

**Mart — incremental with the lookback from Phase 0:**

```sql
-- fct_orders.sql
{{ config(
    materialized='incremental',
    incremental_strategy='delete+insert',
    unique_key='order_date',
    on_schema_change='fail',
) }}
select order_date, order_id, customer_id, amount_cents, status
from {{ ref('stg_vendor_orders') }}
{% if is_incremental() %}
where order_date >= dateadd(day, -4, '{{ var("ds") }}'::date)   -- 4-day lookback, logical date
{% endif %}
```

(On dbt 1.9+, the `microbatch` strategy with `event_time: order_date`, `batch_size: day`, `lookback: 4` expresses this with less hand-rolled risk — prefer it; the SQL above shows what it must be equivalent to. Either way: **no `CURRENT_DATE` in the predicate.**)

**Tests — the four lenses** (`principles/data-quality.md` §2; this YAML is what the `dq-test-planner` skill would produce for this table):

```yaml
models:
  - name: fct_orders
    description: "Grain: one row per order_id. Final at T+4 (vendor lateness policy). Amounts are integer cents, USD."
    config:
      contract: {enforced: true}     # schema-evolution.md §4 layer 1
    columns: [ ... full column/type spec ... ]
    data_tests:
      - dbt_utils.unique_combination_of_columns:        # grain (relationship lens)
          combination_of_columns: [order_id]
      - dbt_utils.expression_is_true:                    # value lens: sum sanity
          expression: "amount_cents >= 0"
    # plus per-column:
    #   not_null: order_id, order_date, amount_cents
    #   accepted_values on status: [placed, shipped, cancelled, returned]
    #   relationships: customer_id → dim_customer (when it exists)
    # volume lens: daily row count vs same-weekday trailing 28d — as a monitor
    # (warn-severity dbt-expectations test or an Elementary/SQL monitor job)
```

## Phase 4 — Orchestration: the DAG with gates

```
land_window  →  copy_to_landing  →  audit_reconcile  →  dbt_source_freshness
             →  dbt_build_marts  →  publish_ready_signal
```

Airflow shape (all defaults from `stacks/airflow.md` §2: retries=3 with exponential backoff, `execution_timeout` on every task, `catchup=False` + the 4-day lookback as the gap-healing mechanism, `max_active_runs=1` because the incremental mart serializes):

- `audit_reconcile`: rows loaded vs manifest — **blocks** on mismatch (control total, the strongest test we have).
- `dbt_build_marts`: runs `dbt build -s +fct_orders` — build + tests interleaved, so a failing staging test stops the mart from building (`stacks/dbt.md` §3).
- `publish_ready_signal`: emits the Airflow Dataset/Asset event *and* writes `audit.window_ready` — **after** the DQ gates, never before (`principles/orchestration.md` §5). Downstream consumers key off this, not off our schedule.
- Alerting: final-failure only, to the owning team's channel, plus independent freshness/volume monitors on `fct_orders` itself (`principles/observability-and-lineage.md` §2 — the vital signs catch what task-state monitoring can't).

## Phase 5 — Prove the correctness properties before calling it done

Run these four drills *now*, while nothing depends on the pipeline — they take an hour and they're the difference between believing and knowing:

1. **Rerun drill:** run the DAG for yesterday's window twice; diff `fct_orders` (`SELECT order_date, COUNT(*), SUM(amount_cents) GROUP BY 1` before/after). Identical ⇒ idempotent. Not identical ⇒ you have the core principle #1 bug; fix before anything else.
2. **Backfill drill:** backfill 7 historical windows with `max_active_runs=1`, then validate seam days against source counts (`principles/pipeline-correctness.md` §3).
3. **Late-data drill:** land a correction file for T−2, rerun today's window, verify T−2 restates correctly (the lookback working) and T−3 does too — then land one for T−5 (outside the lookback) and verify it lands in quarantine/monitoring rather than silently vanishing.
4. **Breakage drill:** point a dev run at a landing file with a renamed column and a nonsense enum value; verify the run fails at the boundary (COPY/contract/accepted_values) and *not* by loading garbage. Loud beats silent (core principle #3).

## Phase 6 — The first-week additions

Not day-one, but week-one: snapshot `dim_customer`-class dimensions from the start even if nobody asked (history is unrecoverable later — `stacks/dbt.md` §5); cost telemetry per run into `audit.load_log`'s sibling (`principles/cost-and-performance.md` §5); masking policies attached to the PII tags from Phase 0 with the CI probe test (`principles/security-and-governance.md` §2); and an `exposures:` entry the moment the first dashboard consumes `fct_orders` — that's what makes the `lineage-blast-radius-scanner` useful when you change this pipeline in six months.

---

**Scaling substitutions** (the architecture holds; components swap): source is an API/DB → same windowed-extractor rules; source is Kafka → connector lands to the same landing-table shape, dedup on `event_id` (`stacks/kafka.md` §6); volumes outgrow warehouse SQL → the transform becomes Spark writing Iceberg, same idempotent-overwrite semantics (`stacks/spark.md` §6, `stacks/lake-table-formats.md`).

**See also:** every phase cites its principles doc — those are the "why" when you need to defend a choice in review · `guides/analyze-existing-platform.md` (the reverse direction: judging a pipeline someone else built).
