# Feature Stores: Concepts + Feast in Practice

**Version 1.0 — 2026-07-06. Concepts are tool-agnostic; concrete examples verified against Feast 0.40+ (APIs move fast in Feast — re-verify signatures on upgrade).** Core tier. Standalone. Related principles: [../principles/train-serve-skew.md](../principles/train-serve-skew.md) (the problem this tool exists to solve), [../principles/data-leakage.md](../principles/data-leakage.md) §1 (point-in-time correctness).

---

A feature store is two promises wrapped in infrastructure: **(1) training and serving read the same feature definition** (kills skew variant 1), and **(2) training-set construction is point-in-time correct** (kills target leakage via the as-of join). Everything else — registries, UIs, materialization scheduling — is supporting cast. Evaluate any feature-store adoption, or any incumbent deployment, against whether those two promises are actually being kept, because both are easy to configure into falsehood.

## 1. Do you need one? (decision tree, before any tool talk)

- Model is **batch-scored** → no. Features and predictions in the same job; a store adds latency-serving machinery you don't use ([../principles/deployment-and-serving.md](../principles/deployment-and-serving.md) §1).
- Online model, features **from the request payload only** → no. Preprocessing inside the model artifact.
- Online model needing **precomputed/historical features** (aggregates, embeddings), single model, small team → maybe not: the *log-and-train* pattern ([../principles/train-serve-skew.md](../principles/train-serve-skew.md) §1 fix 3) gives a stronger skew guarantee with less infrastructure. Feature stores earn their complexity when features are **shared across models/teams** or you need **backfill of new features against history** (log-and-train's weakness).
- Multiple online models, shared entities (user/item features reused), two-language stack, backfill needs → yes, and the alternative is accreting a bespoke worse one.

A feature store is a *distributed system you now operate*: offline store, online store, materialization jobs, registry. Adopting one to avoid writing a point-in-time join and then under-operating it trades a correctness problem for a reliability problem. Budget the operations or don't adopt.

## 2. The core mechanics (Feast vocabulary, transferable concepts)

- **Entity:** the join key (user_id, item_id). **FeatureView:** a group of features from one source, with an owner and a **`ttl`**. **Offline store:** the warehouse-side history (BigQuery/Snowflake/parquet). **Online store:** the low-latency copy (Redis/DynamoDB/SQLite-for-dev). **Materialization:** the scheduled copy from offline→online.
- **Training path:** `store.get_historical_features(entity_df, features)` — entity_df carries `(entity_id, event_timestamp)` rows (your labeled examples with their *prediction timestamps*); Feast performs the as-of join: for each row, the latest feature value with `feature_timestamp <= event_timestamp` and within `ttl`. **This join is the leakage-prevention mechanism** — every training set built through it inherits point-in-time correctness *for the timestamps you supplied*.
- **Serving path:** `store.get_online_features(features, entity_rows)` reads the online store — whatever was last materialized.

## 3. Where the two promises get broken anyway (the audit list)

Each of these is a real finding from real deployments; the tool prevents nothing if configured against itself.

- **Wrong `event_timestamp` in the entity_df = leakage through the front door.** The timestamp must be the *prediction* time, not the label time, not `now()`, not the row's ETL load time. A churn training set built with `event_timestamp = churn_date` asks "what did we know at the moment of churn" — target leakage, delivered by the leakage-prevention tool. Review every `get_historical_features` call site for where its entity_df timestamps come from ([../principles/data-leakage.md](../principles/data-leakage.md) §1 detection).
- **Event-time vs. availability-time = staleness skew.** The offline store records when events *happened*; the online store serves what has *arrived and materialized*. If materialization runs every 6h, training-time joins see data serving never had ([../principles/train-serve-skew.md](../principles/train-serve-skew.md) §2, in full). Mitigations: honest `ttl` per FeatureView, materialization frequency matching the freshness the training join implies, or shifting entity_df timestamps back by the pipeline latency. Audit question: "what is the max feature age serving can observe, and does the training join reproduce it?" Silence = finding.
- **Transformations done outside the store's definitions.** Teams register *raw* features in Feast, then transform them in training code (and re-transform, differently, in the service) — reintroducing skew variant 1 *behind* the tool that was bought to kill it. Rule: the feature as registered is the feature as consumed; transformations live in the FeatureView pipeline (or on-demand transforms — see below), never on both banks of the store.
- **On-demand/request-time transforms** (Feast `OnDemandFeatureView`): run in both the historical and online paths from one definition — the right home for request-derived features. Caveat: they execute *your Python* in the serving path — latency-test them, and pin their deps in the serving image (preprocessing-version skew, [../principles/train-serve-skew.md](../principles/train-serve-skew.md) §3).
- **Materialization silently stalled = the online store serves fossils.** The job fails Tuesday; Redis keeps answering with Monday's values; nothing errors (values within `ttl` are "valid"). Monitor *feature freshness at serve time* (age percentiles per FeatureView vs. its SLO — [../principles/monitoring-and-drift.md](../principles/monitoring-and-drift.md) §2 layer 1) and alert on materialization job failure directly. `ttl` expiry behavior — Feast returns nulls/None past TTL — must be a *handled, monitored* path in the model's degradation ladder, not a surprise ([../principles/deployment-and-serving.md](../principles/deployment-and-serving.md) §5).
- **Registry drift:** feature definitions changed in-place (same name, new semantics) breaks every model trained on the old meaning — the rollback-compatibility violation of [../principles/deployment-and-serving.md](../principles/deployment-and-serving.md) §3, feature-store edition. Feature changes are additive (new name/version suffix), consumers migrate, old definitions removed only after the last consuming model exits its rollback window. Model→FeatureView dependencies belong in the model registry record ([../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md) §1) so this check is mechanical.

## 4. Minimal sound Feast deployment (the shape, not a tutorial)

- Definitions in a git repo (`feature_repo/`), `feast apply` only from CI — the registry is deploy-gated like any production config; hand-`apply` from laptops is the registry-bypass anti-pattern.
- Per-FeatureView: declared owner, freshness SLO comment, `ttl` set to honest staleness tolerance (not `ttl=0`/infinite because a tutorial did).
- Offline store = your warehouse; online store = managed Redis/DynamoDB; materialization on a scheduler *with alerting* (the stalled-materialization failure above).
- Two CI tests from [../principles/testing-ml-systems.md](../principles/testing-ml-systems.md): the point-in-time test (§1 — entity with only-future events yields nulls through `get_historical_features`) and the golden-prediction seam test (§4 — offline features vs. `get_online_features` for fixture entities after a test materialization; this catches offline/online store type coercion drift, a quietly common Feast gotcha with timestamps and int/float columns).
- Prediction logs still record the *served* feature vector ([../principles/train-serve-skew.md](../principles/train-serve-skew.md) §1 prevention) — the store reduces skew probability; the log is how you *verify* it's working, and stores don't exempt you.

## 5. Build-vs-buy honesty

Hand-rolling the two promises = one audited point-in-time join function (a competent data engineer, a week, plus tests) and a materialization job to Redis with freshness monitoring. That's genuinely enough for 1–3 models with stable features, and it's *less* system than Feast. What you can't cheaply hand-roll: cross-team feature discovery/reuse, backfills at scale, on-demand transforms running identically in both paths. Adopt the tool when you have the sharing problem, not the moment you have the skew problem — the skew problem has cheaper cures at small scale (this doc §1; [../principles/train-serve-skew.md](../principles/train-serve-skew.md) decision tree).
