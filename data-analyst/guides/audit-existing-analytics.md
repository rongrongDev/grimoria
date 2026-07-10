# Guide: Audit an Existing Analytics Setup

**Version 1.0.0 · 2026-07-06.** The bounded-time procedure for walking into an
unfamiliar dashboard/metric estate and producing a correctness audit + prioritized
remediation plan (Capability B). Standalone; deep dives are linked per phase.

**Time budgets are part of the method, not a suggestion.** An unbounded audit
finds everything, ranks nothing, and ships after the decisions it was meant to
protect. Two standard sizes:
- **Focused audit** (one dashboard or one metric): ~half a day.
- **Estate audit** (a team's BI surface, ≤ ~30 dashboards): ~3 days, using the
  fan-out in Phase 4.
Findings you don't have time to verify get logged as "unverified risk," not
dropped and not asserted.

**The prime directive** (`principles/core-principles.md` §10): if you can't find
it — a definition, an owner, version control, an experiment log — **that absence
is a finding, usually the top finding.** Never reconstruct what a metric
"probably" means to keep the audit moving.

---

## Phase 1 — Inventory & triage (10% of budget)

Map before judging:
1. List the surfaces in scope; pull **usage stats** (Looker System Activity, Tableau/Power BI usage views — `topics/bi-tools.md`). Rank by (viewers × seniority of decisions fed). A dashboard the CFO reads weekly outranks thirty nobody opened this quarter — the dead thirty go straight into the remediation plan as pruning candidates (`topics/data-visualization.md` §4) and get **no further audit time**.
2. For each in-scope headline metric, locate where its logic *physically lives* (semantic layer? per-dashboard SQL? workbook calc? spreadsheet?) and whether it's in version control. This single column of the inventory predicts most of what Phases 2–3 will find (`topics/dashboard-reliability.md` §1).
3. Identify owners. No owner → finding.

## Phase 2 — Correctness audit of the top metrics (40% of budget)

For each of the top N metrics by triage rank (N sized to budget — typically 3–5
focused / 10–15 estate), run the `metric-definition-auditor` skill, or manually
apply its checklist source (`topics/sql-correctness.md` summary table +
`topics/metric-design.md` §1–2):

- **Fan-out:** row count vs. `COUNT(DISTINCT grain_key)` at each join; in LookML, verify `primary_key` uniqueness (the silent symmetric-aggregate killer, `topics/bi-tools.md` §2); in Tableau, physical joins and LOD grain assumptions (§3).
- **NULL handling:** `!=` filters, `NOT IN` subqueries, `COUNT(col)`-vs-`COUNT(*)` mixing.
- **Time:** timezone conversion count (must be exactly one), `BETWEEN` on timestamps, boundary-day volume.
- **Definition vs. any written spec:** and if no spec exists, draft the §2 spec *from the SQL as-built* — the gaps you can't fill from the SQL are findings.
- **External anchor:** does the metric reconcile (± explainable delta) with finance / a source system / its own history?

## Phase 3 — Cross-surface consistency + statistical validity (25% of budget)

**Consistency:** for every metric name appearing on ≥2 surfaces, diff the
definitions on the six axes (population / numerator / denominator / grain /
timezone / freshness — `topics/metric-design.md` §1). Same name + different
definition = a drift finding rated by who consumes the disagreeing numbers.

**Statistical validity of standing claims:** any dashboard tile or recurring
report making an inferential claim ("test won," "feature X drives retention,"
trend arrows with significance stars):
- Experiment claims → check against `topics/experiment-design.md`'s summary table: power computed pre-launch? horizon committed and respected (peeking)? SRM checked? randomization unit vs. analysis grain? one primary metric or a significance-shopping spread?
- Causal claims without experiments → which design (`topics/causal-inference.md`), or is it `topics/statistical-pitfalls.md` §2 wearing a suit? Run the five-pitfall sweep (mix shift, selection, regression to mean, survivorship) on the headline narratives the dashboards tell.

**Reliability spot-checks** (`topics/dashboard-reliability.md`): data-through
timestamp present and derived from data (not refresh logs)? Freshness SLA and
alerting? Last logic change diffable? Any metric-anomaly detection at all?

## Phase 4 — Estate-scale variant: fan out (replaces solo Phases 2–3 at scale)

Above ~10 surfaces, run the planner/workers/reducer pattern from
`principles/multi-agent-orchestration.md` §3: fixed extraction schema (the spec
fields), workers extract per-surface without judging, one reducer diffs and
ranks. With AI agents, dispatch the `dashboard-reconciliation-scanner` subagent
for the consistency layer; keep Phase 2's deep correctness audit for the top-5
metrics in your own context, because it needs judgment calls the schema can't
carry. Workers report inaccessible logic as gaps, never reconstructions.

## Phase 5 — Prioritized remediation plan (25% of budget)

The deliverable that makes the audit worth its cost. Rank findings by
**(decision blast radius × likelihood the number is materially wrong)** — not by
how interesting the bug is. A subtle fan-out on the exec revenue dashboard
outranks a flagrant pie-chart crime on an intern's sandbox.

Standard shape (BLUF per `topics/stakeholder-communication.md` — the audit is
itself an analysis):

```
1. VERDICT — one paragraph: overall trust level, the 2–3 findings that matter,
   what decisions are currently at risk
2. FIX NOW (this week) — wrong numbers feeding live decisions; each with:
   evidence (the query/row-count proving it), impact estimate, owner, effort
3. FIX SOON (this quarter) — drift pairs, unversioned logic, missing freshness
   alerting: things that will *become* wrong numbers
4. STRUCTURAL — semantic-layer adoption, spec coverage, anomaly detection tiers,
   pruning list (the governance debt behind items 2–3, so leadership sees the
   pattern, not just the leaks)
5. UNVERIFIED RISKS — what the budget didn't cover, so the next audit starts
   where this one stopped
```

Every FIX NOW finding carries its reproduction evidence inline. An audit that
says "revenue may be inflated" gets argued with; one that says "revenue is
inflated 2.3×; here's the row-count query; here's the retry-join causing it"
gets fixed — the difference is the evidence, and it's why Phase 2 records every
check it runs.

---

## Auditor's compressed checklist

| # | Check | Source |
| --- | --- | --- |
| 1 | usage-ranked inventory; logic locations; owners | Phase 1 |
| 2 | fan-out / NULL / timezone / boundary per top metric | `sql-correctness.md` table |
| 3 | spec exists, or drafted-from-SQL with gaps flagged | `metric-design.md` §2 |
| 4 | same-name metrics diffed on six axes | `metric-design.md` §1 |
| 5 | experiment claims: power / peeking / SRM / unit | `experiment-design.md` table |
| 6 | narrative claims: five-pitfall sweep + causal license | `statistical-pitfalls.md`, `causal-inference.md` |
| 7 | freshness / versioning / anomaly detection | `dashboard-reliability.md` table |
| 8 | remediation ranked by blast radius, evidence inline | Phase 5 |
