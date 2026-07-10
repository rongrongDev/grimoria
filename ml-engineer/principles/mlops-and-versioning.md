# MLOps: Registry, CI/CD, and Rollback Discipline

**Version 1.0 — 2026-07-06.** Framework-agnostic; MLflow-specific mechanics in [../topics/experiment-tracking.md](../topics/experiment-tracking.md). Standalone. Related: [training-and-reproducibility.md](training-and-reproducibility.md), [deployment-and-serving.md](deployment-and-serving.md), [testing-ml-systems.md](testing-ml-systems.md).

---

MLOps is version control extended to the two things git doesn't cover: **data and models.** Software CI/CD answers "what code is running and can we rebuild it?" ML systems need that answer for a triple — code, data, model — and the failures in this doc are all cases where one leg of the triple went unversioned and an incident became unanswerable.

The unanswerable questions I've actually been asked during incidents, each mapping to a missing version link: "Which model was live last Tuesday?" (predictions didn't log model version). "What data trained the live model?" (training read a live query). "Is the current model the same one we evaluated?" (artifact overwritten in place). "Can we go back to March's model?" (its features no longer exist). If your system can't answer all four *right now*, that's the work.

## 1. Model registry discipline

**Failure mode.** The registry (MLflow Model Registry, SageMaker, Vertex, or a disciplined bucket layout) exists but is a junk drawer: models registered without lineage, stages/aliases updated by hand, `model_final_v2_ACTUALLY_FINAL` energy, and no relationship between "registered" and "evaluated." A registry that doesn't *gate* is a file share with extra steps.

**The rules that make a registry real:**
- **A model version is a closed record.** Registration requires, mechanically enforced: training-run link (code SHA, config), data snapshot ID, environment lock hash, feature list with versions, eval report against the eval spec (with CIs — [evaluation.md](evaluation.md) §4), and the serialized preprocessing. Registration *fails* if any is missing. This single gate retro-forces reproducibility discipline ([training-and-reproducibility.md](training-and-reproducibility.md) §1) onto every producer.
- **Aliases/stages move only via pipeline, never by hand.** `champion`/`production` alias updates happen in the deploy pipeline after gates pass, leaving an audit trail (who/what/when/from-which). Hand-moves are how "which model was live Tuesday?" becomes archaeology.
- **Versions are immutable.** Re-registration under the same version, artifact overwrites, "just updating the pkl" — banned at the storage layer (object-lock/immutability policy), not by convention.
- **Retention matches the rollback window** ([deployment-and-serving.md](deployment-and-serving.md) §3): every model within the window stays deployable — artifact present *and* feature dependencies still served.

## 2. CI/CD for models: three pipelines, three triggers

Software CI/CD has one trigger (code change). ML has three, and conflating them is the root failure:

| Pipeline | Trigger | Gates |
|---|---|---|
| **Code CI** | PR to pipeline/feature/serving code | Unit + data-contract tests ([testing-ml-systems.md](testing-ml-systems.md)), leakage lints, *smoke training* (tiny fixed dataset, minutes) asserting the pipeline runs end-to-end and metrics land in a known band |
| **Training/retraining CD** | Schedule, drift diagnosis ([monitoring-and-drift.md](monitoring-and-drift.md) §3), or new data snapshot | Data validation on the incoming snapshot; training with full lineage capture; **champion/challenger eval**: new model vs. current production model on the *same* frozen eval set, promote only if better by more than the noise floor with slice guardrails (no slice regresses beyond tolerance) |
| **Deployment CD** | Registry promotion | Artifact loads in the serving image; signature/schema match against the serving contract; latency benchmark within budget; shadow/canary progression ([deployment-and-serving.md](deployment-and-serving.md) §4) |

**Failure modes per pipeline:**
- *Code CI without smoke training:* refactors that type-check but break the training loop (loss silently NaN→skipped, a transform dropped) merge green and are discovered at the next scheduled retrain — by which time twelve other changes merged and the bisect is a day. Smoke training on a fixed 1k-row dataset with a metric-band assertion catches these for pennies.
- *Retraining CD without champion/challenger:* "retrained on schedule, auto-deployed" ships a regression the first time the data has a bad week. The eval set for the comparison must be **frozen and versioned** — comparing champion-on-old-eval vs. challenger-on-new-eval is not a comparison ([evaluation.md](evaluation.md) §4's test-set-hash rule).
- *Deployment CD without signature checks:* model trained with feature v2 deploys against serving code fetching v1 — the deploy succeeds, the skew begins ([train-serve-skew.md](train-serve-skew.md) §3). The model artifact's input schema (names, dtypes, order) is validated against what the serving path actually assembles, in CI, per deploy.
- *Cross-pipeline race:* feature pipeline and model deploy independently with no ordering contract. The fix is the three-deploy sequence in [deployment-and-serving.md](deployment-and-serving.md) §3 (features additive → model → cleanup), enforced by making the model's feature-version dependencies explicit registry metadata that the feature pipeline's CD checks before removing anything.

**Data versioning, minimally sufficient:** you don't need a data-versioning platform to start; you need *immutable training snapshots with IDs* (dated partitions/paths + row count + content hash recorded in the run). DVC/lakeFS/Delta time-travel buy convenience and diffability at scale, but the discipline — training never reads a mutable table — is the actual feature, and it's free.

## 3. Rollback when a model regresses

The mechanics live in [deployment-and-serving.md](deployment-and-serving.md) §3; this is the *decision* discipline:

- **Roll back first, diagnose second** when the regression is user-facing and the previous model is within its compatibility window. A model rollback is cheap and reversible; every hour of diagnosis-before-mitigation is paid in production quality. The instinct to "understand it first" is right for code and wrong for models — you can diagnose from logs after traffic is safe.
- **Know the three rollback flavors** and which the incident needs: (a) *model artifact* rollback (bad training run — the common case); (b) *feature pipeline* rollback (skew introduced upstream — rolling back the model won't help and may double the confusion); (c) *threshold/policy* rollback (model fine, downstream action calibration wrong). Misdiagnosing (b) as (a) is the classic wasted first hour — the score distributions tell them apart: artifact regressions arrive with a model deploy; feature regressions arrive without one.
- **After rollback:** the regressed version gets a registry annotation (what/why/evidence) and a blocked alias so retraining CD can't re-promote it or a sibling trained on the same bad snapshot. The postmortem's structural question: which gate should have caught it — eval set didn't represent the failing slice? champion/challenger noise floor too loose? canary fast-signals missed it? Fix the gate, not just the model.

## 4. Retraining cadence: schedule vs. trigger

**Failure mode A:** no retraining — the model quietly ages until someone notices ([monitoring-and-drift.md](monitoring-and-drift.md)). **Failure mode B:** reflexive frequent retraining — every retrain is a fresh chance to ingest breakage, and without champion/challenger gates, frequency multiplies risk rather than freshness.

Decision: start with a schedule justified by measured decay — plot model quality vs. model age from your prediction/outcome logs (train once, evaluate on successive future windows). Decay steep at 2 weeks → weekly retrains; flat for a quarter → monthly is plenty and weekly is pure risk. Add drift-*diagnosed* triggers (never raw drift-alert triggers — §3 of monitoring doc) on top. Every retrain, scheduled or triggered, passes the same champion/challenger gate; cadence changes the trigger, never the bar.

## 5. Review protocol

1. Ask the four incident questions (top of doc) and demand demonstrated answers, not "we could figure it out."
2. Registry: closed-record enforcement? alias audit trail? immutability at storage layer? retention ≥ rollback window?
3. Three pipelines: does each exist with its gates? Specifically probe smoke training, frozen-eval champion/challenger, and signature validation — the three most commonly missing.
4. Rollback: three flavors distinguishable from dashboards? rehearsed when? blocked-version mechanism?
5. Retraining: cadence justified by decay data or by vibes? triggers gated by diagnosis?
6. Report per finding: the incident question it leaves unanswerable, evidence, fix, gate.
