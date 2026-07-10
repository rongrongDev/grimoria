# Data Leakage

**Version 1.0 — 2026-07-06.** Framework-agnostic; code examples verified against scikit-learn 1.6–1.7 and pandas 2.x. Standalone: readable without any other doc. Related: [train-serve-skew.md](train-serve-skew.md), [evaluation.md](evaluation.md), [../topics/sklearn-pipelines.md](../topics/sklearn-pipelines.md). Callable counterparts: `.claude/skills/data-leakage-scanner` (review a bounded pipeline), `.claude/agents/ml-repo-leakage-scanner` (whole-repo sweep).

---

Data leakage is information from outside the legitimate training scope — the future, the test set, or the label itself — reaching the model during training. It is the single most expensive failure class in ML because it fails in one direction only: **your offline metrics get better while your production model gets worse or stays useless.** Every incentive in the room (yours, your reviewer's, your manager's) points toward believing the improved number. I have never once seen leakage make a model look worse.

The defining war story: a churn model whose AUC jumped from 0.74 to 0.91 when someone added `days_since_last_support_ticket`. Shipped. Production performance was indistinguishable from the old model. The feature was computed from a warehouse table that included tickets filed *after* the churn event — customers cancel, then file a ticket to get a refund. The model had learned to read the label off the future. It took three weeks to notice, because offline dashboards kept saying 0.91.

**The operating rule:** any offline improvement larger than you can explain is leakage until proven otherwise. Celebrate after the investigation, not before.

## The four leakage classes

### 1. Target leakage — features computed using future or label-derived information

**Failure mode.** A feature encodes information that will not exist at prediction time, usually because it was computed from data timestamped *after* the prediction point, or from a column causally downstream of the label. Classic offenders: aggregates over a window that extends past the prediction timestamp (`total_purchases` computed over the customer's full history including post-churn), status fields mutated by the outcome (`account_status = 'closed'` predicting churn), and joins to slowly-updated dimension tables that were overwritten after the event.

**Detection.**
- **Single-feature ablation:** train on each feature alone. Any single feature that gets you >90% of full-model performance is a suspect, not a triumph.
- **Feature importance smell test:** if the top feature's importance dwarfs everything else (e.g., >5× the second feature in gain), read its lineage before believing it.
- **Timestamp audit:** for every feature, answer "what is the latest event timestamp that can influence this value, relative to the prediction timestamp?" If you can't answer from the code, that's the finding.
- **Too-good check:** compare against a published or historical baseline for the problem class. Churn AUC 0.95 on tabular features is not skill; it's a leak.

**Fix.** Recompute the feature with an explicit *point-in-time* constraint: every aggregate, join, and lookup takes `as_of_timestamp` and filters `event_time < as_of_timestamp` (strictly less, and subtract your data-arrival latency — see [train-serve-skew.md](train-serve-skew.md) §feature-staleness). If the source table is mutable-in-place (dimension tables that get overwritten), you cannot fix the feature without a snapshot/history table; say so and build one.

**Prevention.**
- Every feature definition carries a declared time semantics: source event-time column, window, and as-of behavior. A feature without a timestamp story doesn't merge.
- Training-set construction goes through one shared point-in-time join utility (a feature store's `get_historical_features` — see [../topics/feature-stores.md](../topics/feature-stores.md) — or your own single audited function). Ban ad-hoc pandas merges onto the label frame in modeling code.
- CI gate: a test that builds features for a synthetic entity whose only events occur *after* the as-of time, and asserts every feature comes back null/default. This one test has caught more leaks for me than any review.

### 2. Train/test contamination — test rows influencing training

**Failure mode.** Test-set rows (or near-duplicates of them) appear in training. Sources: random split after upsampling/augmentation (augmented copies of a test image land in train), deduplication skipped (the same document scraped twice), retraining pipelines that regenerate the split each run with a different seed so yesterday's test rows are today's train rows, and "peeking" pipelines where the test set was used for early stopping or model selection and then reported as the final number.

**Detection.**
- Hash-based overlap check: exact-match join between train and test on the raw input (or a normalized hash). Should be zero; run it, don't assume it.
- Near-duplicate check for text/images: embedding or MinHash similarity between test and train; inspect the top-similarity pairs by hand.
- Split stability check: re-run the pipeline and diff the test-set row IDs against the previous run. If they differ, your split is not fixed and every historical comparison is contaminated.

**Fix.** Split by a *stable key* (row ID hashing: `hash(id) % 100 < 80`), split **before** any augmentation/upsampling/dedup-sensitive step, and persist the split assignment as data (a column or a manifest file), not as a seed you hope stays constant.

**Prevention.** The split manifest is a versioned artifact (see [mlops-and-versioning.md](mlops-and-versioning.md)). CI asserts train∩test = ∅ on IDs *and* on content hashes on every training run. Early stopping and model selection use validation, never test; the test set is read by exactly one code path, once, at the end.

### 3. Preprocessing leakage — fitting transforms on the full dataset before splitting

**Failure mode.** Scalers, imputers, target encoders, PCA, vocabulary/vectorizer fitting, or feature selection run on train+test combined, then the data is split. The test set's statistics (means, category frequencies, selected features) leak into training. Impact ranges from a quiet 1–2% optimism (StandardScaler) to catastrophic (target encoding fit on all rows — the encoder has literally seen the test labels; supervised feature selection on all rows is the classic "my 10,000-gene classifier is perfect" bug).

**Detection.** Read the code in order: does any `.fit`, `.fit_transform`, groupby-aggregate-onto-self, or `SelectKBest` execute before the split? In notebooks, check cell execution order too — the code order lies. Quantitative check: refit the exact pipeline with preprocessing inside a `Pipeline` under cross-validation; if the score drops, the gap was leakage.

**Fix.** All fitted transforms go inside an sklearn `Pipeline` (or equivalent) so that `cross_val_score`/`fit` on train can never see test rows. Target encoding additionally needs out-of-fold fitting *within* train (`TargetEncoder` in sklearn ≥1.3 does this internally; hand-rolled groupby-mean does not). Concrete patterns: [../topics/sklearn-pipelines.md](../topics/sklearn-pipelines.md).

**Prevention.** Code-review rule you can enforce mechanically: **no `.fit` call outside a Pipeline object in modeling code.** Lint for `fit_transform` on a variable that is later split. The `data-leakage-scanner` skill encodes this review.

### 4. Group leakage — the same entity on both sides of the split

**Failure mode.** Rows are split randomly but are not independent: multiple sessions per user, multiple images per patient, multiple transactions per account, overlapping time windows per sensor. The model memorizes the entity, not the pattern. The published example is medical imaging models that "diagnose" by recognizing the patient (or the scanner); mine was a fraud model with 0.98 validation AUC that memorized account-level behavior and dropped to 0.71 on accounts it had never seen — which is what production is made of.

**Detection.** For every candidate grouping key (user, patient, device, account, document source), compute train/test overlap on that key. Then the decisive experiment: re-evaluate with `GroupKFold`/`GroupShuffleSplit` on that key and compare. The gap between random-split and group-split scores is the memorization you were counting as skill.

**Fix.** Split on the entity that will be *novel at prediction time*. Decision rule: **if production will score entities the model never trained on, the split must group by that entity. If production scores known entities on new events, split by time instead (and both — GroupKFold within a time split — when both are true).** Time-series structure additionally requires time-ordered splits; see [evaluation.md](evaluation.md) §splitting.

**Prevention.** The dataset contract (schema + docs) declares the grouping key(s) and the split policy as metadata. The training harness reads the split policy from the contract rather than letting each experiment choose. CI asserts zero group overlap between splits on every run.

## The leakage review protocol (what the skill executes)

When reviewing any pipeline for leakage, walk these in order — each step feeds the next:

1. **Establish the prediction point.** What does the model know, and when? One sentence: "At time T, for entity E, using data with arrival latency L." If the team can't state this, stop — every other answer is undefined.
2. **Trace each feature backward** to source tables/events. For each: latest event-time that can influence it vs. T. Flag anything unbounded or label-downstream.
3. **Find the split.** What key, what policy, where in the code order, is it persisted? Check against the grouping and time structure of the data.
4. **Find every `.fit`** and place it relative to the split.
5. **Run the cheap detectors:** ID/content-hash overlap, single-feature ablation on the top-importance feature, group-split re-evaluation if a grouping key exists.
6. Report per finding: class (1–4), evidence (file:line + the data fact), blast radius (how optimistic is the current metric likely to be), fix, and the CI gate that prevents recurrence.

## Severity calibration

- **CRITICAL:** target leakage or test-label exposure (target encoding on full data, selection on full data). The reported metric is fiction; treat the model as unevaluated.
- **HIGH:** group leakage where production entities are novel; unstable split across retrains.
- **MEDIUM:** unsupervised preprocessing leakage (scaler/imputer on full data) — real but usually small optimism; fix via Pipeline and re-report.
- **LOW:** hygiene findings (split not persisted as manifest, missing CI gates) with no current evidence of contamination.

One closing instinct to install: leakage is not a bug you fix once. Every new feature, every new data source, every "quick backfill" reopens the question. That's why the prevention items are all *structural* (one join utility, fits inside pipelines, split as versioned artifact, CI overlap gates) — structure survives staff turnover; vigilance doesn't.
