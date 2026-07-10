# Spreadsheet-Level Modeling (Quick Analysis, Not a Warehouse Substitute)

**Version 1.0.0 · 2026-07-06 · Core tier — full depth.**
Applies to: Google Sheets and Excel (365 generation — dynamic arrays, XLOOKUP,
LAMBDA available). Standalone doc.

Spreadsheets are the most-used and least-reviewed analytical tool in any company.
The judgment this doc encodes: **when a spreadsheet is the right tool, how to build
one that survives contact with other people, and the tripwires that tell you it
should have been SQL.**

---

## 1. When a spreadsheet is the right call — and the exit tripwires

**Right tool when:** one-off sizing/sanity math; small-N analysis (< ~50K rows)
where the data arrives as a file; scenario models with human-input assumptions
(pricing, headcount, forecasts) where stakeholders need to turn the knobs
themselves; the collaboration surface *is* the deliverable (finance will live in
this file).

**Wrong tool — move to warehouse + BI (this KB's other docs) when any of these
trip:**
- It gets **refreshed on a schedule** by a human pasting new data (that's a pipeline, done badly, with a human as the cron job);
- Two+ people quote **numbers from different tabs/copies** ("final_v3 (2).xlsx" is `metric-design.md` §1's drift story in miniature);
- It **feeds another spreadsheet** (spreadsheet-to-spreadsheet lineage is undebuggable);
- Row counts approach six figures or formulas span-recalculate for minutes (correctness follows performance down: people paste-as-values to speed it up, freezing stale numbers).

The failure pattern behind most spreadsheet disasters isn't a formula error — it's
a spreadsheet that *outgrew* these tripwires and nobody called it.

## 2. Structure: the discipline that makes spreadsheets auditable

**Failure mode.** The organic spreadsheet: inputs, hardcoded constants, formulas,
and outputs interleaved across one tab; a "quick fix" number typed *over* a formula
in one cell of a column (breaking the column's integrity invisibly — the single
most common spreadsheet corruption); nobody can tell what's assumption vs.
calculation vs. answer.

**The three-layer rule (fix + prevention in one):**
- **Inputs tab(s):** raw data pastes and assumption cells, visually marked (classic convention: blue text/shaded = human-editable), each assumption with source + date ("CAC $42 — finance email 2026-06-12").
- **Calc tab(s):** formulas only. **Zero hardcoded constants** — every number in a formula is a reference to an input cell. `=B4*1.08` is a bug even when 1.08 is right, because the 8% lives nowhere visible and will silently survive the assumption changing.
- **Output tab:** the presentation layer; references calc cells; charts live here.

**Detection when auditing someone else's file:** Excel `Formulas → Show Formulas`
plus "trace precedents" on headline cells; Google Sheets: `Ctrl+`` `. Scan calc
areas for cells containing *values* where neighbors contain formulas — the
typed-over-formula scar. Grep formulas for embedded numeric literals.

## 3. The formula-level pitfalls that produce wrong numbers

| Failure | Mechanism | Fix / prevention |
| --- | --- | --- |
| **VLOOKUP approximate-match default** | omitting the 4th arg defaults to approximate match: on unsorted data returns *wrong rows without erroring* — the spreadsheet twin of SQL's silent fan-out | ban bare VLOOKUP; use **XLOOKUP** (exact by default, explicit `if_not_found`) or INDEX/MATCH with `0` |
| **Lookup misses masked by blanket IFERROR** | `IFERROR(lookup, 0)` turns "key not found" (a data problem you needed to see) into a silent zero in a SUM | let misses error, or use XLOOKUP's `if_not_found` with a *loud* sentinel (`"MISSING"`) and a count-of-missing check cell |
| **Fixed-range formulas going stale** | `SUM(B2:B500)` when data grew to row 650 — undercounts silently forever | full-column ranges, Excel **Tables** (structured references auto-expand), or dynamic arrays |
| **Silent type coercion** | numbers stored as text sum to 0 without error; CSV dates parsed as MDY vs. DMY; the famous case: gene names (SEPT2, MARCH1) auto-converted to dates in enough published papers that the genes were *renamed* | on any import: `ISTEXT` check column, explicit column-type import dialog, count-of-parsed-rows vs. source |
| **Hidden rows/filtered data in aggregates** | `SUM` includes rows a filter is hiding; the visible table and the total disagree | `SUBTOTAL`/`AGGREGATE` when totals should track visibility — and a comment saying which behavior was chosen |
| **Copy-paste formula drift** | one cell in a formula column edited "just this once"; column no longer means one thing | three-layer rule; audit scan from §2; Sheets/Excel "protect range" on calc tabs |

## 4. Reproducibility (Principle 6 applies to spreadsheets too)

A decision-feeding spreadsheet meets the same bar as a decision-feeding query
(`../principles/core-principles.md` §6):
- **Data provenance cell** on every input tab: source system, query link if extracted (paste the SQL in a note), extraction date, row count *at extraction* (so staleness and truncation are both checkable later).
- **Version discipline:** one canonical cloud copy with revision history (Sheets/365), not emailed copies — the moment two copies fork, you've built the two-dashboards problem (`metric-design.md` §1) with worse tooling.
- **Check block** in a corner of the output tab: input row count vs. expected, sum-of-parts vs. total, count of lookup misses, and a deliberately red cell if any check fails. Spreadsheets don't have CI; the check block is the poor analyst's test suite, and it has caught more paste-truncation errors than any review.

## 5. Scenario modeling (the thing spreadsheets are genuinely best at)

Pattern for assumption-driven models (pricing, capacity, forecast):
- Assumption cells: named ranges (`churn_rate`, not `$B$4`) — formulas become readable (`=customers*churn_rate`) and moving the input cell doesn't break references. (Named-range discipline also mitigates the hardcode temptation: naming a constant makes referencing it easier than retyping it.)
- Scenario switching: a scenarios table (base/bull/bear as columns) + one selector cell + INDEX to pull the active column — beats N copies of the model tab, which fork exactly like dashboard SQL copies.
- **Sensitivity before presenting:** a data table (Excel What-If, or manual two-var grid) showing the output across the plausible range of the 2 most uncertain inputs. If the decision flips inside that range, *that finding* — "this comes down to whether churn is 2% or 3%" — is the deliverable, and it feeds straight into the honest-uncertainty framing of `stakeholder-communication.md` §2.

---

## Failure-mode summary table (for auditors)

| Failure | Detection | Fix | Prevention |
| --- | --- | --- | --- |
| Outgrown spreadsheet acting as a pipeline | human-refresh cadence; version forks; feeds other sheets | migrate to warehouse + governed dashboard | §1 tripwires reviewed quarterly for any decision-feeding sheet |
| Hardcodes & typed-over formulas | Show Formulas scan; literal-grep | rebuild on three-layer rule | input marking convention; protected calc ranges |
| Wrong lookups (VLOOKUP default, IFERROR masking) | spot-check known keys; count-miss cell | XLOOKUP exact + loud sentinels | ban bare VLOOKUP in team convention |
| Stale ranges / coerced types | check block (row counts, ISTEXT) | Tables/dynamic arrays; explicit import types | check block standard on every model |
| Unreproducible one-copy-per-inbox model | "which file is canonical?" has no answer | single cloud copy, provenance cells | version discipline in §4 |

**Cross-references:** when the data should have been queried instead —
`sql-correctness.md`; the drift mechanics spreadsheets share with dashboards —
`metric-design.md` §4; presenting scenario/sensitivity results —
`stakeholder-communication.md`.
