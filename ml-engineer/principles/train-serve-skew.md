# Train/Serve Skew

**Version 1.0 — 2026-07-06.** Framework-agnostic; examples reference Feast 0.40+ and sklearn 1.6–1.7 where concrete. Standalone. Related: [data-leakage.md](data-leakage.md), [monitoring-and-drift.md](monitoring-and-drift.md), [../topics/feature-stores.md](../topics/feature-stores.md), [../topics/serving-patterns.md](../topics/serving-patterns.md). Callable counterpart: `.claude/skills/train-serve-skew-auditor`.

---

Train/serve skew is any difference between the features (or preprocessing) a model saw at training time and what it sees at serving time. It is leakage's evil twin: leakage makes offline numbers too good; skew makes production quietly worse than offline, and **nothing alarms** — latency is fine, error rate is zero, the model returns confident predictions computed on inputs it was never trained to understand.

The incident that taught me to treat this as a first-class failure class: a ranking model retrained and deployed, offline NDCG up 3%. Three weeks later a PM noticed conversion had drifted down ~5%. Root cause: the training pipeline computed `avg_session_length` in *seconds* from warehouse event data; the serving path computed it in *milliseconds* from the streaming pipeline. The model had learned a threshold at "300" — every production user looked like a marathon session. Three weeks of quiet damage, found only because a human eyeballed a business dashboard. The model-quality monitoring that would have caught it in hours ([monitoring-and-drift.md](monitoring-and-drift.md)) didn't exist.

**The root cause is always the same: two implementations of one definition.** Everything below is a variant of that, and every durable fix is a variant of "make it one implementation."

## Variant 1: Divergent feature computation

**Failure mode.** Training features are computed in batch (SQL/Spark/pandas over the warehouse); serving features are computed in the request path (Java/Go/Python over the operational DB or request payload). Two codebases, two teams, two definitions that drift: different unit conventions, different null handling (`COALESCE(x,0)` vs. propagating null vs. imputing the mean), different string normalization (lowercased in SQL, raw in the service), different rounding, different filter predicates in "the same" aggregate, different timezone handling (warehouse in UTC, service in local time — a `day_of_week` feature skewed for every non-UTC user).

**Detection.**
- **The skew audit (gold standard):** for a sample of real production requests, log the exact serving-time feature vector (see prevention). Recompute the same features through the *training* pipeline for the same entity/timestamp. Join and diff, per feature: match rate, distribution of deltas. Anything under ~99.9% agreement on a feature the model weights heavily is a live incident.
- **Distribution comparison (weaker but no logging needed):** compare per-feature distributions between the last training set and a window of serving traffic — PSI or KS per feature (thresholds in [monitoring-and-drift.md](monitoring-and-drift.md)). Catches gross skew (units, nulls) but not subtle per-row divergence that preserves the marginal distribution.
- **Code audit:** the `train-serve-skew-auditor` skill — align the two implementations feature-by-feature and diff semantics: source, filter, window, unit, null policy, normalization, timezone. Do this whenever you can't yet do the logging-based audit.

**Fix.** Short term: correct the divergent implementation (decide which side is the *definition*; usually training, because the model's weights encode it). Long term: eliminate one of the two implementations —
1. **One shared library:** the same function/transformer computes the feature in both batch training and the serving path. Works when both are Python and latency allows.
2. **Feature store:** define the transformation once; the store materializes to offline (training, point-in-time correct) and online (serving) consistently. See [../topics/feature-stores.md](../topics/feature-stores.md).
3. **Log-and-train:** compute features *only* in the serving path, log the served feature vectors, and train on the logs. Skew becomes structurally impossible for logged features. Costs: you can't backfill new features without a backfill path, and training data accumulates at serving rate. This is the strongest guarantee; use it for your highest-value models.

**Prevention.** Whichever architecture: **log the served feature vector with every prediction** (sampled if volume demands). This single practice enables the skew audit, regression tracing, and drift monitoring simultaneously — if you adopt one thing from this doc, adopt this. Then run the skew audit as a scheduled job with an alert threshold, not a one-off.

## Variant 2: Feature staleness in online serving

**Failure mode.** Online features are precomputed and pushed to a low-latency store on a schedule. Training uses point-in-time-correct values (the value as of the prediction timestamp) — but if the point-in-time join uses *event* time while production serves values that arrive with pipeline latency, training sees fresher data than serving ever will. A feature "purchases_last_1h" materialized every 6 hours is, at serving time, actually "purchases in some 1h window ending 0–6h ago." The model was trained as if freshness were 0 and serves at freshness U(0,6h). Symptom: model performs best right after materialization runs and decays until the next one — a sawtooth in online quality that offline eval never shows.

**Detection.** Log feature *timestamps* alongside values at serving time; plot age-at-serve per feature. Compare against the freshness the training join assumed. Correlate online quality metrics with time-since-materialization — the sawtooth is diagnostic.

**Fix.** Two directions, pick per feature: (a) make serving fresher (stream the feature, shorten the materialization interval); (b) make training *staler* to match reality — do the point-in-time join against the value that would have been *available* at prediction time (event_time + pipeline latency), not the value that had merely occurred. Feast's `ttl` and materialization semantics handle (b) if configured honestly; hand-rolled joins almost never subtract the latency.

**Prevention.** Every online feature declares a freshness SLO (max acceptable age). Monitoring alerts on age > SLO. Training joins use availability time, not event time, as policy. When a feature can be missing/stale at serve time, decide the degradation *at design time* (serve default? drop to a model without that feature?) and train with that degradation represented — the worst version is a serving path that silently imputes 0 for a feature that was never 0 in training.

## Variant 3: Silent schema and semantics drift

**Failure mode.** The contract between upstream producers and your model erodes without anyone breaking an API: an enum gains a value (`payment_type = 'BNPL'`) the encoder maps to UNK or — worse — crashes nothing and hashes to an arbitrary bucket; a column's semantics change (`price` now includes tax); a field becomes nullable; an upstream default changes (missing country now "" instead of null — your null-handling branch stops firing); a renamed column silently fills with nulls through a permissive join. The model keeps predicting. Nobody pages.

Sub-variant that bites deep-learning systems: **preprocessing version skew** — training tokenizes/normalizes/resizes with version X of a library, serving runs version Y. Same code, different dependency pin, different outputs. (Pin preprocessing deps identically across train and serve; better, ship preprocessing *inside* the model artifact — sklearn Pipeline, TorchScript-embedded transforms, or a model-server preprocessing container built from the training image.)

**Detection.** Schema validation at the serving boundary (types, nullability, enum domains, value ranges) — reject or flag, never coerce silently. Distributional monitoring per feature catches semantic drift that schema checks pass ([monitoring-and-drift.md](monitoring-and-drift.md)). Null-rate and UNK-rate per feature are the highest-yield single signals: alert on any step change.

**Fix.** When found: quantify blast radius first (what fraction of traffic, since when — the served-feature log answers this), then correct the contract or the pipeline, then decide whether the model needs retraining on corrected data or the damage was tolerable. Don't just fix the field and move on: predictions made during the skew window may have written bad labels into your next training set (feedback loops — see [monitoring-and-drift.md](monitoring-and-drift.md)).

**Prevention.** A written schema contract per model input (types, domains, null policy, units, owner), validated in CI against training data *and* at runtime against serving traffic — same contract file, two enforcement points; two copies will themselves skew. Enum encoders must have an explicit, monitored UNK path. Upstream teams appear in the contract as owners so schema changes route a notification to you before deploy, not a mystery to you after.

## Decision tree: which architecture prevents skew for you

- Model is **batch-scored only** (predictions written to a table) → compute features and predictions in the same batch job; skew surface is minimal. Don't buy a feature store for this. See [../topics/serving-patterns.md](../topics/serving-patterns.md).
- **Online serving, features from request payload only** → put all preprocessing inside the model artifact (Pipeline/serialized transform). Skew surface: preprocessing version only.
- **Online serving, features need precomputed history** (aggregates, embeddings) → feature store or log-and-train. Feature store when many models share features and you need backfill; log-and-train when one high-value model and you want the hard guarantee.
- **Two languages in the stack** (Python training, JVM/Go serving) → highest-risk configuration. Do not hand-port feature code. Either serve features from a store both sides read, or move serving-path feature computation into a sidecar that runs the training code.

## The audit protocol (what the skill executes)

1. Inventory features the model consumes (from the model artifact/signature, not from docs).
2. For each, locate the training-side and serving-side computation. **A feature with only one locatable implementation is a finding** (either dead in training or hand-duplicated somewhere you haven't found).
3. Diff semantics per feature across: source, filters, window, aggregation, units, null policy, normalization/casing, timezone, rounding/precision, dependency versions.
4. Check the staleness story: materialization schedule vs. training join assumptions.
5. Check the boundary: schema validation present? UNK/null monitored?
6. If served-feature logs exist, run the quantitative diff on a sample — this converts every "maybe" into a number.
7. Report per feature: divergence found, evidence (both file:line references), estimated impact (weight/importance of the feature × magnitude of divergence), fix, prevention gate.

Severity: **CRITICAL** = confirmed value divergence on a top-importance feature (production quality is actively degraded); **HIGH** = staleness materially beyond training assumptions, or no schema validation on an externally-owned input; **MEDIUM** = divergent null/UNK handling, unpinned preprocessing deps; **LOW** = missing freshness SLOs, missing served-feature logging (hygiene, but it's the hygiene that makes every future incident findable).
