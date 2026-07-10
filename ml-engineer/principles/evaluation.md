# Evaluation Judgment

**Version 1.0 — 2026-07-06.** Framework-agnostic; examples verified against scikit-learn 1.6–1.7 and scipy 1.14+. Standalone. Related: [data-leakage.md](data-leakage.md) (contamination invalidates everything here), [monitoring-and-drift.md](monitoring-and-drift.md) (online continuation of this doc), [training-and-reproducibility.md](training-and-reproducibility.md) (hyperparameter-search overfitting). Callable counterpart: `.claude/skills/eval-protocol-reviewer`.

---

Evaluation is where ML projects are actually won or lost, because the eval *is* the objective as far as your optimization loop is concerned — the model, the hyperparameter search, and the team all optimize whatever number you print. Print the wrong number and everything downstream optimizes the wrong thing with great efficiency.

## 1. Metric–objective alignment: measure what the business loses

**Failure mode.** The metric is chosen for convenience (accuracy, because it's the default) rather than derived from the decision the model drives. Canonical disasters: accuracy on 1%-positive fraud data (the constant "not fraud" model scores 99%); optimizing AUC for a system that only ever acts on the top 100 scores per day (AUC averages over thresholds you'll never use — precision@100 is the real objective); RMSE on demand forecasts where under-forecasting costs 10× over-forecasting (symmetric loss, asymmetric business); clickthrough for a feed where clicks and long-term retention diverge (you will get exactly the clickbait you measured).

**Detection.** Ask three questions of any eval setup; a wobble on any of them is the finding:
1. *What decision does a prediction drive, at what threshold/volume?* The metric must be computed at that operating point.
2. *What does a false positive cost vs. a false negative, in money or user harm?* If the costs differ >2× and the metric is symmetric, the metric is wrong.
3. *If the model gamed this metric perfectly, would the business be happy?* (The clickbait test.)

**Fix.** Derive the metric from the decision: acting on top-K → precision/recall@K; thresholded binary action with asymmetric costs → expected cost at the deployed threshold (write the cost matrix down, get the product owner to sign it); ranking → NDCG@K at the K users actually see; probabilities consumed downstream (pricing, bidding) → calibration (reliability curves, ECE) *in addition to* discrimination — an AUC 0.85 model with garbage calibration will lose money in a bidding system to an AUC 0.82 model that's calibrated.

**Prevention.** Every model has a one-page eval spec: decision driven, operating point, primary metric (one!), guardrail metrics, cost assumptions, slice list. The primary metric is chosen *before* modeling begins and changed only with a written note — post-hoc metric shopping ("it's better on F1 if not AUC") is the eval version of p-hacking.

**Slices are not optional.** Aggregate metrics hide segment failures: a recommender +2% overall and −15% for new users is a new-user incident wearing a success costume. The eval spec names the slices that matter (new vs. tenured entities, geography, platform, head vs. tail, and any fairness-relevant groups), and the eval report shows every slice, every run.

## 2. Split design: match the split to the data's dependence structure

The split must simulate the deployment gap between training and prediction. Random splitting assumes i.i.d. rows; production data almost never is. Full leakage mechanics in [data-leakage.md](data-leakage.md) §2/§4 — this section is the decision procedure.

**Decision tree:**
- Predictions are about the **future** (forecasting, churn, fraud, anything retrained and deployed forward in time) → **time-based split.** Train on [t0, t1), validate on [t1, t2), test on [t2, t3). No shuffling. For model selection with more data, walk-forward/expanding-window CV (`TimeSeriesSplit` is the sklearn primitive, but mind gap/embargo below).
- Production scores **entities never seen in training** (new users, new patients, new devices) → **group split** on that entity (`GroupKFold`, `GroupShuffleSplit`).
- Both (usually true) → group split *within* time split: train on old users' old data, test on new users' new data. Yes, this shrinks your test set. The alternative is a number that's wrong.
- Truly i.i.d. rows, no entity reuse, no time structure (rare: single-shot experiments, some vision benchmarks) → random split is fine. Stratify on the label if it's imbalanced.

**Time-split subtleties that bite:**
- **Gap/embargo:** if features use trailing windows (e.g., 7-day aggregates), a validation row 1 day after the train boundary shares 6 days of window with training rows. Leave a gap ≥ the longest feature window between splits (`TimeSeriesSplit(gap=...)`).
- **One time split tells you about one period.** A model validated only on December will be evaluated on seasonality you didn't sample. Walk-forward across several folds; report the spread, not just the mean — the fold variance *is* your uncertainty about temporal generalization.
- **Retraining cadence realism:** if production retrains weekly on data up to T and serves T→T+7, your eval should train up to T and test on T→T+7 — not train on everything and test on a random 20%.

**Detection (reviewing an existing setup).** Find the split call. Ask: does the data have timestamps? entity keys with repeats? If yes to either and the split is `train_test_split(shuffle=True)` with no groups, the reported numbers are optimistic — demonstrate by re-running with the correct split; the delta is the finding.

**Prevention.** Split policy lives in the dataset contract, implemented once in the shared harness. Every eval report states the split policy in its header. CI gate: assert zero group overlap and correct time ordering between split boundaries on every run.

## 3. Offline–online correlation: the improvement that wasn't

**Failure mode.** Offline metric up, online metric flat or down. I've watched a +4% offline NDCG ranker lose its A/B test three times running. Causes, in the order I look for them:
1. **Contamination/leakage** in the offline eval ([data-leakage.md](data-leakage.md)) — the offline gain was never real.
2. **Off-policy evaluation on on-policy logs:** your training/eval data was generated *under the old model's decisions*. A ranker is evaluated on clicks for items the old ranker chose to show; your new model's preferred items have no labels. Offline eval can only measure agreement with logged outcomes, which structurally favors models similar to the incumbent — and mismeasures genuinely different ones in both directions.
3. **Metric mismatch** (§1) — offline metric isn't the online objective.
4. **Skew** — the offline eval used training-pipeline features; online uses the serving path ([train-serve-skew.md](train-serve-skew.md)).
5. **Feedback/ecosystem effects:** the model changes user behavior, inventory, or adversary behavior in ways a frozen dataset can't represent (fraud models teach fraudsters; recommenders shift what gets created).

**Detection.** Maintain a scatter of offline-delta vs. online-delta across your last N launches (you need the discipline of recording both). If the correlation is weak, your offline eval is a random-number generator with a dashboard — stop tuning against it and fix it before shipping anything else "validated" on it.

**Fix/prevention.** Offline eval gates *what's worth testing online*; the A/B test decides *what ships*. Never let an offline number alone ship a model whose decisions feed back into its data. For ranking/recsys, reduce the off-policy gap: log propensities and use IPS/DR estimators where feasible, or at minimum evaluate on randomized-exploration traffic slices. Keep a small always-on exploration budget (even 1% random-ranked traffic) — it's the price of trustworthy offline evals next quarter. And when offline says +4% and online says 0: **believe online**, then go find which of the five causes above ate the 4%.

## 4. Statistical significance: is the difference real?

**Failure mode.** Model B beats model A by 0.3% AUC on one test set with one seed, and ships. Retrain A with a different seed; it "beats" B by 0.2%. You are reading tea leaves. Deep-learning seed variance alone is commonly ±0.5–1% on many tasks — anything inside that band is noise unless proven otherwise.

**Detection.** Ask of any claimed improvement: (a) across how many seeds/folds? (b) what's the variance of the *baseline* under retraining (the A/A comparison)? (c) is the delta big relative to that? If nobody knows (b), nobody knows anything.

**Fix — the practical toolkit:**
- **Establish the noise floor first:** train the incumbent 3–5× with different seeds; the spread of its metric is your minimum detectable difference. Cheap, brutal, clarifying.
- **Paired comparisons on the same test set:** models are evaluated on the same rows, so use paired tests — bootstrap the *per-row difference* (resample test rows with replacement, compute Δmetric per resample, read the 95% CI; ship only if it excludes zero). Paired bootstrap is my default: metric-agnostic, honest, 20 lines of numpy.
- **Correlated rows** (groups, time): block bootstrap by group/time-unit, or your CI will be falsely tight — resampling correlated rows as if independent understates variance, sometimes badly.
- **Multiple comparisons:** if you evaluated 20 variants and report the best, the winner's edge is inflated (winner's curse). Either hold out a *confirmation set* the winner is scored on exactly once, or correct (Bonferroni is crude but honest at these scales).
- **Practical vs. statistical significance:** with a huge test set, a +0.05% that's "significant" may not cover the retraining-complexity cost of the new model. The eval spec's job (§1) is to say what delta is worth shipping.

**Prevention.** The eval harness computes CIs by default — a metric without an interval doesn't appear in reports. Model-comparison decisions are recorded with: metric ± CI, n seeds, test-set version hash, split policy. (The hash matters: comparing numbers computed on different test-set versions is the quietest way to fool yourself; see [mlops-and-versioning.md](mlops-and-versioning.md).)

## 5. The evaluation-review protocol (what the skill executes)

1. Locate the eval spec (or note its absence — that's finding #1). Establish decision, operating point, claimed metric.
2. Metric–objective check (§1's three questions), including calibration if probabilities are consumed downstream, and the slice list.
3. Split audit (§2 decision tree vs. actual data structure; gap/embargo; policy persistence).
4. Contamination sweep — run [data-leakage.md](data-leakage.md) protocol steps 3–5.
5. Significance audit (§4: noise floor known? paired CIs? confirmation set for multi-variant selection?).
6. Offline–online linkage: is there a record correlating past offline deltas with online outcomes? Is there an A/B path and does anything ship without it?
7. Report findings ordered by "how wrong could the currently-believed numbers be," each with evidence, fix, and the prevention gate.

The one-sentence version of this whole doc: **an evaluation is a simulation of deployment — every place the simulation is easier than deployment (shuffled time, seen entities, leaked stats, incumbent-generated labels, single seeds) is a place your number is a lie of exactly that size.**
