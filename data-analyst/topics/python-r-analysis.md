# Python & R for Analysis — When SQL Isn't Sufficient

**Version 1.0.0 · 2026-07-06 · Extended tier — production patterns + common
pitfalls only** (per KB design; this is not a pandas or tidyverse course).
Applies to: pandas 2.x (copy-on-write semantics default), scipy/statsmodels
current generation, R 4.x + tidyverse. Standalone doc.

---

## 1. The boundary: what leaves SQL, and what never should

Move to Python/R **only** for: statistical tests and modeling beyond warehouse SQL
(regressions, mixed models, survival analysis, power simulations), resampling
(bootstrap CIs, permutation tests), forecasting, and analyses requiring iteration
or simulation. **Aggregation stays in SQL** — pull pre-aggregated or sampled data,
not raw event tables, into a notebook. The anti-pattern to kill on sight:
`pd.read_sql("SELECT * FROM events")` followed by pandas groupbys — slower,
memory-bound, and it silently forks metric logic away from the governed layer
(`dashboard-reliability.md` §1 applies to notebooks too).

**Production pattern for any notebook that feeds a decision** (Principle 6):
parameterized date ranges pinned at the top, `random_state`/`set.seed` set
everywhere randomness exists, environment pinned (lockfile/`renv`), and **Restart &
Run All must succeed before sharing** — hidden notebook state (cells run out of
order, deleted-cell variables still alive) is the #1 source of unreproducible
notebook results, and it's invisible in the shared HTML.

## 2. pandas pitfalls (each returns plausible wrong numbers)

| Pitfall | Mechanism | Detection / fix |
| --- | --- | --- |
| **Merge fan-out** | `merge` on a non-unique key duplicates rows — SQL's §1 bug (`sql-correctness.md`), same silence | always `merge(..., validate="one_to_one" / "one_to_many")` — it raises on violation. This one argument would have prevented every pandas fan-out I've seen. Also compare `len()` before/after. |
| **Silent index alignment** | assigning a Series aligns on *index*, not position — combine frames with unexpected indexes and you get NaNs or misassigned values, no error | `reset_index(drop=True)` before positional operations; prefer `merge` over assignment across frames |
| **NaN semantics ≠ SQL NULL in groupby** | `groupby` **drops NaN group keys by default** (`dropna=True`) — an entire "unknown" segment vanishes from the report | `groupby(col, dropna=False)`; NULL-policy thinking from `sql-correctness.md` §2 applies verbatim |
| **`mean()` etc. skip NaN silently** | `df.col.mean()` is the mean of *non-missing* — denominator quietly shrinks | report missingness (`col.isna().mean()`) alongside any aggregate of a column with NaNs |
| **dtype coercion on load** | `read_csv` guesses: IDs become floats (`1e15` corruption), zip codes lose leading zeros, dates stay strings | explicit `dtype=`/`parse_dates=`; then `df.info()` review as a habit |
| **Chained-assignment ambiguity** | `df[df.x>0]['y'] = 1` historically failed silently on a copy | pandas 2.x copy-on-write makes chained assignment *never* work — use `.loc[mask, 'y'] = 1`; treat any `SettingWithCopy`-era code you inherit as suspect |
| **Timezone-naive datetimes** | naive timestamps compared/joined across sources assume they share a zone; nobody checks | `tz_localize('UTC')` at ingestion; the conventions of `sql-correctness.md` §3 apply |

## 3. Statistical-library pitfalls

- **Student's t vs. Welch:** `scipy.stats.ttest_ind` defaults to `equal_var=True` (Student's). Real metric variances are never equal across arms. **Always `equal_var=False`** (Welch); R's `t.test` already defaults to Welch — a rare case of R protecting you where scipy doesn't.
- **One-sided p-values by accident (or on purpose):** check `alternative=`; a one-sided test chosen after seeing the direction is p-hacking with extra steps (`experiment-design.md` §4).
- **Proportions:** use `statsmodels.stats.proportion` (`proportions_ztest`, `proportion_confint(method="wilson")`) — hand-rolled normal-approximation CIs misbehave at small n or extreme p, exactly where decisions get made.
- **Power:** `statsmodels.stats.power` (`TTestIndPower`, `NormalIndPower`) implements `experiment-design.md` §1 properly — use it instead of the ×16 rule when the decision is close.
- **Regression output ≠ causal estimates:** `statsmodels` will happily fit `outcome ~ treatment + controls` on observational data and print a beautiful coefficient table. The coefficient is causal only under the identification arguments of `causal-inference.md`; the library cannot check that, and its confident formatting is how correlation gets laundered into causation in notebooks.
- **Cluster-robust SEs** for randomization-unit mismatches (`experiment-design.md` §2): `statsmodels` `fit(cov_type="cluster", cov_kwds=...)`; naive SEs on within-user repeated rows are silently overconfident.

## 4. R notes (differences that matter, not a tutorial)

- Tidyverse's grammar makes grain changes *visible* (`group_by → summarise` is explicit), which prevents some pandas-class errors; but `left_join` fans out exactly like SQL/pandas — same row-count discipline; `relationship = "one-to-many"` (dplyr 1.1+) is the `validate=` equivalent. Use it.
- `NA` handling: aggregates return `NA` (not silently skipping) unless `na.rm=TRUE` — R fails louder than pandas here, which is a feature; each `na.rm=TRUE` you type is a NULL-policy decision, make it consciously.
- Factors: `stringsAsFactors` is dead post-4.0, but factor-level traps in modeling (unused levels, alphabetical reference level flipping a coefficient's sign) remain — `relevel` explicitly before regression.
- Prefer R when the statistical method is the point (survival, mixed models, anything where CRAN has the canonical implementation); prefer Python when the analysis glues into engineering systems.

## 5. Minimum reproducibility checklist for a decision-feeding notebook

1. Restart & Run All passes end-to-end. 2. Data pull is a dated, parameterized
query (not a mystery CSV; if a CSV, provenance comment: source, date, rows).
3. Seeds set. 4. Environment lockfile committed. 5. Headline numbers asserted
against a check cell (`assert abs(total - expected) < tol`) — the notebook version
of the spreadsheet check block (`spreadsheet-modeling.md` §4). 6. Notebook lives
in the repo, not in a home directory.

**Cross-references:** SQL-side versions of the same bugs —
`sql-correctness.md` §1–3; test selection and power — `experiment-design.md`;
what a regression coefficient may and may not claim — `causal-inference.md`;
war-story context for why `validate=` matters — `metric-design.md` §1.
