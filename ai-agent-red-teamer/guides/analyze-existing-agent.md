# Guide: Analyze an Existing Agentic System for Risk

**Version 1.0 — 2026-07-06.** Capability B. Framework-agnostic. Produces a risk assessment (excessive agency, missing/meaningless gates, injection surface, trajectory blindness) and a remediation plan for an unfamiliar agent — **without producing any attack content.** Sequences the principles; links its sources. Executable by a junior engineer or a smaller model.

> **Prerequisite:** skim [../principles/core-principles.md](../principles/core-principles.md). The whole guide is that doc's review protocol (§10), expanded into an ordered procedure. Keep [../GLOSSARY.md](../GLOSSARY.md) open.

---

## Phase 0 — Orient (don't skip)

Before reading configs, establish:
- **What is this agent *for*?** The task envelope — what a correct run does. If you can't get a crisp answer, that is **finding #0**: you cannot scope authority or judge trajectories against an undefined task ([../principles/excessive-agency.md](../principles/excessive-agency.md) §3), and undefined tasks accrete undefined authority.
- **What does one run look like?** Get a sample trajectory or a description of the tool loop.
- **Single-agent or multi-agent?** If multi-agent, you'll add Phase 5 ([../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) Part B).

**Output:** task envelope + architecture sketch (agents, tools, data flows).

## Phase 1 — Authority inventory (what *can* it do)

Enumerate the **effective** authority ([../principles/excessive-agency.md](../principles/excessive-agency.md) §3, Step 2), not the nominal tool list:
- Every tool and what each can actually do.
- The permissions each tool's *own* credentials carry (transitive authority).
- Any ambient/environment authority — standing credentials, network egress, filesystem, service-account scope ([../extended/sandbox-and-environment-integrity.md](../extended/sandbox-and-environment-integrity.md)).
- Which of all the above are **irreversible/external** ([../principles/irreversible-actions-and-oversight.md](../principles/irreversible-actions-and-oversight.md) §1–2) — classify by *effect*, worst case.

Use the `tool-permission-auditor` skill on the config. **Output:** the ceiling of harm — everything this system could do if fully hijacked.

## Phase 2 — Injection surface (where untrusted content enters)

Enumerate every channel by which content from the untrusted side of the boundary reaches the model ([../principles/indirect-prompt-injection.md](../principles/indirect-prompt-injection.md) §2): retrieval/RAG, web/file tools, tool results (incl. metadata/error fields), user-supplied artifacts, agent handoffs, persistent memory. For each, check **provenance**: does untrusted content arrive marked as data, or unmarked in the instruction stream? Unmarked = exposure by construction.

Use the `injection-surface-scanner` subagent (it isolates the unbounded reading and returns a ranked surface map). **Output:** the injection surface with per-channel provenance status.

## Phase 3 — Intersect → prioritize

Cross Phase 1 × Phase 2 ([../principles/core-principles.md](../principles/core-principles.md) §3). **The priority list is the set of irreversible/high-authority actions reachable from untrusted content.** Rank by blast radius. This intersection is the core of the assessment — a wide authority with no untrusted channel, or a huge injection surface reaching only read-only tools, are both lower priority than a modest authority where untrusted content can reach a wire transfer.

**Output:** ranked priority target list (the dangerous-quadrant items).

## Phase 4 — Assess the controls on the priority targets

For each priority target, check the three control layers:

**4a — Oversight gates** ([../principles/irreversible-actions-and-oversight.md](../principles/irreversible-actions-and-oversight.md)). Run the gate decision tree (§6). For each irreversible/injection-reachable action: is there a gate? Is it *meaningful* — renders the real action (not the model's narration), legible stakes, right granularity, trusted-provenance approval the agent can't satisfy, fail-closed? A **rubber-stampable gate is a finding**, same as a missing one. Use the `irreversible-action-gate-reviewer` skill.

**4b — Scoping** ([../principles/excessive-agency.md](../principles/excessive-agency.md) §4). Can the authority be tightened on capability/resource/quantity/time and still do the task? Loose-but-justified → scope-down finding. Unjustified/unknown → remove finding.

**4c — Injection defense** ([../principles/indirect-prompt-injection.md](../principles/indirect-prompt-injection.md) §4). Are the defenses *architectural* (least privilege on the reachable path, provenance gating, egress limits) or prompt-only? Prompt-only ("we told it to ignore injected instructions") on a priority target is a finding. Where a test environment exists, confirm susceptibility with **benign-marker probes** — behavioral signal only, never a harmful action (§3-4).

**Output:** per-target control assessment with findings.

## Phase 5 — Multi-agent seams (only if applicable)

If multi-agent ([../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) Part B): audit each agent via Phases 1–4, **then the seams** — for each handoff, diff what upstream knew vs. passed downstream (constraint drop); check whether downstream treats upstream output as trusted instructions (propagation, [../extended/agent-handoff-injection.md](../extended/agent-handoff-injection.md)); map the trust graph for a low-trust→high-authority path; check gates for agent-satisfiability ([../extended/multi-agent-collusion.md](../extended/multi-agent-collusion.md)); check caps/idempotency at the *system* level. **Output:** seam findings.

## Phase 6 — Trajectory observability & cumulative effect

- **Observability** ([../principles/trajectory-evaluation.md](../principles/trajectory-evaluation.md) §5): could you reconstruct a run — tool calls+args, results, reasoning, provenance, gate decisions, order? If not, **that is a high-severity finding**: failures are invisible and incidents un-investigable.
- **Trajectory review:** if you have logs, replay to any divergence turn ([../principles/trajectory-evaluation.md](../principles/trajectory-evaluation.md) §6). For long transcripts, dispatch the `agent-trajectory-tracer` subagent — don't saturate your own context.
- **Cumulative effect** (§4): are there running caps? Could a fully-authorized run accomplish harmful bulk (mass read/send/spend) via individually-legal steps? Missing caps on a high-volume authority is a finding.

**Output:** observability verdict + cumulative-effect findings.

## Phase 7 — Write the assessment + remediation plan

Assemble findings per [../principles/reporting-and-verification.md](../principles/reporting-and-verification.md):
- Each finding: **risk class, surface, blast radius, sanitized behavioral evidence, class-level remediation, verification criteria.** No working payloads.
- **Severity** by blast-radius × reachability; a missing control rates at the severity of what it would have caught.
- **Prioritized remediation:** lead with the dangerous-quadrant items (CRITICAL: injection-reachable irreversible action, no meaningful gate). Order by risk-reduction-per-effort.
- **Verification plan:** for each fix, how it'll be re-tested with variation and what CI regression test locks it in (did it close the *class*?).

**Output:** the risk assessment + remediation plan — the deliverable.

---

## Assessment checklist (the guide in one pass)

- [ ] **0** Task envelope defined? (else finding #0) Architecture sketched? Multi-agent?
- [ ] **1** Effective authority inventoried (incl. transitive + ambient)? Irreversibles classified by effect?
- [ ] **2** Injection surface enumerated (incl. retrieval, memory, metadata, handoffs)? Provenance status per channel?
- [ ] **3** Intersected → ranked priority target list?
- [ ] **4a** Gates present *and meaningful* on each priority target? Rubber-stampable ones flagged?
- [ ] **4b** Scoping tightenable? Unjustified/unknown grants flagged?
- [ ] **4c** Injection defense architectural, not prompt-only? Benign-marker probes (if testable)?
- [ ] **5** (multi-agent) Seams audited — constraint drop, propagation, trust graph, agent-satisfiable gates, system caps?
- [ ] **6** Trajectory reconstructable? Cumulative-effect caps present?
- [ ] **7** Findings written class-level, payload-free, severity by blast-radius, remediation prioritized + verifiable?

To turn this one-system assessment into an ongoing program, see [build-agent-redteam-program.md](build-agent-redteam-program.md).
