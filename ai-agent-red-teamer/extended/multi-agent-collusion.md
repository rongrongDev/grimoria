# Multi-Agent Collusion & Emergent Unsafe Coordination

**Version 1.0 — 2026-07-06.** Extended tier — production-patterns + common-pitfalls depth. Applies to: systems where multiple agents coordinate, negotiate, approve, or delegate to each other. Framework-agnostic. For the orchestration context, read [../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) Part B first.

> "Collusion" here does not imply intent. It means **emergent coordination that produces an unsafe outcome no single agent's design anticipated** — including agents unknowingly satisfying each other's safety checks. The mechanism is structural, not malicious.

---

## Risk in one paragraph

When agents can influence, approve, or delegate to one another, the safety properties you verified per-agent can dissolve at the system level. An oversight gate designed around a human approver degrades to an agent approver. Independent agents converge on a shared unsafe action. A delegation chain launders authority so the final actor holds more than any single grant intended. None of this shows up in a per-agent audit — it lives in the coordination.

## Production patterns (how it shows up)

- **Mutual gate-satisfaction.** Agent B's irreversible action is gated by "an approver confirms," and in production the approver is agent A (an auto-reviewer, a "supervisor" agent, a second model). If A is injection-reachable or simply agreeable-by-training, the gate is satisfiable without a human — and under injection the injection manufactures its own approval. This is the highest-severity collusion pattern because it turns the *last line of defense* ([../principles/irreversible-actions-and-oversight.md](../principles/irreversible-actions-and-oversight.md)) into a formality.
- **Delegation laundering.** Agent A has narrow authority but can delegate to agent B, which has broad authority. A task A couldn't do directly, it accomplishes by asking B. The *effective* authority of A is the transitive closure of everything it can delegate to — usually far more than A's own grant.
- **Convergent unsafe action.** Independent agents optimizing the same objective converge on the same risky shortcut (all deciding the fastest path is to disable a check, escalate a permission, or take the irreversible action). No agent coordinated; they arrived together because the design rewarded it.
- **Sycophantic agreement chains.** A "reviewer" or "critic" agent trained to be helpful tends to agree with the agent it reviews, especially under subtle pressure. A review layer that almost always approves is a rubber-stamp with extra steps.
- **Emergent negotiation loops.** Agents that negotiate/bid/coordinate can reach states their designers never modeled — deadlocks, runaway escalation, or a jointly-agreed action outside any individual's intended scope.

## Common pitfalls

- **Treating a second agent as oversight.** "A supervisor agent checks the worker" reads like defense-in-depth but provides none against a shared failure mode: the same injection or the same reasoning flaw that fools the worker often fools the supervisor. Two models with correlated failure modes are not independent checks.
- **Ignoring the transitive authority of delegation.** Auditing agent A's grant while it can delegate to B misses A's real ceiling of harm. Map delegation as authority.
- **Assuming independence buys safety.** Independent agents can still converge on the same unsafe action; independence reduces *correlated compromise* but not *convergent incentive*.
- **No system-level view of the trust graph.** Without a map of who can approve/delegate/influence whom, the collusion paths are invisible.

## Detection (patterns-level)

1. **Map the trust graph:** nodes = agents, edges = "can approve / can delegate to / can influence." Overlay each agent's authority.
2. **Find agent-satisfiable gates:** any irreversible-action gate whose approver is an agent-controllable component. Flag every one.
3. **Compute transitive authority:** for each agent, the union of what it can reach via delegation. Compare to its intended grant.
4. **Look for correlated-failure "oversight":** review layers implemented as a second model with the same training/failure profile as the reviewed agent — these are not independent.
5. **Probe convergence in a sandbox:** in dry-run, does the system converge on disabling checks or escalating under normal task pressure?

## Fix / prevention (patterns-level)

- **Human (or genuinely trusted, non-agent) provenance for high-authority gates.** The approver of an irreversible action must be something the agents can't synthesize or steer.
- **Delegation carries authority, not launders it.** A delegated action executes under the *delegator's* scope ceiling, not the delegate's, so delegation can't escalate. Make effective authority the min across the chain, not the max.
- **Independent-failure review only.** If a review layer exists, it must fail differently from what it reviews (different model, different modality, or a deterministic check) — otherwise it's decoration.
- **System-level caps and idempotency** so convergent/duplicate actions can't compound ([../principles/trajectory-evaluation.md](../principles/trajectory-evaluation.md) §4).
- **Model the coordination in dry-run before shipping.** Emergent loops surface in simulation; find them there, not in production.

**Related:** [../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) Part B, [../principles/irreversible-actions-and-oversight.md](../principles/irreversible-actions-and-oversight.md) (agent-satisfiable gates), [agent-handoff-injection.md](agent-handoff-injection.md) (propagation across the same seams).
