# BI Tools: Looker (deep), Tableau (key differences), Power BI (extended tier)

**Version 1.0.0 · 2026-07-06.**
Coverage tiers per the KB design: **Looker = core tier, full depth** (chosen as the
primary family because its LookML model is the cleanest teaching example of
semantic-layer governance); **Tableau = key differences** from the Looker mental
model; **Power BI = extended tier** (production patterns + common pitfalls only).
Applies to: Looker as of 2026 (LookML-first, Git-integrated), Tableau 2024.x+,
Power BI current-generation (DAX/VertiPaq, Fabric-era). Standalone doc.

---

## 1. The mental model that transfers across all three

Every BI tool answers three questions; where each tool answers them determines its
failure modes:
1. **Where does metric logic live?** (semantic model vs. per-report)
2. **When does the query run?** (live vs. extract/import/cache)
3. **What stops a user from building a wrong aggregate?** (guardrails vs. hope)

Looker centralizes (1) aggressively — its classic failure is a broken *model*
poisoning everything at once. Tableau/Power BI historically decentralize (1) —
their classic failure is per-report drift (`metric-design.md` §4). Neither failure
is better; they need different audits.

## 2. Looker — core tier, full depth

### The parts that matter
- **LookML models/views/explores** are the semantic layer (`dashboard-reliability.md` §1) — dimensions and measures defined once, in files, in Git. This is Looker's whole governance advantage: *definition changes are diffs*, reviewable and blame-able.
- **Explores** define the allowed join paths. Users self-serve within an explore; they cannot invent a join. This is guardrail (3): fan-out risk is confined to the explore author instead of every user.
- **Symmetric aggregates**: when an explore joins 1:N, Looker generates `SUM DISTINCT`-style SQL so measures from the "one" side don't inflate (`sql-correctness.md` §1's bug, solved at the layer). **Limits you must know:** it only protects *Looker-generated* queries — SQL Runner queries, `derived_table` SQL you write, and anything downstream of a raw SQL block get no protection; and it requires a correct `primary_key` declaration on each view. **A wrong `primary_key` silently re-enables fan-out while everyone assumes the guardrail is on** — that non-unique-PK case is the first thing the `metric-definition-auditor` skill checks in LookML.
- **PDTs / aggregate awareness** (persisted derived tables): precomputed rollups with rebuild schedules. Failure mode: PDT rebuild fails or lags → dashboard serves stale rollup while raw explores are fresh → *two Looker surfaces disagree with each other*. Detection: `datagroup`/trigger status in admin panel; prevention: PDT freshness monitored under the same SLA regime as source tables (`dashboard-reliability.md` §2).

### Looker failure → detection → fix → prevention

| Failure | Detection | Fix | Prevention |
| --- | --- | --- | --- |
| Wrong/missing `primary_key` → silent fan-out despite symmetric aggregates | uniqueness test on the PK column vs. the view's grain | correct the PK; re-verify affected measures | dbt uniqueness test on every view's declared key; PR checklist |
| Explore joins added without cardinality thought | compare explore SQL row counts pre/post join (§1 of sql-correctness) | restructure join or pre-aggregate in a derived table | cardinality comment required on every `join:` block |
| PDT staleness diverging from live explores | datagroup trigger history; cross-check PDT vs. live query | fix trigger; rebuild | PDT freshness alerts |
| Model bloat (one giant explore, 400 fields) | field usage stats (System Activity) | split explores by question; hide internal fields | explore-per-question convention; quarterly field pruning |
| Dev-mode changes pushed without review | Git history shows direct-to-main commits | enforce PR flow on the LookML repo | branch protection; CODEOWNERS |

### System Activity is your audit instrument
Looker's own usage metadata (query history, field usage, dashboard views) powers:
dead-tile pruning (`data-visualization.md` §4), "which dashboards actually get
used" in audits, and the `dashboard-reconciliation-scanner` subagent's scoping
pass. Learn it before your first audit; it turns opinions into inventory.

## 3. Tableau — the key differences if you think in Looker

| Dimension | Looker | Tableau — and the trap |
| --- | --- | --- |
| Logic home | LookML, central, in Git | **Workbook-centric**: calculated fields live per-workbook by default → every workbook is a drift site. Governance = pushing logic upstream (published data sources, or better, dbt) and treating workbook calcs as presentation-only. |
| Version control | native Git | file-based (.twb/.twbx); diffs are XML archaeology. Compensate: keep logic upstream where diffs are real. |
| Fan-out guardrail | symmetric aggregates | **none by default** — a 1:N relationship in a physical join duplicates rows exactly as raw SQL does. Tableau's *relationships* (logical layer, 2020.2+) defer joins per-viz and largely avoid it — prefer relationships over physical joins; audit any workbook still on physical joins. |
| Aggregation control | measures defined in model | **LOD expressions** (`{FIXED [User] : ...}`) — powerful and the #1 source of per-workbook wrong numbers, because each author re-derives grain logic by hand. An audit greps every LOD for grain assumptions. |
| Freshness | live + PDT schedules | **extracts**: fast, and silently stale if refresh fails or was never scheduled. Every extract-based dashboard needs the data-through timestamp from `dashboard-reliability.md` §2 — refresh-succeeded is not data-fresh. |

Bottom line for auditors: in Looker you audit *the model*; in Tableau you audit
*every workbook* (which is why the fan-out pattern in
`../principles/multi-agent-orchestration.md` §3 exists).

## 4. Power BI — extended tier: production patterns + common pitfalls

**Production patterns that hold up:**
- **Star schema is not optional.** VertiPaq and DAX assume dimension→fact stars; flat wide tables and snowflaked chains both produce wrong-filter surprises and slow models. Model first, DAX second.
- **Measures, not calculated columns**, for anything aggregable: measures evaluate in filter context at query time (correct under any slicer); calculated columns are frozen at refresh and bloat the model. Calculated columns are for row-level categorization only.
- **Shared semantic models** (published datasets) + thin report files = the semantic-layer pattern (`dashboard-reliability.md` §1). One dataset, many reports. Per-report imports of the same source = the Tableau drift trap with different branding.
- Version control via PBIP (project format, text-based) checked into Git — recent-generation feature; use it, the .pbix binary alternative is undiffable.

**The pitfalls that actually burn people:**

| Pitfall | Mechanism | Detection / prevention |
| --- | --- | --- |
| **Filter-context misunderstanding** | a DAX measure returns "wrong" totals because the total row evaluates in its own filter context, not as sum-of-visible-rows (classic with ratio measures) | test every ratio measure at total level vs. hand-sum; pattern: `SUMX` over the grain, not ratio-of-sums, when the business wants the sum of row ratios |
| **Bidirectional relationships** | enabling both-directions filtering to "make a slicer work" creates ambiguous filter paths → non-deterministic-looking numbers and circular dependency errors later | ban by default; use measure-level `CROSSFILTER` for the specific need |
| **`CALCULATE` filter overwrite** | `CALCULATE(x, T[col]=v)` *replaces* existing filter on that column rather than intersecting — numbers ignore the user's slicer and nobody notices | code review rule: `KEEPFILTERS` unless overwrite is documented intent |
| **Auto date/time tables** | hidden per-column date tables bloat the model and mask the need for a proper calendar dimension | disable the setting; one marked date table |
| **Import-mode staleness** | same as Tableau extracts: refresh fails, report serves old data confidently | data-through card on every report page (`dashboard-reliability.md` §2) |

## 5. Choosing between them (the honest one-paragraph version)

If governance and metric consistency dominate (they usually do at >20 dashboard
scale), Looker's model-first design fights drift for you. If exploration
flexibility and viz craft dominate, Tableau is stronger and you compensate with
upstream dbt governance. Power BI wins on Microsoft-stack integration and cost, and
its shared-dataset + PBIP patterns close most of the governance gap *if actually
enforced*. All three fail identically when metric logic is copy-pasted per surface
— tool choice never substitutes for the governance rules in
`dashboard-reliability.md`.

**Cross-references:** the drift these tools do/don't prevent —
`metric-design.md` §4; freshness and versioning regimes —
`dashboard-reliability.md` §2–3; auditing a live estate —
`../guides/audit-existing-analytics.md` and the `dashboard-reconciliation-scanner`
subagent.
