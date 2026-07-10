# Changelog — ml-engineer KB

All notable additions and revisions to this knowledge base, against dated framework versions. Maintainers: bump doc version stamps when revising, and record here which framework movements triggered the revision.

## v1.0 — 2026-07-06 (initial release)

**Framework baseline this release was written and verified against:** Python 3.11+, scikit-learn 1.6–1.7, PyTorch 2.4–2.7 (CUDA 12.x), MLflow 2.14+/3.x (alias-based registry), Feast 0.40+, pandas 2.x, Optuna 3.x/4.x, pytest 8.x, pandera 0.20+/Great Expectations 1.x, TF 2.16–2.17/Keras 3.x era.

**Added — structure:** `README.md` (map), `DESIGN.md` (primitive-assignment rationale, incl. the deliberate eval-protocol-reviewer skill-not-subagent deviation), `GLOSSARY.md`, this changelog.

**Added — principles (full failure-mode → detection → fix → prevention depth):** data-leakage (4-class taxonomy + review protocol + severity calibration), train-serve-skew (3 variants + audit protocol + architecture decision tree), evaluation (metric–objective, split design, offline↔online, significance), training-and-reproducibility (repro checklist, layered overfitting detection, search discipline, distributed summary), deployment-and-serving (batch/online tree, latency budgets, rollback windows, shadow/canary for models, degradation ladders), monitoring-and-drift (concept vs. data drift, four monitoring layers, alerting design, feedback loops, first-30-minutes runbook), mlops-and-versioning (registry discipline, three-pipeline CI/CD, rollback flavors, retraining cadence), testing-ml-systems (feature unit tests, data contracts, training mechanics, seam tests, what-not-to-test), multi-agent-orchestration (role splits, fan-out patterns, ML-specific agent failure modes).
**Added — topics, core tier (full depth):** sklearn-pipelines, pytorch-training, experiment-tracking (MLflow; W&B translation notes), feature-stores (concepts + Feast), serving-patterns.
**Added — topics, extended tier (production patterns + pitfalls):** distributed-training, tensorflow, automl, recommender-systems, time-series-forecasting.
**Added — guides:** build-ml-pipeline-from-scratch (capability A, phase-by-phase with done-when), analyze-existing-ml-system (capability B, budgeted phases + report skeleton).
**Added — skills (`.claude/skills/`):** data-leakage-scanner, train-serve-skew-auditor, eval-protocol-reviewer — each with trigger + when-not-to-use frontmatter and output contracts.
**Added — subagents (`.claude/agents/`):** pipeline-regression-tracer, ml-repo-leakage-scanner — read-only tool allowlists (Read, Grep, Glob, Bash), report contracts with coverage-honesty requirements.

**Known staleness risks to watch (re-verify on upgrade):** Feast API signatures move fast (topics/feature-stores.md flags this); MLflow 3.x continues deprecating stage APIs (topics/experiment-tracking.md §2); sklearn pickle compatibility remains per-minor-version (topics/sklearn-pipelines.md §6); PyTorch `weights_only` checkpoint semantics (topics/pytorch-training.md §4); Keras multi-backend numerics (topics/tensorflow.md).

<!-- Template for future entries:
## vX.Y — YYYY-MM-DD
**Framework movements prompting revision:** ...
**Changed:** doc — what and why (link the incident/issue if one prompted it)
**Added / Removed:** ...
-->
