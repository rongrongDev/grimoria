# Data Analyst Knowledge Base

**Version 1.0.0 · 2026-07-06.** The distilled judgment of a principal data
analyst — written to be used without its author, by human analysts at any level
and by AI models invoking the skills/subagents. Structure rationale:
[DESIGN.md](DESIGN.md). Terms: [GLOSSARY.md](GLOSSARY.md). History:
[CHANGELOG.md](CHANGELOG.md).

## Find what you need in 30 seconds

**"I have a business question and a blank page"** →
[guides/build-analysis-from-scratch.md](guides/build-analysis-from-scratch.md)
— the end-to-end path (question → metric → SQL → design → uncertainty → deck).

**"I inherited dashboards/metrics and don't trust them"** →
[guides/audit-existing-analytics.md](guides/audit-existing-analytics.md)
— the time-budgeted audit + remediation-plan procedure.

**"Two dashboards disagree on the same metric"** → the six-axis diff in
[topics/metric-design.md](topics/metric-design.md) §1; at estate scale, dispatch
the `dashboard-reconciliation-scanner` subagent.

**"We're about to launch an A/B test"** → invoke the
`experiment-design-reviewer` skill (pre-launch gate);
background in [topics/experiment-design.md](topics/experiment-design.md).

**"Is this metric's SQL right?"** → invoke the `metric-definition-auditor`
skill; background in [topics/sql-correctness.md](topics/sql-correctness.md).

**"Turn this finished analysis into an exec doc"** → dispatch the
`analysis-narrative-drafter` subagent (after validation, never before);
rules in [topics/stakeholder-communication.md](topics/stakeholder-communication.md).

**"My number moved / looks wrong and I don't know why"** → detection tables at
the bottom of every topic doc; start with
[topics/sql-correctness.md](topics/sql-correctness.md) (mechanical causes) then
[topics/statistical-pitfalls.md](topics/statistical-pitfalls.md) (statistical causes).

## Map

### Principles (read these first; everything else applies them)
| Doc | What it carries |
| --- | --- |
| [principles/core-principles.md](principles/core-principles.md) | The ten judgments: decisions-not-numbers, denominators, row counts, pre-registration, honest uncertainty, reproducibility, guardrails, causal discipline, gaps-are-findings |
| [principles/multi-agent-orchestration.md](principles/multi-agent-orchestration.md) | When to split analytics work across agents: validity gates, audit fan-out, and the failure modes (confidence laundering, parallel metric forks) |

### Topics — core tier (full depth: failure → detection → fix → prevention)
| Doc | Covers |
| --- | --- |
| [topics/sql-correctness.md](topics/sql-correctness.md) | Join fan-out, NULL traps, timezone bugs, date off-by-ones, window idioms, big-table discipline |
| [topics/experiment-design.md](topics/experiment-design.md) | Power before launch, randomization units, peeking, multiple comparisons, novelty, SRM, guardrails |
| [topics/statistical-pitfalls.md](topics/statistical-pitfalls.md) | Simpson's paradox, correlation≠causation, cohort selection bias, regression to the mean, survivorship |
| [topics/metric-design.md](topics/metric-design.md) | The metric-spec contract, definition drift, vanity vs. decision metrics, choosing guardrails |
| [topics/data-visualization.md](topics/data-visualization.md) | Chart-by-claim selection, axis honesty, tables vs. charts, dashboard cognitive load, the dashboard spec |
| [topics/stakeholder-communication.md](topics/stakeholder-communication.md) | BLUF, uncertainty without uselessness, p-value translation, pushback on number-shopping |
| [topics/dashboard-reliability.md](topics/dashboard-reliability.md) | Semantic layer as single source of truth, freshness, versioned logic, metric anomaly detection |
| [topics/bi-tools.md](topics/bi-tools.md) | Looker in depth; Tableau's key differences; Power BI (extended tier) |
| [topics/spreadsheet-modeling.md](topics/spreadsheet-modeling.md) | When spreadsheets are right, the three-layer structure, lookup/type traps, scenario modeling |

### Topics — extended tier (production patterns + pitfalls)
| Doc | Covers |
| --- | --- |
| [topics/python-r-analysis.md](topics/python-r-analysis.md) | The SQL/notebook boundary, pandas silent failures, scipy/statsmodels traps, R deltas, notebook reproducibility |
| [topics/causal-inference.md](topics/causal-inference.md) | Method decision tree, diff-in-diff, regression discontinuity, matching-as-honesty-tier, reporting rules |

### Callables (`.claude/`, repo root)
| Name | Kind | One-line trigger |
| --- | --- | --- |
| `experiment-design-reviewer` | Skill | A/B test plan exists, not yet launched → launch/fix/block verdict (+ sample-size lookup table) |
| `metric-definition-auditor` | Skill | One metric's SQL/definition needs a correctness verdict with evidence queries |
| `dashboard-reconciliation-scanner` | Subagent | Many surfaces, same metric name, disagreeing numbers → isolated estate scan, verdict returns |
| `analysis-narrative-drafter` | Subagent | Validated analysis → stakeholder document with enforced uncertainty hygiene |

## Reading paths

- **New analyst, week one:** core-principles → sql-correctness → metric-design → build-analysis-from-scratch. Then the rest as work demands them.
- **Senior analyst inheriting an estate:** audit-existing-analytics → dashboard-reliability → bi-tools → metric-design.
- **AI model with one task:** the router above names your entry point; every doc is standalone with explicit links — read the entry doc plus its direct links only.
