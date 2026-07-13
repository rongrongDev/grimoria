# Multi-Agent Orchestration for Prompt Work

**Last reviewed:** 2026-07-13 · **Applies to:** Claude 4.x–5-era agent harnesses (Claude Code-style subagents and equivalents).
**Read this when:** deciding whether to split prompt-engineering work itself across multiple agents — authoring, reviewing, testing as separate contexts.
**Scope wall:** this doc covers multi-agent workflows *for doing prompt work*. Architecting multi-agent product systems is `@ai-engineer/topics/multi-agent-orchestration.md`; go there for orchestration in general.

Prompt engineering has a property that makes multi-agent splits unusually well-motivated: **the artifact under construction is text that persuades models — so the model that wrote it is the worst-positioned model to judge it.** An author-context has marinated in its own intentions; it reads the prompt it meant, not the prompt it wrote (rule 4). Ignorance simulation — the discipline's core review move — *requires* a context that doesn't share the author's assumptions. A fresh subagent is the cheapest genuinely ignorant reader you will ever hire.

The counterweight: every agent added is another context that can drift from the spec, and prompt work's spec is subtle. Split for *independence* and for *volume isolation*; never for ceremony.

---

## 1. The planner / implementer / reviewer split — when it pays

**When it pays.** A prompt change with stakes: a production system prompt refactor, a new prompt for a consequential task, a change touching policy/refusal behavior. The gains come from two specific independences:

- **Reviewer independence (the load-bearing one).** The reviewer agent gets the prompt text and the task spec — *not* the author's conversation, not the reasoning that produced the draft, not the summary of intent. The moment the reviewer sees "I added rule 7 to handle the refund edge case," it reads rule 7 as handling the refund edge case, and ignorance is gone; it will grade the intent instead of the text (the same mechanism as `topics/reasoning-elicitation.md` §3 — a persuasive trace corrupts the checker). Clean handoff: prompt text + spec + "review per the checklist," nothing else. This is why `prompt-clarity-reviewer` exists as an invocable skill: it makes the clean handoff the path of least resistance.
- **Planner leverage (situational).** For refactors of accumulated system prompts, a planning pass that produces the rule inventory and target structure (`topics/system-prompt-design.md` §2's protocol) *before* any rewriting keeps the implementer from re-deriving structure mid-edit and smuggling in scope creep. For small prompt changes, a planner is ceremony — skip it.

**When it doesn't.** One-off prompts, prototypes, changes already gated by a regression set with tight cases. The regression set *is* a reviewer — a deterministic, incorruptible, cheap one. Add agent-reviewers for what case sets can't see (ambiguity to a fresh reader, structural risk), not to re-check what they already pin.

**Gate pattern.** The reviewer's findings gate the merge the way CI does: severity-rated findings (the skills' output formats are designed as gate inputs), author addresses or explicitly waives with a reason in the version notes. A review that can be silently ignored converges to decoration within a month.

## 2. Fan-out patterns — testing in parallel

The two fan-outs that recur in prompt work, both built on the same math (per-branch volume × branch count must stay out of the parent's window):

- **Fan out across edge-case categories.** One `edge-case-behavior-scanner` per category (degenerate inputs, format-collisions, boundary cases, off-role requests) rather than one scanner grinding sequentially. Categories are independent, so parallelism is free correctness-wise; each returns a per-category characterization, and the parent merges tables, not transcripts.
- **Fan out across models.** Portability work (`extended/cross-model-portability.md`): the same prompt + regression set, one `prompt-version-differ`-style run per target model, parent receives per-model flip tables. This is how a model-migration decision becomes an afternoon instead of a sprint — and how it becomes *evidence* instead of "it seemed fine on the cases I tried."

**Fan-out discipline (learned the annoying way):**
- **Fix the harness before multiplying it.** Same regression set version, same params, same grading criteria across branches — a fan-out over subtly different harnesses produces differences that get read as model/category differences. Pin the case-set version in every branch's instructions.
- **Specify the return format in the dispatch.** N agents returning free-form prose = a merge job nobody budgeted. The dispatch prompt for a fan-out is itself a production prompt: give it the output skeleton (`topics/structured-output.md` §1 applies to your own tooling).
- **Cap the fan.** Ten categories usually cluster into four; run the clustering first. Each branch bills tokens and returns a report someone must read.

## 3. Failure modes specific to multi-agent prompt work

**Iterating without a regression set — the agent version.** An agent told "improve this prompt until the failing case passes" will do exactly that, efficiently, and with no memory of why existing sentences exist — it optimizes the visible target and silently reintroduces failures that older wording was holding down. This is §2 of `topics/versioning-and-regression-testing.md` at machine speed: the human version reintroduces an old bug per quarter; the agent version can do it per iteration loop. **Hard rule: no agent gets edit access to a production prompt without the regression set wired into its loop as the acceptance check — the full set, not the case being fixed.**

**Parallel agents converging on conflicting conventions.** Two agents authoring prompts for sibling features simultaneously: one delimits with XML tags, one with markdown headers; one puts format-specs last, one first; enum casings differ. Each prompt is individually fine; the family is now unmaintainable, and worse, *examples and fragments get copied between prompts* carrying convention collisions into single files — which is `topics/system-prompt-design.md` §3 (conflicting layers) with parallelism as the cause instead of time. Fix: a written prompt-style convention (delimiter scheme, section order, casing, null policy) handed to every authoring agent in its dispatch, and a merge-time consistency pass by one context that reads the whole family. One page of convention beats any amount of post-hoc reconciliation.

**Reviewer contamination (repeat because it's the one that silently defeats the whole design).** Pipelines drift toward "author agent summarizes its changes for the reviewer agent" because it feels efficient. It converts independent review into rubber-stamping of the summary. The handoff is the artifact, never the narrative about it.

**Verdict laundering.** A scanner subagent reports "3 categories show format degradation"; by the time the parent's summary reaches the human it's "minor formatting notes, otherwise clean." Every hop is a lossy compression biased toward "fine." Countermeasure: subagent verdicts travel as structured severity tables (the skills'/agents' fixed output formats), and the top-level report links the raw findings; a human can always drill one level down.

## 4. Default topologies

Small change, low stakes:
```
author (you/agent) ──► regression set ──► ship
```
Substantive change:
```
author ──► prompt-clarity-reviewer + few-shot-example-auditor (parallel, clean handoff)
       ──► regression set ──► prompt-version-differ vs. prod ──► ship
```
New prompt for a consequential surface, or system-prompt refactor:
```
planner (inventory/spec) ──► author ──► reviewers (parallel skills)
   ──► edge-case-behavior-scanner fan-out (categories)
   ──► regression set ──► version-differ ──► human sign-off with flip table in hand
```

The topology is chosen by *what an error costs*, not by how interesting the pipeline is to build. Most prompt changes are the first row.
