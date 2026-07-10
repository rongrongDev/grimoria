# Agent-to-Agent Handoff Injection

**Version 1.0 — 2026-07-06.** Extended tier — production-patterns + common-pitfalls depth. Applies to: any system where one agent's output becomes another agent's input (orchestrator→worker, pipeline stages, delegation chains, agent networks). Framework-agnostic. Read [../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) Part B and [../principles/indirect-prompt-injection.md](../principles/indirect-prompt-injection.md) first.

> **Safety note.** Mechanism and defense at the category level; no working propagation payload. Per [DESIGN.md](../DESIGN.md).

---

## Risk in one paragraph

Injection doesn't stop at the agent it entered. When agent A ingests untrusted content, gets steered, and produces output that agent B consumes as *trusted* input, the injected instruction has crossed the trust boundary a second time — into an agent that may hold authority A never had. The handoff is a boundary the system usually forgets to defend, because designers think of injection as an *external* entry point and treat inter-agent messages as internal and therefore trusted. That assumption is the vulnerability.

## Production patterns (how it shows up)

- **Trusted-by-default handoffs.** Agent B is built to treat the orchestrator's or upstream agent's messages as authoritative instructions — after all, they're "internal." But A's output is a function of everything A read, including untrusted content. B trusting A = B trusting everything A could ingest.
- **Authority gradient across the handoff.** A low-authority, injection-reachable front agent hands off to a high-authority back agent. The injection's blast radius is the *downstream* authority, not the upstream one. The dangerous quadrant ([../principles/core-principles.md](../principles/core-principles.md) §3) is assembled across two agents.
- **Constraint drop at the seam.** A operated under a constraint (scope limit, recipient allowlist) that wasn't propagated in the handoff payload, so B operates without it. Even absent injection this is a bug; with injection it's an escalation path.
- **Instruction laundering.** Untrusted content that B would have flagged if it arrived directly gets "cleaned" by passing through A's summarization — A restates the injected instruction in its own trusted-looking voice, and B accepts it. The provenance was lost in the retelling.
- **Chain amplification.** In a multi-hop chain, each handoff that re-trusts the previous agent extends the effective injection surface further downstream.

## Common pitfalls

- **Treating inter-agent messages as trusted.** The single root cause. "It came from our own agent" is not provenance; it's a longer path from the same untrusted source.
- **Defending only the outer edge.** Injection review that checks the system's external inputs but not the handoffs misses propagation entirely.
- **Losing provenance in summarization/transformation.** When A rewrites untrusted content into its own output, the trust label doesn't survive unless the system carries it explicitly.
- **Not propagating constraints.** The downstream agent can't honor a constraint it was never told about.
- **Per-agent injection audits.** Each agent looks fine in isolation; the propagation lives in the seam.

## Detection (patterns-level)

1. **Enumerate handoffs** as injection channels ([../principles/indirect-prompt-injection.md](../principles/indirect-prompt-injection.md) §2). Every A→B edge where A can ingest untrusted content is a propagation surface.
2. **Re-evaluate the trust boundary at each handoff:** does B treat A's output as data or as trusted instructions? Trusted-instruction handling of upstream output that traces to untrusted content is the finding.
3. **Diff constraints across the seam:** what did A operate under that wasn't passed to B? (This is the classic between-the-agents bug the `agent-trajectory-tracer` audits first in multi-agent runs.)
4. **Map the authority gradient:** low-trust upstream → high-authority downstream is the priority path.
5. **Trace provenance survival:** does the system carry a trust label through the handoff, or does A's retelling launder it?
6. **Benign-marker probe across the chain** (sanctioned): does a marker embedded upstream change *downstream* behavior? That proves propagation without a harmful payload.

## Fix / prevention (patterns-level)

- **Re-establish the trust boundary at every handoff.** Downstream agents treat upstream output as untrusted data unless its provenance is verified — never as trusted instructions by default.
- **Carry provenance through the handoff.** The trust label travels with the content across agents, so B knows which parts of A's message trace to untrusted origin and refuses to let them authorize privileged actions.
- **Propagate constraints explicitly.** Scope limits and allowlists travel with the handoff so downstream agents inherit them.
- **Least privilege downstream too.** The back agent's authority is the real blast radius; keep it minimal and gate its irreversible actions regardless of who invoked it — the caller being "internal" is not authorization.
- **Audit the seams, not just the agents** ([../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) §B6).

**Related:** [../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) Part B, [../principles/indirect-prompt-injection.md](../principles/indirect-prompt-injection.md), [multi-agent-collusion.md](multi-agent-collusion.md) (delegation/gate-satisfaction over the same seams). Subagent: `agent-trajectory-tracer` (audits handoff seams first in multi-agent transcripts).
