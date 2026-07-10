# Design Note: Why Each Piece Lives Where It Lives

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Author:** principal AI evaluation engineer (final knowledge transfer)

## The sorting rule

**Principles teach, skills do, subagents isolate.** Concretely: content became a *principles doc* when its value is judgment you reason with while making a decision; a *skill* when it's a repeatable, bounded procedure over artifacts already in (or easily brought into) the working context; a *subagent* when the work either produces more intermediate output than a working context should carry, or requires independence from whoever produced the thing being checked. No *commands* exist in this KB: nothing here is both trivial and worth naming — the command primitive's niche — and defaulting rubric reviews or bias probes to a no-auto-invoke command would just hide them from the models that should be invoking them.

## Placement decisions and their reasons

| Piece | Primitive | Why this and not something else |
|---|---|---|
| 8 core technical areas + orchestration | `principles/` docs | Tradeoffs and war-story-backed judgment. A skill can't "do" statistical rigor for you — you read it, then design differently. Each doc carries failure→detection→fix→prevention so it's actionable, not just wise. |
| Extended-tier areas (adversarial, agentic, multimodal, RLHF) | `topics/` docs | Same read-and-reason nature, deliberately shallower (production patterns + pitfalls) per the KB's scope contract. Separated from `principles/` so depth expectations are legible at the path level. |
| Build-from-scratch, audit-existing | `guides/` docs | End-to-end *workflows* with ordered steps and exit criteria. Kept as docs, not skills, because both require sustained human judgment and multi-day elapsed time (human-label turnarounds, stakeholder sign-off) — a skill invocation implies a bounded session. The audit guide is, however, written to be executable by an agent as a protocol. |
| `eval-rubric-reviewer` | skill | Repeatable document review, minutes-scale, inputs fit in context, output is a findings report. Trigger and not-for conditions are crisp — the skill-shaped sweet spot. Supporting `checklist.md` keeps the per-criterion checks versionable independently of the invocation logic. |
| `judge-bias-auditor` | skill | Also bounded and repeatable, but it *runs probes and computes numbers* rather than reading documents — kept as a skill (not subagent) because probe outputs are small (stats tables), and the operator benefits from watching probes land. Its `bias-test-protocols.md` exists so protocols can be tightened without touching frontmatter/triggers. |
| `contamination-scanner` | subagent | Both isolation criteria at once: dataset-scale scan output (n-gram tables, similarity matrices) would flood a parent context, and the adopting engineer shouldn't grade their own benchmark — a fresh context is a cheap independence guarantee. Tool allowlist includes corpus/file access + web (publication-date research) but the prompt forbids editing what it audits. |
| `eval-regression-tracer` | subagent | Reads hundreds of transcripts to answer one question; the parent needs the verdict, not the reading. Statistics-before-reading is hard-coded because a narrative-first tracer in the parent context is exactly how noisy deltas get names (`principles/statistical-rigor.md` §4). No web tools — everything it needs is local run data. |

## Structural choices

- **Every doc standalone:** each states version/date/scope in its header and links out rather than assuming reading order — required for smaller models invoked with a single file in context.
- **Cross-references run both directions:** principles docs name the skills/subagents that operationalize them; every skill/subagent names its backing principles doc. A reader entering from either side finds the other.
- **War stories are load-bearing, not decoration:** each major failure mode carries one concrete caught-in-the-wild case, because "position bias exists" doesn't change behavior and "our harness alphabetized the slots and gave every candidate a 7-point tailwind for a quarter" does.
- **Failure→detection→fix→prevention as the recurring skeleton:** detection first-class because most eval failures are *silent* — the score keeps printing.
