# Experiment Tracking & Model Registry with MLflow

**Version 1.0 — 2026-07-06. Applies to MLflow 2.14+ and 3.x (aliases-based registry; notes where 3.x differs). Concepts transfer to Weights & Biases directly — the discipline is identical, the API names differ.** Core tier. Standalone. Related principles: [../principles/training-and-reproducibility.md](../principles/training-and-reproducibility.md), [../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md) (registry *discipline* — this doc is the mechanics).

---

Experiment tracking has one job: **when someone points at a model and asks "where did this come from?", the answer is a click, not an investigation.** Every logging decision below is derived from that. Teams fail at tracking not by lacking a tool but by logging decoratively — metrics without lineage, runs without data versions, a registry nobody gates on. A tracker that can't answer the four incident questions ([../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md) §top) is a metrics screensaver.

## 1. What a run must contain (the closed record, in MLflow terms)

```python
import mlflow

mlflow.set_experiment("churn-model")
with mlflow.start_run() as run:
    mlflow.log_params(flatten(cfg))                       # full config, incl. "constants"
    mlflow.set_tags({
        "git_sha": sha, "git_dirty": str(is_dirty),        # refuse or loudly tag dirty
        "data_snapshot": snapshot_id,                      # immutable data version
        "env_lock_hash": lock_hash,                        # resolved deps hash
        "split_manifest": split_hash,                      # the split IS an artifact
        "eval_set_version": eval_hash,                     # comparisons need same eval set
    })
    for epoch in ...:
        mlflow.log_metrics({"val_auc": auc, "train_loss": loss}, step=epoch)
    mlflow.log_artifact("eval_report.json")                # per-slice, with CIs
    mlflow.log_artifact("conda.lock")                      # the env itself, not just hash
    mlflow.sklearn.log_model(pipe, name="model",
                             signature=infer_signature(X_sample, pipe.predict(X_sample)),
                             input_example=X_sample.head())
```

The judgment items, each preventing a specific incident:
- **`git_dirty` enforcement.** A run from an uncommitted tree is unreproducible by construction. Minimum: tag it in red. Better: the training harness refuses ([../principles/training-and-reproducibility.md](../principles/training-and-reproducibility.md) §1).
- **`data_snapshot` and `eval_set_version` as first-class tags**, because the two dirtiest comparison tricks are different training data and different eval sets — with the hashes tagged, "are these runs comparable?" is a filter expression instead of a meeting.
- **Signature + input example, always.** The signature is what deployment CD validates the serving payload against ([../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md) §2's signature gate). `log_model` without a signature produces an artifact that will be schema-checked by production traffic instead.
- **Log the model *through the flavor API*** (`mlflow.sklearn`/`pytorch/...`), not `log_artifact("model.pkl")` — flavors capture dependency requirements and enable `mlflow.pyfunc.load_model` in serving, which is your one consistent load path.
- **Per-step metrics with `step=`** — the curve is diagnostic ([../principles/training-and-reproducibility.md](../principles/training-and-reproducibility.md) §2's *gap trajectory*); a final-value-only run hides overfitting shape.
- Log **eval reports as artifacts** (JSON with slices and CIs), not just scalar metrics — scalar `val_auc=0.84` without its CI and slice table is exactly the un-interrogatable number [../principles/evaluation.md](../principles/evaluation.md) bans.

**Hyperparameter searches:** one *parent* run per search, `nested=True` child per trial (Optuna's MLflow callback does this) — the search's full trial history is the audit trail for validation-overfitting review ([../principles/training-and-reproducibility.md](../principles/training-and-reproducibility.md) §3: "how many times was the val set consulted" becomes a query). Log the search *space* and budget on the parent.

## 2. Registry mechanics (MLflow ≥2.9 aliases; stages are deprecated)

```python
client = MlflowClient()
mv = mlflow.register_model(f"runs:/{run.info.run_id}/model", "churn-model")
# Promotion happens ONLY in the deploy pipeline, after gates:
client.set_registered_model_alias("churn-model", "champion", mv.version)
# Serving resolves the alias:
model = mlflow.pyfunc.load_model("models:/churn-model@champion")
```

- **Aliases (`@champion`, `@challenger`), not the deprecated Production/Staging stages** — audits of older setups will find stage-based flows; migrate deliberately, because stage-transition APIs disappear in 3.x.
- **Promotion is pipeline-only.** A human moving `@champion` in the UI bypasses champion/challenger gating ([../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md) §2) and leaves the audit trail in someone's memory. Lock UI edit permissions if the deployment matters; at minimum, alert on alias changes not attributable to the CD identity.
- **Registration gating:** MLflow won't enforce your closed record for you — put a *pre-registration validator* in the pipeline that rejects runs missing the §1 tags/artifacts. This is 30 lines and is the difference between a registry and a junk drawer.
- **Version annotations for incidents:** regressed versions get `client.set_model_version_tag(..., "blocked", reason)` and the retraining pipeline checks the tag before promotion ([../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md) §3).
- Serving pins by *version* at deploy time (resolve the alias once, deploy the number, log it per prediction); live-resolving `@champion` per request makes "which model served this?" answerable only by timeline reconstruction.

## 3. Operating the tracker (the unglamorous parts that decide whether it survives)

- **Backend:** the default local `mlruns/` directory is for laptops only. Team = tracking server with a real DB (Postgres) + object-store artifact root, behind auth. The failure mode is organic: laptop MLflow → "let's share it" → the server *is* someone's EC2 box with SQLite → it's now production infrastructure with no backups holding your entire model lineage. Treat the tracking DB + artifact store as production data (backup, retention policy) the day the registry gates a deployment.
- **Naming/retention:** one experiment per model-project (not per person, not per week); tags for everything queryable; a quarterly cleanup policy for failed/abandoned runs *defined upfront* — a tracker with 40k unlabeled runs is write-only memory.
- **W&B differences that matter when translating this doc:** artifacts have first-class lineage graphs (use them for data snapshots), sweeps replace the parent/child pattern, and the registry equivalent is W&B Model Registry with aliases — the *discipline* (closed record, pipeline-only promotion, pre-registration validation) transfers verbatim. Choose by: self-hosted/OSS requirement → MLflow; managed + collaboration surface → W&B. Don't run both; the lineage graph fragments.

## 4. Anti-patterns (each observed in a real org)

- **The decorative tracker:** metrics logged, lineage absent — answers "what was the AUC" but not "on what data." Detected by the four incident questions; fixed by the pre-registration validator, which makes lineage load-bearing.
- **Comparing across eval-set versions:** run A (March eval set) vs run B (May eval set) in the same leaderboard view. The `eval_set_version` tag exists to make this visible; the harness should *refuse* to rank runs whose hashes differ.
- **The registry bypass:** "urgent fix" deployed from a laptop path, registered retroactively (or never). Every bypass is invisible until the incident where the served artifact matches no registry version. Fix is social + mechanical: make the pipeline path *faster* than the bypass (the real reason bypasses happen) and alert on serving-image model hashes not found in the registry.
- **Logging the world:** every gradient norm, every batch, 2GB of artifacts per run. Tracking cost becomes the reason people stop tracking. Log curves at epoch/eval-step granularity, artifacts that feed decisions (eval report, env lock, plots), and pointers (snapshot IDs) rather than data.
