# Model Serving Patterns: Batch, Online, and the Space Between

**Version 1.0 — 2026-07-06. Pattern-level, tool-agnostic; tool names (FastAPI, Triton, TorchServe, KServe) current as of this date.** Core tier. Standalone. Related principles: [../principles/deployment-and-serving.md](../principles/deployment-and-serving.md) (the judgment layer — read it first if choosing), [../principles/train-serve-skew.md](../principles/train-serve-skew.md), [../principles/monitoring-and-drift.md](../principles/monitoring-and-drift.md).

---

This doc is the implementation companion to [deployment-and-serving.md](../principles/deployment-and-serving.md) §1's decision tree. Per pattern: the shape, what it buys, where it fails, and the instrumentation it must carry. The recurring theme: **each pattern trades skew surface against freshness** — batch has almost no skew surface and stale predictions; online has fresh predictions and maximal skew surface. Choose the *least* online pattern the product tolerates.

## 1. Batch scoring (the underrated default)

**Shape:** scheduled job → compute features + predictions for the full entity set → write to a table/KV cache → consumers look up. The model never sees a request.

**What it buys:** features and predictions computed in *one place, one pipeline, one run* — skew variants 1 and 2 structurally near-impossible. Failures are visible (job fails, table stale) rather than silent. Retries are free; latency is a lookup; throughput is embarrassingly parallel; no model on-call.

**Failure modes:**
- **Staleness beyond tolerance, undetected.** Job silently stops (upstream table late, cron dead) and consumers happily read last week's scores. Instrument: predictions table carries `scored_at`; consumers alert on age > SLO; the job itself alerts on failure *and on abnormal row counts* — the run that "succeeds" on 3% of entities is worse than the one that fails.
- **Partial writes:** consumers read mid-job and see old+new mixed. Write to a staging table, swap atomically (partition switch / view repoint / transactional rename).
- **The missing-entity default:** a new user signed up after last night's run has no row. That miss path is part of the model's production behavior — define it (popularity default, cold-start heuristic), log its rate, alert on shifts ([../principles/deployment-and-serving.md](../principles/deployment-and-serving.md) §5's ladder applies to batch too).
- **Score-everything waste:** scoring 100M entities nightly when 2M are active. Score by activity window; but note the trap — filtering by *recent activity* changes the scored population's distribution, so monitoring baselines ([../principles/monitoring-and-drift.md](../principles/monitoring-and-drift.md) §2) must be computed on the same filtered population or you'll chase phantom drift.

## 2. Online request/response serving

**Shape:** model behind an endpoint; features assembled per request (payload + online store); prediction returned in the request path.

**Implementation ladder (climb only as far as needed):**
1. **Model-in-service** (FastAPI/gRPC service loading the artifact — via `mlflow.pyfunc` or the pinned pipeline): fine for CPU tabular models at moderate QPS. Pitfalls: load the model *once* at startup, not per request (yes, seen in production — p99 was the disk); Python-level thread safety of `predict` (most sklearn/torch inference is safe for concurrent reads, but anything with internal state — custom transformers with caches — isn't; when in doubt, worker-per-process via gunicorn/uvicorn workers); model RAM × workers must fit the node.
2. **Dedicated model server** (Triton, TorchServe, KServe/Seldon on k8s): buys dynamic micro-batching (the big GPU-throughput lever), multi-model serving, standardized metrics. Pay for it when: GPU inference, high QPS, or many models — not for one tabular model.
3. **Split preprocessing/model:** keep feature assembly in your service, model in the server. This *reintroduces a seam* — the signature check and golden-prediction test ([../principles/testing-ml-systems.md](../principles/testing-ml-systems.md) §4) become mandatory, not advisory.

**Failure modes:** every one in [../principles/train-serve-skew.md](../principles/train-serve-skew.md) (this is the pattern that doc exists for), plus: cold-start latency after deploys/scale-up (pre-warm: score fixtures on startup before readiness passes); the caller-timeout-fallback trap ([../principles/deployment-and-serving.md](../principles/deployment-and-serving.md) §2 — measure your consumer's timeout, alert on your p99 approaching it); GPU inference without batching (throughput cliff — enable server-side dynamic batching and *re-measure p99*, since batching trades tail latency for throughput).

**Mandatory instrumentation (the serving contract):** per prediction, log model version + served features + score ([../principles/monitoring-and-drift.md](../principles/monitoring-and-drift.md) §2's substrate); schema validation at ingress with monitored reject/UNK rates; p99 (not mean) by endpoint *and* by feature-fetch vs. forward-pass ([../principles/deployment-and-serving.md](../principles/deployment-and-serving.md) §2's itemized budget); degradation-ladder rung per response.

## 3. The hybrid: precompute heavy, assemble light (most real online systems)

**Shape:** batch/stream jobs precompute expensive parts (embeddings, aggregates, candidate lists) into an online store; the request path does a cheap lookup + light model / final scoring. This is the recsys shape ([recommender-systems.md](recommender-systems.md)) and the feature-store shape ([feature-stores.md](feature-stores.md)).

**What it buys:** online freshness where it matters (request context) with batch economics for the 95% of computation that doesn't need to be fresh.

**Failure modes:** it inherits *both* parents' — batch staleness on the precomputed parts (freshness monitoring per component, [feature-stores.md](feature-stores.md) §3's stalled-materialization trap) *and* online skew on the assembled parts — **plus one of its own: version coherence across components.** Embeddings from model v7 combined at request time with a ranker trained against v6 embeddings is a skew bug with no single deploy to blame; two-tower systems die on this. Rule: co-versioned artifacts (embedding version pinned in the ranker's registry record, checked at deploy — same mechanism as feature-compatibility windows, [../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md) §2).

## 4. Streaming / async scoring

**Shape:** events on a queue → scoring consumer → predictions to a topic/table; consumers act asynchronously (fraud review, moderation, alerting). Freshness of seconds without request-path coupling.

**Failure modes:** consumer lag = silent staleness (lag *is* a model-quality metric here — alert on it as such, not just as infra health); reprocessing/replay double-scores with side effects (idempotency by event ID; predictions written as upserts); ordering — features computed from the *stream's* state vs. the *store's* state can race the event being scored (decide and document which snapshot semantics the model assumes, then test it); and poison messages wedging the consumer (dead-letter with alerting — a model that errors on 0.1% of events and blocks the partition is a full outage delivered slowly).

## 5. Choosing, restated as constraints (complement to the principles-doc tree)

| Constraint | Pattern |
|---|---|
| Request-time-only information needed | Online (2) or hybrid (3) |
| Predictions acceptable if hours old | Batch (1) — take it and run |
| Freshness in seconds, consumer is async | Streaming (4) |
| Expensive per-entity computation + fresh context | Hybrid (3) |
| Team can't staff model on-call | Batch (1), or don't ship an online model |

Final judgment note: pattern migrations (batch→online is the common one, chasing freshness) are *re-architectures of the skew surface*, not deploys. The batch model's features were warehouse-computed; the online version must reproduce them in the request path — which is precisely skew variant 1 at maximum strength. Budget the migration as: build the online feature path, run the golden-prediction parity test against the batch pipeline, shadow it ([../principles/deployment-and-serving.md](../principles/deployment-and-serving.md) §4), and only then move traffic. Teams that budget it as "wrap the model in FastAPI" ship the three-week units-mismatch story from [../principles/train-serve-skew.md](../principles/train-serve-skew.md).
