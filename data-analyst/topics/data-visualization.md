# Data Visualization: Charts That Don't Lie

**Version 1.0.0 · 2026-07-06 · Core tier — full depth.**
Tool-agnostic; implementation notes for Looker/Tableau in `bi-tools.md`. Standalone
doc. Used by `../guides/build-analysis-from-scratch.md` Phase 5 and by dashboard
audits (`../guides/audit-existing-analytics.md`).

A chart is a claim. Choose the form for **the claim being made**, not for the data
shape you happen to have — that inversion is where most bad charts come from.

---

## 1. Chart type selection — decide by claim, not by data

| The claim | Use | Do NOT use |
| --- | --- | --- |
| "A is bigger than B" (comparison across categories) | horizontal bar, sorted by value | pie (angles compare poorly), radar |
| "It changed over time" (trend) | line | bar-per-day forests; stacked area when individual series matter |
| "These two things move together" (relationship) | scatter (+ fit line only with a stated model) | dual-axis line (see §2) |
| "The distribution matters" (spread/outliers/shape) | histogram, box/violin, ECDF | a single average — the claim IS that the average misleads |
| "Parts of a whole, one snapshot" | stacked bar (≤ ~5 parts), or just a table | pie beyond 3 slices; donut always |
| "Parts of a whole, over time" | stacked area *only if* the total matters most; else small-multiple lines | 100%-stacked area when readers need levels |
| "Exact values matter" (finance, SLAs) | **table**, possibly with inline bars | any chart forcing readers to eyeball pixels |
| "Flow between stages" (funnel) | ordered bar with explicit *rate between stages* labels | funnel-shaped infographics that distort area |

Two rules that outrank the table: **sort categorical axes by value** (alphabetical
order is a random permutation to the reader), and **small multiples beat one busy
chart** whenever there are >4 series — the eye compares aligned panels far better
than tangled lines.

## 2. Misleading axis choices (the classic crimes, and the honest calls)

**Truncated y-axis.** Rule with actual nuance, not dogma:
- **Bars encode value by length → must start at zero.** A bar chart from 95–100 turns a 1% difference into a 5× visual difference. Non-negotiable.
- **Lines encode change by slope → zero-start is not required**, and forcing it can be its own lie (flattening a 3% conversion collapse into an invisible wiggle). Choose a range that makes the *practically meaningful* variation visible, and label the axis clearly.
- Detection heuristic when auditing: does the visual ratio between elements roughly match the numeric ratio? If a 2% difference looks like a doubling, the chart misleads regardless of intent.

**Dual y-axes.** Two series, two independent scales — the intersection point and
relative slopes are pure artifacts of scale choice, and the chart manufactures
correlation. Someone once "showed" marketing spend driving signups with a dual-axis
chart whose scales were chosen to overlap; indexed to a common base (=100 at
period start), the series visibly diverged. **Fix:** index both series to 100, or
use two stacked panels sharing an x-axis. Dual axes are acceptable only for the
same quantity in two units (°C/°F).

**Other recurring crimes:** log scale unlabeled (or labeled but unexplained to a
lay audience); time axis with irregular intervals plotted as regular (M1, M2, M3,
M7 equally spaced); 3-D anything (occludes and distorts); area/bubble charts scaling
*radius* instead of area (a 2× value drawn as 4× ink).

**Prevention (convention):** dashboard style guide states: bars start at zero; line
charts print their y-range; no dual axes; time axes to scale. Auditors then check
conformance instead of relitigating taste.

## 3. When a table beats a chart

Use a table when: readers need **exact values** (they will hover-hunt a chart
otherwise); comparing across **many dimensions at once** (a chart forces one
dimension to "win"); the audience will **look up their own row** (per-region
managers); or there are **< 5 numbers** (a chart adds ceremony, not clarity — put
the number in the sentence).
Make tables readable: right-align numbers, consistent decimals, thousands
separators, bold the column being argued about, sort by it.

## 4. Cognitive load in dashboards

**Failure mode.** The 40-tile dashboard nobody can answer a question from — built
by accreting every stakeholder request, pruned never. Its cost is invisible: people
*feel* informed while each tile gets 0 seconds of attention, and the one anomaly
that mattered sits unread in tile #31.

**Detection.** The five-second test: show the dashboard to its intended user for
five seconds; ask what the message was. No answer → no message. Also: usage stats
(most BI tools expose per-tile/per-view engagement — tiles nobody has viewed in 90
days are candidates for deletion, and `audit-existing-analytics.md` uses this).

**Fix / design rules.**
- **One dashboard, one question.** "How is checkout health?" is a dashboard. "Everything about the product" is a filing cabinet.
- Inverted pyramid: headline KPIs (with comparison and target) top-left → trends middle → diagnostic detail bottom. Top-left is prime real estate; the eye starts there.
- ≤ 9 tiles per screen. More → split into linked dashboards ("overview" + drill-downs).
- Every number needs a comparator (vs. last period, vs. target, vs. forecast). A number without a reference point is trivia.
- Consistent color = consistent meaning across the whole dashboard (one series color per segment everywhere; red reserved for "bad," and if red-vs-green carries meaning, encode it redundantly — ~8% of male viewers are red-green colorblind).

**Prevention.** Dashboard spec (below) reviewed before build; quarterly pruning
pass tied to usage stats; new-tile requests must name the decision they serve
(`metric-design.md` §3).

## 5. The dashboard spec (write before building)

One page, agreed with the owner before any pixels:

```
Audience & cadence:   Growth PM, weekly Monday review
Question answered:    Is checkout converting at target, and if not, which stage broke?
Decisions it feeds:   pause/continue checkout experiments; escalate infra latency
Headline metrics:     checkout_conversion_rate v3 (spec link), p95 checkout latency
Comparators:          WoW, vs. 92% target
Drill dimensions:     platform, payment method  (NOT geo — owner confirmed no geo decisions)
Freshness needed:     T-1 by 09:00 PT (matches metric SLA — see dashboard-reliability.md §2)
Out of scope:         refunds (finance owns), traffic acquisition
```

The "out of scope" line is what keeps the dashboard from becoming the 40-tile
filing cabinet — scope creep arrives one reasonable request at a time.

---

## Failure-mode summary table (for auditors)

| Failure | Detection | Fix | Prevention |
| --- | --- | --- | --- |
| Wrong chart for the claim | state the claim, check §1 table | swap form | claim named in dashboard spec per tile |
| Truncated bar axis / dual axes / scale games | visual ratio ≠ numeric ratio | zero-base bars; index-to-100 instead of dual axes | style-guide conventions, checked in review |
| Chart where table belongs | readers hover-hunting exact values | table with aligned numerals | "exact values needed?" question in spec |
| Overloaded dashboard | 5-second test fails; dead tiles in usage stats | one-question split; prune | spec with out-of-scope line; quarterly prune |
| Numbers without comparators | tile shows a bare number | add period/target reference | spec requires comparator per headline |

**Cross-references:** metric versioning shown on dashboards —
`dashboard-reliability.md` §3; presenting uncertainty visually (CI bands, not
point-only lines) — `stakeholder-communication.md` §2; Looker/Tableau mechanics —
`bi-tools.md`.
