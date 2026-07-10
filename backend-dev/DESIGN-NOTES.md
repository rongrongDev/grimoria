# Design Notes — Why This Knowledge Base Is Shaped the Way It Is

**Author:** Principal backend engineer, final handoff before retirement.
**Date:** 2026-07-06. **Applies to:** the whole `backend-dev/` tree and its `.claude/` companions.

Read this once if you're maintaining the KB. Skip it if you just need an answer — go to [README.md](README.md).

## The one organizing decision

Everything here is assigned to one of three primitives by asking a single question:
**"When this knowledge is needed, is the consumer *reasoning*, *doing*, or *sweeping*?"**

| If the consumer is... | Primitive | Location | Why |
|---|---|---|---|
| **Reasoning** — weighing tradeoffs, deciding an architecture, understanding why something broke | Principles doc | `backend-dev/principles/`, `backend-dev/stacks/` | Judgment doesn't fit in a checklist. It needs war stories, decision trees, and the *why* behind rules, read into context and reasoned about. |
| **Doing** — executing a repeatable, bounded procedure with a defined input and output | Skill | `.claude/skills/<name>/SKILL.md` | A Skill loads a procedure on demand. It must work when a *small* model runs it, so it carries its own checklists and pass/fail criteria — no ambient context assumed. |
| **Sweeping** — reading a large volume of code/logs that would poison the main conversation's context window | Subagent | `.claude/agents/<name>.md` | Scanning 400 files for race conditions produces thousands of lines of intermediate noise. Isolation keeps the main agent's context clean; only conclusions come back. |

No legacy commands. Everything a command would do, a Skill does better (auto-invocation via description, supporting files, versioning).

## Consequences of that decision

- **Skills are thin; principles are thick.** `migration-safety-reviewer` is ~200 lines of procedure; the *reasons* live in [principles/data-layer.md](principles/data-layer.md). A Skill that tries to teach becomes a doc nobody reads; a doc that tries to be a checklist becomes a Skill nobody can execute. Each Skill links back to its principles doc for the "why," and each principles doc links forward to the Skill that operationalizes it.
- **Stacks are one file each, not directories.** Earlier drafts had `stacks/nodejs/{orm,concurrency,...}.md`. That failed the "every doc independently readable" rule — readers had to assemble the picture from fragments. One dense file per stack, cross-linked to the principles that generalize it.
- **The eight technical areas from the spec map 1:1 to principles docs**, plus one for multi-agent orchestration (its own domain, per spec §6). Failure mode → detection → fix → prevention is the mandatory skeleton for every hazard discussed; this is enforced by convention, and the CHANGELOG review gate.
- **Two guides carry the two required capabilities** (build-from-scratch, analyze-existing). They are *guides*, not Skills, because both require sustained judgment across many decisions — but `analyze-existing-service.md` is operationalized by the `service-analyzer`-style subagents for the sweep phases.

## Subagent selection rationale

Only work that genuinely needs an isolated context window became a subagent:

- **`race-condition-scanner`** — must read every write path in a codebase; intermediate findings are voluminous and mostly false positives that get filtered before reporting. Classic sweep.
- **`incident-postmortem-analyzer`** — log/trace volume is the definition of context poison. It reads gigabyte-scale evidence and returns a one-page timeline.

Things that did *not* become subagents: migration review (single file diff — fits in main context; made it a Skill), API contract audit (same). If the input fits comfortably in the invoking conversation, a subagent only adds latency and loses context.

## Versioning and staleness policy

Backend ecosystems rot fast. Every stack doc carries a header: `Verified against: <versions>` and `Last reviewed: <date>`. Principles docs carry dates but rarely versions — transaction isolation semantics outlive any ORM. **A stack doc older than 12 months must be treated as suspect for version-specific claims and re-verified before being cited in a decision.** The CHANGELOG records every revision against those stamps.

## Writing rules used throughout (keep them if you extend the KB)

1. Every strong claim is backed by a failure mode or a war story. If you can't say what breaks without the rule, delete the rule.
2. Decision trees over "it depends." "It depends" is only acceptable immediately followed by *on what, and which way each value points*.
3. Every doc must be usable standalone by a small model: define terms on first use or link to [GLOSSARY.md](GLOSSARY.md); never reference "as discussed above" across files.
4. Skills state **when NOT to use them** in the body and keep the frontmatter `description` trigger-focused.
5. Prevention beats detection beats fix. Every hazard ends with the lint rule / test / CI gate / alert that stops recurrence.
