# Irreversible Actions & Human-in-the-Loop Gate Design

**Version 1.0 — 2026-07-06.** Applies to: any agent that can take actions with real-world, external, or hard-to-undo effects — payments/transfers, deletions, access/permission changes, external communications (email, tickets, posts, messages to customers), code deploys, infrastructure changes, physical-world actuation. Framework-agnostic. Core-tier, full depth.

> This is the doc about the **last line of defense.** When least privilege ([excessive-agency.md](excessive-agency.md)) and injection containment ([indirect-prompt-injection.md](indirect-prompt-injection.md)) have done their work, some irreversible actions remain — and a human, or a human-quality check, has to stand between the agent and the point of no return. This doc is about making that check *real*.

---

## 1. What "irreversible" means, precisely

An action is irreversible for red-team purposes if, once taken, it cannot be undone *at zero cost within the task window* by the agent or operator. The test is practical, not philosophical:

- **Truly irreversible** — the effect propagates beyond your control the instant it fires: money leaves the account, an email reaches an outside recipient's inbox, data is disclosed to a third party, a customer-facing message is posted. You can send an apology, not un-send the message.
- **Effectively irreversible** — technically undoable but costly, slow, or damaging: a hard delete with no backup, a force-push that rewrote history, a production config change that caused an outage, revoked access that locked people out. "We restored from backup four hours later" is not reversibility; it's incident response.
- **Reversible** — a draft, a staged change, a scratch file, a proposal awaiting approval, anything in a sandbox with no external effect. These need logging, not gates.

**Classify by effect, not by tool name.** A "send message" tool is reversible if it writes a draft and irreversible if it delivers. Read the *effect*, and read the worst case: a tool that *usually* drafts but *can* deliver is an irreversible tool.

## 2. The action classes that warrant a gate by default

These are the categories where the default answer is "gate it," and autonomous execution needs a positive justification (not the other way around):

- **Financial** — moving money, making purchases, issuing refunds/credits, changing billing, committing spend. Any amount above a task-appropriate floor.
- **Destructive** — deleting data/records/resources, dropping tables, terminating instances, overwriting without a recoverable copy, force-pushing.
- **Access & security** — granting/revoking permissions, changing auth config, rotating or issuing credentials, modifying security groups/firewall rules, adding users.
- **External communications** — anything an outside party will see: emails, customer messages, public posts, support-ticket replies, calendar invites to externals, API calls that publish. External visibility makes it irreversible *and* reputational.
- **Production / infrastructure changes** — deploys, config changes, schema migrations, feature-flag flips affecting real users.
- **Physical-world actuation** — anything controlling hardware, robotics, IoT, or industrial systems.

The [core-principles.md](core-principles.md) §4 decision tree tells you *when* within these classes a gate is mandatory: the intersection of **irreversible × reachable-from-untrusted-content** is where a gate is non-negotiable, because that's where an injection can drive a permanent effect.

## 3. Failure mode — gates that don't gate

The dangerous failure isn't the *absent* gate (that's easy to spot). It's the **present-but-meaningless** gate — the one that exists on the architecture diagram and gets clicked through in practice. The recurring ways a gate dies:

- **Rubber-stamping.** The operator sees the same confirmation dialog a hundred times a day, all previously benign, and develops a click-through reflex. The one malicious confirmation looks identical to the ninety-nine safe ones. A gate that fires constantly trains the human to ignore it. **Alert fatigue is a gate-design failure, not an operator failure.**
- **Insufficient information to decide.** The gate says "Confirm action?" with no rendering of *what* will happen — which recipient, which amount, which records, which is the actual destructive change. The human can't evaluate what they can't see, so they approve on trust. A gate the human cannot reason about is a formality.
- **Confirming the wrong granularity.** One approval authorizes a whole batch ("approve all 500 emails"), or a broad grant ("allow this agent to send emails for the next hour"), collapsing many decisions into one rubber-stamp. Or the reverse — so many micro-confirmations that fatigue is guaranteed.
- **Trusting the agent's own summary of what it will do.** The gate shows the model's *description* of the action, not the action itself. Under injection or hallucination, the description and the actual tool arguments can diverge — the human approves the benign summary while the real arguments do something else. **The gate must render the actual action (the real tool call and arguments), not the model's narration of it.**
- **Approval provenance is untrusted.** If the "human confirmation" can itself be produced by the agent (a second agent "approving," a confirmation the model can synthesize, an auto-approver bot), it isn't a trusted-provenance check at all — the injection can manufacture its own approval. See [../extended/multi-agent-collusion.md](../extended/multi-agent-collusion.md).
- **Gate on the wrong step.** The confirmation happens *after* the irreversible effect, or on a preliminary step while the real damage is downstream and ungated.

## 4. Fix — designing a meaningful gate

A gate is meaningful when a competent human, in the moment, can actually decide correctly. Design for that:

1. **Render the real action, not the narration.** Show the actual tool call and its concrete arguments — the exact recipient, amount, records, target. The human approves *what will happen*, verified against the true call, not the model's description of it.
2. **Make the stakes legible at a glance.** Surface the effect class and the worst case ("This will email an *external* address," "This deletes 1,240 records, *no backup*," "This transfers $12,000"). The human should not have to reconstruct the risk.
3. **Gate at the point of no return, on the right granularity.** Place the confirmation immediately before the irreversible effect. Batch-approve only truly homogeneous, low-stakes actions; require per-action confirmation where each is individually consequential.
4. **Require trusted-provenance approval.** The confirmation must come from a principal the system trusts and the agent cannot impersonate — a real operator through a channel outside the agent's control. Never let an agent (or an agent-controllable component) satisfy its own gate.
5. **Keep gate frequency low enough to stay meaningful.** If a gate fires so often it trains a reflex, the *design* is wrong: reduce the volume of gated actions (tighter scope, higher autonomous-safe thresholds for genuinely low-stakes cases) so the gates that remain are rare and therefore attended-to. A well-designed gate is uncommon and always worth reading.
6. **Fail closed.** If the gate can't get a decision (operator unavailable, ambiguous state), the action does *not* fire. An action that proceeds on gate timeout has no gate.
7. **Log the decision with its context.** What was shown, who approved, when — so the trajectory review ([trajectory-evaluation.md](trajectory-evaluation.md)) can reconstruct not just what the agent did but what the human was asked and answered.

## 5. Dry-run / simulation modes as a testing (and operating) pattern

A **dry-run mode** — where the agent executes its full trajectory but every irreversible effect is stubbed, logged instead of performed — is one of the highest-value patterns in agent safety, for two reasons:

- **As a red-team tool:** you can exercise the whole agent, including the dangerous paths, and observe *what it would have done* without any real effect. You get the trajectory and the intended irreversible actions as data, safely, at scale. This is how you test injection reachability into irreversible actions without ever firing one.
- **As an operating pattern:** shipping a new agent (or a new tool) in dry-run/shadow mode first — actions logged, not executed, and reviewed — surfaces excessive-agency and gate-design problems before they can cause harm. Promote to live execution only after the dry-run trajectories look right.

Build the stub boundary in from the start: every irreversible tool has a mode where it records the intended call and returns a plausible result without the effect. Retrofitting this is painful; designing for it is cheap and pays back on the first near-miss.

## 6. Decision tree: gate, alert, or autonomous?

```
Effect class of the action?
│
├─ Reversible at zero cost in-window → AUTONOMOUS. Log it. Done.
│
├─ Irreversible/external, LOW stakes, NOT reachable from untrusted content
│     → AUTONOMOUS with mandatory post-hoc ALERT + rate/volume cap.
│       (e.g. an internal, bounded, low-value action the operator directly asked for)
│
├─ Irreversible/external, and reachable from untrusted content (injection surface)
│     → GATE (meaningful, per §4). Non-negotiable — this is the dangerous quadrant.
│
└─ Irreversible/external, HIGH stakes (money/access/destructive/customer-facing),
   even if not obviously injection-reachable
      → GATE by default. Loosen to alert only with a written risk justification
        and a hard cap.
```

When unsure which branch applies, gate. The cost of an unnecessary gate is a moment of operator time; the cost of a missing one is the incident.

## 7. Common pitfalls

- **Counting the gate's existence as the control.** A gate on the diagram that's rubber-stamped in practice provides *negative* value — false assurance. Audit gates for *meaningfulness* (§3), not presence.
- **Approving the summary, not the action.** The single most dangerous gate bug: the human sees the model's benign description while the real arguments differ. Always render the true call.
- **Batch approvals on heterogeneous actions.** "Approve all" over a list where one item is the dangerous one is a rubber-stamp by construction.
- **Agent-satisfiable approval.** If any agent-controllable component can produce the confirmation, the gate is theater under injection.
- **No dry-run path.** Without a stub mode, you cannot test dangerous trajectories safely, so they get tested in production by accident.
- **Gate volume so high it trains reflexes.** Then the fix is fewer gated actions (tighter scope), not "the operator should pay more attention." Design the human's job to be doable.

## Review protocol

1. Enumerate every action the agent can take; **classify each by effect** (reversible / effectively-irreversible / truly-irreversible), reading the worst case (§1–2).
2. For each irreversible/external action, run the **gate decision tree** (§6). Is there a gate where one is required?
3. For each *present* gate, audit **meaningfulness** (§3–4): does it render the real action? Legible stakes? Right granularity? Trusted-provenance approval that the agent can't satisfy? Fail-closed?
4. Check gate **frequency** — is any gate fired often enough to be rubber-stamped? If so, that's a design finding.
5. Confirm a **dry-run/simulation** path exists for testing and safe rollout (§5).
6. Confirm gate decisions are **logged** with their context for trajectory review.
7. Report missing *and* meaningless gates as findings ([reporting-and-verification.md](reporting-and-verification.md)); a rubber-stamped gate is as much a finding as an absent one.

**Related:** [excessive-agency.md](excessive-agency.md) (scoping reduces how many actions need gates), [indirect-prompt-injection.md](indirect-prompt-injection.md) (why the injection-reachable quadrant is non-negotiable), [trajectory-evaluation.md](trajectory-evaluation.md) (gates are decision points a trajectory review reconstructs), [../extended/multi-agent-collusion.md](../extended/multi-agent-collusion.md) (agents satisfying each other's gates). Skill: `irreversible-action-gate-reviewer`.
