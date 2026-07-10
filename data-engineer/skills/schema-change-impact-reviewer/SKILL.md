---
name: schema-change-impact-reviewer
description: Review a proposed schema change (warehouse DDL, dbt model/YAML diff, Avro/Protobuf schema, or a PR touching table/topic shapes) for breaking changes against downstream consumers, classifying each change by the compatibility taxonomy and producing a verdict with the required expand/contract plan. Use when a PR renames/retypes/drops columns or changes a model's contract/grain, when asked "will this schema change break anything," or as the review gate before any DDL on a shared table. Do NOT use for whole-warehouse blast-radius mapping when consumers are unknown (dispatch the lineage-blast-radius-scanner agent first — this skill needs a consumer list to review against), for OLTP database migration mechanics like locking/rewrites (use the migration-safety-reviewer skill), or for data-content quality questions (use dq-test-planner or the data-quality principles doc).
---

# Schema Change Impact Reviewer

You are reviewing a schema change as the engineer who has watched a column rename null-fill three dashboards for four days without a single error being raised. The judgment behind every rule here is `data-engineer/principles/schema-evolution.md` (the change taxonomy §1, expand/contract §3, detection layers §4) — cite those sections in findings so humans can read the why.

**Silent breaks outrank loud breaks.** A change that will make something *crash* is HIGH; a change that will make something *keep working with wrong results* (rename null-matching a join, semantic change, grain change) is CRITICAL. Order your review accordingly.

## Inputs you need

1. **The change:** DDL, dbt diff (model SQL + YAML/contract changes), or registry schema diff. From a full PR, extract every schema-shaped change — including implicit ones: a changed `SELECT` column list in a dbt model *is* a schema change; a changed `unique_key` or join is a potential grain change.
2. **The consumer list:** dbt children + exposures (`dbt ls -s <model>+`), registry consumer groups, warehouse access-history readers, known dashboards/exports. If consumers are unknown and the table is shared, **stop and say so** — recommend dispatching `lineage-blast-radius-scanner`; reviewing against an empty consumer list produces false confidence, which is worse than no review.
3. Whether the table/topic is shared beyond the producing team (raises every severity one notch — unknown consumers are assumed for shared objects).

## Review procedure

For **each** changed element, walk this in order:

**Step 1 — Classify against the taxonomy** (`schema-evolution.md` §1): additive-nullable / add-non-null / widen / narrow-or-retype / rename / drop / semantic change / enum-set change / grain change / layout-only. When a diff shows drop+add of similar columns, treat it as a rename (tools rarely say "rename").

**Step 2 — Hunt the silent variants specifically:**
- Rename: which consumers reference the old name? `SELECT *` consumers won't error — they'll propagate the change further downstream; flag them as *amplifiers*, not safe.
- Semantic change (same name/type, new meaning — units, timezone, gross/net, ID recycled): *invisible to every tool*; detect by reading the transformation diff and the column description diff. Any repurposed column = CRITICAL + must ship as a new column instead.
- Enum changes: find `CASE WHEN`/`accepted_values`/filter usage downstream; new values fall into `ELSE`/NULL buckets silently.
- Grain change (unique_key change, join added that can fan out, aggregation level change): CRITICAL; per `schema-evolution.md` §1 this is a *new table*, not a change.

**Step 3 — Check the compatibility mechanism:**
- Streams: does the registry compat mode (`BACKWARD_TRANSITIVE`/`FULL_TRANSITIVE`?) actually gate this? New fields have defaults? (`data-engineer/stacks/kafka.md` §5)
- dbt: is the model contracted (`contract: enforced`)? Versioned (`versions:`)? Will slim CI catch it (`data-engineer/stacks/dbt.md` §7)?
- Warehouse DDL outside dbt: what, if anything, would catch this before consumers do? (Usually: nothing — say so.)

**Step 4 — Require the migration shape** for anything non-additive: the expand → migrate → contract plan (`schema-evolution.md` §3) — what ships now alongside the old shape, how consumers migrate, what evidence gates the contract step (access-history zero-readers, not a calendar date). A breaking change with no migration plan = verdict UNSAFE regardless of how few consumers you found (the ones you didn't find are the incident).

**Step 5 — Backfill/history interaction:** does the change require rebuilding history (type change, new column needing backfill)? If yes, flag the backfill checklist (`data-engineer/principles/pipeline-correctness.md` §3) and downstream-rebuild propagation as required follow-ups.

## Output format

```
## Schema Change Impact Review: <object(s)>
Consumer evidence: <dbt graph / access history / registry — and its freshness; "consumer list incomplete" if so>

### Verdict: SAFE / SAFE WITH PLAN / UNSAFE

| # | Change | Class (taxonomy) | Consumers hit | Break mode (loud/silent) | Severity |
|---|--------|------------------|---------------|--------------------------|----------|

### Required plan (per non-additive change: expand/migrate/contract steps + contract-phase evidence gate)
### Detection gaps (what would NOT have caught this; which layer from schema-evolution.md §4 to add)
```

Severity: **CRITICAL** = silent wrongness reaches consumers (rename/semantic/grain/enum on consumed columns); **HIGH** = loud breakage of consumers, or CRITICAL-class change on a table with unverified consumer list; **MEDIUM** = breaks only intra-team objects with a plan; **LOW** = additive/layout with notes (e.g., clustering change with cost impact — cite `data-engineer/principles/cost-and-performance.md` §3).

**Evidence rule:** every "consumers hit" claim names the consumer (model/dashboard/consumer-group) and how you found it. If you inferred rather than observed, mark it `assumed` — reviewers act differently on evidence vs. inference, and conflating them is how impact reviews lose trust.
