# Core Principles — Red-Teaming Agentic Systems

**Version 1.0 — 2026-07-06.** Applies to: tool-using LLM agents of any framework maturity (single-agent tool loops through multi-agent orchestrations; MCP-style tool servers, retrieval/browser tools, code-execution and computer-use agents). Framework-agnostic. Read this first; every other doc in `ai-agent-red-teamer/` is an expansion of one section here.

> **Scope reminder.** This doc and this KB cover what an agentic system *does*. For what a base model *says* (jailbreaks, harmful-content elicitation), see the `ai-model-red-teamer/` KB. Nothing here contains a working exploit; that is a hard constraint, not a stylistic one — see [DESIGN.md](../DESIGN.md).

---

## 1. The one idea: authority ≠ trust

An agent accretes **authority** — the set of tools it can call, the permissions those tools carry, the irreversible effects it can produce. Authority is granted once, at design time, and tends only to grow.

The **trust** an individual action deserves is not fixed. It varies moment to moment along two axes:

- **Provenance** — where did the content driving this action come from? An instruction from the operator who owns the task is high-trust. A string that arrived inside a web page the agent was asked to summarize, or inside a tool result, or inside a document in a shared drive, is *untrusted* — it may have been authored by an adversary specifically to reach this context.
- **Reversibility** — if this action is wrong, can it be undone? A draft can. A sent email, a deleted record, a wire transfer, a `git push --force`, a posted message to customers cannot.

**Every agentic failure this KB covers is a case of authority outrunning trust at a specific point in the trajectory.** The red-teamer's job is to find those points before an adversary does. Say it as a sentence you can apply anywhere: *at the moment this action fires, does the authority behind it exceed the trust its inputs and its reversibility justify?*

## 2. The trust boundary

Draw one line through any agentic system: on one side, content the system controls (the system prompt, the operator's instructions, the developer's tool definitions); on the other, content that entered from outside (retrieved documents, web pages, tool outputs, other agents' messages, user-supplied files, memory written in a prior session). That line is the **trust boundary.**

The single most important architectural fact about LLM agents: **the model sees both sides as the same thing — tokens in a context window.** It has no built-in, reliable way to know that this paragraph is a developer instruction and that paragraph is attacker-authored text pasted into a support ticket. Provenance is not preserved by the model; it must be preserved by the *system around* the model, or it is lost.

Almost everything else follows:

- **Indirect prompt injection** ([indirect-prompt-injection.md](indirect-prompt-injection.md)) is untrusted content crossing the trust boundary and being treated as instructions.
- **Excessive agency** ([excessive-agency.md](excessive-agency.md)) is the blast radius on the *other* side of that boundary — how much damage a boundary failure can do, set by how much authority the agent holds.
- **Irreversible-action risk** ([irreversible-actions-and-oversight.md](irreversible-actions-and-oversight.md)) is what happens when a high-authority, low-reversibility action fires without a trustworthy check.
- **Trajectory blindness** ([trajectory-evaluation.md](trajectory-evaluation.md)) is failing to *see* a boundary crossing because you only looked at the final output.

## 3. The two questions that structure every agent assessment

When you sit down in front of an unfamiliar agentic system, you are answering two questions. Keep them separate; conflating them is the most common assessment error.

**Q1 — What can this agent do?** (Authority inventory.) Enumerate every tool, every permission, every side effect, every irreversible action. This is objective and mostly mechanical. The [analyze-existing-agent.md](../guides/analyze-existing-agent.md) guide walks it.

**Q2 — Where does untrusted content reach the decision?** (Injection surface.) Enumerate every channel by which content from the untrusted side of the boundary flows into the model's context: retrieval, web/file tools, tool results, user fields, other agents, persistent memory. The `injection-surface-scanner` subagent automates the sweep.

**The risk is the product, not either factor alone.** A wide-authority agent with no untrusted-content channel is exposed only to operator error. A narrow-authority agent with a huge injection surface can be hijacked but can't do much harm. The dangerous quadrant — the one you prioritize — is **high authority × reachable by untrusted content**, especially where the authority includes irreversible actions.

## 4. Decision tree: does an action need a human-in-the-loop gate?

Use this at design-review time for every action an agent can take autonomously. It is deliberately conservative; loosen it only with evidence.

```
Is the action reversible at zero cost within the task window?
│
├─ YES → autonomous execution is defensible.
│        (Still log it for trajectory review. §6.)
│
└─ NO → Is the effect externally visible or does it move money / delete data /
         change access / send communications?
        │
        ├─ NO (irreversible but internal & low-stakes, e.g. writing a scratch file)
        │     → autonomous is usually fine; log + rate-limit.
        │
        └─ YES → Can untrusted content influence whether or how this action fires?
                (i.e., is this action reachable from the injection surface in §3-Q2?)
                │
                ├─ NO (only the operator's direct instruction can trigger it)
                │     → gate OR strong post-hoc alerting, depending on stakes.
                │
                └─ YES → REQUIRE A MEANINGFUL HUMAN GATE.
                         High authority + untrusted-reachable + irreversible is
                         the quadrant where agents cause real-world harm.
                         See irreversible-actions-and-oversight.md for what
                         "meaningful" means (a rubber-stamped gate is no gate).
```

The most common real-world failure is the bottom branch collapsing: an action that *is* irreversible and *is* reachable from untrusted content, guarded by a confirmation dialog that the operator clicks through a hundred times a day. That is not a gate; it is a formality. Designing gates that stay meaningful under production pressure is its own discipline — that's why it has its own doc.

## 5. Decision tree: how much authority should a task get?

The principle is **least authority for the task in front of the agent, not the hardest task it might ever face.** Over-provisioning "so we don't have to change it later" is how excessive agency happens.

```
For each tool/permission the agent could hold:
│
├─ Does THIS task actually require it?
│   ├─ NO → don't grant it. (Most excessive-agency findings die here.)
│   └─ YES ↓
│
├─ Can it be scoped tighter and still do the task?
│   (read-only instead of read-write; one repo/table/account instead of all;
│    a spending cap; a time-box; an allowlist of recipients/domains)
│   ├─ YES → scope it. Broad-by-default is the finding.
│   └─ NO ↓
│
└─ Is the grant revocable and observable?
    (can an operator pull it mid-task; is every use logged)
    ├─ NO → treat as high-risk; add a gate or monitoring before shipping.
    └─ YES → grant, log, and set an expiry.
```

## 6. Trajectory over output

**Judging only an agent's final answer misses most agentic failures.** A run can reach an innocuous-looking conclusion by way of a path that leaked data, took an unauthorized action, or was steered by injected content — and the final message says "Done!" The harm is in the *trajectory* — the ordered sequence of thoughts, tool calls, tool results, and actions — not in the summary.

Two consequences you must design for from day one:

- **Success criteria are defined over the path, not the endpoint.** "Did it produce a plausible answer" is not a pass condition. "Did it take only authorized actions, keep untrusted content as data, and stop at the right point" is. See [trajectory-evaluation.md](trajectory-evaluation.md).
- **Logging must be sufficient for post-hoc reconstruction.** If you cannot, after the fact, see every tool call *with its arguments and its result*, and attribute each to the content that prompted it, you cannot red-team the trajectory — and you cannot investigate the incident either. **No trajectory log is itself a finding**, and usually a high-severity one: it means failures are invisible until they're expensive.

## 7. Individually-safe, cumulatively-harmful

A sequence of tool calls each of which is reasonable in isolation can compound into an outcome nobody would have approved as a single request. Read a record (fine). Read another (fine). Aggregate across many (fine). Export the aggregate (fine). The *cumulative* effect — a bulk exfiltration of data the agent was allowed to touch one row at a time — is the harm, and no per-step review catches it because no step is wrong.

Per-step guardrails are necessary but not sufficient. You also need **cumulative-effect reasoning**: rate limits, volume caps, and trajectory-level review that asks "what did this whole run *accomplish*," not just "was each call permitted." This is developed in [trajectory-evaluation.md](trajectory-evaluation.md) §"privilege escalation through legitimate chains."

## 8. Provenance is the mitigation that generalizes

Most injection defenses that target a specific phrasing are whack-a-mole — you block one wording, the next one gets through. The defenses that *generalize* are the ones that preserve and act on **provenance**: keeping track, through the whole pipeline, of which side of the trust boundary each piece of content came from, and refusing to let untrusted content escalate its own privileges.

Concretely, provenance-preserving design means: untrusted content is structurally marked as data (not silently concatenated into the instruction stream); tools that act on untrusted-derived instructions are the *least* privileged; and the highest-authority actions require an input whose provenance is trusted (an operator confirmation, not a string the model found on a web page). You cannot make a model perfectly ignore embedded instructions — so you make the injection *not matter* by ensuring the hijacked path can't reach the dangerous authority. Design for containment, not perfect refusal.

## 9. Red-team like an adversary, report like an engineer

An adversary doesn't attack the tool you documented; they attack the tool you forgot you exposed, the retrieval index nobody thought of as an input channel, the "internal only" agent reachable through a handoff. Assessment means enumerating the *actual* surface, not the intended one.

But the output of red-teaming an agent is not an attack. It is a **finding**: a described risk class, the surface it lives on, the authority it can reach, the blast radius, and a remediation that closes the *class*, verified. A finding must be actionable to the product team without itself being a runnable exploit. This is a real tension and it has its own discipline — see [reporting-and-verification.md](reporting-and-verification.md). When in doubt, describe the mechanism and the fix; never the payload.

## 10. Standing rules (the short list)

1. **Assume every external input is adversarial.** Retrieved documents, tool outputs, web pages, files, other agents' messages, and memory from prior sessions are all untrusted until proven otherwise. "It's just a support ticket" is how injections land.
2. **Trust boundary is a system property, not a model property.** The model won't preserve provenance for you. If the architecture doesn't, it's lost.
3. **Least authority, always.** Grant for the task, scope tight, make it revocable, log every use, expire it.
4. **Irreversible + untrusted-reachable = gate.** And make the gate meaningful (§4).
5. **Judge the trajectory, not the output.** And keep logs good enough to reconstruct it (§6).
6. **Cumulative effect is a risk even when every step is legal** (§7).
7. **Missing logging/gates/provenance are findings in themselves** — you don't need a successful attack to report them; the absent control *is* the vulnerability.
8. **Never produce a working attack artifact**, in a report, a test case, or a doc (§9, [DESIGN.md](../DESIGN.md)).

## Review protocol (use this doc as a checklist)

Given an agentic system, in one pass:

1. Inventory authority (Q1, §3). What can it do; which of those are irreversible?
2. Map the injection surface (Q2, §3). Where does untrusted content reach the model?
3. Intersect them (§3). Which irreversible/high-authority actions are reachable from untrusted content? That set is your priority list.
4. For each priority action, run the gate decision tree (§4). Is there a meaningful human gate? Is it rubber-stampable?
5. Run the authority decision tree (§5) across all grants. What can be scoped down?
6. Check trajectory observability (§6). Could you reconstruct a run and attribute each action to its trigger?
7. Check for cumulative-effect exposure (§7). What could a fully-authorized run *accomplish* in bulk?
8. Write findings per [reporting-and-verification.md](reporting-and-verification.md). No payloads.

The two guides operationalize this: [analyze-existing-agent.md](../guides/analyze-existing-agent.md) for one system, [build-agent-redteam-program.md](../guides/build-agent-redteam-program.md) for a whole program.
