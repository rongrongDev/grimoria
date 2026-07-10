# Observability & Lineage — SLAs, freshness, lineage for impact analysis, alerting that avoids noise

**Applies to:** tool-agnostic; concrete examples: Snowflake ACCESS_HISTORY, dbt manifest, OpenLineage 1.x conventions · **Last verified:** 2026-07-06

Task-success monitoring tells you your *code* ran. Data observability tells you the *data* is present, sufficient, and shaped right — which is what consumers actually depend on. This doc covers the three vital signs (§2), SLAs (§1), lineage as the precondition for safe change (§3), and alert design that stays credible (§4).

---

## 1. Pipeline SLAs — define them as consumer promises

An SLA of "the DAG usually finishes by 7" is a hope. A usable SLA is: **table X is complete through window W by time T, with completeness meaning volume within band and DQ blockers green.** Written per *table consumers read*, not per DAG — consumers don't know your DAGs exist.

- Derive T backwards from the consumer's deadline (board dashboard read at 9am → mart by 8:30 → facts by 8:00 → landing by 7:00). The intermediate deadlines give you *leading* alerts: landing late at 7:05 is actionable; mart late at 8:35 is an apology.
- Measure and publish attainment (last 30/90 days). An SLA you don't measure decays into fiction, and the first time you need the history is during the "can we depend on this table?" conversation with a new consumer.
- Tier your tables. Tier-1 (money, exec, ML-serving): SLA + full vital signs + paging. Tier-2: vital signs + business-hours alerts. Tier-3: freshness only. Uniform treatment is unaffordable in attention, and attention is the scarce resource (§4).

## 2. The three vital signs — freshness, volume, schema, per table

(Core principle #10.) Task success is a proxy; these measure the thing itself. All three are cheap queries; the discipline is *having them on every table that matters, from creation* — scaffold them, don't hand-add them.

1. **Freshness:** `deadline − MAX(event_time)` (not `MAX(loaded_at)` — a load of old data is fresh by loaded_at and stale by event_time; consumers experience event_time). Alert against the per-table SLA, respecting the restatement/seal policy from `data-engineer/principles/pipeline-correctness.md` §4 so you don't page on designed lateness.
2. **Volume:** per-window row count vs same-weekday trailing baseline, banded both directions; explicit zero-rows check. Detail in `data-engineer/principles/data-quality.md` §2 lens 1 — volume lives in both docs because it's simultaneously a quality assertion and an operational signal; implement once, alert once.
3. **Schema:** nightly snapshot of column/type per table, diffed; any change not attached to an announced migration is an alert. This is the layer-4 net from `data-engineer/principles/schema-evolution.md` §4 — it catches the vendor feed and the manual-DDL hotfix that bypassed CI. Cheap to build (information_schema dump + diff), embarrassingly high yield.

**The pairing that catches "succeeded but wrong": every green task with red vital signs is an incident; every red task with green vital signs is a nuisance.** Route the first to a pager, the second to a queue. Platforms that only watch tasks invert this — they page for the nuisance and sleep through the incident (a feed delivering zero rows "succeeds" all the way to the boardroom).

| | |
|---|---|
| **Failure mode** | Pipeline green, data stale/thin/reshaped; discovered by a consumer, days later, with trust damage disproportionate to the bug |
| **Detection** | The three vital signs above; consumer report = detection failure, do the postmortem on the *monitoring gap*, not just the data bug |
| **Fix** | Incident path in `data-engineer/principles/data-quality.md` §5 (contain → scope → trace → backfill → prevent) |
| **Prevention** | Vital signs scaffolded at table creation; tiering so the important tables page; monthly review of tables with zero monitors (they accumulate — every platform grows unmonitored tables like weeds) |

## 3. Lineage — the precondition for safe change

Lineage answers two questions you cannot safely operate without: **"if I change this, what breaks?"** (impact analysis, walking downstream) and **"this is wrong, where did it come from?"** (root cause, walking upstream). Core principle #9: lineage before change, always.

**Sources of lineage, in order of trustworthiness:**

1. **Execution-derived:** warehouse query/access history (Snowflake `ACCESS_HISTORY`, BigQuery `INFORMATION_SCHEMA.JOBS`) records what *actually read and wrote* what, including the analyst cron and the BI extract that no static analysis knows about. Ground truth for the contract question "does anything still read the old column?" — this is the evidence gate for the contract phase of expand/contract.
2. **Static/declared:** dbt `manifest.json` (`ref()`/`source()` edges), Airflow datasets, OpenLineage events. Precise for the covered surface, blind outside it (the surface it doesn't cover is exactly the ungoverned stuff that bites you).
3. **Parsing/grep:** searching repos and dashboard definitions for table/column names. Noisy, misses dynamic SQL, catches things nothing else does. The floor, not the goal.

A real impact analysis uses **1+2 union 3**, which is exactly what the `lineage-blast-radius-scanner` agent does — it exists as a subagent because walking a full manifest + query history is a context-flooding read that should return only the verdict. For a single small diff with known consumers, the in-context `schema-change-impact-reviewer` skill suffices.

**Column-level vs table-level:** table-level lineage overstates blast radius (everything downstream of the *table* looks affected by a one-column change) — fine for small graphs, paralyzing at scale, and paralysis becomes "we never change anything" or "we ignore the analysis." Column-level (dbt + SQL-parsing tools, Snowflake access history at column granularity) is what makes impact reports *actionable*. Invest in it when table-level reports routinely exceed a screen.

**Freshness of lineage matters more than completeness:** a lineage graph last built quarterly is a map of a city that's been rebuilt. Lineage extraction runs in CI / nightly, or it's archaeology.

## 4. Alerting design that avoids noise

Alert fatigue is the terminal disease of data platforms. The sequence is always: enthusiastic alerting → 30 alerts/day → muted channel → real incident missed → "why didn't we know?" Design against the sequence, not just for detection:

- **Page = actionable + urgent + owned.** Every page names a table, a symptom, a suspected direction, and lands on the team that can fix it (producer-side for shared tables — `data-engineer/principles/orchestration.md` §5). Everything failing that test goes to a triage queue with a daily look, not a pager.
- **Alert on final state, not process:** final failure after retries, SLA breach — not each retry, not "task slow" (unless slow *is* the SLA breach; leading-indicator alerts from §1's intermediate deadlines are the sanctioned version of this).
- **One incident, one alert:** an upstream failure that turns 40 downstream tables stale must page once, on the root, with a blast list — not 40 times. This requires lineage (§3) wired into alert routing: suppress descendants of an already-alerting ancestor. Fan-out paging is the fastest known route to a muted channel.
- **Statistical monitors earn paging rights slowly:** new anomaly detectors run in shadow (queue-only) until their precision over a few weeks proves out; deterministic invariants (grain, zero-rows, schema change) can page from day one. Same logic as blocking-severity assignment in `data-engineer/principles/data-quality.md` §1.
- **Budget attention:** track alerts/week per team and % actioned. Under ~50% actioned means your thresholds are lies, and the muting has already begun whether or not anyone admits it. Deleting a bad alert is a contribution, not a risk — the risk is keeping it and training people to ignore the channel it shares with good alerts.

## 5. Run-level metadata — the substrate for all of the above

Every pipeline writes, per (task, window, attempt): start/end, status, rows read/written, bytes scanned, cost estimate, DQ results summary. One queryable audit table (or OpenLineage events into a store). This is what turns questions from archaeology into SQL: "when did volume start drifting," "what did this window cost last month vs now," "which runs touched the bad window" — and it's the primary input the `data-quality-incident-tracer` agent walks when tracing an incident. Pipelines that log only to stdout have their history rotated away exactly when you need it.

---

**See also:** `data-engineer/principles/data-quality.md` (what the monitors assert; incident response) · `data-engineer/principles/schema-evolution.md` §4 (schema-drift net) · `data-engineer/principles/cost-and-performance.md` §5 (cost observability — same substrate, money lens) · agents: `lineage-blast-radius-scanner`, `data-quality-incident-tracer`.
