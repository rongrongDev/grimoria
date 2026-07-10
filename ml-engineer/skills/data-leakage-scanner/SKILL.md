---
name: data-leakage-scanner
description: Review a feature-engineering/training pipeline (a PR diff, named files, or one pipeline directory) for data leakage — target leakage, train/test contamination, preprocessing-before-split, and group leakage — producing severity-rated findings with evidence and prevention gates. Use when reviewing any PR that adds/changes features or split logic, when an offline metric jumped suspiciously, before first-training a new pipeline, or as Phase 2 of ml-engineer/guides/analyze-existing-ml-system.md on a single system. Do NOT use for whole-repository sweeps across many pipelines (dispatch the ml-repo-leakage-scanner subagent — unbounded reading floods this context), for training-vs-serving divergence (use train-serve-skew-auditor — that compares two implementations; this audits one pipeline's time-correctness), or for eval metric/split-policy design questions (use eval-protocol-reviewer).
---

# Data Leakage Scanner

You are executing the leakage review protocol from `ml-engineer/principles/data-leakage.md` on a bounded scope (a diff, named files, or one pipeline). Read that doc's four-class taxonomy and severity calibration if any pattern below is unfamiliar — it is the source of truth; this skill is its procedure.

**Stance:** leakage only ever makes metrics *better*, so you are adversarially auditing every path by which future, test-set, or label information could reach training. An unexplained metric improvement in the PR description is evidence, not reassurance. You must classify findings against the four classes, and you must report unresolved lineage as unresolved — never as clean.

## Procedure

**1. Bind the prediction contract first** (do not start grepping without it): at time T, for entity E, with data latency L, predict Y. Extract from docs/code/PR description; if it cannot be established, emit that as the first finding (HIGH) and audit against the most conservative reading.

**2. Class 1 — target leakage.** For each feature in scope, trace to its source and answer: *latest event-timestamp that can influence this value, relative to T?* Flag: aggregates without an `as_of`/`event_time < T` bound; joins to mutable dimension tables; features causally downstream of Y (status/outcome-adjacent columns); any feature whose lineage you cannot resolve (report as unresolved). If you can execute code: single-feature ablation on the top-importance feature; importance dominance >5× second place = investigate before trusting.

**3. Class 2 — contamination.** Locate the split. Check: split before augmentation/oversampling/dedup? keyed on stable IDs and persisted as a manifest, or regenerated per run? early stopping/model selection reading validation only, test read exactly once? If executable: assert train∩test = ∅ on IDs and content hashes.

**4. Class 3 — preprocessing leakage.** Find every `.fit`/`.fit_transform`/groupby-aggregate-onto-self/feature-selection call and place it relative to the split. In sklearn code the mechanical rule is: any fit outside a `Pipeline` in modeling code is a finding (`ml-engineer/topics/sklearn-pipelines.md` §2 lists the disguises: hand-rolled target encoding, pre-split SMOTE, pre-split SelectKBest, pandas groupby features). In notebooks, audit execution order, not just code order.

**5. Class 4 — group leakage.** Identify candidate grouping keys (user/patient/account/device/document-source). Does the split policy group by the entity that will be novel at prediction time? If executable: overlap count per key across splits; group-split re-evaluation delta if cheap.

**6. Prevention gates.** For each finding, name the specific gate from `ml-engineer/principles/data-leakage.md` prevention items / `ml-engineer/principles/testing-ml-systems.md` (point-in-time test, split-invariant CI assertions, no-fit-outside-pipeline lint, split manifest) that keeps it fixed.

**Scope discipline:** stay within the given diff/files/pipeline plus the minimal upstream you must read to resolve lineage (feature definitions, split utilities, schema). You are read-only; execute code only for the named detectors, never to "fix and see."

## Output contract (emit exactly this structure)

```markdown
## Leakage scan: <scope> — <date>
**Prediction contract:** <T/E/L/Y sentence, or "UNESTABLISHED (finding #1)">
**Verdict:** CLEAN | FINDINGS (N) | BLOCKED (cannot audit — why)

| # | Class (1–4) | Evidence (file:line + the data fact) | Severity | Metric impact |
|---|---|---|---|---|

### Finding details
[Per finding: mechanism in one sentence; fix; prevention gate]

### Traced clean
[Features/paths examined and cleared — with the check that cleared them]

### Unresolved (NOT clean)
[Lineage you could not resolve and why; recommend escalation — e.g. dispatch ml-repo-leakage-scanner if resolution requires unbounded reading]
```

Severity per the source doc's calibration: CRITICAL = target/label leakage (metrics are fiction); HIGH = novel-entity group leakage, unstable split; MEDIUM = unsupervised preprocessing leakage; LOW = hygiene gaps. If verdict is CLEAN, the "Traced clean" section must demonstrate coverage — a clean verdict with an empty evidence trail is a failed review.
