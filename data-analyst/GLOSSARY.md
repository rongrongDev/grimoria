# Glossary

**Version 1.0.0 · 2026-07-06.** Single shared vocabulary for the data-analyst KB.
Where a term has a full treatment, the entry links it.

- **A/A test** — an experiment where both arms get the identical experience; used to validate the assignment/analysis pipeline (a "significant" A/A result means the instrument is broken, e.g. SRM).
- **Alpha (α)** — the false-positive rate a test tolerates; 0.05 means 1-in-20 no-effect experiments will still look "significant." Spent per look — hence peeking inflates it (`topics/experiment-design.md` §3).
- **BLUF** — Bottom Line Up Front; answer-first document structure (`topics/stakeholder-communication.md` §1).
- **CUPED** — variance-reduction technique using pre-experiment behavior as a covariate; typically cuts required sample 20–50% (`topics/experiment-design.md` §1).
- **Cohort** — a group defined by a shared entry event/time, followed forward. Valid cohorts condition only on entry-time information (`topics/statistical-pitfalls.md` §3).
- **Confidence interval (CI)** — the range of effect sizes consistent with the data; the decision-relevant output of a test, ahead of the p-value (`topics/experiment-design.md` §7).
- **Delta method** — SE correction for ratio metrics analyzed at a finer grain than randomization (e.g., CTR per user); fixes the unit-of-analysis mismatch (`topics/experiment-design.md` §2).
- **Denominator drift** — two surfaces sharing a numerator but silently differing in population/denominator; the most common metric-disagreement mechanism (`topics/metric-design.md` §1).
- **Difference-in-differences (DiD)** — quasi-experimental design comparing treated vs. control change over time; identified only under parallel trends (`topics/causal-inference.md` §2).
- **Fan-out (join fan-out)** — row duplication from joining across grains, inflating downstream aggregates without error (`topics/sql-correctness.md` §1).
- **Grain** — what one row represents in a table/CTE/result ("one row per user per day"). Most SQL correctness reduces to grain bookkeeping.
- **Guardrail metric** — a metric an experiment or team target must not degrade; the counterweight that makes optimization safe (`topics/metric-design.md` §5).
- **Goodhart's law** — when a measure becomes a target, it ceases to be a good measure; the reason guardrails exist.
- **Half-open interval** — date range `[start, end)`: inclusive start, exclusive end. Tiles without gaps or double-counts; this KB's mandatory convention (`topics/sql-correctness.md` §4).
- **HARKing** — Hypothesizing After Results are Known; presenting a post-hoc finding as if pre-registered (`topics/experiment-design.md` §4).
- **LOD expression** — Tableau's Level-of-Detail calc (`{FIXED ...}`); per-workbook grain logic and its top drift/wrongness source (`topics/bi-tools.md` §3).
- **MDE (minimum detectable effect)** — the smallest true effect a test can reliably detect at its sample size; set from the decision, before launch (`topics/experiment-design.md` §1).
- **Metric spec** — the written contract (population, numerator, denominator, grain, time basis, NULL policy, owner, version) making a metric computable identically by two people (`topics/metric-design.md` §2).
- **North star metric** — the single metric a product org optimizes long-term; legitimate only with chartered counterweight metrics (`topics/metric-design.md` §5).
- **Novelty effect** — transient lift from newness that decays with exposure; diagnosed via day-of-exposure curves (`topics/experiment-design.md` §5).
- **p-hacking** — exercising analytic degrees of freedom after seeing data (metric/segment/window shopping) until significance appears; the umbrella over peeking, HARKing, and multiple comparisons.
- **p-value** — probability of a result at least this extreme if the true effect were zero. Not the probability the effect is real; translate before presenting (`topics/stakeholder-communication.md` §3).
- **Parallel trends** — DiD's load-bearing assumption: treated and control would have moved alike absent treatment; falsified via pre-trend plots (`topics/causal-inference.md` §2).
- **PDT** — Looker persisted derived table; precomputed rollup with its own staleness failure mode (`topics/bi-tools.md` §2).
- **Peeking** — reading a fixed-horizon test's decision metric before its committed end and stopping on significance; inflates false positives severalfold (`topics/experiment-design.md` §3).
- **Power** — probability a test detects a true effect of the assumed size; 0.80 standard. Computed before launch or not meaningfully at all (`topics/experiment-design.md` §1).
- **Pre-registration** — committing hypotheses, primary metric, n, and horizon before data exists; the structural antidote to p-hacking.
- **Randomization unit** — the entity randomly assigned (user/session/request/cluster); must match or dominate the analysis unit (`topics/experiment-design.md` §2).
- **Regression discontinuity (RDD)** — causal design exploiting a sharp assignment threshold; local estimate, killed by threshold gaming (`topics/causal-inference.md` §3).
- **Regression to the mean** — extremes on noisy metrics drift back on remeasurement; mimics treatment effects in selected-because-extreme groups (`topics/statistical-pitfalls.md` §4).
- **Semantic layer** — the single version-controlled home of metric logic (LookML, dbt metrics) consumed by all surfaces; the structural fix for drift (`topics/dashboard-reliability.md` §1).
- **Simpson's paradox** — a relationship reversing between subgroup and aggregate views due to mix shift (`topics/statistical-pitfalls.md` §1).
- **SRM (sample-ratio mismatch)** — observed arm sizes deviating from the designed split beyond chance; means assignment/logging is broken and all results are suspect (`topics/experiment-design.md` §6).
- **Survivorship bias** — analyzing only entities that survived to be observed; requires snapshots to defeat (`topics/statistical-pitfalls.md` §5).
- **Symmetric aggregates** — Looker's SQL generation preventing fan-out inflation in joined explores; dependent on correct `primary_key` declarations (`topics/bi-tools.md` §2).
- **Type M error (winner's curse)** — conditional on significance in an underpowered test, the estimated effect is inflated; why underpowered "wins" shrink at rollout (`topics/experiment-design.md` §1).
- **Vanity metric** — a number that can only rise and feeds no decision (cumulative anything); test: "can it go down? what decision moves?" (`topics/metric-design.md` §3).
- **Welch's t-test** — t-test without the equal-variances assumption; this KB's default over Student's (`topics/python-r-analysis.md` §3).
