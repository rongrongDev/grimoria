# Sample-Size Reference (α = 0.05 two-sided, power = 0.80, two equal arms)

**Version 1.0.0 · 2026-07-06.** Supporting file for `experiment-design-reviewer`.
Derivation and judgment: `data-analyst/topics/experiment-design.md` §1.

## Proportion metrics — required n PER ARM

Formula: `n ≈ 16 · p(1−p) / MDE²` (MDE absolute, in proportion units).
Rows: baseline rate p. Columns: absolute MDE.

| baseline p | 0.25pp | 0.5pp | 1pp | 2pp | 5pp |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1% | 253,000 | 63,400 | 15,800 | 4,000 | 630 |
| 2% | 502,000 | 125,000 | 31,400 | 7,800 | 1,250 |
| 5% | 1,216,000 | 304,000 | 76,000 | 19,000 | 3,040 |
| 10% | 2,304,000 | 576,000 | 144,000 | 36,000 | 5,760 |
| 20% | 4,096,000 | 1,024,000 | 256,000 | 64,000 | 10,240 |
| 50% | 6,400,000 | 1,600,000 | 400,000 | 100,000 | 16,000 |

Reading example: baseline conversion 5%, want to detect an absolute lift of
0.5pp (i.e., 5.0% → 5.5%, a 10% relative lift) → ≈ **304,000 users per arm**.

## Mean (continuous) metrics — required n PER ARM

Formula: `n ≈ 16 · σ² / MDE²`, or with effect in std-dev units d = MDE/σ:
`n ≈ 16 / d²`.

| effect size d (in σ) | n per arm |
| ---: | ---: |
| 0.01 | 160,000 |
| 0.02 | 40,000 |
| 0.05 | 6,400 |
| 0.10 | 1,600 |
| 0.20 | 400 |

Warning that saves readouts: revenue-per-user metrics have enormous σ (heavy
tails); d = 0.01–0.05 is the realistic range, so revenue tests need far more
sample than conversion tests on the same traffic. Winsorize/cap outliers by a
**pre-registered** rule, or use a proportion proxy (purchase rate) as primary.

## Adjustments

- **Power 0.90** instead of 0.80: multiply n by ~1.34 (constant 21 instead of 16).
- **α = 0.01**: multiply by ~1.49.
- **Unequal split k:1**: total sample must rise; per the smaller arm, multiply its n by (1+k)/(2√k) approximately — a 90/10 split needs ~2.8× the total of a 50/50 for equal power. Don't accept 95/5 "safety" splits without redoing the math.
- **CUPED / covariate adjustment**: multiply n by (1 − ρ²), ρ = correlation of pre-period covariate with the metric; ρ = 0.5 → 25% saving; ρ = 0.7 → ~50%. Requires pre-period data for the same units.
- **Exact recomputation** when the decision is close: `statsmodels.stats.power` (see `data-analyst/topics/python-r-analysis.md` §3) — the ×16 rule is within ~2% for proportions near the table's range but degrades at p < 1% or extreme MDEs.

Always evaluate n at the **exposure point** (users who reach the treated surface),
not total traffic — dilution is the most common reason a "sufficiently powered"
test wasn't.
