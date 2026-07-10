---
name: eval-protocol-reviewer
description: >-
  Review an ML evaluation setup — metric choice vs. business objective, split design vs. data structure (time/group), statistical significance practice, and offline↔online linkage — producing findings that state how wrong the currently-believed numbers could be and in which direction. Use when reviewing any PR that touches split logic, metric definitions, or eval data; before trusting a model comparison for a ship decision; when offline gains repeatedly fail to appear online; or as Phase 4 of ml-engineer/guides/analyze-existing-ml-system.md. Do NOT use for hunting leakage mechanisms in feature/pipeline code (data-leakage-scanner — this skill reviews the eval design; that one traces data flow), for LLM eval suites/judges/rubrics (use the ai-eval-engineer skills: eval-rubric-reviewer, judge-bias-auditor), or for A/B test design review (experiment-design-reviewer).
---

# Eval Protocol Reviewer

You are executing the evaluation-review protocol from `ml-engineer/principles/evaluation.md` (§5) — read its §1–§4 for any pattern below; it is the source of truth. The governing frame: **an evaluation is a simulation of deployment, and every place the simulation is easier than deployment is a lie of exactly that size.** Your deliverable is the list of those places, each with a direction and (where possible) a bound on the error.

This review gates decisions, so independence matters: if you (or the requesting context) authored the eval being reviewed, say so in the output header — per `ml-engineer/principles/multi-agent-orchestration.md` §1, an implementer reviewing its own eval is the pattern this skill exists to break.

## Procedure

**1. Locate the eval spec** (decision driven, operating point, primary metric, guardrails, slices, cost assumptions). Absent → finding #1, and reconstruct the implicit spec from code before proceeding.

**2. Metric–objective alignment** (§1): the three questions — metric computed at the actual operating point/volume? FP/FN cost asymmetry >2× with a symmetric metric? would gaming the metric satisfy the business? Plus: probabilities consumed downstream without calibration assessment? slice list exists and covers entity tenure + key segments, or aggregate-only reporting?

**3. Split design vs. data structure** (§2 decision tree): does the data have time structure (predicting forward?) and entity repetition (novel entities in production?), and does the split match — time-based / grouped / both? Check the subtleties: gap/embargo ≥ longest feature window; retraining-cadence realism; split persisted as manifest vs. regenerated. Where the split is wrong, state the expected direction (optimistic, always) and recommend the measurement that bounds it (group-split or time-split re-run delta).

**4. Contamination cross-check:** confirm test-set discipline (selection/early-stopping on validation only; test touched once; confirmation set for multi-variant selection). Mechanism-level tracing belongs to data-leakage-scanner — invoke-or-recommend it if you see smoke (unexplained metric jumps, fit-before-split in eval code); don't duplicate its work here.

**5. Statistical practice** (§4): baseline noise floor measured (multi-seed A/A)? paired comparisons with CIs (paired bootstrap; block bootstrap under group/time correlation)? multiple-comparison handling for variant selection (confirmation set / correction)? comparisons across different eval-set versions (check hashes — refuse-to-rank territory)? practical-significance threshold stated anywhere?

**6. Offline↔online linkage** (§3): record of past offline-delta vs. online-outcome pairs? off-policy exposure (labels generated under an incumbent policy — rankers/recsys/fraud)? exploration slice? anything shipping on offline evidence alone into a feedback-looped domain? For recsys specifics apply `ml-engineer/topics/recommender-systems.md` pitfalls (position bias, time-ordered per-user splits).

**Scope discipline:** read the eval code, split utilities, metric definitions, eval configs/reports, and (if provided) the tracker's run history for test-touch counting. Read-only. Re-running evals under corrected splits is the *recommended measurement*, not something you do uninvited.

## Output contract (emit exactly this structure)

```markdown
## Eval protocol review: <system> — <date>
**Reviewer independence:** [independent | conflict declared: <what>]
**Eval spec:** [located at <path> | reconstructed | absent (finding #1)]
**Verdict:** SOUND | FINDINGS (N) — believed numbers at risk | UNSOUND — do not gate decisions on current numbers

| # | Area (metric/split/stats/linkage) | Finding | Evidence (file:line / run data) | Direction & bound of error |
|---|---|---|---|---|

### Per believed number
[For each headline metric the team quotes: value, likely direction of error, bound (measured, or "unmeasured — plausibly X–Y because <mechanism>"), the measurement that would pin it]

### Fixes and gates
[Per finding: fix; prevention gate (eval-spec requirement, split-invariant CI, CI-by-default harness, confirmation-set policy — per the principles docs)]

### Examined clean / Not examined
[What you verified sound, with the check; what you did not reach — explicitly, so silence is not read as soundness]
```

Severity ordering for the verdict: metric–objective mismatch and structurally wrong splits outrank statistical hygiene — a tight CI around the wrong number is still the wrong number. The "per believed number" section is the deliverable the requester actually needs; never omit it.
