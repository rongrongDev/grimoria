# Guide: Build a Minimal, Architecturally Sound ML Pipeline From Scratch

**Version 1.0 — 2026-07-06. Assumes: Python 3.11+, scikit-learn 1.6–1.7, MLflow 2.14+/3.x, pytest 8.x. Deep-learning variant notes reference PyTorch 2.6+.** This guide is followable start-to-finish with no context beyond linked docs. It sequences the principles docs; when it says *why* only briefly, the link has the full argument.

**What you'll have at the end:** a supervised model on tabular data with leakage-safe features, a reproducible training run, an honest evaluation, a serving path, monitoring, and the CI gates that keep all of it true — the minimal system that won't embarrass you in six months. Scope it small deliberately: every step here survives scaling; skipping steps doesn't.

---

## Phase 0 — Frame before code (half a day, saves the project)

Produce two one-page artifacts. Nothing else starts until they exist, because every later decision derives from them:

1. **The prediction contract:** *"At time T, for entity E, using data available with latency L, predict Y to drive decision D."* One sentence, all five variables bound. This defines the leakage boundary ([../principles/data-leakage.md](../principles/data-leakage.md) §protocol step 1), the split policy, and the serving mode.
2. **The eval spec** ([../principles/evaluation.md](../principles/evaluation.md) §1): decision driven, operating point, ONE primary metric derived from the decision's costs (write the cost matrix; get it signed), guardrail metrics, slices (minimum: entity tenure + your product's key segment), and the *heuristic baseline* the model must beat (predict-the-majority / seasonal-naive / current business rule). If the baseline isn't written down, the model will be compared to nothing and declared good.

**Serving-mode decision now, not later** ([../principles/deployment-and-serving.md](../principles/deployment-and-serving.md) §1 tree): batch unless request-time information is genuinely required. This guide's main path assumes **batch-scored, online-looked-up** — the right first architecture for most problems ([../topics/serving-patterns.md](../topics/serving-patterns.md) §1); the online variant is noted per phase.

## Phase 1 — Repository and environment skeleton (half a day)

```
ml-pipeline/
├── pyproject.toml + uv.lock          # locked deps; `uv sync` reproduces the env
├── src/pipeline/
│   ├── features.py                   # pure functions ONLY (testability contract)
│   ├── dataset.py                    # snapshot loading + split (the only split code)
│   ├── train.py                      # entrypoint: config in, registered model out
│   ├── evaluate.py                   # eval-spec metrics, slices, CIs
│   └── score_batch.py                # the serving path
├── contracts/input_schema.py         # pandera schema — ONE contract file
├── configs/train.yaml                # every knob; no constants buried in code
├── tests/                            # phases 2–5 each add tests here
└── fixtures/train_1k.parquet         # frozen tiny dataset for smoke tests
```

Rules installed now (cheap now, impossible later): all deps lockfile-pinned; feature code importable and pure ([../principles/testing-ml-systems.md](../principles/testing-ml-systems.md) §1's structural prerequisite); notebooks allowed for exploration but nothing ships from one; config file is the *entire* parameter surface ([../principles/training-and-reproducibility.md](../principles/training-and-reproducibility.md) §1).

## Phase 2 — Data snapshot and contract (1 day)

1. **Materialize an immutable training snapshot:** a dated, write-once path (`data/snapshots/2026-07-06/`) with row count + content hash recorded. Training *never* reads a live query ([../principles/training-and-reproducibility.md](../principles/training-and-reproducibility.md) §1 — the nine-days-of-pandas story).
2. **Write the input contract** (`contracts/input_schema.py`, pandera): types, nullability, ranges, enum domains, key uniqueness. This same file later validates serving inputs — one contract, two enforcement points ([../principles/train-serve-skew.md](../principles/train-serve-skew.md) §3).
3. **Split, per the data's structure** ([../principles/evaluation.md](../principles/evaluation.md) §2 decision tree — spend 30 real minutes here): time-based if predicting forward (almost certainly yes), grouped by entity if production scores novel entities, both if both. Implement in `dataset.py` as the *only* split code, **persist the assignment as a manifest** (IDs per split, hashed), and add the CI assertions: train∩test = ∅ on IDs and content hashes, zero group overlap, time ordering ([../principles/data-leakage.md](../principles/data-leakage.md) §2/§4).
4. **Reserve the test set now:** `evaluate.py --final` is the only code path that reads it, and you will run it once, at the end (Phase 5). Also carve a small **confirmation set** if you plan any hyperparameter search ([../principles/training-and-reproducibility.md](../principles/training-and-reproducibility.md) §3).

## Phase 3 — Leakage-safe features (2–3 days, the phase that decides everything)

1. Every feature in `features.py` is a pure function taking `(events_df, as_of: timestamp)` and filtering `event_time < as_of` — point-in-time correctness by construction ([../principles/data-leakage.md](../principles/data-leakage.md) §1). Aggregation across rows happens *only* here (or inside the sklearn Pipeline), never in ad-hoc pandas in training code ([../topics/sklearn-pipelines.md](../topics/sklearn-pipelines.md) §2).
2. Training-set assembly calls these functions with `as_of = ` each row's *prediction* timestamp from the contract — not label time, not now() ([../topics/feature-stores.md](../topics/feature-stores.md) §3's front-door leak, which needs no feature store to commit).
3. **Tests, same PR as each feature** ([../principles/testing-ml-systems.md](../principles/testing-ml-systems.md) §1): hand-computed golden cases, edge inputs (empty/null/single-event/out-of-order), determinism, and the **point-in-time test** — an entity with only-future events yields all-null features. That last one is the highest-value test in the repo.
4. Fitted preprocessing (scaling, encoding, imputation) goes **inside the sklearn Pipeline** — copy the canonical skeleton from [../topics/sklearn-pipelines.md](../topics/sklearn-pipelines.md) §1 with its judgment defaults (explicit columns, `remainder="drop"`, unknown-category handling). No `.fit` outside a Pipeline, ever.

## Phase 4 — Reproducible training + tracking (1–2 days)

1. `train.py`: load snapshot → validate against contract (hard gate) → assemble features → fit Pipeline under CV honoring the split policy → log everything to MLflow with the **closed record** — copy the run-logging block from [../topics/experiment-tracking.md](../topics/experiment-tracking.md) §1 verbatim (git SHA + dirty flag, snapshot ID, lock hash, split manifest hash, config, per-step metrics, signature, eval artifact). Refuse to run from a dirty tree.
2. Seed everything; then measure **seed variance** (3–5 runs) — this number is your noise floor and every future "improvement" is judged against it ([../principles/evaluation.md](../principles/evaluation.md) §4).
3. Train the *baseline* from the eval spec through this same harness — it's a registered model like any other, and it's the champion until beaten.
4. Hyperparameter search, if any: budget declared upfront, parent/child runs, selection on CV, chosen config scored once on the confirmation set ([../principles/training-and-reproducibility.md](../principles/training-and-reproducibility.md) §3).
5. Tests added: smoke training on the 1k fixture with metric band (runs in PR CI, minutes), serialization round-trip, seed-repro ([../principles/testing-ml-systems.md](../principles/testing-ml-systems.md) §3).

*(Deep-learning variant: same skeleton; `train.py` follows the correctness ladder in [../topics/pytorch-training.md](../topics/pytorch-training.md) §1 before any real run, checkpoints per §4.)*

## Phase 5 — Honest evaluation (1 day)

`evaluate.py` computes the eval spec exactly: primary metric **at the operating point**, guardrails, every slice, paired-bootstrap CIs vs. the baseline ([../principles/evaluation.md](../principles/evaluation.md) §4 — block-bootstrap if grouped/time-correlated). Output: a JSON eval report logged as a run artifact. Ship/no-ship rule, written before you look: *primary metric beats baseline by more than the noise floor, CI excluding zero, no slice regressing beyond tolerance.* Then — once — `evaluate.py --final` on the test set. That number goes in the registry record and is not revisited.

Register the model ([../topics/experiment-tracking.md](../topics/experiment-tracking.md) §2): aliases not stages, pre-registration validator enforcing the closed record, promotion to `@champion` only via the deploy path.

## Phase 6 — Serving path (1–2 days for batch)

`score_batch.py`: load `models:/name@champion` (resolve once, log the version) → load scoring population → validate against the *same* contract file → assemble features through the *same* `features.py` with `as_of = now` semantics → predict → write to a staging table with `scored_at` and `model_version` columns → atomic swap ([../topics/serving-patterns.md](../topics/serving-patterns.md) §1: partial-write and staleness traps). Define the missing-entity default and log its rate. Because features and scoring share one implementation and one process, skew variant 1 is structurally closed — this is why batch-first is the sound minimal architecture.

Tests: **golden-prediction seam test** — fixture entities through training-side assembly vs. `score_batch.py`'s assembly, assert equality ([../principles/testing-ml-systems.md](../principles/testing-ml-systems.md) §4). Trivially green today; it's the tripwire for the day someone "optimizes" one path.

*(Online variant: the same Pipeline behind FastAPI per [../topics/serving-patterns.md](../topics/serving-patterns.md) §2 — model loaded at startup, contract validation at ingress, per-prediction logging of version + served features + score, p99 measured against the caller's timeout, degradation ladder written ([../principles/deployment-and-serving.md](../principles/deployment-and-serving.md) §2/§5). The seam test becomes mandatory rather than prudent.)*

## Phase 7 — Monitoring + retraining loop (1–2 days)

Minimal but real, from [../principles/monitoring-and-drift.md](../principles/monitoring-and-drift.md) §2:
- **Layer 1:** per-feature null/UNK/out-of-range rates + PSI vs. training reference, computed by the scoring job itself each run; **Layer 2:** score distribution (mean, percentiles, fraction actionable) per run, per slice; **Layer 3:** primary metric on prediction↔outcome joins at fixed label maturity, per slice; **Layer 4:** the business decision metric.
- Alerts per §3's tiering: page on score-volume/score-distribution steps and null-rate steps; ticket on moderate drift; everything else is a dashboard. Every alert names its runbook action.
- **Retraining:** scheduled (justify cadence from measured decay once you have weeks of layer-3 data — [../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md) §4), gated by champion/challenger on the frozen eval set + data validation on the new snapshot. Never auto-retrain on drift alerts (§3's trap).

## Phase 8 — CI assembly (half a day; mostly wiring what phases built)

PR CI: unit + contract tests, leakage invariants (split overlap, point-in-time), smoke training with band, seam test. Retraining CD: snapshot validation → train → champion/challenger → register. Deploy CD: signature check, (online: latency benchmark), alias promotion with audit trail. This is [../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md) §2's three-pipeline table, minimally instantiated.

## Done-when (the system, not the model)

- [ ] The four incident questions answerable by demonstration ([../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md) §top)
- [ ] Rerun of the champion's training from its logged record lands within the measured noise floor
- [ ] Point-in-time test, split-invariant assertions, smoke training, seam test — all green in CI
- [ ] Eval report shows: beats baseline beyond noise floor, CIs, all slices
- [ ] Scoring job monitored (freshness, volume, score distribution) with tiered alerts
- [ ] A deliberate rollback (re-point alias, re-run scoring) rehearsed once

Total: roughly two weeks of disciplined work for one engineer. Every shortcut skipped here has a named incident waiting in the principles docs — the links are the receipts.
