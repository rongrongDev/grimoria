# Design Note: Why Each Piece Lives Where It Lives

**Version:** 1.0.0 · **Date:** 2026-07-13 · **Author:** principal prompt engineer (final knowledge transfer)

## The sorting rule

**Principles teach, skills do, subagents isolate.** Content became a *principles or topics doc* when its value is judgment you reason with while writing or reviewing a prompt — you can't "invoke" the knowledge that few-shot examples teach format more strongly than instructions do; you read it once and then design differently forever. Content became a *skill* when it's a bounded, repeatable procedure over an artifact that fits in the working context (a prompt is almost always small; the *review* of a prompt is skill-shaped by nature). Content became a *subagent* when the work produces volumes of intermediate output the caller's context should never carry — running a prompt against 200 edge-case inputs, or diffing two prompt versions across a full regression set, generates transcripts by the hundred; the caller needs the characterization, not the transcripts.

No *commands* exist in this KB. Nothing here is both trivial and worth naming — and burying a clarity review behind a no-auto-invoke command would hide it from exactly the models that should be running it before every prompt ship.

## Placement decisions and their reasons

| Piece | Primitive | Why this and not something else |
|---|---|---|
| Core craft areas (clarity, few-shot, reasoning, structured output, system prompts, versioning) | `topics/` docs | Full-depth failure→detection→fix→prevention judgment. A skill can't "do" clarity for you — you internalize why one ambiguous noun forked output across thousands of requests, then you write differently. |
| Worldview + decision trees | `principles/` | The 12 rules everything else instantiates, and the forks (few-shot or not, CoT or not, prompt-JSON or API-enforced) with *defaults*, because "it depends" is the least useful sentence in this field. |
| Extended-tier areas (portability, injection-aware structure, cost, multi-turn) | `extended/` docs | Production patterns + pitfalls, deliberately shallower per the scope contract. Separated at the path level so depth expectations are legible. |
| Build-from-scratch, audit-existing | `guides/` | End-to-end workflows with ordered steps and exit criteria. Docs rather than skills because both interleave human judgment (stakeholder spec questions, tradeoff calls) with mechanical steps — though both are written to be executable by an agent as a protocol. |
| `prompt-clarity-reviewer` | skill | Minutes-scale document review; the prompt under review fits in context; output is a findings table. The skill-shaped sweet spot. Its `checklist.md` is separate so the per-check list can tighten without touching the trigger frontmatter. |
| `few-shot-example-auditor` | skill | Also bounded review, but of the *examples* specifically — a distinct procedure (coverage matrix, pattern-leakage probes) with a distinct trigger. Merging it into the clarity reviewer would make both triggers mushy. |
| `edge-case-behavior-scanner` | subagent | Isolation-mandatory: it executes the prompt against a large input batch and reads every output. Hundreds of model responses stay in its window; only the failure-mode characterization returns. Also an independence guarantee — the prompt's author shouldn't grade their own edge cases from memory of what they intended. |
| `prompt-version-differ` | subagent | Same isolation math (two versions × N regression cases = 2N transcripts) plus a discipline the parent context tends to lose: attribute each behavior delta to a specific prompt edit *before* narrating, or every diff becomes a story about the edit you remember making. |

## Structural choices

- **Every doc standalone**, stamped with date and model-family scope in its header. This is the fastest-rotting domain in the series — prompting behavior that holds on one model version can invert on the next — so the stamp is not decoration; it's the trust boundary.
- **Cross-references run both directions:** topic docs name the skills/subagents that operationalize them; every skill/subagent names its backing docs.
- **Scope walls are explicit.** System architecture (RAG, agents, tool use) → `@ai-engineer/`. Evaluation methodology (metric design, judges, statistical rigor) → `@ai-eval-engineer/`. Adversarial injection methodology → `@ai-agent-red-teamer/`. This KB owns the *craft of the prompt itself*; where a topic touches a wall, the doc links out and says exactly what it does and doesn't cover. `@ai-engineer/topics/prompt-design.md` is the system-level view of the same territory; this KB is the deep end of that pool, and both say so.
- **War stories are load-bearing.** "Ambiguity causes inconsistency" changes nobody's behavior. "The word *date* on an invoice extractor forked output on 15% of documents for a month" does.
