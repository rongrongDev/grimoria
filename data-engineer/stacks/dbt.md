# dbt — production patterns, incremental correctness, tests, contracts

**Applies to:** dbt Core 1.8–1.10 (microbatch strategy 1.9+, Oct 2024; model contracts GA since 1.5; unit tests 1.8+); dbt Cloud tracks Core within weeks. Warehouse examples: Snowflake. · **Last verified:** 2026-07-06

dbt is where your transformation logic, tests, docs, and lineage live as one versioned artifact — which makes the dbt project the single highest-leverage place to enforce this KB's discipline. It is also where undisciplined SQL sprawls into a 900-model hairball nobody can change safely. This doc is the difference.

---

## 1. Project structure that survives growth

**Layering (staging → intermediate → marts)** is the load-bearing convention (rationale: `data-engineer/principles/data-modeling.md` §2):

- `staging/`: one model per source table, 1:1, only rename/retype/dedup — **no joins, no business logic**. `stg_` prefix. This layer is your schema-evolution shock absorber: an upstream rename is a one-file fix here instead of a fifty-model grep.
- `intermediate/`: reusable joins/aggregations that aren't consumer-facing. `int_` prefix, not exposed to BI.
- `marts/`: facts and dimensions, grain-documented, contracted, tested with the full four lenses. The only layer consumers may query.

Rules that keep the graph sane:
- **`source()` only in staging; `ref()` everywhere else; zero hardcoded table names.** Hardcoded names are invisible to dbt's lineage — they create the "nothing depends on this" illusion that precedes the "we dropped it and three dashboards died" incident. Grep for raw `db.schema.` strings in CI.
- **No cross-mart-to-staging reaches** (a mart reffing another domain's staging model bypasses that domain's logic); marts consume other marts or their own upstream chain.
- **Model = one grain, stated in the YAML description, enforced by a uniqueness test** (core principle #7). A model whose description can't state its grain in one sentence is two models.

## 2. Materialization decision tree

(The cost logic is `data-engineer/principles/cost-and-performance.md` §4; dbt mapping:)

- `view` — default for staging (cheap, always fresh, zero storage) until query volume on it costs more than materializing.
- `table` — marts rebuilt fully each run, while full rebuild is affordable. **Full rebuild is self-healing** (restatements, late data, logic fixes all just... apply); give it up only when cost forces you to.
- `incremental` — when full rebuild is the cost problem. This is where correctness bugs live; see §4.
- `ephemeral` — CTE inlining; fine for trivial shared snippets, hostile to debugging (no relation to query). Use sparingly.
- `materialized_view`/dynamic tables (warehouse-managed) — narrow, high-value, near-real-time aggregations; logic stays in the repo even when the engine manages refresh.

## 3. dbt's run model — what `dbt run` actually guarantees

- dbt builds a DAG from `ref()`s and runs models in dependency order, parallel up to `threads`. It guarantees *ordering*, not *idempotency* — that comes from materialization choice. `table`/`view` are idempotent by construction (full replace); `incremental` is exactly as idempotent as your strategy + unique_key make it (§4).
- **Selection syntax is your blast-radius tool:** `dbt build -s stg_orders+` (it and everything downstream), `+fct_revenue` (everything upstream), `state:modified+` (changed models and their downstream — the backbone of slim CI, §7).
- **`dbt build`** (run + test interleaved in DAG order) over separate `run`-then-`test` in production: it stops downstream models from building on an upstream that just failed its tests — the "test at the boundary, before propagation" rule (`principles/data-quality.md` §1) executed by the tool.
- Failures mid-run leave the graph partially built. That's fine *because* models are idempotent — the retry re-runs from scratch per model. `dbt retry` (1.6+) resumes from the failure point.

## 4. Incremental models — the correctness minefield

Every incremental model is a hand-rolled idempotency problem (`principles/pipeline-correctness.md` §1). The three strategies and their failure modes:

- **`merge`** (default on Snowflake): needs a **correct, truly-unique `unique_key`** — a non-unique key merges multiple source rows into one target row nondeterministically (silent data loss that reshuffles on every run; the symptom is "this model gives slightly different numbers each build"). Grain test on the *source* of the key, not just the target.
- **`delete+insert` / `insert_overwrite`**: partition-scoped rebuild; idempotent per window by construction. Preferred when the data is time-windowed and the warehouse supports cheap partition replacement.
- **`microbatch`** (1.9+): dbt manages per-window (`event_time` + `batch_size`) processing — each batch is an independent, retryable, idempotent unit; built-in `lookback` for late data; `dbt run --event-time-start/--event-time-end` for targeted backfills. **For new time-series incrementals on 1.9+, default to microbatch** — it deletes the entire class of hand-rolled `is_incremental()` watermark bugs below.

Hand-rolled `is_incremental()` blocks — the four classic bugs to check in review (all four appear in the `pipeline-idempotency-auditor` skill's checklist):
1. **Watermark from wall clock** (`WHERE ts > CURRENT_DATE - 1`) instead of `(SELECT MAX(ts) FROM {{ this }})` or dbt's event-time windows → gaps/overlaps when runs shift.
2. **No lookback for late data** (`> MAX(ts)` exactly) → late arrivals permanently dropped; undercount machine (`principles/pipeline-correctness.md` §4). Subtract a measured lateness buffer.
3. **Non-idempotent append** (no `unique_key`, strategy `append`) → every retry duplicates the window.
4. **Schema change unhandled** — `on_schema_change` defaults to `ignore`, meaning a new column silently doesn't populate in the incremental target while the full-refresh version has it: two truths. Set `append_new_columns` (or `fail` for contracted marts, forcing a conscious migration).

**`--full-refresh` discipline:** it heals logic drift but re-runs *today's code over all history* (anachronism risk — `principles/pipeline-correctness.md` §3 step 4) and re-scans everything (cost). Big tables get `full_refresh: false` as a config guard, with refresh as a deliberate, costed operation, not a habit. And know your seams: an incremental model that also feeds snapshots or exports needs those rebuilt after a full refresh.

## 5. Snapshots — SCD2 without hand-rolling

dbt snapshots implement SCD Type 2 (`principles/data-modeling.md` §3): `timestamp` strategy (needs a reliable `updated_at`) or `check` strategy (column-set comparison; use when `updated_at` lies, which it does more often than sources admit — an `updated_at` that doesn't change when the interesting column changes is the classic silent SCD gap).

- **Snapshot from day one on every dimension whose history could ever matter** — history you didn't capture is unrecoverable; this is the cheapest insurance in the toolbox.
- Snapshots are stateful and live outside `--full-refresh` semantics: **never** full-refresh a snapshot (it destroys the history it exists to keep); protect prod snapshot schemas accordingly.
- Test the SCD invariants explicitly: one current row per key, no overlapping validity windows (`dbt_utils.mutually_exclusive_ranges`).

## 6. Tests — dbt's half of the data-quality program

What to assert and why is `data-engineer/principles/data-quality.md` §2 (four lenses); the `dq-test-planner` skill produces the per-model list. dbt mechanics:

- Generic tests (`unique`, `not_null`, `accepted_values`, `relationships`) + packages: **`dbt-utils`** (`expression_is_true`, `mutually_exclusive_ranges`, `equal_rowcount`) and **`dbt-expectations`** (distributional: `expect_column_values_to_be_between`, quantile/stddev checks) cover the value/relationship lenses without custom SQL.
- **Severity as consequence policy:** `error` = blocks downstream (in `dbt build`), `warn` = logs. Map from the block/quarantine/warn taxonomy — deterministic invariants error; statistical checks warn until proven precise. `store_failures` for triage-able failure rows.
- **`source freshness`** (`loaded_at_field` + warn/error thresholds) is the boundary freshness check — wire `dbt source freshness` as the *first* gate in orchestration so a stale source stops the run before it propagates staleness with a green checkmark.
- **Unit tests (1.8+)** — fixed inputs, expected outputs, run at *build/CI time without warehouse data*: use for gnarly logic (window-function dedup, SCD as-of joins, currency/tax math). They test the *SQL*; data tests test the *data*; you need both and they are not substitutes.
- Volume lens: `dbt-expectations` row-count-vs-baseline tests exist, but banded same-weekday baselines usually live better in the monitoring layer (`elementary` package bridges this gap well inside dbt).

## 7. Contracts, exposures, and CI — the schema-evolution enforcement layer

This is dbt as the machine that says no (`data-engineer/principles/schema-evolution.md`):

- **Model contracts** (`contract: {enforced: true}` + full column/type spec) on every mart with external consumers: dbt refuses to build if the model's output drifts from the declared shape — a rename/type-change fails in *CI*, not in the consumer's dashboard. Contracted models + `on_schema_change: fail` on incrementals = belt and suspenders.
- **`versions:`** (model versions, 1.5+) implement expand/contract for models: publish `fct_orders.v2` alongside `v1` with a `latest_version` pointer and a deprecation date on v1. Use for any contracted-model breaking change.
- **Exposures** declare downstream consumers (dashboards, ML jobs, exports) in YAML: they appear in lineage, and `dbt ls -s +exposure:finance_daily` answers "what feeds this exec dashboard" — which turns the `lineage-blast-radius-scanner` agent's job from archaeology into a graph query. Maintain them; an exposure file that's 18 months stale is worse than none because it manufactures false confidence.
- **Slim CI:** every PR runs `dbt build -s state:modified+ --defer --state <prod-manifest>` into a disposable schema — build what changed and everything downstream of it, deferring unchanged upstreams to prod relations. This is the CI gate that catches breaking changes before merge (`schema-evolution.md` §4 layer 1). Add a manifest-diff step (e.g., `recce` or a hand-rolled catalog diff) to surface column-level changes for the `schema-change-impact-reviewer` skill to review.
- The compiled **`manifest.json` is the platform's lineage source of truth** (`principles/observability-and-lineage.md` §3) — column-level with recent dbt + parsers. Ship it somewhere queryable on every prod deploy; both subagents in this KB start from it.

## 8. Operational failure modes

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| **Non-unique `unique_key` merge loss** — numbers shift slightly every run | Grain test on key source; run-to-run diff of an aggregate on unchanged history | Fix key (composite), rebuild affected history | Grain tests as merge requirement; `pipeline-idempotency-auditor` on incremental PRs |
| **Late data dropped by exact watermark** — systematic undercount vs source | Reconciliation count vs source per window | Add lookback ≥ P99 lateness; backfill the undercounted range | Microbatch with `lookback`; lateness histogram monitor |
| **`dbt run` without `build`/gating** — downstream built on failed-test upstream | Bad numbers with all-green run logs; test failures discovered post-hoc | Switch prod job to `dbt build`; re-run affected subgraph | `dbt build` as the only sanctioned prod invocation |
| **900-model spaghetti** — 40-minute runs, circular staging reaches, no one dares refactor | `dbt ls` + graph metrics (max depth, fan-in); run duration trend | Incremental re-layering, one domain at a time; delete dead models (access-history check first) | Layering rules in CI (path-based ref linting); quarterly dead-model sweep |
| **Full-refresh cost bomb** — someone `--full-refresh`es the 40TB event model at 2pm | Warehouse cost alert; run duration 20× | Kill, run windowed backfill instead (microbatch ranges) | `full_refresh: false` guard on big models; refresh runbook with cost estimate step |
| **Stale exposures/contracts theater** — lineage says safe, dashboard breaks anyway | Post-incident: consumer wasn't declared | Add the missing exposure *in the postmortem*, plus access-history sweep for other undeclared readers | Quarterly exposure audit against warehouse access history |

---

**See also:** `data-engineer/principles/data-modeling.md` (what the layers/marts should contain) · `principles/data-quality.md` (the testing philosophy §6 implements) · `principles/schema-evolution.md` (why contracts/versions exist) · `stacks/snowflake.md` (the warehouse under all of it) · skills: `dq-test-planner`, `schema-change-impact-reviewer`, `pipeline-idempotency-auditor`.
