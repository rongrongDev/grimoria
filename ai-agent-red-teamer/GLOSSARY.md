# Glossary

**Version 1.0 — 2026-07-06.** Shared vocabulary for `ai-agent-red-teamer/`. Defined conceptually — never with a working example. Terms are cross-linked to the doc that develops them.

---

**Agentic system.** An LLM-based system that doesn't just produce text but takes *actions* — calls tools, browses, reads/writes files, sends communications, executes code, orchestrates other agents. The action capability is what makes it this KB's subject; a model that only talks belongs to `ai-model-red-teamer/`.

**Authority.** The total set of things an agent *can* do: its tools, the permissions those tools carry, the side effects and irreversible actions it can produce. Granted at design time; tends only to grow. Distinguished from *trust*. See [core-principles.md](principles/core-principles.md) §1.

**Effective authority.** The true ceiling of harm — an agent's nominal grant *plus* the permissions its tools' own credentials carry (transitive authority) *plus* any ambient/environment access it inherits. Almost always broader than designers believe. See [excessive-agency.md](principles/excessive-agency.md) §2–3.

**Trust (of an action).** Whether a specific action *deserves* to fire right now, given its inputs' **provenance** and its **reversibility**. Unlike authority, it varies moment to moment. The red-team question is whether authority exceeds the trust an action's context justifies. See [core-principles.md](principles/core-principles.md) §1.

**Trust boundary.** The line between content the system controls (system prompt, operator instructions, developer tool definitions) and content that entered from outside (retrieved docs, web pages, tool outputs, other agents, user files, prior-session memory). The model sees both as the same token stream; provenance must be preserved by the *system*, not the model. See [core-principles.md](principles/core-principles.md) §2.

**Provenance.** The origin and trust label of a piece of content — trusted (operator/developer) vs. untrusted (external). Preserving provenance end-to-end is the injection defense that *generalizes*, because it lets the system refuse to let untrusted-origin content authorize privileged actions. See [core-principles.md](principles/core-principles.md) §8.

**Indirect prompt injection.** Untrusted content encountered mid-task (in a web page, document, tool result, handoff, or memory) carrying embedded instructions that the agent treats as if they came from the operator — untrusted content crossing the trust boundary and being interpreted as instructions rather than data. Distinct from *direct* injection (the user themself typing an override). The defining agentic risk because a steered agent *acts*. See [indirect-prompt-injection.md](principles/indirect-prompt-injection.md).

**Injection surface.** The set of all channels by which untrusted content reaches the model's context: retrieval/RAG, web/file tools, tool results (incl. metadata/error fields), user-supplied artifacts, agent handoffs, persistent memory. What you enumerate to assess injection exposure. See [indirect-prompt-injection.md](principles/indirect-prompt-injection.md) §2.

**Benign-marker probe.** A sanctioned injection-*susceptibility* test: a completely harmless, inert tell placed in a test input — one whose only possible effect is to make the agent's behavior observably different if and only if the trust boundary failed — used to measure *behaviorally* whether untrusted content can steer the agent, without ever authoring a harmful action. The way to measure susceptibility without producing an attack; the specific tells are designed inside the test harness, not in shared docs. See [indirect-prompt-injection.md](principles/indirect-prompt-injection.md) §3.

**Excessive agency.** The gap between what an agent *can* do and what its task *needs* it to do — excessive permissions, excessive functionality, or excessive autonomy. Every unit of the gap is blast radius available to a mistake or a hijack. See [excessive-agency.md](principles/excessive-agency.md).

**Least privilege / permission scoping.** Granting only the authority a specific task requires, scoped tight on four dimensions — **capability** (narrowest verb), **resource** (smallest object set), **quantity** (caps), **time** (expiry/revocability). The mitigation that appears in every other doc because it caps the harm of every other failure. See [excessive-agency.md](principles/excessive-agency.md) §4.

**Transitive authority.** Authority an agent holds indirectly because a tool it calls runs under broad credentials — the agent's effective authority is the union of what all its tools can do. See [excessive-agency.md](principles/excessive-agency.md) §2.

**Ambient authority.** Authority an agent inherits implicitly from its execution environment (a service account, CI token, developer session with standing access) — never explicitly granted, but fully held. See [excessive-agency.md](principles/excessive-agency.md) §2, [sandbox-and-environment-integrity.md](extended/sandbox-and-environment-integrity.md).

**Irreversible action.** An action that cannot be undone at zero cost within the task window — money moved, external message sent, data hard-deleted, access changed, production deployed. Classified by *effect* and worst case, not by tool name. See [irreversible-actions-and-oversight.md](principles/irreversible-actions-and-oversight.md) §1.

**Human-in-the-loop (HITL) gate.** A confirmation checkpoint requiring a trusted human decision before an irreversible/high-stakes action fires. Meaningful only if it renders the *real* action, shows legible stakes, is the right granularity, requires trusted-provenance approval the agent can't satisfy, and fails closed. See [irreversible-actions-and-oversight.md](principles/irreversible-actions-and-oversight.md) §4.

**Rubber-stamped gate.** A gate that exists but is clicked through by reflex — because it fires too often, shows too little, or batches heterogeneous actions. Provides *negative* value (false assurance). A rubber-stampable gate is a finding, same as a missing one. See [irreversible-actions-and-oversight.md](principles/irreversible-actions-and-oversight.md) §3.

**Dry-run / simulation mode.** A mode where the agent executes its full trajectory but every irreversible effect is stubbed and logged instead of performed. A red-team tool (exercise dangerous paths safely) and an operating pattern (shadow-launch new agents). See [irreversible-actions-and-oversight.md](principles/irreversible-actions-and-oversight.md) §5.

**Trajectory.** The ordered sequence of an agent's (thought, action, observation) tuples across a run — the actual unit of agentic behavior and evaluation. Judging only the final output misses failures that happened in the middle. See [trajectory-evaluation.md](principles/trajectory-evaluation.md).

**Trajectory-level evaluation.** Judging the whole action sequence against path-safety criteria (action authorization, boundary integrity, no unauthorized egress, gate compliance, bounded cumulative effect) — not just endpoint correctness. A path-safety failure fails the run even if the answer is right. See [trajectory-evaluation.md](principles/trajectory-evaluation.md) §3.

**Divergence turn.** The first turn in a trajectory where the agent's action stops being what a competent operator with the same context would do. Attributing it to its trigger (often an untrusted tool result) locates the failure. Everything after is usually consequence, not cause. See [trajectory-evaluation.md](principles/trajectory-evaluation.md) §6.

**Privilege escalation through legitimate chains (cumulative effect).** A sequence of individually-authorized, individually-reasonable tool calls compounding into an outcome nobody would have approved as a single request (bulk exfiltration one legal read at a time; a walk from low to high privilege). Per-step guardrails can't catch it; you must reason about the aggregate. See [trajectory-evaluation.md](principles/trajectory-evaluation.md) §4.

**Dangerous quadrant.** The intersection that gets prioritized: **high authority × reachable-by-untrusted-content**, especially where the authority is irreversible. Where agents cause real-world harm. See [core-principles.md](principles/core-principles.md) §3.

**Blast radius.** The worst authorized outcome if a given risk is realized — what action, what scope, reversible or not, how many records/dollars/recipients. Drives severity, alongside reachability. See [reporting-and-verification.md](principles/reporting-and-verification.md) §3.

**Handoff injection (propagation).** An injected instruction that entered one agent surviving into a downstream agent that consumes the first's output as trusted input — the trust boundary must be re-evaluated at *every* handoff, not just the system edge. See [agent-handoff-injection.md](extended/agent-handoff-injection.md).

**Multi-agent collusion.** Emergent coordination (not necessarily intentional) producing an unsafe outcome no single agent's design anticipated — including agents satisfying each other's oversight gates, or delegation laundering authority. See [multi-agent-collusion.md](extended/multi-agent-collusion.md).

**Goal drift.** The gradual divergence of an agent's *effective* objective from the intended one over a long-horizon run — via constraint decay under context pressure, sub-goal substitution, or delayed injection. A trajectory pathology at long horizons. See [goal-drift-long-horizon.md](extended/goal-drift-long-horizon.md).

**Sandbox / environment integrity.** The risk category of an agent affecting its execution environment beyond its intended scope (reaching credentials, networks, or state it shouldn't), and the defensive design — isolation, least privilege, egress control, monitoring — that contains it. See [sandbox-and-environment-integrity.md](extended/sandbox-and-environment-integrity.md).

**Finding.** The *output* of agent red-teaming: a described risk class, its surface, the authority/blast-radius it reaches, sanitized behavioral evidence, a class-level remediation, and verification criteria — actionable to the product team without being a runnable exploit. Not an attack. See [reporting-and-verification.md](principles/reporting-and-verification.md).

**Skill vs. Subagent (in this KB).** A **skill** is a bounded review of a nameable set of files whose findings land in the caller's context (e.g. `tool-permission-auditor`). A **subagent** isolates *unbounded* reading whose volume would flood the caller, returning only a verdict (e.g. `injection-surface-scanner`). The boundary is context volume, not topic. See [multi-agent-orchestration.md](principles/multi-agent-orchestration.md) §A1.
