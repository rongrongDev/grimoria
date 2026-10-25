# Multi-Agent Orchestration for FinOps Work

**Applies to:** running AI agents (Claude-class, any size) against cloud cost work using this KB's skills and subagents. Provider-agnostic.
**Last verified:** 2026-07-25

This doc covers *how to structure agent work*, not what the work is — the skills and principles docs own that. Read this before pointing any agent with tool access at a cloud estate.

## The prime directive: agents analyze; humans transact

The money-touching acts in this domain — **deleting resources, purchasing/exchanging/cancelling commitments, changing capacity or autoscaling settings, modifying tags in bulk** — are executed by humans (or by human-approved change pipelines owned by `devops-engineer/` machinery), never directly by an analysis agent. Two reasons, both learned expensively:

1. **Asymmetric, delayed blast radius.** An agent that mislabels noise as signal in a report costs a re-read. An agent that "cleans up" an idle-looking resource that was the DR standby costs an unbounded amount at the worst future moment — the feedback that would have taught the agent it was wrong arrives months later, at failover. Idle-looking and safe-to-delete are different properties, and the difference lives in organizational context agents don't reliably hold.
2. **A multi-year purchase is not a retry-able action.** A commitment transaction binds the org for 1–3 years on the agent's read of a usage snapshot. The entire discipline of `finops-engineer/principles/commitments-and-discounts.md` exists because *humans* get that bet wrong with full context; an agent executing purchases removes the one gate (the pre-purchase review conversation) that catches the wrongness.

Mechanically: subagent tool allowlists in this KB are read-only (see `finops-engineer/DESIGN.md`); recommendations route to owners; every skill's output contract ends in a handoff, not an action. Where automated *execution* is genuinely wanted (TTL teardown of tagged-ephemeral environments, scheduled non-prod stop/start), build it as guard-railed pipeline automation with human-owned policy — `devops-engineer/` territory — not as agent discretion.

## Pattern 1 — Fan-out audits (many accounts, one rubric)

Auditing tagging coverage or spend posture across N accounts/teams parallelizes cleanly *because the units are independent*:

- **Coordinator** holds only the account list, the shared rubric, and the aggregate; it dispatches one worker per account and never touches raw billing data itself.
- **Workers** run `finops-engineer/skills/spend-posture-assessor/SKILL.md` (or `tag-coverage-auditor` for tags-only) per account, or dispatch `finops-engineer/agents/unallocated-spend-scanner.md` where the account is big enough to need mining. Each returns its output contract verbatim — the contracts are designed to aggregate without prose reparsing.
- **Scope discipline is the correctness condition.** Each worker claims findings and savings *only inside its assigned scope*. Cross-account items (shared services, consolidated-billing commitment benefit, org-level discounts) are **coordinator-only** work — they are precisely the items that get double-counted when every worker "helpfully" includes them (see failure mode 3).
- Cap the fan-out's aggregate report the way every output contract here caps itself: ranked, ≤3 P0s. Forty accounts × 10 findings pasted together is not an assessment; it's a landfill with headers.

## Pattern 2 — Continuous watcher (anomaly triage as a standing agent)

Cost anomalies reward continuous attention, and month-end-only review has a built-in 30-day detection floor (`finops-engineer/principles/cost-anomaly-detection.md`). A scheduled agent (cron-dispatched, daily or on alert-fire) running `finops-engineer/skills/cost-anomaly-triager/SKILL.md` works well with three constraints:

- **It dispositions, it doesn't remediate** — classification + owner-addressed recommendation, per the prime directive. Even "obvious" runaways: the resource pegging CPU at 2am is occasionally the launch load test someone forgot to annotate.
- **It must be allowed to say "nothing to report."** A watcher rewarded for finding things manufactures findings, and manufactured findings mute the channel — alert fatigue rebuilt at the agent layer. Silence on a quiet day is the correct output.
- **Its memory is the annotation trail, not its context.** Each run reads/writes the expected-change annotations and prior dispositions (a file or channel — durable, human-visible), so Tuesday's agent knows Monday's spike was dispositioned ONE-OFF. Stateless re-triage of the same spike every day is the agent-layer version of the alert nobody actioned.

## Pattern 3 — Planner / implementer / reviewer for optimization changes

For changes that touch live capacity (rightsizing, scheduling, autoscaling limits, spot adoption), split roles even when one agent could nominally do it all — the split exists to force the reliability gate into the structure:

- **Planner** builds the proposal from `finops-engineer/principles/cost-optimization.md`: peak-inclusive evidence, commitment-portfolio impact (dispatch `finops-engineer/agents/commitment-utilization-analyzer.md` — optimization strands coverage), cross-team effects, rollback plan.
- **Reliability reviewer** — a *separate* agent (or human) whose only brief is `reliability-engineer/` judgment: does this eat a margin an SLO depends on? Was the evidence window seasonal-complete? It holds veto, and its veto is not negotiable by the planner. The whole point of separating it is that a single agent asked to "optimize cost while considering reliability" reliably lets the optimization objective erode the consideration — the same failure as the human cost-push that caused the rightsizing outage, automated.
- **Implementer** is the normal change pipeline (canary, SLO-watched, rollback-ready — `devops-engineer/principles/deployment-strategies.md`), executing only planner-proposed, reviewer-passed, owner-signed changes.
- Commitment purchases follow the same shape with `finops-engineer/skills/commitment-proposal-reviewer/SKILL.md` as the reviewer and *finance* sign-off before any human transacts.

## Failure modes specific to agents on FinOps work

1. **The SLO-breaching optimizer.** An agent scores savings against a visible objective (the bill) and risks against an invisible one (margins, SLOs it can't see). Symptom: recommendations that are all technically "unused capacity." Fix: the reviewer split above, and never granting the optimizer execution rights. Detection net: `reliability-engineer/` alerting catches what slips through — but if that's your detection layer, the process already failed.
2. **The helpful cleaner.** Scanner-type agents drifting from measuring waste to removing it (the auditor-with-a-pen problem). Prevention is structural, not promissory: read-only allowlists, and output contracts whose orphan sections end in a *confirmation path*, not a verdict.
3. **Double-counted savings.** Parallel agents each attribute the same saving — the commitment analyzer counts a rightsizing's effect, the per-account assessor counts it, the optimization planner counts it; leadership hears 3× the real number, and the practice's credibility (its actual currency — `finops-engineer/principles/operating-model-and-maturity.md`) pays the difference. Prevention: single savings ledger at the coordinator, scope-limited claims in every worker contract, and all results measured against the *forecast baseline* (`finops-engineer/topics/budgeting-and-forecasting.md`) — a shared counterfactual arithmetically can't pay the same dollar twice.
4. **Snapshot advice outliving its snapshot.** An agent's recommendation inherits its data's timestamp, but reads as timeless once written down. A commitment sizing computed in March quietly consumed in June, two migrations later, is the stranded-RI story with extra steps. Every agent output here carries its data window in the header — treat a stale window as expired, re-run rather than reuse.
5. **Context poisoning by billing data.** Mining millions of line items in the conversation where decisions are being made buries the decision. That's why the mining lives in `finops-engineer/agents/` subagents that return ≤80 lines — respect the boundary; don't "quickly check the CUR" inline.

## When NOT to orchestrate

One account, one question, one anomaly → one skill in the main conversation. The stakeholder negotiations — tag-schema agreement, shared-cost split rules, chargeback decisions, EA negotiation — are human-led with agent *support* at most (`finops-engineer/DESIGN.md` on why the build-from-scratch playbook has no skill form). Orchestration is for scale (many accounts), cadence (continuous watch), or adversarial structure (the reviewer split). Everything else is ceremony.
