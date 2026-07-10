# Changelog — data-analyst knowledge base

All notable changes to this KB. Format: date · version · what and why.
Rule (from `topics/metric-design.md` §4, applied to ourselves): content changes
that alter guidance get an entry; typo fixes don't.

## 1.0.0 — 2026-07-06

Initial complete release. Authored as a principal-analyst brain-dump for use
without the author.

**Added**
- `DESIGN.md` — primitive-assignment rationale (docs vs. skills vs. subagents).
- `principles/core-principles.md` — the ten core judgments.
- `principles/multi-agent-orchestration.md` — validity-gate pipeline, audit fan-out, relay failure modes.
- Core-tier topics (full failure→detection→fix→prevention depth):
  `sql-correctness`, `experiment-design`, `statistical-pitfalls`,
  `metric-design`, `data-visualization`, `stakeholder-communication`,
  `dashboard-reliability`, `bi-tools` (Looker deep / Tableau deltas),
  `spreadsheet-modeling`.
- Extended-tier topics (production patterns + pitfalls):
  `python-r-analysis`, `causal-inference`, Power BI section of `bi-tools`.
- Guides: `build-analysis-from-scratch` (Capability A),
  `audit-existing-analytics` (Capability B, time-budgeted).
- Skills: `experiment-design-reviewer` (+ `power-reference.md` lookup table),
  `metric-definition-auditor`.
- Subagents: `dashboard-reconciliation-scanner`, `analysis-narrative-drafter`.
- `README.md` 30-second router, `GLOSSARY.md` (36 terms).

**Conventions established in this release**
- Half-open date intervals mandatory; temporal `BETWEEN` banned in review.
- Metric spec (`metric-design.md` §2) required before any dashboard ship.
- Causal verbs require an identified design (language rule).
- Fixed-horizon experiments with pre-launch power calc as the default methodology;
  sequential methods allowed only when pre-registered.
- Version/date stamp + applies-to line in every doc header.

**Maintenance notes for successors**
- When a tool generation shifts (new Looker modeling language features, pandas 3.x,
  Power BI/Fabric changes), update the affected doc's applies-to line and add an
  entry here — stale version stamps are this KB's own metric-drift risk.
- New war stories replace weaker examples; don't accumulate. One story per lesson,
  referenced by name (current named stories: "the +4% that wasn't",
  "the 14-month WAU disagreement", "the retry-join revenue inflation").
