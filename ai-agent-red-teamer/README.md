# ai-agent-red-teamer — Agentic-System Red-Team Judgment, Encoded

**Version 1.0 — 2026-07-06.** A self-contained knowledge base distilled from years of adversarially probing agentic systems — models that don't just talk, but call tools, browse, write files, and take multi-step actions in the world. Written to be used without its author, by junior-through-staff AI safety/agent red-team engineers and by smaller AI models invoking the bundled skills/subagents. Structure rationale: [DESIGN.md](DESIGN.md). Vocabulary: [GLOSSARY.md](GLOSSARY.md). History: [CHANGELOG.md](CHANGELOG.md).

**The organizing idea:** an agent accretes **authority** (the tools and permissions it holds) faster than it earns **trust** (whether a given action's inputs and reversibility justify it *right now*). Every serious agentic failure is authority outrunning trust at one point in the trajectory — untrusted content treated as instructions, a permission broader than the task, an irreversible action with no real human check, a harmful path behind a clean-looking answer. Every principles doc teaches one such gap; every skill/subagent detects one.

**Scope boundary:** this KB is about what an agentic system *does*. For what a base model *says* — jailbreaks, harmful-content generation, conversational attacks — see the sibling KB `ai-model-red-teamer/`. We link there rather than restate. Rule of thumb: if the failure is fully "the model emitted bad text," it's theirs; if it needs an action/tool-call/state-change to matter, it's ours.

> **Safety constraint (read before contributing):** this KB contains **no working attack content** — no injection payloads, no exploit chains, no framework-hijacking recipes. The audience includes unsafeguarded models reading a single doc as their whole context, so every doc must be safe to hand to one. Describe attack *classes* and *mechanisms*; never a runnable instance. This overrides completeness. See [DESIGN.md](DESIGN.md).

## Find what you need (30 seconds)

**"I want to..."**

| ...do this | Go to |
|---|---|
| Stand up an agent red-team **program** end to end | [guides/build-agent-redteam-program.md](guides/build-agent-redteam-program.md) |
| **Assess one unfamiliar agent** for risk + remediation | [guides/analyze-existing-agent.md](guides/analyze-existing-agent.md) |
| Review an agent's **tool permissions** for excessive agency | Skill: `tool-permission-auditor` |
| Check a workflow for **missing/rubber-stamped confirmation gates** | Skill: `irreversible-action-gate-reviewer` |
| Map an agent's **injection surface** (untrusted-content entry points) | Subagent: `injection-surface-scanner` |
| Trace a **trajectory** to where untrusted content changed behavior | Subagent: `agent-trajectory-tracer` |

**"I need the judgment on..."** (principles — each: failure mode → detection → fix → prevention, ending in a review protocol)

| Risk class | Doc |
|---|---|
| The core model (authority ≠ trust, the trust boundary, decision trees) | [principles/core-principles.md](principles/core-principles.md) |
| Indirect prompt injection (untrusted content as instructions) | [principles/indirect-prompt-injection.md](principles/indirect-prompt-injection.md) |
| Excessive agency & permission scoping | [principles/excessive-agency.md](principles/excessive-agency.md) |
| Irreversible actions & human-in-the-loop gate design | [principles/irreversible-actions-and-oversight.md](principles/irreversible-actions-and-oversight.md) |
| Trajectory-level evaluation (+ privilege escalation via legit chains) | [principles/trajectory-evaluation.md](principles/trajectory-evaluation.md) |
| Reporting & fix verification (safe, class-level findings) | [principles/reporting-and-verification.md](principles/reporting-and-verification.md) |
| Multi-agent orchestration (doing RT vs. being RT'd) | [principles/multi-agent-orchestration.md](principles/multi-agent-orchestration.md) |

**Extended tier** (production-patterns + common-pitfalls depth):

[multi-agent collusion](extended/multi-agent-collusion.md) · [sandbox & environment integrity](extended/sandbox-and-environment-integrity.md) · [goal drift on long-horizon tasks](extended/goal-drift-long-horizon.md) · [agent-to-agent handoff injection](extended/agent-handoff-injection.md)

## The two questions that structure every assessment

1. **What can this agent do?** — the authority inventory (effective, including transitive + ambient). → [excessive-agency.md](principles/excessive-agency.md)
2. **Where does untrusted content reach the decision?** — the injection surface. → [indirect-prompt-injection.md](principles/indirect-prompt-injection.md)

The risk is the **intersection**: high authority × reachable-by-untrusted-content, especially where the authority is irreversible. Everything in this KB is depth on that intersection. ([core-principles.md](principles/core-principles.md) §3.)

## Where to start

- **New to the KB, human:** this page → [guides/analyze-existing-agent.md](guides/analyze-existing-agent.md) (concrete, you'll see the model in action) → read [principles/core-principles.md](principles/core-principles.md) and [principles/indirect-prompt-injection.md](principles/indirect-prompt-injection.md) in full → the rest as work demands.
- **AI model invoked as a skill/subagent:** your SKILL/agent file links exactly the principles sections you need; every doc is standalone.
- **Junior engineers:** the two guides are sequenced to follow without prior context; each step links its *why*.
- **Staff+ / reviewers:** each principles doc ends with a review protocol; the skills are those protocols with output contracts.

## Where the skills and subagents physically live

The reading content lives here under `ai-agent-red-teamer/`. The invocable **Skills** live in `.claude/skills/<name>/SKILL.md` and **Subagents** in `.claude/agents/<name>.md` — that's where the harness discovers them (matching every sibling KB). Each skill/agent body names the `ai-agent-red-teamer/principles/...` doc that is its source of truth. See [DESIGN.md](DESIGN.md) for why the split.

## Rules this KB lives by

1. Every doc is independently readable, carries a version/date stamp and the framework-maturity level it applies to. This field moves fast; undated advice rots.
2. Facts live in one place; everything else links (see [DESIGN.md](DESIGN.md) boundary rules before adding content).
3. Skills do bounded reviews in your context; subagents isolate unbounded reading. Their frontmatter says when *not* to use them — respect it.
4. Strong claims are backed by generalized, non-reproducible program-level lessons — a scope that was too broad, a gate that got rubber-stamped, a surface nobody had mapped. The *why* is what makes a rule survive a deadline.
5. **No working attack content, anywhere, ever.** Every addition gets a second read specifically for it (the standing gate in [CHANGELOG.md](CHANGELOG.md)).
