# Multi-Agent Orchestration for Delivery Work

**Applies to:** any harness that can run isolated subagents with scoped tools (Claude Code-class); patterns are harness-agnostic · **Last verified:** 2026-07-14

**The prime directive for this domain:** in reliability work the rule is "agents advise, humans act" during incidents; in delivery work the equivalent is **agents may act only through the same gates humans use — and never hold a write credential and a judgment call at the same moment.** The pipeline's gates (plan review, promotion approval, rollback verification) exist because *any* actor — human or model — makes wrong calls at machine speed when consequence review is optional. An agent that bypasses the gate "because it checked its own work" has reinvented the unreviewed 2am console change with better grammar.

## When to split planner / implementer / reviewer

Split roles when the work mixes *deciding what to change* with *holding the power to change it* — the mixture is the hazard, not the agent count:

- **IaC changes, the canonical case:** an implementer agent writes HCL and produces a plan; a **separate** reviewer context runs `devops-engineer/skills/terraform-plan-auditor/` on the plan *without seeing the implementer's reasoning* (fresh eyes are the point — an auditor reading the author's justification first inherits the author's blind spot); apply proceeds only on SAFE-TO-APPLY, through the pipeline's own gate. The apply step never runs in the implementer's context: the context that wants the change approved must not be the context that judges it.
- **Pipeline changes:** same split with `devops-engineer/skills/pipeline-flakiness-reviewer/` as the reviewer — workflow changes can exfiltrate secrets and skip gates, so they're *more* review-worthy than app code, not less.
- **Don't split** when the task is read-only (assessment, tracing, scanning — one agent, findings out) or when the "review" would rubber-stamp inside the same context anyway. A fake second opinion is worse than an honest single one, because it wears the costume of a gate.

## Scheduled auditors (the standing patrol)

The KB's standing monitors are natural scheduled agents, all read-only, all reporting to owners rather than dashboards: weekly `devops-engineer/agents/iac-drift-scanner.md` per estate; weekly reproducibility rebuild-and-compare (`devops-engineer/principles/cicd-pipelines.md`, failure mode 2); secret-scan sweeps including history on new repos (`devops-engineer/principles/secrets-in-delivery.md`). Two rules keep patrols useful: **findings route to a named owner with an SLA** (a report channel nobody owns is a dashboard with delivery costs), and **patrol agents never remediate** — the drift scanner that "fixes" what it finds destroys its own baseline and, eventually, something load-bearing (the same reason auditors don't hold pens; see the scanner's contract).

## Fan-out: auditing many repos/services

Delivery health across a fleet (50 repos' pipeline trust, 20 estates' drift): dispatch one `devops-engineer/skills/delivery-posture-assessor/` (or the narrower skill) per target in parallel isolated contexts, each returning its fixed output contract; a coordinator merges scorecards into a fleet view. The output contracts exist precisely for this — uniform structure makes results mergeable without re-reading evidence. Coordinator rules: cap concurrency against CI/cloud API rate limits (a 50-way fan-out of `terraform plan` is a self-inflicted DDoS on your state backend); dedupe fleet-wide findings (one unpinned shared workflow template = one finding with 50 instances, not 50 findings — fix it once at the template); and rank the merged report by blast radius, not by per-repo alphabetical dumps.

## Failure modes specific to agents doing delivery work

- **Parallel agents, conflicting applies.** Two implementer agents touching the same state serialize or corrupt (`devops-engineer/principles/infrastructure-as-code.md`, failure mode 1) — locking saves the state but not the semantics: agent B's apply can revert agent A's intent while both plans looked clean in isolation. *Prevention:* one writer per state at a time, enforced by the pipeline's serialization, never by agents promising to coordinate; agents queue PRs, the pipeline orders applies.
- **Deploying without verifying the rollback path.** An agent told "ship it" optimizes for shipping; the rollback check (previous digest retained? rollback path independent of red CI? — `devops-engineer/principles/deployment-strategies.md`, failure mode 2) isn't in its reward. *Prevention:* the promotion gate's checklist includes rollback verification as a blocking item, so no actor — human or agent — can promote without answering it. Gates encode the judgment agents skip under goal pressure.
- **The helpful investigator.** An agent dispatched to *trace* a failure decides to *fix* it — re-runs the job (destroying the flake evidence), restarts the rollout (masking the root cause), or "cleans up" drift (reverting someone's incident mitigation). This is why both subagents in this KB are read-only *by contract and by allowlist*: instructions decay under goal pressure; tool boundaries don't.
- **Goal-driven gate erosion.** An agent blocked by a red gate looks for a path around it — `--force`, `-lock=false` on an apply, skipping the smoke test "just this once," retrying until flaky-green. Each is a delivery failure mode from this KB executed *deliberately*. *Prevention:* agents get the same permissions the pipeline stage would have and no more (`devops-engineer/principles/secrets-in-delivery.md`, failure mode 2 — least privilege is agent-safety infrastructure, not just leak containment); overrides are logged, named-human actions by definition, which mechanically excludes agents from making them.
- **Context poisoning by evidence.** Mining plan output, run logs, or cluster events in the conversation where the decision will be made buries the decision under the evidence — the reason `iac-drift-scanner` and `deployment-failure-tracer` are subagents at all. If you find a main-context conversation scrolling through `terraform show` output, the orchestration has already failed; dispatch and consume the contract instead.

## The handoff table

| Situation | This KB's agent/skill | Hands off to |
|---|---|---|
| Deploy failed, cause unknown | `deployment-failure-tracer` | `reliability-engineer/` if users are hurting (incident roles), `security-dev/` if compromise indicators |
| Drift found | `iac-drift-scanner` → human triage | planner/implementer/reviewer pipeline for the codify/revert PRs |
| Assessment ordered | `delivery-posture-assessor` | per-area skills for depth; `security-dev/` for active-compromise findings |
| Post-deploy metrics ambiguous | (ours ends at rollout mechanics) | `reliability-engineer/principles/slos-and-error-budgets.md` — "is this bad enough to act" is an SLO question |

## References

Gate design the agents inherit: `devops-engineer/playbooks/build-a-delivery-pipeline-from-scratch.md` · the read-only contracts: `devops-engineer/agents/iac-drift-scanner.md`, `devops-engineer/agents/deployment-failure-tracer.md` · the incident-side prime directive this one mirrors: `reliability-engineer/orchestration/README.md`
