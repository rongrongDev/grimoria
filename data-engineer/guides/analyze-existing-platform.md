# Analyze an Existing Data Platform — a bounded-time audit

**Applies to:** any warehouse/lake platform; concrete queries assume Snowflake + dbt + Airflow where shown (substitute equivalents) · **Last verified:** 2026-07-06

You've inherited (or been asked to assess) an unfamiliar data platform. This guide produces, in a **bounded time budget**, the three artifacts that matter: (1) an architecture & lineage summary, (2) a risk register of data-quality and schema-fragility findings, (3) a prioritized remediation plan. It is written to be executable by a human or an agent; for agent execution, Phases 2–3 shard cleanly across the fan-out pattern in `principles/multi-agent-orchestration.md` §3.

**Time budgets** (pick one; the phases scale, the sequence doesn't):
- **1 day**: Phases 0–2 only, top-10 tables, verbal findings.
- **1 week** (default; per-phase splits below assume it): all phases, tier-1 surface covered.
- **1 month**: all phases + verification drills on the top pipelines + remediation execution begins.

**Evidence rule** (binding, human or agent): every finding carries a query you ran, a file:line, or a run-log reference. No pattern-matched "typically this means" findings — if you didn't observe it *here*, it isn't a finding (the same rule the fan-out audits enforce; one hallucinated CRITICAL discredits the register).

---

## Phase 0 — Orientation: what exists and what matters (½ day)

Don't read code first. Find the **money and the readers** first — they define "matters" for every later judgment:

1. Inventory the estate mechanically: warehouses/databases/schemas, table counts and sizes, DAG/job inventory, dbt project(s), streaming topics. (Snowflake: `INFORMATION_SCHEMA` + `ACCOUNT_USAGE.TABLES`/`TABLE_STORAGE_METRICS`; Airflow: `airflow dags report`.)
2. Rank tables by *consumption*: query counts by table from access history over 30 days (`ACCESS_HISTORY`), BI-tool dashboard lists, and ask two questions of whoever's available: *"which numbers do executives look at?"* and *"which dataset breaking would page someone?"* The top ~10 tables by this ranking are your **tier-1 surface** — every subsequent phase goes deep on these and samples the rest.
3. Identify owners (or their absence — unowned tier-1 tables are already a finding).

**Artifact:** one page — estate size, tier-1 table list with owners, consumption ranking method.

## Phase 1 — Architecture & lineage summary (1 day)

Goal: the diagram + narrative a newcomer needs, *as it actually is*, not as the wiki says.

1. **Trace tier-1 tables upstream to sources:** dbt `manifest.json` gives the modeled subgraph (`dbt ls -s +<table>`); access history's write edges give the ungoverned rest (what writes each table — `principles/observability-and-lineage.md` §3's source-of-trust ordering). For a graph too big to read inline, this is precisely the `lineage-blast-radius-scanner` agent's job, run in inventory mode per tier-1 table.
2. Classify each hop: ingestion (tool? CDC? files?), transformation (dbt? stored procs? — **note every transformation living outside version control**: scheduled queries, views created by hand, BI-layer SQL; these are the platform's dark matter and reliably where the worst surprises live), serving (BI, exports, reverse-ETL, ML).
3. Note the **seams**: orchestrator boundaries, Kafka→warehouse hand-offs, cross-team dependencies implemented as schedule-gap coincidences (`principles/orchestration.md` §5 — grep DAGs for hardcoded morning schedules feeding each other).

**Artifact:** architecture summary — flow diagram for tier-1 lineage, component inventory with versions (stamp them: an Airflow 1.10 or dbt 0.x sighting is itself a finding), dark-matter list, seam list.

## Phase 2 — Data-quality & schema-fragility risk register (2 days)

The core of the audit. For the tier-1 surface, assess five risk families — each maps to the KB doc that defines "good," which is your rubric:

1. **Rerun safety** (`principles/pipeline-correctness.md` §1): for each tier-1 pipeline, what happens on retry/re-run? Look for: bare `INSERT INTO` without window delete, `NOW()`/`CURRENT_DATE` windowing (grep task code and dbt models — highest-yield single grep on any platform), incremental models with exact-watermark predicates (late-data droppers) or non-unique merge keys. This is the `pipeline-idempotency-auditor` skill applied per pipeline — use it verbatim as the checklist.
2. **Test & monitor coverage** (`principles/data-quality.md` §2, `observability-and-lineage.md` §2): per tier-1 table — grain test? freshness monitor? volume band? *Any* value-level assertion? Score four-lenses coverage. Also audit the *alerting reality*: where do failures go, and are they read? (Count warn-level test failures older than 30 days that nobody actioned — that number is the platform's real quality posture, and it's usually the most clarifying single number in the report.)
3. **Schema fragility** (`principles/schema-evolution.md`): contracts/registry enforcement present? `SELECT *` in pipeline models (grep — each is a fragility point)? Hardcoded table names bypassing lineage (`stacks/dbt.md` §1)? Cross-team tables with no declared consumers (exposures/registry) — i.e., changes there fly blind? Recent incident history of "dashboard broke when X changed" (ask; there's always one).
4. **Correctness spot-checks** (pick 3–5, they're cheap and they find things): grain check on the top fact (`GROUP BY key HAVING COUNT(*)>1`); reconciliation of one money metric source→mart; a seam-day check around the most recent known backfill; restatement behavior (does yesterday's number change today? does anyone know it does?).
5. **Cost & governance sampling** (`principles/cost-and-performance.md` §1, `security-and-governance.md`): top-10 workloads by spend + utilization of compute (idle warehouses); then — who can read the PII-bearing tier-1 tables, is anything masked, does a deletion path exist even on paper? (One day of a one-week audit; these become their own deep audits if red.)

**Artifact:** the risk register. Per finding: family, evidence (query/file:line), affected consumers (from Phase 1 lineage), severity — **CRITICAL** = wrongness is plausibly being consumed *now* (grain violations on tier-1, dropped late data on money tables, unmonitored feeds already known stale); **HIGH** = one routine event (retry, upstream rename, backfill) from CRITICAL; **MEDIUM** = fragility with warning time; **LOW** = hygiene.

## Phase 3 — Prioritized remediation plan (1 day)

Sequence by *risk-reduction per unit effort*, and resist the rebuild reflex — the platform is running someone's business today.

1. **Stop active bleeding** (CRITICAL findings): fixes first, but note that some "fixes" are *announcements* — if a tier-1 number has been wrong for months, the communication of that fact is part of the remediation and needs the same care as the fix (`principles/data-quality.md` §5).
2. **Instrument before renovating:** vital signs (freshness/volume/schema) on the tier-1 surface is almost always remediation item #1 or #2 — a week of effort that converts every *future* silent failure into a loud one, and it de-risks all subsequent remediation (you can now see what your changes do). (`observability-and-lineage.md` §2.)
3. **Idempotency retrofits** on tier-1 pipelines (bounded, per-pipeline effort; each one makes retries/backfills safe and unlocks confident operations).
4. **Contract the seams:** registry/compat enforcement on shared streams, contracts + exposures on shared marts, readiness signals replacing schedule coincidences.
5. **Structural work last** (re-layering the dbt hairball, warehouse cost redesign, governance program) — schedule-shaped, quarter-scale, and only *after* instrumentation exists to prove the work isn't regressing anything.

**Artifact:** remediation backlog — per item: finding(s) addressed, effort (S/M/L), owner, risk if deferred; top 5 sequenced explicitly with the dependency reasoning ("monitors before refactors because...").

## Running this with agents

Fan out Phase 2 by ownership domain with fixed rubrics (the skills named above *are* the rubrics), read-only credentials, evidence rule enforced, aggregator dedups and spot-checks samples before the register ships — the full pattern, including why severity claims get capped at evidence, is `principles/multi-agent-orchestration.md` §3. Phases 0–1 stay with the lead (human or frontier-model): they're judgment about *what matters*, which is exactly what doesn't shard.

---

**See also:** `guides/build-a-pipeline-from-scratch.md` (what "good" looks like built fresh — the implicit rubric behind Phase 2) · skills: `pipeline-idempotency-auditor`, `schema-change-impact-reviewer`, `dq-test-planner` (remediation item generators) · agents: `lineage-blast-radius-scanner`, `data-quality-incident-tracer`.
