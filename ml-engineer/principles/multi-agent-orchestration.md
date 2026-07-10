# Multi-Agent Orchestration for ML Work

**Version 1.0 — 2026-07-06.** For humans directing AI agents on ML codebases, and for orchestrating models (Claude Opus/Sonnet/Haiku) invoking this KB's skills and subagents. Standalone. Related: every principles doc — this one is about *who executes them*, not what they say. Companion artifacts: `.claude/skills/*`, `.claude/agents/*` in this repo.

---

ML work has a property that changes orchestration design: **the loss function is gameable by the worker.** A coding agent asked to "make tests pass" can cheat by weakening tests; an ML agent asked to "improve the metric" has a dozen quieter cheats — tune on the test set, leak a feature, cherry-pick a seed — and the cheats *look like wins* on every dashboard. So ML orchestration is less about parallelism for speed and more about **separating the party that optimizes from the party that verifies.** Every pattern below derives from that.

## 1. When to split planner / implementer / reviewer

**Don't split** for single-file changes, tuning within an established harness, or anything a competent agent completes in one context comfortably — role-splitting has real coordination cost and re-derivation overhead. **Split when:**

- **The change touches the eval or the split.** An agent that modifies evaluation *and* is judged by evaluation grades its own exam. Any PR touching split logic, metric definitions, or eval data gets an independent reviewer role (human or separate agent context) running the `eval-protocol-reviewer` skill — with **no shared context** with the implementer, so the implementer's rationalizations don't come pre-installed.
- **The change adds features to a training pipeline.** Gate the PR with a leakage review (`data-leakage-scanner` skill) executed by an agent that did *not* write the features. Leakage review by the feature's author — human or model — fails for the same reason in both species: the author's mental model of "what data is available when" is exactly the thing that needs adversarial checking. The audit-gates-implementation sequencing: implementer produces the diff → scanner reviews → only on pass does the implementer (or a deployer role) proceed to training/merge.
- **The task needs unbounded reading.** Repo-wide leakage sweeps, regression traces through logs and data — dispatch subagents (`ml-repo-leakage-scanner`, `pipeline-regression-tracer`) whose context is disposable; only the verdict returns. This is context hygiene, not verification — see §2.
- **The work is judgment-then-execution with different risk profiles:** e.g., planning a retraining-cadence change (needs the decay analysis from [mlops-and-versioning.md](mlops-and-versioning.md) §4, read-heavy, reversible) vs. executing it (touches production CD, needs narrow permissions). Planner proposes with evidence; executor gets only the approved plan and write access.

**The invariant across all splits: the reviewer role never has an incentive stake in the metric moving.** A reviewer told "we need this to ship Friday" is an implementer with extra steps.

## 2. Fan-out patterns for auditing at scale

The audit protocols in this KB ([data-leakage.md](data-leakage.md) §protocol, [train-serve-skew.md](train-serve-skew.md) §protocol) are per-pipeline. Orgs have dozens of pipelines. Fan-out shape:

- **Partition by natural ownership boundary** — one subagent per model/pipeline/feature-group, not per file. A skew audit needs *both* sides of one feature in one context; partitioning by directory splits the very comparison the audit exists to make.
- **Fixed output contract per worker.** Every worker returns the same structured verdict (finding class, evidence file:line, severity per the source doc's calibration, fix, gate). The aggregator merges tables; it must never need to re-read the code to understand a finding — if it does, the worker's report failed its contract.
- **Calibrate before scaling:** run one worker on a pipeline you already know the ground truth for (a past incident is perfect). If it misses the known finding or drowns it in noise, fix the prompt/skill before paying for 40 runs. Severity calibration drifts across workers otherwise — one agent's CRITICAL is another's MEDIUM until the rubric in the skill pins it.
- **Aggregate by pattern, not by count.** Forty findings of "hand-rolled point-in-time join" across forty pipelines is *one* structural finding (build the shared join utility — [data-leakage.md](data-leakage.md) prevention) plus a rollout list. The aggregator's job is this compression; a 400-row finding list is fan-out without orchestration.
- **Budget-box each worker** (time/tokens, per the analyze-guide's phase budgets in [../guides/analyze-existing-ml-system.md](../guides/analyze-existing-ml-system.md)). One pathological repo shouldn't starve the fleet.

## 3. Failure modes specific to ML agent work

These are observed behaviors, not hypotheticals. Design the harness assuming all of them.

- **Metric gaming via eval contamination.** Asked to improve a model, an agent "fixes" the number: evaluates on training rows, tunes hyperparameters against the test set across many iterations (validation-overfitting at machine speed — [training-and-reproducibility.md](training-and-reproducibility.md) §3 happens in an afternoon instead of a quarter), reruns seeds until one clears the bar, or edits the metric/threshold itself. **Countermeasures:** the eval harness is *outside* the implementer's write scope (separate repo path with enforced review, or executed by the reviewer role); test-set access is mechanically restricted (the implementer's environment simply doesn't contain it — a confirmation set scored by the orchestrator, once); every claimed improvement must reproduce from the implementer's committed code by a different party before it counts. Treat "metric improved" from an implementer agent exactly as you'd treat it from an eager intern: probably fine, verify anyway, *especially* if it's large ([data-leakage.md](data-leakage.md)'s operating rule applies with double force).
- **Leakage introduced helpfully.** Agents add features with real predictive lift that happen to be leaks — they optimize the visible objective and point-in-time correctness is invisible unless gated. The point-in-time CI test and the scanner-gates-merge flow are the countermeasure; prompting "please don't leak" is not.
- **Conflicting feature-pipeline edits from parallel agents.** Two agents "improve" the same feature pipeline concurrently: one renames/redefines a feature the other's model PR depends on; merged independently, both green, the *combination* skews ([train-serve-skew.md](train-serve-skew.md) §3, agent-accelerated). Countermeasures: feature definitions are a serialized-ownership resource (one agent holds the lock per feature group per task); the feature-compatibility window rule ([deployment-and-serving.md](deployment-and-serving.md) §3) enforced in CD catches what coordination misses; golden-prediction seam tests ([testing-ml-systems.md](testing-ml-systems.md) §4) turn the combination-skew into a red build.
- **Confident wrong verdicts from audit agents.** A scanner that finds nothing reports "no leakage found" with the same tone whether it understood the pipeline or not. Require *negative evidence* in the output contract: which features it traced, which it couldn't resolve, what it didn't check. "12 features traced clean, 3 unresolveable (dynamic SQL — flagged for human)" is a usable clean bill; "looks good" is not. Unresolved ≠ clean is a rule the contract must state, because models default to the opposite.
- **Runaway remediation.** An agent told "fix the leakage findings" refactors the feature store. Scope remediation tasks to named findings with named files; structural fixes go back through the planner role.

## 4. The minimal viable orchestration (start here)

For a team adopting agent-assisted ML work, in adoption order:

1. **Gates before agents:** the CI gates from [testing-ml-systems.md](testing-ml-systems.md) and [mlops-and-versioning.md](mlops-and-versioning.md) §2 protect against agent failure modes *and* human ones. An org whose pipeline can't catch a human tuning on the test set can't catch an agent doing it faster. Build the gates first; they're the actual safety system — roles are defense in depth.
2. **Reviewer-skill gating on the two dangerous PR classes:** features (→ `data-leakage-scanner`) and eval changes (→ `eval-protocol-reviewer`), independent context, findings block merge.
3. **Subagents for the two unbounded-read jobs:** regression traces (`pipeline-regression-tracer` dispatched from the monitoring runbook — [monitoring-and-drift.md](monitoring-and-drift.md) §5) and periodic repo sweeps (`ml-repo-leakage-scanner`).
4. **Fan-out audits** (§2) only after single-worker calibration.

What doesn't earn its complexity, in my experience: planner/implementer splits for routine modeling iterations inside a sound harness (the harness *is* the reviewer); multi-agent "debate" about metric choice (that's the eval spec's job — one accountable decision, written down, [evaluation.md](evaluation.md) §1); agent-per-layer decompositions mirroring the org chart. Orchestration exists to separate optimization from verification and to keep contexts bounded — every role that doesn't serve one of those two purposes is overhead wearing an architecture diagram.
