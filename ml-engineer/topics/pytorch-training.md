# PyTorch Training: Discipline for Deep Learning

**Version 1.0 — 2026-07-06. Applies to PyTorch 2.4–2.7 (CUDA 12.x); notes where behavior is version-sensitive.** Core tier. Standalone. Related principles: [../principles/training-and-reproducibility.md](../principles/training-and-reproducibility.md) (the judgment layer over this doc), [../principles/testing-ml-systems.md](../principles/testing-ml-systems.md); extended: [distributed-training.md](distributed-training.md).

---

Deep learning's failure signature is *silent mediocrity*: a training loop with a wiring bug rarely crashes — it converges to a worse model, and you can't tell "worse because bug" from "worse because hard problem" without discipline. This doc is the discipline, ordered as: make it correct, make it reproducible, make it fast — in that order, always.

## 1. The correctness ladder (run on every new model/loop)

1. **Overfit one batch to ~zero loss.** Can't? The wiring is broken: loss/label misalignment, missing `optimizer.zero_grad()`, detached graph (`.item()`/`.detach()`/numpy round-trips inside the forward), frozen params, LR orders off. Nothing else matters until this passes.
2. **Check loss at init.** Classification should start at ~`ln(num_classes)`. Way off → biased init or wrong loss (the classics: `CrossEntropyLoss` fed softmaxed outputs — it wants raw logits; `BCEWithLogitsLoss` vs `BCELoss` sigmoid double-application; label smoothing accidentally on).
3. **Verify the data, not the code:** decode and *look at* a batch post-augmentation, with labels attached. Wrong normalization stats, channel order, corrupted augment, or shuffled label alignment (`Dataset` returning `(x, y)` pairs that don't correspond — the worst one, because loss still decreases as the model learns the *marginal* label distribution) all live here.
4. **Gradient sanity:** `torch.nn.utils.clip_grad_norm_` returns the pre-clip norm — log it. Zero grads on a layer = detached; exploding = LR/init; and clipping firing on >5% of steps means your LR is wrong, clipping is just hiding it.
5. **A tiny-data end-to-end run** with a metric-band assertion — then freeze it as the smoke test in CI ([../principles/testing-ml-systems.md](../principles/testing-ml-systems.md) §3).

## 2. Reproducibility mechanics (implements [training-and-reproducibility.md](../principles/training-and-reproducibility.md) §1)

```python
def seed_everything(seed: int):
    random.seed(seed); np.random.seed(seed)
    torch.manual_seed(seed)                      # seeds CUDA too, all devices
    os.environ["PYTHONHASHSEED"] = str(seed)

# DataLoader workers have their own RNG lineage:
g = torch.Generator(); g.manual_seed(seed)
DataLoader(ds, num_workers=4, generator=g,
           worker_init_fn=lambda wid: np.random.seed(seed + wid),
           persistent_workers=True)
```

- Seeding alone gives *statistical* reproducibility at best. For bit-exact: `torch.use_deterministic_algorithms(True)` + `CUBLAS_WORKSPACE_CONFIG=:4096:8` + `torch.backends.cudnn.benchmark=False`. Some ops will raise (no deterministic implementation) — that error is *information*, naming your nondeterminism source. Cost: often 10–30% throughput; opt in for debugging/compliance, not by default, but **measure your seed variance either way** — you cannot read a ±0.4% "improvement" without knowing the seed band ([../principles/evaluation.md](../principles/evaluation.md) §4).
- Known nondeterminism sources people forget: `atomicAdd`-based ops (scatter, some pooling/interpolation backward), multi-worker augmentation order, `set_epoch` not called on `DistributedSampler` (same shuffle every epoch — also a *correctness* bug), and **hardware/driver changes** — bit-exactness does not survive GPU model or CUDA version changes; record both in the run.
- `torch.compile` (2.x): treat compiled-vs-eager as a *config change* — numerics differ at float tolerance, and occasionally more. Keep an eager fallback flag and compare curves once per model family.

## 3. The training-loop failure catalog

Each entry: symptom → cause → fix. These are the ones I've debugged more than twice.

- **Val metric great, production bad** → eval-mode leakage: `model.eval()` missing (dropout/BN active at val), or val transforms include train augmentation. Grep for `.eval()`/`torch.no_grad()` pairing at every eval site; better, one shared `evaluate()`.
- **Loss decreases, metric doesn't** → metric computed on shifted labels/preds, or loss on logits vs metric on wrong-threshold hard preds; also class-imbalance where loss improves on the majority ([../principles/evaluation.md](../principles/evaluation.md) §1).
- **NaN loss step N** → LR spike (check warmup), fp16 overflow (use bf16 on A100+/H100 — dynamic range makes most loss-scaling pain disappear; fp16 needs `GradScaler`), a bad batch (log batch indices; add a data-side NaN gate — [../principles/testing-ml-systems.md](../principles/testing-ml-systems.md) §2), or division/log on zero in a custom loss (add eps; `torch.autograd.set_detect_anomaly(True)` to localize, dev only — it's slow).
- **First epochs fine, then slow degradation** → LR schedule stepped per-batch when written for per-epoch (or vice versa) — check `scheduler.step()` placement; or BN stats poisoned by an unshuffled dataset segment.
- **OOM at hour 6, not step 1** → cached-fragment growth from *variable-length* batches (bucket by length), a Python-side list accumulating tensors that keep graphs alive (`losses.append(loss)` instead of `loss.item()` — this one is a rite of passage), or eval building graphs (missing `no_grad`).
- **Throughput mysteriously low** → data-starved GPU. Diagnose before optimizing the model: GPU util sawtoothing to 0 = loader-bound (more workers, `pin_memory=True`, decode/augment on GPU, or cache decoded data); profile with `torch.profiler` one window per investigation, not always-on.
- **Gradient accumulation subtly wrong** → loss not divided by accumulation steps (effective LR silently ×k), or BN stats computed per-micro-batch when the recipe assumed the full batch. Also the effective-batch/LR coupling: [../principles/training-and-reproducibility.md](../principles/training-and-reproducibility.md) §4.

## 4. Checkpointing that survives incidents

A checkpoint that can't resume *exactly* is a lineage break. Save — atomically (write temp, fsync, rename), every N steps *and* on best-val — a dict containing: model `state_dict`, **optimizer** `state_dict` (Adam moments are state; resuming without them is a different training run), **scheduler** state, scaler state (AMP), epoch/step, RNG states (`torch.get_rng_state()`, cuda, numpy, python), and the config + code SHA + data snapshot ID ([../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md) §1's closed record, embedded). Test resume-equivalence once per codebase change: train 200 steps straight vs. 100+resume+100 — curves should match to float noise. Keep `best.pt` distinct from `last.pt`; deploy from best, resume from last. Load with `map_location="cpu"` (artifact shouldn't demand the training GPU) and `weights_only=True` (2.4+ default hardening; custom-object checkpoints need explicit allowlisting — better to keep checkpoints tensor-only and config-reconstruct the model).

## 5. Export: the training/serving boundary

The deployed artifact should carry its preprocessing ([../principles/train-serve-skew.md](../principles/train-serve-skew.md) §3 preprocessing-version skew). Options by situation: TorchScript is legacy-stable but frozen in time; `torch.export`/ONNX for cross-runtime serving; or ship the eval-mode `nn.Module` in a pinned container matching the training image. Whatever the path: **golden-prediction parity test** — N fixture inputs through training-side model vs. exported artifact in the *serving* image, assert `atol` ≈1e-5 (fp32) — in deployment CD ([../principles/testing-ml-systems.md](../principles/testing-ml-systems.md) §4). Quantized exports get their own eval run, not an assumption of parity; per-slice, because quantization error concentrates on tails.

## 6. Hygiene defaults (the boring list that prevents the exciting incidents)

`model.train()`/`model.eval()` set explicitly at every phase boundary; `optimizer.zero_grad(set_to_none=True)`; loss reduction explicit (`mean` vs `sum` interacts with accumulation and DDP averaging); `num_workers>0` with `persistent_workers=True` on real jobs; bf16 autocast as the mixed-precision default on modern hardware; log every run to the tracker with the full closed record ([experiment-tracking.md](experiment-tracking.md)); and the loss-curve-equivalence test before trusting any parallelism change ([distributed-training.md](distributed-training.md)).
