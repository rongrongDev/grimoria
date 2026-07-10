---
name: train-serve-skew-auditor
description: Compare a model's training-side and serving-side feature computation for divergence — semantics diffs (units, nulls, windows, timezones, normalization), feature staleness vs. training assumptions, schema-boundary gaps, and preprocessing version skew — producing per-feature findings with both file:line references. Use when a model's online quality lags its offline eval, when reviewing a PR that touches feature code on either side of the train/serve boundary, before promoting a model to online serving, or as Phase 3 of ml-engineer/guides/analyze-existing-ml-system.md. Do NOT use for time-correctness of a single training pipeline (that's data-leakage-scanner — this skill needs TWO implementations to compare), for whole-repo sweeps across many models (dispatch ml-repo-leakage-scanner), or for tracing an active production regression through logs and deploy history (dispatch pipeline-regression-tracer — this skill reads code, not incidents).
---

# Train/Serve Skew Auditor

You are executing the audit protocol from `ml-engineer/principles/train-serve-skew.md` for one model. That doc defines the three variants you hunt (divergent computation, staleness, schema/semantics drift) and the architecture fixes; this skill is the procedure. The governing fact: **skew's root cause is always two implementations of one definition** — your job is to find every pair and diff them.

## Procedure

**1. Inventory features from the artifact, not the docs:** the model's signature/feature list (MLflow signature, `feature_names_in_`, config). This list drives everything; docs and feature lists in READMEs drift.

**2. Locate both implementations per feature.** Training side: feature pipeline / point-in-time join / offline store definitions. Serving side: request-path assembly, online-store reads, on-demand transforms. **A feature with only one locatable implementation is a finding, not a relief** — either it's dead in training or duplicated somewhere unfound (report as unresolved). Feature-store systems: verify the registered definition is what *both* sides actually consume, and check for out-of-store transformations on either bank (`ml-engineer/topics/feature-stores.md` §3).

**3. Diff semantics per feature** across this checklist — each item is a shipped incident somewhere: source table/stream; filter predicates; window bounds; aggregation function; **units**; null/missing policy (`COALESCE` vs. propagate vs. impute — and imputed *with what*); string normalization/casing; **timezone**; rounding/precision; dtype coercions; dependency versions of shared preprocessing (tokenizers, encoders — pin-diff the two environments).

**4. Staleness audit** (variant 2): materialization/refresh cadence per feature vs. what the training join assumed (event-time vs. availability-time — check whether the offline join subtracts pipeline latency); TTL-expiry behavior (what serves when stale — and was the model trained with that degradation represented?); freshness SLOs and their monitoring.

**5. Boundary audit** (variant 3): schema validation at serving ingress (same contract file as training-side validation, or a drifting copy?); unknown-category/UNK path explicit and monitored; null-rate/UNK-rate alerts exist.

**6. Quantify if the substrate exists:** served-feature logs present → run the per-feature diff on a sample (recompute the same entities/timestamps through the training path; report match rate + delta distribution, weighted by feature importance). Logs absent → that absence is itself a HIGH finding (skew is currently undetectable in production) and your code-diff findings remain hypotheses; say so explicitly.

**Scope discipline:** one model's feature surface. Read-only. Follow the two implementations wherever they live (including cross-language serving code — read it; do not assume the port is faithful, since the unfaithful port is the thing you're hunting).

## Output contract (emit exactly this structure)

```markdown
## Train/serve skew audit: <model> — <date>
**Feature source of truth:** <artifact/signature used>
**Implementations found:** training=<path(s)>, serving=<path(s)>, shared=<yes/no/partial>
**Verdict:** ALIGNED | DIVERGENT (N findings) | UNAUDITABLE (why)

| # | Feature | Divergence | Training (file:line) | Serving (file:line) | Severity | Est. impact |
|---|---|---|---|---|---|---|

### Finding details
[Per finding: the semantic diff in one sentence; which side is the definition; fix (short-term correction + which one-implementation architecture per the principles doc §1 fix ladder); prevention gate (golden-prediction seam test, freshness SLO+alert, shared contract file — per ml-engineer/principles/testing-ml-systems.md §4)]

### Staleness table
[Per precomputed feature: refresh cadence, training-assumed freshness, TTL behavior, monitored?]

### Aligned (evidence)
[Features verified equivalent — and by what: shared implementation / semantic diff clean / quantitative match rate]

### Unresolved (NOT aligned)
[Features whose serving implementation you could not locate or read; recommend escalation]
```

Severity per the source doc: CRITICAL = confirmed value divergence on a heavily-weighted feature; HIGH = staleness beyond training assumptions, missing ingress validation, no served-feature logging; MEDIUM = divergent null/UNK handling, unpinned preprocessing deps; LOW = missing SLOs/monitoring hygiene. Estimated impact = feature importance × divergence magnitude — say "unknown" when you can't compute it rather than guessing.
