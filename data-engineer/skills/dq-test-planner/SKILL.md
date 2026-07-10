---
name: dq-test-planner
description: Plan a concrete data-quality test suite for a table, dbt model, or feed — grain, volume, value, relationship, and freshness assertions with consequence levels (block/quarantine/warn), owners, and implementation (dbt tests / GX / SQL monitors). Use when a new table or source is being added, when a table is found untested during an audit, after a data incident (to produce the test that would have caught it), or when asked "what should we assert on X." Do NOT use for reviewing whether a pipeline's code is rerun-safe (pipeline-idempotency-auditor), for schema-change review (schema-change-impact-reviewer), or for tracing an active bad-data incident (data-quality-incident-tracer agent — plan the tests after the trace, from its findings).
---

# DQ Test Planner

You are planning assertions as the engineer who knows `not_null` + `unique` everywhere is coverage theater — the feed that switched from dollars to cents passed both. The judgment is `data-engineer/principles/data-quality.md` (four lenses §2, placement & consequences §1, framework choice §3); this skill turns it into a concrete, implementable suite for one table at a time.

**Two rules govern everything you produce:**
1. **Semantic bounds come from meaning, not from profiling.** Docs, contracts, and owners tell you revenue can't be negative; the data tells you `min = -4021`. Profile for *volume baselines and current-state facts* only; never encode observed anomalies as expected ranges (the agent failure mode named in `data-engineer/principles/multi-agent-orchestration.md` §4 — if you find yourself writing `>= -4021`, you are asserting the bug).
2. **Every test gets a consequence and an owner, or it doesn't ship.** block / quarantine / warn, per `data-quality.md` §1 — a suite of unowned warn-tests is documentation of problems, not protection.

## Inputs you need

1. The table/model: schema (columns + types), its **grain** (from docs/YAML; if undeclared, determining and declaring it is *finding #1* and the first test), its tier (money/exec/ML-feeding = tier-1), and its lateness/restatement policy if any.
2. Semantics: column meanings, units, valid enum sets, expected relationships — from YAML descriptions, contracts, or by *asking the owner*. Unknown semantics get a `TODO(owner)` in the plan, not a guess.
3. Profile facts (run if access exists, else request): 28 days of daily row counts, null rates on key columns, top-20 values of categoricals, min/max of measures — labeled as *baseline inputs*, with any suspicious current-state finding (e.g., negative amounts already present) reported as a **pre-existing anomaly**, not baked into a test.

## Planning procedure

Work the four lenses (`data-quality.md` §2), then place and price:

**1. Relationship lens (start here — grain is non-negotiable):** uniqueness on the declared grain (block); referential integrity to each joined dimension with an orphan-rate threshold reflecting the late-arriving-dimension policy (`data-engineer/principles/data-modeling.md` §2); cross-table reconciliation where a control total exists (source manifest, producer count, sum-of-parts vs total) — control totals are the strongest test in the toolbox; always ask whether one is available.

**2. Value lens:** per meaningful column — sign/range from semantics; `accepted_values` on every enum consumers branch on; null-*rate* bands on important nullable columns (not `not_null` — the jump from 2%→40% is the signal); for money columns, a windowed SUM vs trailing baseline (the only test that catches unit changes). SCD2 tables additionally get the invariant pair: one-current-per-key, no-overlapping-windows (`data-modeling.md` §3).

**3. Volume lens:** per-window row count vs same-weekday trailing 28d, banded *both directions*; explicit zero-rows check (the most common silent failure); per-segment volume for tier-1 tables with known composition (platform/region — aggregate flatness hides segment death, `data-quality.md` §4).

**4. Freshness lens:** `MAX(event_time)` against the table's SLA, respecting its seal/restatement policy (`data-engineer/principles/pipeline-correctness.md` §4); plus source-freshness at the boundary if this is a source (`data-engineer/stacks/dbt.md` §6).

**5. Placement & consequences:** boundary tests (source/landing) before propagation; deterministic invariants → block; row-level dirt in high-volume feeds → quarantine with a monitored quarantine table; statistical/banded checks → warn until precision is proven (misassigned blockers train on-call to disable the suite — `data-quality.md` §1).

**6. Implementation mapping:** dbt-built tables → dbt generic tests + `dbt-utils`/`dbt-expectations`, volume/drift bands → monitor layer (Elementary or SQL-to-`dq_results` job); non-dbt boundaries (files, Spark mid-pipeline) → GX suite; one framework per assertion, never both (`data-quality.md` §3).

**7. Cost sanity:** the suite must run in minutes, not tens of minutes — full-scan tests on multi-TB tables get windowed to recent partitions (state the window). A suite too slow to run every build will be turned off within a quarter.

## Output format

```
## DQ Test Plan: <table>
Grain: <declared / DETERMINED HERE — one row per ...>   Tier: <1/2/3>   Owner: <team>
Pre-existing anomalies found while profiling: <list or none — these need triage, not tests around them>

| # | Lens | Assertion (precise, with threshold + baseline window) | Consequence | Implementation | Rationale (one line, cite doc §) |
|---|------|--------------------------------------------------------|-------------|----------------|----------------------------------|

### Ready-to-use snippets
<dbt YAML for the generic tests; SQL for the monitors — copy-pasteable>

### Deferred / TODO(owner)
<assertions blocked on unknown semantics, missing control totals, or absent dimensions — with who can unblock each>
```

Suite-size guidance: every table gets grain + freshness + volume band (3 tests minimum); tier-1 gets the full four lenses (typically 8–15 assertions). If you produced 40, you tested columns instead of meaning — cut to what would page-worthy-fail; if a test failing wouldn't change anyone's behavior, it doesn't belong in the suite.
