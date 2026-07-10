# Causal Inference Beyond A/B Tests

**Version 1.0.0 · 2026-07-06 · Extended tier — production patterns + common
pitfalls only.** This doc makes you a competent *consumer and first-line producer*
of quasi-experimental estimates; methods at the research frontier (synthetic
control variants, staggered-DiD estimators) get a "know it exists, get review"
treatment. Standalone doc. Prerequisite mindset: `statistical-pitfalls.md` §2
(correlation vs. causation) — this doc is what to do *after* you've admitted the
correlation isn't enough.

---

## 1. First: do you actually need this? (decision tree)

```
Causal question, can you randomize?
├─ YES, even partially / on a subset / via encouragement
│    → RANDOMIZE. experiment-design.md. Every method below is strictly worse.
│      ("We can't randomize" usually means "randomizing is annoying." Push twice:
│       holdouts, staged rollouts, and encouragement designs cover most "can't"s.)
├─ NO — policy hit everyone at once, at a known time
│    → §2 Diff-in-diff (needs an untreated comparison group)
│    → no comparison group at all → interrupted time series; weakest; label as such
├─ NO — treatment assigned by a threshold on a running variable (score ≥ X gets it)
│    → §3 Regression discontinuity
├─ NO — treatment self-selected, no threshold, no timing discontinuity
│    → §4 matching/regression adjustment — HONESTY TIER, not identification:
│      adjusts only for what you measured; say "selection on observables" out loud
└─ The stakes are high (pricing, market entry, anything board-level)
     → whatever method: pre-register the design, get a second analyst to attack it
       (multi-agent version: principles/multi-agent-orchestration.md §2)
```

The one-sentence discipline for every method here: **name the assumption that
substitutes for randomization, and show the strongest available test of it.** No
named assumption → it's `statistical-pitfalls.md` §2 with extra math.

## 2. Difference-in-differences (DiD)

**Use when:** a change hit one group (region, platform, cohort) at a known time,
another comparable group was untouched, and you have outcome data for both, before
and after. Estimate = (treated after − treated before) − (control after − control
before): the control group's change stands in for what would have happened to the
treated group anyway.

**The load-bearing assumption — parallel trends:** absent treatment, both groups
would have moved the same. Untestable directly; the mandatory falsification check
is **pre-trends**: plot both series for a long window before treatment. Diverging
before treatment → the design is dead; do not proceed to the regression.

**Production pattern:** event-study plot (per-period estimates relative to
treatment date) rather than a single pooled estimate — it shows pre-trends,
effect onset, and decay in one figure, and it's the figure reviewers should demand.

**Pitfalls that produce wrong-sign decisions:**
- **Treatment timing chosen *because of* the outcome** ("we launched the retention fix where churn was spiking") → regression to the mean masquerades as treatment effect (`statistical-pitfalls.md` §4). Ask *why then, why there* before trusting any DiD.
- **Staggered rollouts with two-way fixed effects:** when units adopt at different times and effects vary, the classic TWFE regression secretly uses already-treated units as controls and can flip the estimated sign. Know-it-exists tier: modern estimators (Callaway–Sant'Anna and kin) fix this — if your rollout is staggered, get methods review rather than running `outcome ~ treated*post + unit + time`.
- **Contaminated control** (spillovers: the control region's users heard about the promo) → effect underestimated; argue no-spillover explicitly.

## 3. Regression discontinuity (RDD)

**Use when:** treatment switches at a sharp threshold of a running variable —
credit score ≥ 700 gets the offer, spend ≥ $100 gets free shipping, signup before
a date gets grandfathered pricing. Units just above vs. just below the cutoff are
as-good-as-randomized *locally*.

**Production pattern:** the RDD plot (binned outcome means vs. running variable,
fit on each side) is the analysis; if the jump isn't visible in that plot, no
regression specification should convince anyone. Use local-linear fits with a
data-driven bandwidth and show the estimate is stable across bandwidths.

**Pitfalls:**
- **Manipulation of the running variable:** if people can game the threshold (sales reps nudging deals over $100K to hit the incentive), the two sides differ by *savviness*, not just treatment. Detection: histogram of the running variable — bunching just above the cutoff kills the design (formally the McCrary density test; the histogram usually tells you first).
- **Other things changing at the same cutoff** (the $100 threshold also triggers a different email) → you're estimating the bundle, not the treatment. Enumerate everything keyed to the threshold.
- **Overreaching the estimate:** RDD identifies the effect *at the cutoff*, for marginal units. "Free shipping lifts spend 12% (for customers near $100)" does not license "roll it out to everyone" arithmetic — say the localness in the deliverable.

## 4. Matching / regression adjustment — the honesty tier

Propensity scores, nearest-neighbor matching, and regression with controls all do
the same thing: compare treated and untreated units that look similar **on the
variables you measured**. None of them touch selection on unobservables — the
motivated-user problem from `statistical-pitfalls.md` §2 survives every covariate
you add. Valid uses: shrinking obvious composition differences and bounding
("even after matching on tenure, plan, and usage, X-adopters retain 8pp better —
some of which is still selection"). Invalid use: "we controlled for everything, so
it's causal." Nobody has ever controlled for everything; several teams have
shipped roadmaps believing they did.

**Production pattern if used:** show covariate balance before/after matching, and
run a **negative-control outcome** (something the treatment cannot plausibly
affect — e.g., pre-period behavior, or an unrelated metric). A "significant
effect" on the negative control measures your residual selection bias directly,
and it is the single most persuasive honesty check for stakeholders.

## 5. Reporting quasi-experimental results

The deliverable states, in one block: the method; **the assumption in plain
language** ("this is causal only if Region B would have trended like Region A");
the falsification checks run and their results (pre-trends plot, density test,
negative control); and a confidence label one notch weaker than an equivalent RCT
would earn. The `analysis-narrative-drafter` subagent requires this block for any
causal claim without randomization; the causal-verbs language rule
(`statistical-pitfalls.md` §2) applies with the method named as the license.

---

## Failure-mode summary table (for auditors)

| Failure | Detection | Fix | Prevention |
| --- | --- | --- | --- |
| DiD with diverging pre-trends | event-study plot pre-period | different control group or no DiD | pre-trends plot mandatory in readout |
| DiD where treatment timed on the outcome | ask "why there, why then" | model the selection or abandon | regression-to-mean check in review |
| Staggered TWFE sign flips | rollout is staggered + effects plausibly dynamic | modern staggered estimators + methods review | flag "staggered?" in design intake |
| RDD with bunching at cutoff | running-variable histogram | abandon or redesign threshold | density check mandatory |
| Matching sold as identification | "controlled for everything" language | relabel as descriptive + negative control | causal-verbs rule; §5 reporting block |
| Local RDD estimate globalized | extrapolation beyond cutoff in the deliverable | state localness; separate rollout analysis | narrative-drafter checks scope of claims |

**Cross-references:** when you *can* randomize — `experiment-design.md`; the
underlying selection traps — `statistical-pitfalls.md`; adversarial review of
high-stakes causal claims — `../principles/multi-agent-orchestration.md` §2;
phrasing the weaker confidence honestly — `stakeholder-communication.md` §2.
