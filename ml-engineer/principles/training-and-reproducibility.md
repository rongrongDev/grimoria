# Training Discipline & Reproducibility

**Version 1.0 — 2026-07-06.** Examples verified against PyTorch 2.6–2.7, scikit-learn 1.6–1.7, Optuna 3.x/4.x. Standalone. Related: [evaluation.md](evaluation.md) (significance, split design), [../topics/pytorch-training.md](../topics/pytorch-training.md), [../topics/distributed-training.md](../topics/distributed-training.md), [../topics/experiment-tracking.md](../topics/experiment-tracking.md), [mlops-and-versioning.md](mlops-and-versioning.md).

---

Training discipline is what separates "we have a model" from "we have a model we can rebuild, trust, and improve." The failures in this doc share a signature: they don't crash. A non-reproducible run trains fine. An overfit model converges beautifully. A validation-set-overfit hyperparameter search reports its best numbers ever. Discipline is the only detector.

## 1. Reproducibility: can you rebuild last quarter's model?

**Failure mode.** The production model regresses; you need to retrain "the same model" with a data fix — and can't. The training data was a live query (the warehouse has since changed), dependencies floated (`pip install torch` now resolves differently), the seed wasn't set (or was set but nondeterministic kernels dominated), preprocessing lived in a notebook that has been edited since. The moment this bites is always an incident, never a drill: you're debugging a regression and cannot establish the baseline. I once spent nine days proving a "model regression" was actually a pandas minor-version change in how `groupby(...).mean()` handled NaNs in the *retraining* — nine days that would have been one `diff` with pinned envs and versioned data.

**What "reproducible" must mean (in priority order):**
1. **Rerunnable:** same code + same data + same config, without archeology. This is 90% of the value.
2. **Statistically reproducible:** rerun lands within the known seed-variance band ([evaluation.md](evaluation.md) §4 — you measured that band, right?).
3. **Bit-exact:** same weights bit-for-bit. Needed for debugging ("is the diff the data or the code?") and compliance. Expensive; opt in deliberately.

**The checklist that achieves it:**
- **Code:** training runs from a git commit, not a dirty tree. The run logs the SHA (and refuses, or loudly tags, dirty-tree runs).
- **Data:** training reads an immutable snapshot (versioned path, DVC/lakeFS/Delta version, or at minimum a written table + row-count + content hash logged with the run). *A live SQL query in a training script is a nondeterminism bug with a long fuse.*
- **Environment:** lockfile-pinned deps (uv/pip-tools/conda-lock), Python and CUDA version recorded; container image digest for anything that matters. `requirements.txt` with `>=` is not pinning.
- **Config:** every hyperparameter, including the "constants" in code, serialized and logged. If changing a value requires editing code, it will eventually be edited and unlogged.
- **Seeds:** set all of them — Python `random`, NumPy, framework (`torch.manual_seed` covers CUDA too in current PyTorch), and `PYTHONHASHSEED`; plus DataLoader `worker_init_fn`/`generator`. For bit-exactness in PyTorch add `torch.use_deterministic_algorithms(True)` and `CUBLAS_WORKSPACE_CONFIG=:4096:8`, expect a throughput tax and some ops to error out (that error is the tool working — it names the nondeterministic op). Details: [../topics/pytorch-training.md](../topics/pytorch-training.md).
- **Order matters too:** data shuffling order, augmentation RNG, and multi-worker scheduling all feed the result. Seed the loaders, not just the model.

**Detection.** The drill *is* the detector: rerun last month's production training from its logged artifacts. Score it: did you find the code? the exact data? did the env resolve? did the metric land in-band? Run this drill quarterly; the first run always fails somewhere, and where it fails is your roadmap.

**Prevention (CI gates).** Training refuses to start without: git SHA, resolved lockfile hash, data snapshot ID, serialized config. The experiment tracker ([../topics/experiment-tracking.md](../topics/experiment-tracking.md)) stores all four with every run — a run missing any of them should be impossible to register in the model registry ([mlops-and-versioning.md](mlops-and-versioning.md)).

## 2. Overfitting detection beyond one validation curve

**Failure mode.** "Val loss tracked train loss, we're fine" — while the model memorized entity-level shortcuts the random split couldn't expose, or the val set is small enough that the curve is noise, or 200 tuning iterations quietly fit the val set (§3). The single train/val loss plot is necessary and radically insufficient.

**The layered detectors, cheapest first:**
1. **Gap trajectory, not gap snapshot:** train–val gap *growing* over epochs while val flattens = classic; early-stop on val with a patience window, and keep the best-epoch checkpoint, not the last.
2. **Val-set noise floor:** with a small val set, know its binomial/bootstrap noise before reading curves. A 2k-row val set has ~±1% noise on accuracy at 1σ — early-stopping decisions inside that band are coin flips.
3. **Structure-respecting re-evaluation:** score the model under group and time splits ([evaluation.md](evaluation.md) §2) even if you trained with a random split. Gap between random-split and group-split scores = memorization of entities, invisible to detector #1.
4. **Shuffled-label canary:** train on labels randomly permuted. The model should achieve chance on validation. If it does *better than chance*, your pipeline leaks ([data-leakage.md](data-leakage.md)); if it achieves near-zero *training* loss quickly, you have far more capacity than signal — regularization and data volume matter more than architecture tweaks right now.
5. **Learning-curve extrapolation:** train on 10/25/50/100% of data. Val score still climbing at 100% → get data, not architecture. Flat from 25% → capacity or label-noise ceiling; more data won't help.
6. **Slice-level gaps:** aggregate val can be fine while the model overfits the head and fails the tail. Report the eval-spec slices during training, not just at the end.

**Fix.** Boring and effective, in order of expected value: more/better data, stronger augmentation, early stopping done right, weight decay/dropout tuned on *validation-of-validation* (§3), smaller model. Architecture search is the last resort, not the first.

**Prevention.** The training harness always emits: best-epoch val metric with CI, group-split score, and slice table. Overfitting reviews read those three artifacts, not the loss png.

## 3. Hyperparameter search discipline: don't overfit the validation set

**Failure mode.** Every val-set evaluation leaks a few bits of information into your choices. Run 500 Optuna trials selecting on val AUC and the best trial's val AUC is *biased upward* — you've done gradient ascent on the val set with yourself as the optimizer. Sign: val metric improved all quarter; test (or online) didn't move. This is the individual-scale version of benchmark overfitting, and it happens to careful people; volume of evaluations, not carelessness, is the cause.

**Detection.** Keep a **confirmation set** (second holdout) the search never sees; score only the chosen config on it, once. Gap between best-val and confirmation score = your search's overfitting, measured. Also plot best-val-so-far vs. trial count: gains that keep "improving" past ~100 trials at a scale below your val noise floor (§2.2) are noise-fitting, definitionally.

**Fix / working discipline:**
- **Budget before searching:** N trials fixed in advance; the search doesn't extend because "it's still improving" (that's the noise talking).
- **Search on CV or multiple seeds** when affordable — selecting on a mean across folds resists single-split noise far better.
- **Coarse-to-fine, log-scale** for LR/regularization; random or TPE (Optuna default) over grid — grid wastes budget on dimensions that don't matter.
- **Selection metric = eval-spec primary metric** ([evaluation.md](evaluation.md) §1), computed identically to the final eval. Searching on loss and reporting AUC invites divergence.
- **The test set is scored once**, by the final chosen model, after all decisions are frozen. A test set consulted repeatedly is just a slow validation set — and everything in this section applies to it retroactively, which is how teams end up with no honest holdout at all.

**Prevention.** The tracker records every trial (config + val score) so search volume is auditable. Registry promotion requires a confirmation-set score logged separately from the search's val scores. When you inherit a project, "how many times has anything been evaluated on the test set?" is question one — if the answer is "unknown," treat reported test numbers as validation numbers.

## 4. Distributed training pitfalls (single-node summary)

Full treatment in [../topics/distributed-training.md](../topics/distributed-training.md); the two failure modes you must know even if you "don't do distributed," because DataParallel→DDP migrations and gradient accumulation hit them:

- **Effective batch size math.** Effective batch = per-device batch × devices × accumulation steps. Scale it 8× without touching LR and you've silently changed the optimization problem — usually undertrained (too-low LR for the larger batch). Rule of thumb: scale LR linearly with batch size (with warmup) as a starting point, then re-tune; don't port hyperparameters across batch-size regimes and call the comparison fair.
- **Silent gradient-sync bugs.** DDP averages gradients across ranks; metrics computed per-rank and logged from rank 0 only describe 1/Nth of the data; BatchNorm statistics are per-device unless you use SyncBatchNorm; ranks disagreeing on data sharding (same seed → same shard → duplicated data) trains on 1/Nth the data at N× cost. Detector: **loss-curve equivalence test** — 1-GPU run vs. N-GPU run with identical effective batch and seeds should produce statistically indistinguishable curves. Run it once per training-codebase change; it's the unit test of distributed training.

## 5. Review protocol (training-pipeline review)

1. Reproducibility audit: the four artifacts (SHA, env lock, data snapshot, config) — present and enforced, or best-effort?
2. Seed/determinism story: what's seeded, what's known-nondeterministic, has seed variance been measured?
3. Overfitting instrumentation: which of §2's detectors exist? (Minimum bar: early-stopping with patience + group-split score + val noise floor known.)
4. Search discipline: budget declared? confirmation set exists? test-set touch count?
5. If distributed: loss-equivalence test exists? effective-batch/LR relationship documented?
6. Report per finding: failure mode, evidence, what number it could be corrupting, fix, and the gate that keeps it fixed.
