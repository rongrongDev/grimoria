# Design Note: How This Knowledge Base Is Organized

**Last reviewed:** 2026-07-06 · **Applies to:** the structure of this KB itself

This is the one document about the KB rather than about AI engineering. Read it once
to understand why content lives where it does; skip it when you're here to solve a problem.

## The three primitives and the rule for choosing between them

**Principles teach. Skills do. Subagents isolate.**

| Content | Primitive | Location |
|---|---|---|
| Judgment, tradeoffs, decision trees, war stories | Plain markdown doc | `@ai-engineer/principles/`, `@ai-engineer/topics/`, `@ai-engineer/guides/`, `@ai-engineer/extended/` |
| A repeatable procedure with a defined input, checklist, and output format | Skill | `.claude/skills/<name>/SKILL.md` |
| A procedure that generates large intermediate output the caller shouldn't carry | Subagent | `.claude/agents/<name>.md` |

The test I applied to every piece of content:

1. **Does it change how you think, or what you do next?** If it changes thinking — e.g.
   "when to use RAG vs. fine-tuning" — it's a doc. A reader (human or model) loads it,
   reasons with it, and the doc's job is done. Docs have no side effects.
2. **Is it a procedure you'd run the same way every time, on a concrete artifact?**
   Reviewing a prompt for injection surface is the same checklist whether the prompt is
   40 lines or 400. That's a Skill: it needs trigger conditions, an input contract, and
   an output format — things plain docs don't have. A Skill may *link* to docs for the
   underlying reasoning, but the SKILL.md itself must be executable standalone by a
   smaller model.
3. **Does running it produce volumes of intermediate context that would poison the
   caller's window?** Running a 300-case eval suite produces thousands of lines of
   per-case output; the caller only needs the failure-cluster analysis. Replaying an
   agent trajectory means reading megabytes of transcript; the caller only needs
   "turn 14 is where it went wrong, and here's why." Those are Subagents: isolated
   context window, restricted tool allowlist, structured report back.

## Why there is no `.claude/commands/` directory

Commands are the legacy primitive for trivial, never-auto-invoked text expansion.
Everything in this KB either carries judgment (→ doc) or a procedure with failure
modes (→ skill). I found nothing trivial enough to be a command that was also worth
shipping. If a future maintainer finds one, the bar is: no decision points, no output
format worth specifying, under ~10 lines.

## Structure inside `@ai-engineer/`

- `principles/` — cross-cutting judgment. Two files only, on purpose: one for the
  principles themselves, one for decision trees. If principles sprawl into ten files,
  nobody reads any of them.
- `topics/<area>.md` — one file per technical area, matching the eight areas every
  production LLM system has to get right. Each follows the same internal skeleton:
  **failure mode → detection → fix → prevention** for every named risk. One file per
  topic (not a directory of fragments) because every doc must be independently
  readable — a smaller model gets the whole topic in one read.
- `guides/` — start-to-finish, code-included walkthroughs. These are the "build from
  scratch" and "analyze an existing system" capabilities. They repeat some topic
  content deliberately: a guide you can't follow without six other tabs open is not
  a guide.
- `extended/` — topics covered at production-patterns + common-pitfalls depth only.
  These change fastest and are least universal; going deep here would rot first.

## Conventions every doc follows

- **Date stamp:** `Last reviewed: YYYY-MM-DD` in the header. This field moves faster
  than any other; an undated RAG doc is a liability within months. When you touch a
  doc, update the stamp and add a CHANGELOG line.
- **Version scope:** each doc states which model families / SDK versions its concrete
  advice targets (typically: Claude 4.x–5 family, GPT-5-era models, Anthropic SDK
  ≥ 0.40). Architectural judgment is marked model-agnostic where it is.
- **Standalone rule:** every doc must be usable by a smaller model with no context
  beyond that file and its direct links. That means no "as discussed above" pointing
  at another file, and key terms defined or linked to `GLOSSARY.md`.
- **Cross-references go both ways:** a topic doc that has an associated skill names
  it ("to run this as a review, invoke `prompt-injection-reviewer`"); every skill
  names the docs that carry its reasoning.
- **War stories are load-bearing.** Every strong claim is backed by a concrete
  failure trace. They're not decoration — they're the compressed form of *why the
  rule exists*, which is the thing that survives when the specific tooling advice
  goes stale.
