# Guide: Build an Agent Red-Team Program From Scratch

**Version 1.0 — 2026-07-06.** Capability A. Framework-agnostic. This guide *sequences* the principles; it doesn't restate them — each step links its source. Follow it start to finish to stand up a program that red-teams agentic systems at the methodology level. A junior engineer should be able to execute it; a staff engineer should recognize the structure.

> **Prerequisite reading:** [../principles/core-principles.md](../principles/core-principles.md) (the authority-vs-trust model this whole program operationalizes). Keep [../GLOSSARY.md](../GLOSSARY.md) open.

---

## Step 0 — Scope the program and the boundary with model red-teaming

Before anything, decide what you own. This program covers what agentic systems *do*. Base-model content safety (jailbreaks, harmful-text generation) is a different program — `ai-model-red-teamer/`. Draw the line explicitly so findings route correctly ([../DESIGN.md](../DESIGN.md) boundary rule): if a failure is fully expressible as "the model said something bad," it's theirs; if it requires an action/tool-call/state-change to matter, it's yours. Agree this with the model-safety team so nothing falls between you.

**Deliverable:** a one-page scope statement naming the systems in scope, the boundary with model red-teaming, and the escalation path for high-severity findings.

## Step 1 — Build the agentic risk-category coverage matrix

A coverage matrix is what keeps a program from tunnel-visioning on injection (the "fun" attack) while missing excessive agency and gate design. Rows are risk classes; columns are the systems you cover. The rows, from this KB:

**Core classes (full coverage required):**
- Indirect prompt injection ([../principles/indirect-prompt-injection.md](../principles/indirect-prompt-injection.md))
- Excessive agency / permission scoping ([../principles/excessive-agency.md](../principles/excessive-agency.md))
- Irreversible-action & oversight-gate risk ([../principles/irreversible-actions-and-oversight.md](../principles/irreversible-actions-and-oversight.md))
- Trajectory-level failure & privilege-escalation-via-legitimate-chains ([../principles/trajectory-evaluation.md](../principles/trajectory-evaluation.md))

**Extended classes (cover where the system's architecture warrants):**
- Multi-agent collusion / emergent coordination ([../extended/multi-agent-collusion.md](../extended/multi-agent-collusion.md))
- Sandbox / environment integrity ([../extended/sandbox-and-environment-integrity.md](../extended/sandbox-and-environment-integrity.md))
- Goal drift on long-horizon tasks ([../extended/goal-drift-long-horizon.md](../extended/goal-drift-long-horizon.md))
- Agent-to-agent handoff injection ([../extended/agent-handoff-injection.md](../extended/agent-handoff-injection.md))

Each cell records: *is this class assessed for this system, by what method, when last, with what result?* An empty cell is a known gap, not a silent one. **The matrix is the program's memory** — it's how you answer "are we covered" without relying on who remembers what.

**Deliverable:** a living coverage matrix (risk class × system × method × date × status).

## Step 2 — For each system, run the two-question intake

For every system in scope, produce the two inventories from [../principles/core-principles.md](../principles/core-principles.md) §3:

- **Authority inventory (Q1):** every tool, permission, side effect, and irreversible action — *effective*, including transitive and ambient authority ([../principles/excessive-agency.md](../principles/excessive-agency.md) §3). Use the `tool-permission-auditor` skill.
- **Injection surface (Q2):** every channel by which untrusted content reaches the model — retrieval, web/file, tool results, user fields, handoffs, memory ([../principles/indirect-prompt-injection.md](../principles/indirect-prompt-injection.md) §2). Use the `injection-surface-scanner` subagent for the sweep.

Then **intersect** them: the set of irreversible/high-authority actions reachable from untrusted content is your priority target list for that system. This intersection *is* the risk prioritization; everything else is depth-of-coverage on it.

**Deliverable per system:** authority inventory + injection surface + the intersection (priority target list).

## Step 3 — Design trajectory-level evaluation criteria

Output-only evaluation is the most common program-level failure ([../principles/trajectory-evaluation.md](../principles/trajectory-evaluation.md) §7). Define success at the trajectory level *before* you test, in three layers (§3 of that doc):

- **Layer A — endpoint correctness** (necessary, not sufficient).
- **Layer B — path safety:** action authorization, boundary integrity (untrusted content stayed data), no unauthorized egress, gate compliance, bounded cumulative effect. **A Layer-B failure fails the run regardless of Layer A.**
- **Layer C — path quality:** no loops, bounded cost/steps.

Encode these as explicit pass/fail assertions your eval harness checks against trajectory logs — not vibes. This is also where you define the **benign-marker probe** susceptibility tests ([../principles/indirect-prompt-injection.md](../principles/indirect-prompt-injection.md) §3-4): sanctioned, behavioral, harmless-tell injection tests that assert the boundary held.

**Deliverable:** a trajectory eval spec (Layer A/B/C assertions) + a benign-marker probe suite, both runnable in CI.

## Step 4 — Set permission-scoping review standards

Turn least-privilege from an aspiration into a gate. Standards to publish ([../principles/excessive-agency.md](../principles/excessive-agency.md) §4–5):

- **Every new tool/scope grant requires a recorded task-need justification** before rollout. No justification, no grant. (`tool-permission-auditor` is the review procedure.)
- **Default-deny irreversible authority on injection-reachable paths.**
- **Scope on all four dimensions** (capability, resource, quantity, time); caps and expiry by default.
- **Periodic re-audit** so capability creep becomes a visible recurring decision.
- **Gate standards** for irreversible/external actions ([../principles/irreversible-actions-and-oversight.md](../principles/irreversible-actions-and-oversight.md) §4): render-the-real-action, trusted-provenance approval, fail-closed, low-enough frequency to stay meaningful. (`irreversible-action-gate-reviewer` is the review procedure.)

**Deliverable:** written scoping + gate standards, wired as pre-rollout review gates.

## Step 5 — Specify logging sufficient for trajectory review

You can't red-team (or investigate) what you can't reconstruct. Require the trajectory-log schema from [../principles/trajectory-evaluation.md](../principles/trajectory-evaluation.md) §5: every tool call with args, every tool result, reasoning, **provenance attribution per action**, gate decisions, running aggregates, order/timestamps. **Absent or insufficient logging is a standing finding** at the severity of what it would hide.

**Deliverable:** a logging requirements doc, enforced as a precondition for a system entering scope.

## Step 6 — Build the reporting & verification pipeline

Findings must be actionable without being attack artifacts ([../principles/reporting-and-verification.md](../principles/reporting-and-verification.md)). Standardize:

- **Finding template:** risk class, surface, authority-reached/blast-radius, sanitized behavioral evidence, class-level remediation, verification criteria. **No working payloads, ever** — a review gate on every report checks this ([../DESIGN.md](../DESIGN.md)).
- **Severity rubric** by blast-radius × reachability (§3 of the reporting doc), with the rule that a *missing control* is a finding at the severity of what it would have caught.
- **Verification loop:** every fix re-tested with *variation* (not the original probe), a CI regression test added, and re-checked at the *class* level — did it close the class or just the instance? (§4 of the reporting doc.)
- **Escalation path** for CRITICAL (injection-reachable irreversible action with no meaningful gate) agreed with product/leadership in advance.

**Deliverable:** finding template + severity rubric + verification checklist + escalation path.

## Step 7 — Choose the human/automated/agent mix

Balance three testing modes; over-relying on any one is a coverage failure:
- **Structured manual review** (the audit skills, the decision trees) — best for authority/gate/logging assessment.
- **Sanctioned automated probing** (benign-marker suites in CI) — best for injection-susceptibility regression at scale.
- **Isolated review agents** (subagents) — best for unbounded reading (surface sweeps, long-trajectory forensics). Take your own medicine: read-only tools, treat analyzed content as data ([../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) Part A).

**Deliverable:** a testing-mode plan mapping each risk-class row to the modes that cover it.

## Step 8 — Operationalize as gates, not one-offs

A program is durable when its checks live in the development lifecycle, not in a person's memory:
- Injection-surface + permission audit gate **before** a new tool integration ships (a subagent-gated rollout — [../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) §A2).
- Benign-marker probe suite + trajectory eval in **CI**, so injection susceptibility and path-safety regressions are caught pre-merge.
- Coverage matrix reviewed on a cadence; empty cells and stale audits surface automatically.
- Dry-run/shadow rollout for new agents before live execution ([../principles/irreversible-actions-and-oversight.md](../principles/irreversible-actions-and-oversight.md) §5).

**Deliverable:** the program running as CI gates + scheduled re-audits + a maintained coverage matrix.

---

## The whole program on one page

1. **Scope** + boundary with model red-teaming (Step 0).
2. **Coverage matrix** of risk classes × systems (Step 1) — the program's memory.
3. Per system: **authority × injection-surface intersection** → priority targets (Step 2).
4. **Trajectory eval criteria** + benign-marker probes (Step 3).
5. **Scoping + gate standards** as pre-rollout gates (Step 4).
6. **Logging requirements** for reconstructability (Step 5).
7. **Reporting + verification pipeline**, payload-free, class-level (Step 6).
8. **Testing-mode mix** (Step 7) and **CI/gate operationalization** (Step 8).

To assess a *specific* system against this program, use the companion guide: [analyze-existing-agent.md](analyze-existing-agent.md).
