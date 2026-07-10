# Data Quality — what to assert, frameworks, drift detection, contracts, incident response

**Applies to:** dbt 1.9+ tests, Great Expectations 1.x (a.k.a. GX Core), tool-agnostic principles · **Last verified:** 2026-07-06

Data quality is not a tool you install; it's a set of assertions about meaning, placed where they stop bad data from propagating, with an owner who acts when they fire. This doc covers what to assert (§2 — the part most teams get wrong), where to put it (§1), frameworks (§3), silent-drift detection (§4), incident response (§5), and contracts (§6). Planning a concrete suite for a table is the `dq-test-planner` skill; tracing a live incident is the `data-quality-incident-tracer` agent.

---

## 1. Where tests run, and what happens when they fail

Two placement rules that matter more than any individual test:

1. **Test at the boundary, before propagation.** The cheapest place to stop bad data is where it enters: source-freshness and landing-zone assertions catch a broken vendor feed before forty downstream models bake it in. Testing only the final mart tells you you're wrong *after* everything is built.
2. **Every test has a declared consequence and an owner.** Three consequence levels — **block** (stop the pipeline; for correctness invariants: grain uniqueness, key integrity, impossible values), **quarantine** (route failing rows to a holding table, load the rest; for row-level dirt in high-volume feeds where one bad row shouldn't stop a million good ones), **warn** (log/alert but load; for drift signals needing human judgment). A failing test that pages nobody and blocks nothing is documentation of a problem, not protection against it — I have audited platforms with hundreds of "passing" warn-level tests nobody had read in a year.

**Severity misassignment is its own failure mode.** Blocking on a noisy distribution test causes on-call to disable tests wholesale ("that one always fails, ignore it") — and then the disabled suite misses a real incident. Blockers must be *deterministic invariants*; anything statistical is warn/quarantine until it has earned trust.

## 2. What to actually assert — the four-lens rule

`not_null` + `unique` on every table is coverage theater. The feed that switches from dollars to cents passes both. For every table that matters, assert through **four lenses** (this is core principle #4; the `dq-test-planner` skill operationalizes it):

1. **Volume:** row count for this window vs. a trailing baseline (same weekday, trailing 28 days — daily seasonality is real; comparing Monday to Sunday guarantees false alarms). Assert a band, not a floor: 2× volume is as wrong as 0×. Zero rows deserves its own explicit test — the most common silent failure is a "successful" load of nothing.
2. **Values:** ranges and distributions on the columns that carry meaning. Money: sign, magnitude bounds, and a *sum* vs trailing baseline (the cents-vs-dollars bug is only visible in the sum). Enums: `accepted_values` — an unknown enum value is usually an upstream product launch you're about to misclassify into `ELSE NULL`. Null *rates* on important nullable columns (a jump from 2%→40% nulls is an upstream regression that `not_null` can't see because the column is legitimately nullable).
3. **Relationships:** grain uniqueness (the non-negotiable — `data-engineer/principles/data-modeling.md` §1); referential integrity fact→dimension (orphan rate, with a threshold; some orphaning is normal with late-arriving dimensions); cross-table consistency (sum of line items == order totals; stream count ≈ batch count — reconciliation tests, the only defense for dual-path systems).
4. **Freshness:** `MAX(event_time)` recency per table against its SLA — covered in depth in `data-engineer/principles/observability-and-lineage.md` §2, but it belongs in the same suite because staleness *is* a quality failure to the consumer.

**Control totals are the gold standard** where you can get them: source system says it sent N rows / $X total; pipeline asserts it landed N rows / $X. This catches loss and duplication in one check with zero statistics. Any vendor/internal handoff that can emit a manifest should.

**How many tests:** grain + freshness + one volume band on *every* model; the full four lenses on sources, marts, and anything feeding money/ML. Testing every column of every intermediate model produces alert fatigue and a 40-minute CI suite nobody waits for — spend the budget at the boundaries and the ends.

## 3. Frameworks — dbt tests vs Great Expectations (and when neither)

- **dbt tests** (generic + `dbt-utils`/`dbt-expectations` packages): assertions live next to the model, run in the DAG, versioned in the same PR that changes the logic. **Default choice for anything dbt builds.** Their limit: they run after the model builds (test-after-write), so "block" means "downstream doesn't run," not "the write never happened" — fine when layers are the containment.
- **Great Expectations / GX Core:** heavier — brings profiling, data docs, suites that run *outside* dbt (on landing files, on a Spark frame mid-pipeline, against a vendor drop before load). Use it at ingestion boundaries dbt can't see, or in Python/Spark pipelines with no dbt at all. Don't run both frameworks over the same tables asserting the same things — one source of truth per assertion, or the two suites drift and disagree.
- **Neither** for reconciliation and anomaly jobs — a scheduled SQL job writing to a `dq_results` table with alert thresholds is often clearer than forcing statistical checks into either framework, and it gives you a queryable history of every check result, which is what you'll want during incidents (§4).

## 4. Silent drift and anomaly detection — catching what no assertion anticipated

Assertions catch failures you predicted. Drift detection catches the rest: the upstream app change that halves event volume from Android, the vendor who quietly added a new status code, the timezone shift that moves 8% of events across a date boundary.

What works in production, in increasing sophistication (stop when the noise exceeds the value):

1. **Metric time series + banded baselines:** for each key table, record per-window row count, null rates on key columns, sum/mean of key measures, distinct counts of key categoricals. Alert on deviation beyond k·MAD from the same-weekday trailing baseline. This is 80% of the value; robust statistics (median/MAD, not mean/stddev — one incident in the training window otherwise poisons the baseline) and seasonality-awareness are the difference between useful and muted-within-a-month.
2. **Distribution shift on critical columns:** categorical share drift (share-per-value vs baseline, alert on absolute-share change > threshold — a new enum value appearing at 0.1% is information; `checkout_v2` jumping to 30% share is a launch you should know about).
3. **Observability platforms** (Monte Carlo, Elementary, Soda, or homegrown on layer-1): worth it once table count × team count makes hand-tended baselines untenable. They do not replace §2 — they detect *change*, not *wrongness*; a feed that has always been wrong drifts nothing. Anomaly detection supplements assertions, never substitutes.

**Segment before you alert (and when you debug):** aggregate metrics hide compositional breaks. Total volume flat while iOS doubled and Android went to zero is a critical incident invisible at the total. Baseline per top segment (platform, region, major source) for tier-1 tables.

| | |
|---|---|
| **Failure mode** | Upstream change alters meaning/volume/mix without breaking any schema or assertion; weeks pass before a human notices a dashboard "feels wrong" |
| **Detection** | Layer 1–2 monitors above; segment-level baselines; consumer-reported anomaly as the failure of all of the above |
| **Fix** | Incident procedure §5 below; then backfill corrected windows (`data-engineer/principles/pipeline-correctness.md` §3) |
| **Prevention** | Every tier-1 table gets layer-1 monitors at creation (make it a scaffold, not a choice); upstream teams announce app-release dates so drift alerts can be correlated instead of investigated cold |

## 5. When bad data ships anyway — incident response order

The instinct is to debug root cause first. Wrong order — contain, then trace:

1. **Contain:** stop scheduled runs that would propagate further; mark affected tables/dashboards ("known issue" banner beats silent wrongness — consumers making decisions *right now* are the live damage).
2. **Scope:** which windows, which tables, which downstream consumers (lineage — `lineage-blast-radius-scanner` for a big graph). Who already consumed wrong numbers? An exec deck already sent is damage you must *communicate*, not just fix.
3. **Trace to the source stage:** walk upstream layer by layer comparing each stage's output for the bad window until you find the first wrong stage — that's the `data-quality-incident-tracer` agent's whole job. The first *wrong* stage, not the first *alerting* stage; alerts fire downstream of causes.
4. **Fix + backfill** affected windows in dependency order, then rebuild downstream.
5. **Prevent:** the postmortem's output is a *new test* that would have caught this at the boundary — every incident either adds an assertion/monitor or explains why it can't. A postmortem without a new check is a story, not a fix.

## 6. Data contracts

The organizational layer that makes §1–4 cross-team: schema + semantics + freshness SLA + quality assertions, versioned with the interface, enforced in both sides' CI. Full treatment in `data-engineer/principles/schema-evolution.md` §5 (contract content and process) — the DQ-specific addition here: **put the four-lens assertions (§2) *in* the contract**, not just the schema. "Column exists with type X" plus "daily volume within band, sum positive, ≤0.5% orphans" is a contract that catches semantic breaks, which schema-only contracts never do.

---

**See also:** `dq-test-planner` skill (turn this doc into a concrete suite for one table) · `data-quality-incident-tracer` agent (§5 step 3 at scale) · `data-engineer/principles/observability-and-lineage.md` (freshness/alerting design — the sibling of this doc) · `data-engineer/stacks/dbt.md` §6 (test syntax and packages).
