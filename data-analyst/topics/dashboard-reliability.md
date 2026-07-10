# Dashboard Reliability & Metric Governance Infrastructure

**Version 1.0.0 · 2026-07-06 · Core tier — full depth.**
Applies to: any BI stack; semantic-layer mechanics assume Looker-style LookML or
dbt metrics (tool specifics in `bi-tools.md`). Standalone doc. The org-wide audit
built on it is the `dashboard-reconciliation-scanner` subagent.

A dashboard is production software wearing a business-casual costume. Treat its
logic with less rigor than app code and it fails the same ways — silently, at the
worst moment, in front of an executive.

---

## 1. Single source of truth: semantic layer vs. per-dashboard SQL

**Failure mode.** Every dashboard carries its own hand-written SQL for "the same"
metrics. Each copy starts identical; each drifts independently with every fix and
filter tweak. This is the mechanism behind the 14-month WAU disagreement in
`metric-design.md` §1 — copy-paste metric logic is *guaranteed* eventual drift,
the only variable is when.

**Detection.** Inventory where each headline metric's logic physically lives.
Count independent implementations per metric name. Anything > 1 is a reconciliation
waiting to be noticed. (This inventory at scale is exactly the
`dashboard-reconciliation-scanner` subagent's Phase 1.)

**Fix / target architecture.** Metric logic defined **once**, in a
version-controlled semantic layer, consumed by every surface:
- Looker: LookML measures/explores (the model IS the semantic layer);
- dbt metrics / MetricFlow feeding multiple BI tools;
- Tableau: published data sources with the metric logic upstream in dbt — because per-workbook calculated fields are the drift mechanism (see `bi-tools.md` §3).
Ad-hoc/exploratory SQL may bypass the layer (analysts must explore); anything on a
*scheduled, shared* surface may not.

**Prevention.** Rule: a dashboard PR that hand-implements a metric that exists in
the layer gets rejected in review; a metric needed but absent from the layer gets
*added to the layer* (with a `metric-design.md` §2 spec), not inlined. The layer's
repo has code owners.

## 2. Freshness, and the silent-staleness failure

**Failure mode.** Pipeline breaks Friday; dashboard shows Thursday's numbers all
week; nobody notices because the numbers look *plausible* — stale data is always
plausible, that's what makes it dangerous. A team once ran a Monday launch
go/no-go on a dashboard whose upstream had been frozen for four days. (Contrast: a
dashboard that ERRORS is a good dashboard — it's the one that quietly shows old
data that burns you.)

**Detection.** Every dashboard displays its data-through timestamp ("data through
2026-07-05 23:59 PT") sourced from the *data itself* (`MAX(event_date)`), never
from "last refresh ran at" — a refresh that succeeds against a stale upstream
updates the refresh time while the data stays old. That distinction has fooled
multiple teams.

**Fix/prevention.** Freshness SLA per source table (declared in the metric spec,
`metric-design.md` §2); automated check comparing data-through vs. SLA, alerting
the *owning* channel; the dashboard tile shows the timestamp so humans are the
backstop. dbt `source freshness` or equivalent warehouse scheduled check both work.

## 3. Versioning dashboard logic changes

**Failure mode.** A filter tweak or measure edit made live in the BI UI at 4:55 PM
Friday. The number changes; the trend breaks; nobody can answer "what changed and
when?" because BI-tool edit history is (at best) a low-fidelity audit log nobody
reads. The chart's history now lies (`metric-design.md` §4 — drift wears the old
trend line as a disguise).

**Detection.** Ask, for the org's top-10 dashboards: "show me the diff and review
for the last logic change." No diff producible → no governance, whatever the
process doc claims (`core-principles.md` §10: that's the finding).

**Fix/prevention.**
- Logic in files, files in git: LookML natively; Tableau/Power BI via source files or their git-integration features (weaker — see `bi-tools.md`; compensate by pushing logic upstream to dbt where diffing is native).
- Definition changes get PR review by someone who didn't write them — the same peer-review bar as `sql-correctness.md`'s checklist, because dashboard SQL *is* SQL.
- User-visible definition changes get a dashboard annotation at the change date ("v3: bot filter fixed; level −2%") and a version bump in the metric spec.
- Development happens in a dev environment/branch, not live on the production dashboard (Looker: dev mode; Tableau: staging project).

## 4. Anomaly detection on the metrics themselves

**Failure mode.** The pipeline is green, freshness is fine — and the metric is
garbage because an upstream app release broke event logging (double-fire, dropped
platform, renamed event). Infrastructure monitoring cannot see this; only the
*numbers* can.

**Detection tiers (implement in this order — each catches what the previous
misses):**
1. **Volume:** row counts per source per day vs. same-weekday baseline (±3σ or ±30%). Catches total breakage. Cheapest; do this week one.
2. **Metric-level:** headline metrics vs. trailing forecast band (seasonality-aware — same-weekday comparisons at minimum, or STL/Prophet-style bands). Catches the double-fire that *doubles* a rate.
3. **Distribution/segment:** metric by platform/country/version vs. baseline shares. Catches "iOS events silently stopped" while the aggregate wobbles inside its band — the aggregate is the last place breakage shows up.

**Tuning discipline:** alerts route to the metric's *owner* (spec field), not a
channel-of-everyone; every alert gets triaged ack'd-real / ack'd-noise; > ~30%
noise rate means widen bands or fix seasonality handling, because an ignored alert
channel is worse than none — it provides the *feeling* of coverage during exactly
the incident it sleeps through.

**Prevention of the root cause:** event-schema change review that includes
analytics (the app team renaming an event should break a contract test, not a
quarter's trend); daily entity snapshots so history is reconstructable after the
fact (also required by `statistical-pitfalls.md` §5 for survivorship analysis).

---

## Failure-mode summary table (for auditors)

| Failure | Detection | Fix | Prevention |
| --- | --- | --- | --- |
| Per-dashboard copy-paste metric SQL | count implementations per metric name | consolidate into semantic layer | review rule: consume the layer or extend it |
| Silent staleness | data-through (from data, not refresh log) vs. SLA | fix upstream; alert on SLA breach | timestamp tile + automated freshness check |
| Unversioned logic edits | "show me the last change's diff" fails | logic into git; PR review; dev/prod split | annotations + version bump on user-visible changes |
| Broken logging with green pipelines | 3-tier anomaly checks (volume → metric → segment) | fix instrumentation; backfill or annotate the gap | analytics sign-off on event-schema changes |
| Alert fatigue | >30% noise, unacked alerts | widen bands, fix seasonality, route to owners | triage discipline + ownership field in spec |

**Cross-references:** the spec that declares owner/SLA/version —
`metric-design.md` §2; tool-specific mechanics (LookML dev mode, PDT freshness,
Tableau extracts) — `bi-tools.md`; running the full audit —
`../guides/audit-existing-analytics.md`; org-wide implementation sweep —
`dashboard-reconciliation-scanner` subagent.
