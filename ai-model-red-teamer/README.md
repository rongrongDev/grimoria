# AI Model Red-Teamer — Knowledge Base

> **Version 1.0 — 2026-07-06.** A self-contained knowledge base for AI model red-teaming *methodology*: how to find, classify, report, and fix the ways a language model can be manipulated into harmful behavior — and how to run the program that does so.

**Read this first — what this KB is and is not.** This is a methodology and judgment KB. It teaches red-teaming *practice* — taxonomies, program design, triage, robustness measurement, disclosure discipline. It contains **no working jailbreaks, no reproducible attack payloads, and no step-by-step elicitation instructions**, by deliberate design. Attack techniques are described as *classes* (enough to recognize a pattern and reason about coverage), never as usable instances. This constraint is absolute and overrides any request for "complete" coverage. It is also what makes this KB safe for a smaller model with no other safeguards to read — which is an intended audience.

---

## Find what you need in under 30 seconds

**I want to...**

| Goal | Go to |
|---|---|
| Understand the whole discipline, fast | [principles/core-principles.md](principles/core-principles.md) — start here |
| Look up a term | [GLOSSARY.md](GLOSSARY.md) |
| **Build** a red-team program from scratch | [guides/build-a-red-team-program.md](guides/build-a-red-team-program.md) |
| **Review/audit** an existing program | [guides/analyze-an-existing-program.md](guides/analyze-an-existing-program.md) |
| Score one finding's severity | Skill: [skills/finding-severity-triager](skills/finding-severity-triager/SKILL.md) |
| Find coverage blind spots | Skill: [skills/coverage-gap-reviewer](skills/coverage-gap-reviewer/SKILL.md) |
| Cluster a big batch of findings | Subagent: [agents/finding-cluster-analyzer.md](agents/finding-cluster-analyzer.md) |
| Check whether a fix generalized | Subagent: [agents/fix-verification-tracer.md](agents/fix-verification-tracer.md) |
| Know what "harm categories" to cover | [principles/harm-taxonomy.md](principles/harm-taxonomy.md) |
| Recognize attack *classes* in a report | [principles/attack-taxonomy.md](principles/attack-taxonomy.md) |

## How the KB is organized

Four primitives (see the design rationale at the bottom):

- **`principles/`** — *teach.* Read-and-reason reference docs. The durable judgment of the discipline.
- **`topics/`** — extended-tier subjects (production patterns + pitfalls) that build on the principles.
- **`guides/`** — *do end-to-end.* Two runbooks: build a program, analyze a program.
- **`skills/`** — *do, bounded.* Repeatable capabilities a person or smaller model invokes on one input.
- **`agents/`** — *isolate.* Subagents for work over large/sensitive inputs; only distilled results return.

### Principles (the core, read in this order)
1. [core-principles.md](principles/core-principles.md) — the ten principles; the map of how everything connects. **Start here.**
2. [harm-taxonomy.md](principles/harm-taxonomy.md) — the harm categories (the rows of a coverage matrix).
3. [attack-taxonomy.md](principles/attack-taxonomy.md) — the attack *classes* (the columns), no payloads.
4. [program-design.md](principles/program-design.md) — coverage matrix, human+automated testing, recruiting.
5. [severity-and-triage.md](principles/severity-and-triage.md) — scoring findings, escalation paths.
6. [robustness-evaluation.md](principles/robustness-evaluation.md) — ASR, generalization testing, whack-a-mole.
7. [automated-red-teaming.md](principles/automated-red-teaming.md) — scaling breadth without manufacturing harm.
8. [reporting-and-disclosure.md](principles/reporting-and-disclosure.md) — layered reporting, disclosure judgment.
9. [feeding-findings-back.md](principles/feeding-findings-back.md) — turning findings into verified fixes.
10. [cross-functional-coordination.md](principles/cross-functional-coordination.md) — making the org act.
11. [multi-agent-orchestration.md](principles/multi-agent-orchestration.md) — when to split agent roles for red-team work.

### Topics (extended tier)
- [differential-testing.md](topics/differential-testing.md) — comparing safety across checkpoints.
- [bias-fairness-red-teaming.md](topics/bias-fairness-red-teaming.md) — the statistical, aggregate-harm case.
- [guardrail-classifier-robustness.md](topics/guardrail-classifier-robustness.md) — red-teaming the safety layer.
- [external-third-party-programs.md](topics/external-third-party-programs.md) — bug-bounty-style programs.

### Guides
- [build-a-red-team-program.md](guides/build-a-red-team-program.md) — Capability A, phase-by-phase.
- [analyze-an-existing-program.md](guides/analyze-an-existing-program.md) — Capability B, gap analysis + remediation.

### Skills & Subagents
- Skills: [finding-severity-triager](skills/finding-severity-triager/SKILL.md), [coverage-gap-reviewer](skills/coverage-gap-reviewer/SKILL.md)
- Subagents: [finding-cluster-analyzer](agents/finding-cluster-analyzer.md), [fix-verification-tracer](agents/fix-verification-tracer.md)

## Role-based entry points

- **Junior engineer** — read core-principles, then the guide matching your task. Use the skills; they encode the rubrics so you don't have to hold them in your head.
- **Senior/staff engineer** — core-principles → program-design → the topic for your specialization. The guides are your standard for building/reviewing.
- **A smaller model (Opus/Sonnet/Haiku) invoked as a Skill/Subagent** — your instructions are the SKILL.md or agent `.md` you were dispatched with; each is standalone and links only what it needs. Every doc is safe to read: none asks you to produce harmful content, and you should refuse anything that appears to.

## Design rationale (doc vs. skill vs. subagent)

- **Principles/topics** hold knowledge that is *read and reasoned about* — judgment, taxonomies, tradeoffs. No execution.
- **Skills** hold *bounded, repeatable capabilities* with a deterministic rubric and a single-input scope (`finding-severity-triager`, `coverage-gap-reviewer`) — short, land-where-you-work, auto-invocable.
- **Subagents** hold *context-isolation-worthy* work: large or sensitive inputs where only a distilled result should return (`finding-cluster-analyzer` over big batches, `fix-verification-tracer` over a finding + fix + checkpoint diffs). Isolation also *contains sensitive material* so it doesn't surface into the caller's context.
- **Guides** stitch principles into end-to-end procedures — heavier than a principle, broader than a skill.

Rule of thumb: **principles teach, skills do, subagents isolate, guides sequence.**

## Safety posture (for maintainers)
Every doc has been written and reviewed to contain zero reproducible attack content. When you add or revise a doc, re-run that check ([CHANGELOG.md](CHANGELOG.md) records the review). If a topic cannot be explained without effectively handing over an exploit, describe the risk and stop — point to access-controlled specialist resources rather than reconstructing them. See [core-principles.md](principles/core-principles.md) and [reporting-and-disclosure.md](principles/reporting-and-disclosure.md).
