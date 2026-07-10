# Multi-Agent Orchestration — Two Meanings, Kept Separate

**Version 1.0 — 2026-07-06.** Applies to: (a) structuring red-team *work* with multiple agents, and (b) red-teaming multi-agent *systems under test*. Framework-agnostic. Core-tier for the orchestration methodology; the deep risk-class treatment of systems-under-test lives in the `extended/` docs this links to.

> **Read this framing first.** "Multi-agent" means two completely different things in this KB, and conflating them causes real mistakes. This doc is explicit about which is which in every section:
> - **Part A — Agents *doing* the red-teaming.** How to structure your assessment work across multiple agents/subagents.
> - **Part B — Agents *being* red-teamed.** How a multi-agent system under test introduces risk classes a single-agent system doesn't have.
> When you read "orchestration" elsewhere, check which meaning applies. A subagent that *audits* permissions (Part A) and a subagent *whose* permissions you're auditing (Part B) are opposite roles.

---

# Part A — Agents doing the red-teaming (methodology)

## A1. Why isolate red-team work into subagents at all

The principle is the same one from [trajectory-evaluation.md](trajectory-evaluation.md): reading a long agent trajectory, or sweeping a whole tool config, in your *own* context causes the exact context-saturation failure you're investigating. Isolation is not organizational tidiness; it's a correctness requirement. The rule:

- **Skill (bounded, in-context):** a review of a nameable set of files whose findings must land where the work is happening — a tool-permission audit of one agent's config (`tool-permission-auditor`), a gate review of one workflow (`irreversible-action-gate-reviewer`). Isolating these would only hide the findings from the operator.
- **Subagent (unbounded, isolated):** work whose *reading* would flood the caller — sweeping every tool/config for injection surface (`injection-surface-scanner`), replaying a long trajectory to find the divergence turn (`agent-trajectory-tracer`). The subagent absorbs the volume and returns a ranked verdict.

The boundary is **context volume, not topic.** If the reading is bounded and the findings belong in the caller's flow, it's a skill; if the reading is unbounded and only the conclusion matters, it's a subagent.

## A2. Orchestration patterns for a red-team program

- **Gate a rollout with an audit subagent.** Before a new tool integration ships, an `injection-surface-scanner` sweep + a `tool-permission-auditor` review gate the merge. The audit runs in isolation, returns a verdict, and the finding blocks or clears the rollout. This is red-team work as a CI gate.
- **Parallel review alongside live testing.** While one track does sanctioned live probing (benign-marker susceptibility tests), a trajectory-review subagent processes the resulting transcripts in parallel, returning divergence diagnoses without saturating the live tester's context.
- **Fan-out for breadth, isolate each worker.** To assess many agents/tools, dispatch one scanner per target in isolation and aggregate the ranked results — never read them all in one context.

## A3. Pitfalls of red-teaming *with* agents (and the irony)

The tools you build to red-team agents are themselves agents, and they're subject to this KB's own risks. Take your own medicine:

- **Injection into the analyzer.** A trajectory or web page you feed a review subagent may contain text aimed at *the analyzing model*. Treat all analyzed content as data; if it tries to instruct the analyzer, that's a finding (injection reached the review context), not an instruction to follow. The `agent-trajectory-tracer` is built with this rule; any analysis agent you write must be too.
- **Over-privileging the red-team agents.** A red-team subagent needs read access to do its job, not write access to fix things. Give analysis agents read-only tools by design ([excessive-agency.md](excessive-agency.md)) — a compromised or confused red-team agent with write authority is its own incident.
- **Redundant/forked agents.** Don't spin up three near-identical review agents that duplicate reads and can conflict — the same multiple-writers/duplicate-work anti-pattern from Part B (§B4). Reuse a working tool (this KB reuses `agent-trajectory-tracer` rather than forking it — see [DESIGN.md](../DESIGN.md)).

---

# Part B — Agents being red-teamed (risk classes)

A multi-agent *system under test* is not just "several agents." The coordination between agents is a new surface with failure modes no single agent's design anticipated. Assess it as its own category, on top of assessing each agent individually.

## B1. The new surface: the seams between agents

Single-agent assessment covers each agent's authority and injection surface. Multi-agent assessment adds the **seams** — the handoffs, shared state, and coordination logic *between* agents. The seams are where the multi-agent-specific failures live, and they're invisible if you audit each agent in isolation:

- A constraint present in agent A's context but dropped when A hands off to B (the classic between-the-agents bug).
- An injection that entered agent A, survived A's clean-looking output, and propagated into B as trusted input.
- Two agents' individually-safe actions combining into an unsafe aggregate.
- One agent satisfying another's oversight gate.

## B2. Injection propagation across handoffs

An injection doesn't stop at the agent it entered. If agent A ingests untrusted content, gets steered, and produces output that agent B consumes as *trusted* input, the injection has crossed the trust boundary a second time — and B may hold authority A didn't. **The trust boundary must be re-evaluated at every handoff, not just at the system's outer edge.** A downstream agent that treats an upstream agent's output as fully trusted has effectively extended the injection surface to include everything upstream could ingest. Full treatment: [../extended/agent-handoff-injection.md](../extended/agent-handoff-injection.md).

## B3. Collusion and mutual gate-satisfaction

When agents can approve, confirm, or authorize each other, oversight designed around "a human confirms" quietly degrades to "another agent confirms" — which under injection means the injection can manufacture its own approval. If agent B's irreversible action is gated by "agent A approves," and A is injection-reachable, the gate is theater. **An oversight gate is only meaningful if its approver has trusted provenance the agents can't synthesize** ([irreversible-actions-and-oversight.md](irreversible-actions-and-oversight.md) §3). Full treatment of emergent unsafe coordination: [../extended/multi-agent-collusion.md](../extended/multi-agent-collusion.md).

## B4. Amplification: redundant and conflicting actions

Parallel agents amplify a single failure. Two agents given the same task may both take the irreversible action (a double-send, a double-charge) because neither knew the other did. Conflicting agents may fight over shared state, producing an outcome neither intended. The cumulative-effect risk ([trajectory-evaluation.md](trajectory-evaluation.md) §4) is worse in parallel: N agents each acting within their per-agent cap can blow through the *system* envelope N-fold if the caps aren't shared. Assess caps and idempotency at the *system* level, not just per agent.

## B5. Cumulative effect across agents

Individually-safe steps compounding into a harmful whole (the privilege-escalation-through-legitimate-chains problem) gets harder to see across agents, because no single agent's trajectory contains the whole chain. The read that looks bounded in agent A plus the export that looks bounded in agent B is a bulk exfiltration that neither trajectory reveals alone. **Cumulative-effect review in a multi-agent system must reason over the combined trajectory, not per-agent.**

## B6. Detection for multi-agent systems under test

1. **Audit each agent individually first** (authority + injection surface, per the core principles). This is necessary groundwork.
2. **Then audit the seams** (§B1): for each handoff, diff what the upstream agent knew against what it passed downstream. A constraint present upstream and absent downstream is a finding. Untrusted content surviving into a higher-authority downstream agent is a finding.
3. **Map the trust graph:** which agents can influence which others, and what authority each holds. Look for a low-trust, injection-reachable agent with a path (via handoff or gate-satisfaction) to a high-authority agent. That path is the multi-agent version of the dangerous quadrant.
4. **Check gates for agent-satisfiability** (§B3): can any agent-controllable component approve an irreversible action?
5. **Check caps and idempotency at the system level** (§B4): shared totals, dedup on actions, protection against double-execution.
6. **Review the combined trajectory** for cross-agent cumulative effect (§B5). The `agent-trajectory-tracer` handles multi-agent transcripts and audits the seams first.

## B7. Common pitfalls (systems under test)

- **Auditing agents individually and calling it done.** The multi-agent failures live in the seams; per-agent audits pass while the system is exposed.
- **Assuming an upstream agent's output is trusted.** It carries whatever the upstream agent ingested, including injections. Re-evaluate the boundary at every handoff.
- **Agent-satisfiable gates.** "Another agent approves" is not oversight under injection.
- **Per-agent caps, no system cap.** N agents × per-agent cap = N× the intended envelope.
- **Per-agent trajectory review missing the cross-agent chain.** The harmful aggregate spans agents; no single transcript shows it.

## Review protocol

**Part A (your red-team setup):** Are analysis agents read-only? Do they treat analyzed content as data (injection-into-analyzer handled)? Are you reusing tools rather than forking redundant ones? Is unbounded reading isolated to subagents, bounded reviews kept in-context?

**Part B (the system under test):** Each agent audited individually? Seams audited (constraint-drop, injection propagation)? Trust graph mapped for a low-trust→high-authority path? Gates checked for agent-satisfiability? Caps/idempotency at system level? Combined trajectory reviewed for cross-agent cumulative effect?

**Related:** [../extended/agent-handoff-injection.md](../extended/agent-handoff-injection.md), [../extended/multi-agent-collusion.md](../extended/multi-agent-collusion.md), [../extended/sandbox-and-environment-integrity.md](../extended/sandbox-and-environment-integrity.md), [trajectory-evaluation.md](trajectory-evaluation.md) §4 (cumulative effect), [irreversible-actions-and-oversight.md](irreversible-actions-and-oversight.md) §3 (agent-satisfiable gates). Subagents: `injection-surface-scanner`, `agent-trajectory-tracer`.
