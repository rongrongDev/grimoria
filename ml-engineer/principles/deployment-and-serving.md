# Deployment & Serving

**Version 1.0 — 2026-07-06.** Framework-agnostic patterns; concrete mechanics in [../topics/serving-patterns.md](../topics/serving-patterns.md). Standalone. Related: [train-serve-skew.md](train-serve-skew.md), [monitoring-and-drift.md](monitoring-and-drift.md), [mlops-and-versioning.md](mlops-and-versioning.md).

---

Deployment is where a model stops being a file and starts being a liability. The judgment in this doc exists because models fail differently from services: a bad service throws errors; a bad model returns confident, well-formed, wrong answers at 200 OK. Every pattern below is shaped by that asymmetry.

## 1. Batch vs. online: the first and biggest decision

**Failure mode.** Teams build online serving by default — a FastAPI wrapper, a deployment, an on-call rotation — for a model whose consumers would have been perfectly served by a nightly table. Now they own latency SLOs, feature freshness, autoscaling, and train/serve skew surface ([train-serve-skew.md](train-serve-skew.md)) for nothing. The reverse failure exists too (batch-scoring users who churned an hour ago) but is rarer and more visible.

**Decision tree:**
- Can predictions be computed **before they're needed** — is the entity set enumerable (all customers, all SKUs) and is input data that's hours old acceptable? → **Batch.** Score on a schedule, write to a table/cache, serve lookups. You inherit warehouse reliability instead of building service reliability. This is the right answer more often than it feels.
- Prediction requires **request-time information** (the query, the current cart, this session's context) → **Online.** No choice.
- Entity set enumerable but predictions must reflect **recent events** (recommendations that update after each click) → hybrid: batch-compute the heavy parts (embeddings, candidate sets), online-compute the light request-time part. Most production recsys land here ([../topics/recommender-systems.md](../topics/recommender-systems.md)).
- **Asynchronous** consumers (fraud review queues, content moderation) → streaming/near-real-time scoring off a queue; you get online freshness without request-path latency coupling.

Full tradeoff table and implementation patterns: [../topics/serving-patterns.md](../topics/serving-patterns.md).

## 2. Latency budgets for online inference

**Failure mode.** "The model takes 40ms" — measured as mean, on a warm GPU, batch size 32, without feature fetching. Production is p99, cold caches, batch size 1, plus 15ms of feature-store reads, plus serialization. The service ships, the downstream caller's 100ms budget blows, and the *caller* implements a timeout that silently drops your predictions — I've seen a fraud model "in production" that was actually being timed-out on 30% of requests, and the fallback (`approve`) was the fraud.

**The discipline:**
- Budget end-to-end and itemize: network + auth + feature fetch + preprocessing + model forward + postprocessing + serialization. The model forward is often the *minority* of the p99.
- Measure p99 (and p99.9 if the caller retries), batch-size-1, production hardware, concurrent load. Nothing else is a measurement; it's marketing.
- **Know the timeout-fallback path.** What does the caller do when you're slow — default score? cached score? fail open/closed? That fallback is part of your model's behavior in production; design it, log its firing rate, alert on it.
- Cheapest wins first: (1) don't fetch features you can precompute; (2) cache aggressively where staleness allows; (3) quantize/distill/ONNX-export the model; (4) dynamic batching (server-side micro-batching, e.g. in Triton/TorchServe) if concurrency is high; (5) GPU only when arithmetic intensity justifies it — a 5ms-CPU tabular model on a GPU is a cost bug, not an optimization.

## 3. Versioning and rollback: the model is data + code + artifact

**Failure mode.** "Roll back the model" means redeploying an older container — but the older model reads feature v1 and the feature pipeline moved to v2 last week; or the older artifact was overwritten in place ("model_latest.pkl"); or nobody knows which artifact was live last Tuesday when the metrics regressed. Rollback that hasn't been rehearsed is a plan to improvise during an incident.

**The rules:**
- **Immutable, identified artifacts.** Every deployable model has a registry version ([mlops-and-versioning.md](mlops-and-versioning.md)) binding: weights, preprocessing, feature list + versions, training-data snapshot ID, eval report. Nothing named `latest` or `final` is deployable.
- **Every prediction logs its model version.** Non-negotiable — it's the join key for every regression investigation you'll ever run ([monitoring-and-drift.md](monitoring-and-drift.md), and the `pipeline-regression-tracer` agent depends on it).
- **Rollback compatibility window:** a model is only rollback-safe while its feature dependencies still exist. Feature pipeline changes must keep serving the previous model's features until that model exits the window (expand/contract, applied to features). If model vN+1 needs feature changes, ship features first (additive), model second, remove old features third — three deploys, not one.
- **Rehearse:** roll back in staging on every release, or quarterly in production during business hours. The first rollback you ever attempt should not be during the incident.

## 4. Shadow, canary, and progressive delivery — for models specifically

Standard progressive delivery assumes you can tell good from bad quickly. Models break that assumption: the failure signal may be a quality metric with days of label latency. Choose the pattern by *how fast you can detect badness*:

- **Shadow deployment:** new model scores real traffic; predictions logged, not acted on. Detects: crashes, latency, schema errors, prediction-distribution shifts vs. incumbent (compare score distributions per slice — large unexplained divergence is a stop signal even without labels). Cannot detect: business-outcome quality (its predictions don't act, so no outcome labels for *its* decisions — the off-policy problem, [evaluation.md](evaluation.md) §3). Shadow is your integration test against reality; run every model through at least a short shadow phase. Cost: 2× inference.
- **Canary:** N% of traffic gets the new model, with **entity-sticky assignment** (a user flip-flopping between models can be worse than either) and automated rollback triggers on the *fast* signals: error rate, latency, prediction-distribution guardrails (score mean/percentiles within bands, null/UNK feature rates), and downstream fast proxies (acceptance rate, immediate CTR). Quality metrics with label latency don't gate the canary — they gate the *full rollout* later.
- **A/B test:** the canary that runs long enough for slow labels, with real statistics ([evaluation.md](evaluation.md) §4). For any model whose decisions feed back into training data, this is the only trustworthy quality verdict.

**Sequence for a high-stakes model:** offline eval → shadow (days) → canary 1–5% with auto-rollback on fast signals (days) → A/B at 50% until significance on the real objective → 100% + the old model kept warm within the rollback window.

**Failure modes of the patterns themselves:** shadow model reading from the *online* store while the incumbent's features were logged at training time (you're shadow-testing skew, not the model); canary assignment by request instead of entity (contaminates both arms); auto-rollback triggers so tight that normal daily seasonality flaps them (they get disabled, then never re-enabled — alert-fatigue mechanics, see [monitoring-and-drift.md](monitoring-and-drift.md) §alerting).

## 5. The degradation ladder

Every online model needs a written answer to "what happens when you're down?" — because the answer exists whether you wrote it or not, and unwritten answers are usually "the caller's timeout invents one." Design the ladder explicitly: full model → cached last-known-good prediction per entity → simpler fallback model (logistic regression that loads in 10ms) → static heuristic/default → fail closed (block the action) or open (allow it). Which rung is acceptable is a *product* decision (fraud fails closed; recommendations fail open to popularity); get it signed off like the cost matrix in [evaluation.md](evaluation.md) §1. Log which rung served every request; alert when the mix shifts.

## 6. Review protocol

1. Is the serving mode (batch/online/hybrid) justified by the §1 tree, or is it accidental architecture?
2. Latency: end-to-end p99 measured under load? itemized? caller timeout + fallback known and monitored?
3. Versioning: immutable artifacts? prediction logs carry model version? feature-compatibility window enforced? rollback rehearsed — when last?
4. Rollout: shadow/canary path exists? sticky assignment? auto-rollback triggers on fast signals, and are they still enabled?
5. Degradation ladder written, product-approved, instrumented?
6. Report per finding: failure mode, evidence, incident it enables, fix, prevention gate.
