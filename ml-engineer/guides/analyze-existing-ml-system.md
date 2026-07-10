# Guide: Analyze an Existing ML System (Bounded Time Budget)

**Version 1.0 — 2026-07-06.** For humans or agents handed an unfamiliar ML codebase/pipeline and asked "is this sound?" Deliverables and phase budgets are fixed; depth flexes to fit. Standalone; links carry the depth. Fan-out version for many pipelines: [../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) §2 — calibrate on one system with this guide first.

**The three deliverables (write their skeletons before you start; fill as you go):**
1. **Leakage & skew risk assessment** — findings with class, evidence (file:line + data facts), severity.
2. **Evaluation-methodology review** — how wrong could their believed numbers be, and in which direction.
3. **Prioritized remediation plan** — ordered by (production risk × confidence), each item with its prevention gate.

**Time budgets** (scale: S ≈ half-day for one model+pipeline; M ≈ 2 days for a system with serving+retraining; L ≈ 5 days for multi-model). Percentages below apply to whichever you're on. **The budget is a deliverable-forcing device: when a phase's time is up, write what you have, mark unresolved items as explicitly unresolved (never as clean — [../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) §3's negative-evidence rule), and move on.**

---

## Phase 1 — Establish what the system claims to be (15%)

Read before judging: README/design docs, then the *actual* entrypoints (training script, serving path, scheduler configs — trust cron/CI definitions over docs; docs describe intentions, schedulers describe reality).

Answer in writing:
- **The prediction contract:** at time T, for entity E, with data latency L, predict Y to drive decision D. Reconstruct it from code if undocumented — and if it *can't* be reconstructed, that's finding #1 (severity HIGH: nobody can audit leakage against an undefined prediction point — [../principles/data-leakage.md](../principles/data-leakage.md) §protocol).
- **The architecture:** batch/online/hybrid ([../topics/serving-patterns.md](../topics/serving-patterns.md)), where features are computed (how many implementations? — this number is the skew surface), what retrains, on what trigger.
- **The four incident questions** ([../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md)): which model is live, what data trained it, is it the evaluated artifact, can they roll back. Ask by demonstration, not interview.
- **Stack inventory** with versions — routes you to [../topics/](../topics/) docs (inherited TF system → [tensorflow.md](../topics/tensorflow.md); Feast present → [feature-stores.md](../topics/feature-stores.md) §3's audit list; AutoML artifacts → [automl.md](../topics/automl.md) pitfalls).

## Phase 2 — Leakage assessment (25%)

Run the protocol from [../principles/data-leakage.md](../principles/data-leakage.md) (§protocol, severity calibration included) against deliverable 1. Priorities under budget:

1. **The split** (highest yield per minute): find it, check policy vs. data structure (timestamps? repeated entities? → [../principles/evaluation.md](../principles/evaluation.md) §2 tree), stability across retrains, persistence as artifact. A wrong split undermines every number they've ever reported — check it before admiring any feature.
2. **Preprocessing order:** every `.fit`/`fit_transform`/target-encode/select relative to the split. In notebooks, check execution-order poisoning. ([../principles/data-leakage.md](../principles/data-leakage.md) §3; sklearn specifics in [../topics/sklearn-pipelines.md](../topics/sklearn-pipelines.md) §2.)
3. **Feature time-semantics:** for the top-importance features (get the importance list — it's your reading order), trace lineage and answer the latest-influencing-timestamp question. Feature-store systems: check `event_timestamp` provenance at every `get_historical_features` call ([../topics/feature-stores.md](../topics/feature-stores.md) §3).
4. **Cheap detectors if you can execute code:** train/test ID+content overlap, single-feature ablation on the top feature, group-split re-evaluation. An hour of compute that converts suspicions into numbers.

## Phase 3 — Train/serve skew assessment (20%)

Protocol from [../principles/train-serve-skew.md](../principles/train-serve-skew.md) (§audit protocol). Priorities:

1. Count feature implementations (Phase 1's number). Two+ → diff semantics per top feature: source, window, units, nulls, timezone, normalization, dependency pins.
2. Staleness: materialization/refresh cadence vs. what the training join assumed; freshness monitoring present?
3. The serving boundary: schema validation? UNK/null paths monitored? preprocessing inside or outside the artifact?
4. **Served-feature logging exists?** If yes, run the quantitative skew diff on a sample — the single most conclusive hour available in this whole guide. If no, that absence is itself a HIGH finding (every future skew incident is currently undetectable).

## Phase 4 — Evaluation-methodology review (20%)

This is deliverable 2; run the protocol from [../principles/evaluation.md](../principles/evaluation.md) §5. Under budget, the four questions with the biggest wrongness-exposure:
- Metric vs. decision (§1's three questions — including calibration if probabilities are consumed, and slicing).
- Split realism (already assessed Phase 2 — here, translate into "reported X, believable range is X−Δ").
- Significance hygiene: noise floor measured? CIs anywhere? test-set touch count ("unknown" = treat test numbers as validation numbers — [../principles/training-and-reproducibility.md](../principles/training-and-reproducibility.md) §3)?
- Offline–online linkage: any record of offline deltas vs. A/B outcomes? anything shipped on offline evidence alone into a feedback-looped domain ([../principles/monitoring-and-drift.md](../principles/monitoring-and-drift.md) §4)?

**Write the direction-of-error sentence for every believed number** — "0.91 AUC, likely optimistic by the group-leak delta (unmeasured, plausibly 0.05–0.15)" is the deliverable's voice: quantified where possible, bounded where not, never vague.

## Phase 5 — Operations spot-check (10%)

Not a full ops audit — just the items whose absence turns incidents into archaeology: monitoring layers 1–3 present ([../principles/monitoring-and-drift.md](../principles/monitoring-and-drift.md) §2)? prediction logs with model version? rollback rehearsed and compatibility-windowed ([../principles/deployment-and-serving.md](../principles/deployment-and-serving.md) §3)? retraining gated by champion/challenger or fire-and-forget ([../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md) §2/§4)? CI: any of the big four tests (point-in-time, split invariants, smoke training, seam test — [../principles/testing-ml-systems.md](../principles/testing-ml-systems.md))?

## Phase 6 — Synthesis: the remediation plan (10%)

Order findings by **production risk × confidence**, not by discovery order or intellectual interest. Standard shape of the top of the list, from experience:
1. Anything CRITICAL from leakage (their numbers are fiction — remediation starts with *re-measuring reality*, because every other priority depends on knowing actual model quality).
2. Confirmed skew on weighted features (production is degraded *right now*).
3. Missing prediction/served-feature logging (blocks diagnosis of everything else; cheap; do early even though it fixes nothing directly).
4. Split/eval corrections + the CI gates that lock them (prevents the findings from regrowing).
5. Ops gaps in incident-cost order.

Each item: finding link, concrete fix, its **prevention gate** (the test/monitor/CI check from the relevant principles doc — a fix without a gate is a finding on a return trip), and effort class (hours/days/weeks). Resist scope creep in writing: remediation ≠ rebuild; note where [build-ml-pipeline-from-scratch.md](build-ml-pipeline-from-scratch.md) patterns apply *if* a rebuild is separately decided.

## Report skeleton

```markdown
# ML System Analysis: <system> — <date>, budget <S/M/L>
## System summary (Phase 1: contract, architecture, stack, incident-question scorecard)
## Leakage & skew findings
| # | Class | Evidence (file:line + data fact) | Severity | Believed-number impact |
## Evaluation review (per believed metric: value, direction & bound of error, why)
## Remediation plan (ordered; fix + gate + effort each)
## Not examined / unresolved (explicit — absence of a finding here is not absence of risk)
```

The last section is mandatory and is where audit integrity lives: unread code, unverifiable lineage, and out-of-time items are declared, because the reader will otherwise assume silence means clean — and three weeks later ([../principles/train-serve-skew.md](../principles/train-serve-skew.md)'s favorite interval) that assumption becomes your finding.
