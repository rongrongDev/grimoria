# Design Note — ai-agent-red-teamer Knowledge Base

**Version 1.0 — 2026-07-06.** Author: retiring principal AI agent red team lead. This note explains *why* content landed where it did, so future maintainers extend the KB without eroding its structure — and without ever letting it become an attack cookbook.

---

## The one organizing idea

Everything here is organized around a single observation from years of adversarially probing agentic systems: **an agent accretes authority faster than it earns trust.** A model that only talks can be wrong; an agent that calls tools can be wrong *and act on it*. The agent holds authority — the tools it can call, the permissions it was granted, the irreversible effects it can produce — but the trust each individual action deserves changes moment to moment, depending on where the inputs came from (trusted operator vs. a web page it just read) and how reversible the effect is (a draft vs. a wire transfer).

Every serious agentic failure I have seen is the same shape: **authority outran trust at a specific point in the trajectory.** Untrusted content reached a privileged context and was treated as instructions (indirect prompt injection). Granted permission exceeded what the task needed, so a mistake had more blast radius than it should have (excessive agency). An irreversible action fired without a human who actually understood it (oversight gap). A multi-step path produced a clean-looking final answer by way of a harmful route nobody would have approved step by step (trajectory blindness). Multiple agents amplified one of these because no single agent's design anticipated the others (multi-agent risk).

So: **every principles doc teaches one place authority can outrun trust; every skill/subagent detects one.** That is the spine. If you are adding content and can't say which authority-vs-trust gap it addresses, it probably belongs in an existing doc, not a new one.

## Scope boundary with `ai-model-red-teamer/`

The sibling KB `ai-model-red-teamer/` probes what a model **says** — jailbreaks, harmful-content elicitation, single- and multi-turn conversational attacks against the base model. This KB probes what an agentic system **does** — the risks that only exist once a model can call tools, read untrusted content mid-task, and take multi-step or irreversible actions.

The boundary rule: **if the failure is fully expressible as "the model emitted bad text," it belongs to `ai-model-red-teamer/`. If the failure requires an action, a tool call, a state change, or a multi-step effect to matter, it belongs here.** Content-safety methodology (harm taxonomies, jailbreak classes, severity of generated text, responsible disclosure of a base-model finding) is *linked to*, never restated. When an injection's *payload* is "make the model say something harmful," that payload's harm is a content-safety question (their KB); the *delivery via untrusted tool output into a privileged context* is the agentic question (this KB).

## The hard constraint that shaped every file

This KB documents **methodology, category-level taxonomy, detection strategy, and defensive design.** It contains **no working prompt-injection payloads, no reproducible exploit chains, no step-by-step framework-hijacking instructions, and nothing that functions as a usable attack script if copied verbatim.** Attack *classes* and the mechanism that makes them dangerous are described in general terms; a working instance is never given.

This is not a stylistic preference — it is a structural constraint, because the intended audience explicitly includes smaller models invoked as skills/subagents *with no other safeguards*. A doc in this KB may be the entire context a model has when it reads it. So every doc must be safe to hand to an unsafeguarded model: reading it must not teach that model to attack anything. Where a topic genuinely cannot be explained without handing over a working exploit, the doc describes the risk and stops. This constraint overrides completeness. A gap in coverage is acceptable; a pasteable payload is not.

## Primitive assignment (doc vs. Skill vs. Subagent)

The rule I applied: **principles teach, skills do, subagents isolate.**

- **`principles/`** — cross-cutting judgment independent of any framework: the core authority-vs-trust model, the four core risk classes, reporting discipline, and multi-agent orchestration. These are the docs you *reason from*. Each follows failure mode → detection → fix → prevention and ends with a review protocol.
- **`extended/`** — the extended-tier risk classes (multi-agent collusion, sandbox/environment integrity, goal drift, handoff injection) at production-patterns + common-pitfalls depth only. These are real risks but shallower coverage by design; the CHANGELOG records if one gets promoted.
- **`guides/`** — the two end-to-end capabilities the brief demands: design a program from scratch, and analyze an existing agentic system. Guides *sequence* the principles; they do not restate them.
- **`.claude/skills/`** — repeatable *reviews of bounded artifacts* whose findings must land in the caller's working context: `tool-permission-auditor` (review a granted tool scope against task need) and `irreversible-action-gate-reviewer` (check a workflow for missing human-confirmation gates). These read a nameable set of files; isolating them would only hide the findings from where the work happens.
- **`.claude/agents/`** — work whose *reading is unbounded* and would flood the caller: `injection-surface-scanner` (sweep an agent's whole tool/config surface to enumerate every place untrusted content reaches the model without provenance separation). Returns a ranked surface map, not the file dump.

### Why the KB content lives in `ai-agent-red-teamer/` but skills/agents live in `.claude/`

This matches the whole sibling ecosystem (`ml-engineer/`, `ai-eval-engineer/`, etc.). The harness discovers invocable Skills in `.claude/skills/<name>/SKILL.md` and Subagents in `.claude/agents/<name>.md`; that's where they must physically live to be callable and independently testable. Their *logical home* is this KB — every SKILL/agent body names the `ai-agent-red-teamer/principles/...` doc that is its source of truth, exactly as `data-leakage-scanner` references `ml-engineer/principles/data-leakage.md`. The brief's canonical paths (`@ai-agent-red-teamer/skills/...`) describe the logical ownership; the physical path is the harness's requirement.

### Deliberate deviations from the brief's examples

1. **`trajectory-tracer` — reused, not duplicated.** The brief lists a red-team `trajectory-tracer` subagent for finding where untrusted content changed an agent's behavior. A general-purpose `agent-trajectory-tracer` subagent **already exists** in this repo (built for the `ai-engineer` KB) and already treats injected content in a transcript as a first-class finding. Forking it into a near-identical red-team copy would be exactly the redundant-agent, multiple-writers anti-pattern this KB warns about in `principles/multi-agent-orchestration.md`. So I reuse it: `principles/trajectory-evaluation.md` and both guides point to `agent-trajectory-tracer` for replay-based forensics, and I built the one genuinely non-overlapping subagent (`injection-surface-scanner`) instead. Modeling the discipline is part of the lesson.

2. **No separate `topics/` tree.** The brief allowed `topics/<name>/`. Agent red-teaming has no "stack mechanics" layer the way ML does; framework-specific notes (MCP tool servers, retrieval tools, browser tools, memory stores) are *where* the core risks show up, so they live as "where this shows up in practice" sections inside the relevant principles doc rather than as standalone framework guides. A per-framework tree would also invite exactly the framework-hijacking detail the scope constraint forbids.

3. **Privilege-escalation-through-legitimate-chains folded into `trajectory-evaluation.md`.** The brief lists it as its own technical area. Mechanically it *is* the trajectory problem — a harmful cumulative effect assembled from individually-reasonable steps is only visible when you judge the path, not the steps. Giving it its own doc would split one idea across two homes. It gets a full, clearly-headed section instead.

## Boundary rules (so the KB doesn't rot)

1. **A fact lives in exactly one place; everything else links.** The injection taxonomy lives in `principles/indirect-prompt-injection.md`; skills reference it rather than restating it. Duplicated taxonomy drifts and then contradicts itself.
2. **Skills and agents carry procedure + output contract only.** If you find yourself teaching theory in a SKILL.md, move it to a principles doc and link.
3. **Every doc carries a version/date stamp and the framework-maturity level it applies to.** This field moves fast; undated agent-safety advice is worse than none. When you revise, bump the stamp and add a CHANGELOG entry.
4. **Extended-tier docs stay at patterns + pitfalls depth.** If one earns full-depth demand, promote it to `principles/` explicitly in the CHANGELOG.
5. **The scope constraint is a review gate, not a guideline.** Every addition gets a second read specifically for accidental working-attack content before it merges (see `CHANGELOG.md` for the standing checklist).

## Reading-order contract

`README.md` is the map (find anything in <30s). `GLOSSARY.md` is the shared vocabulary. New readers: README → both guides → `principles/core-principles.md` and `principles/indirect-prompt-injection.md` in full → the rest as work demands. Agents/small models: invoke the skill; the skill links exactly the principles sections it depends on, and every doc is standalone by design.
