# ml-engineer — Production ML Judgment, Encoded

**Version 1.0 — 2026-07-06.** A self-contained knowledge base distilled from 20+ years of building, training, and operating ML systems in production — written to be used without its author, by junior-through-staff engineers and by AI models invoking the bundled skills/subagents. Structure rationale: [DESIGN.md](DESIGN.md). Vocabulary: [GLOSSARY.md](GLOSSARY.md). History: [CHANGELOG.md](CHANGELOG.md).

**The organizing idea:** nearly every serious ML failure is a silent divergence between two things that were supposed to be the same — training vs. serving features, offline metric vs. business objective, logged experiment vs. actual run, yesterday's world vs. today's. Every doc teaches one divergence class; every skill/subagent detects one.

## Find what you need (30 seconds)

**"I want to..."**

| ...do this | Go to |
|---|---|
| Build a new ML pipeline end-to-end | [guides/build-ml-pipeline-from-scratch.md](guides/build-ml-pipeline-from-scratch.md) |
| Assess an unfamiliar ML codebase | [guides/analyze-existing-ml-system.md](guides/analyze-existing-ml-system.md) |
| Review a PR that adds/changes **features or splits** | Skill: `data-leakage-scanner` |
| Check why **online quality lags offline eval** | Skill: `train-serve-skew-auditor` |
| Vet an **evaluation setup / model comparison** | Skill: `eval-protocol-reviewer` |
| Trace a **live model-quality regression** | Subagent: `pipeline-regression-tracer` |
| Sweep a **whole repo** for leakage/skew | Subagent: `ml-repo-leakage-scanner` |

**"I need the judgment on..."** (principles — each: failure mode → detection → fix → prevention)

| Topic | Doc |
|---|---|
| Data leakage (target, contamination, preprocessing, group) | [principles/data-leakage.md](principles/data-leakage.md) |
| Train/serve skew (computation, staleness, schema drift) | [principles/train-serve-skew.md](principles/train-serve-skew.md) |
| Evaluation (metrics, splits, significance, offline↔online) | [principles/evaluation.md](principles/evaluation.md) |
| Training discipline (repro, overfitting, HPO, distributed) | [principles/training-and-reproducibility.md](principles/training-and-reproducibility.md) |
| Deployment (batch/online, latency, rollback, canary/shadow) | [principles/deployment-and-serving.md](principles/deployment-and-serving.md) |
| Monitoring (drift types, what to watch, alerting, feedback loops) | [principles/monitoring-and-drift.md](principles/monitoring-and-drift.md) |
| MLOps (registry, CI/CD for models+data, rollback, retraining) | [principles/mlops-and-versioning.md](principles/mlops-and-versioning.md) |
| Testing ML systems (features, data contracts, seams) | [principles/testing-ml-systems.md](principles/testing-ml-systems.md) |
| Orchestrating agents on ML work | [principles/multi-agent-orchestration.md](principles/multi-agent-orchestration.md) |

**"I'm working in..."** (topics — stack mechanics)

Core tier (full depth): [sklearn-pipelines](topics/sklearn-pipelines.md) · [pytorch-training](topics/pytorch-training.md) · [experiment-tracking (MLflow)](topics/experiment-tracking.md) · [feature-stores (Feast)](topics/feature-stores.md) · [serving-patterns](topics/serving-patterns.md)
Extended tier (patterns + pitfalls): [distributed-training](topics/distributed-training.md) · [tensorflow](topics/tensorflow.md) · [automl](topics/automl.md) · [recommender-systems](topics/recommender-systems.md) · [time-series-forecasting](topics/time-series-forecasting.md)

## Where to start

- **New to the KB, human:** this page → skim both guides → read [principles/data-leakage.md](principles/data-leakage.md) and [principles/train-serve-skew.md](principles/train-serve-skew.md) in full (they carry the KB's two central failure classes) → the rest as your work demands.
- **AI model invoked as a skill/subagent:** your SKILL/agent file links exactly the principles sections you need; every doc is standalone by design.
- **Junior engineers:** the guides are sequenced so you can follow them without having read anything else; each step links its *why*.
- **Staff+ / reviewers:** each principles doc ends with a review protocol; the skills are those protocols with output contracts.

## Rules this KB lives by

1. Every doc is independently readable and carries a version/date stamp plus the framework versions it was verified against.
2. Facts live in one place; everything else links (see [DESIGN.md](DESIGN.md) boundary rules before adding content).
3. Skills do bounded reviews in your context; subagents isolate unbounded reading. Their frontmatter says when *not* to use them — respect it.
4. Strong claims are backed by incidents. If you revise a rule, keep (or replace) its war story — the *why* is what makes rules survive contact with deadlines.
