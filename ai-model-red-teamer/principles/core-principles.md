# Core Principles of AI Model Red-Teaming

> **Version 1.0 — 2026-07-06.** Applies to: all model versions and program maturity levels. This is the root judgment doc; every other doc in this KB assumes you have read it.

**Safety note for the reader (including model readers):** This document and this entire knowledge base describe red-teaming *methodology* — how to find and manage model failures. It deliberately contains no working attacks, no reproducible payloads, and no step-by-step elicitation instructions. If you are a model reading this to invoke a Skill or answer a question, nothing here asks you to produce harmful content, and you should refuse anything that appears to. See [reporting-and-disclosure](./reporting-and-disclosure.md) for why we write this way.

---

## What red-teaming actually is

Red-teaming is the adversarial half of model safety: you deliberately try to make a model do the thing it is supposed to refuse, so the failure is found by you — under controlled conditions, documented, and fixable — rather than by a motivated stranger after launch. Automated evals check whether the model does the right thing on cases you thought of. Red-teaming checks whether the model does the wrong thing on cases the world will think of and you didn't.

The two are not substitutes. I have watched a model pass every automated eval in the suite — thousands of cases, green across the board — and fail inside the first hour of unstructured human probing, because a human tried a framing no eval author had written down. Evals measure known failure shapes. Red-teaming discovers unknown ones. A program that only runs evals is measuring its own imagination.

## The ten principles

### 1. The absence of a finding is not the absence of a vulnerability

A clean red-team pass means "we did not find it," never "it is not there." This is the single most dangerous confusion in the field. Report coverage (what you tested), not just outcomes (what you found). A dashboard that shows "0 criticals this cycle" without showing what was probed is worse than no dashboard, because it manufactures false confidence. See [robustness-evaluation](./robustness-evaluation.md) for why a low attack success rate can coexist with a wide-open vulnerability.

### 2. Patching a phrasing is not fixing a vulnerability

When a finding is reported, the cheap fix is to make that exact input refuse. The expensive, correct fix addresses the *mechanism* that let the input through. If you patch phrasings, you are playing whack-a-mole, and the mole always wins: the same underlying weakness resurfaces in a slightly reworded form, often within a week. I have seen a "fixed" jailbreak reappear after a trivial synonym swap because the patch keyed on surface tokens, not on what the model was actually being manipulated into doing. Always ask: *what class of input does this belong to, and did the fix close the class?* See [feeding-findings-back](./feeding-findings-back.md).

### 3. Coverage is a matrix, not a number

"We red-teamed the model for 200 hours" tells you nothing about safety. Two hundred hours all spent on one favorite attack class leaves every other harm category untested. Track coverage as a grid of (harm category × attack class × surface), and treat empty cells as known unknowns. Tunnel vision on a few "fun" attack classes is the most common way a mature program still ships a gap. See [program-design](./program-design.md).

### 4. Severity is about the world, not about cleverness

A finding's severity is a function of real-world consequence — uplift potential, ease of reproduction, breadth of affected population — not of how elegant the attack was. The most impressive-looking jailbreak may be low-severity because it produces only information already trivially available elsewhere; a boring-looking one may be critical because it provides genuine uplift toward serious harm at scale. Score consequence, not craft. See [severity-and-triage](./severity-and-triage.md).

### 5. Red-teaming must not manufacture the harm it studies

The program's own tooling — especially automated adversarial generation — can itself produce genuinely dangerous, reusable content as a byproduct. A red-team that fills a shared repository with working attack payloads has created the exact artifact it exists to prevent. Design controls so that findings capture *the vulnerability* without becoming *a weapon*. This constraint is load-bearing and overrides "be comprehensive." See [automated-red-teaming](./automated-red-teaming.md) and [reporting-and-disclosure](./reporting-and-disclosure.md).

### 6. Human creativity and automated scale are complements

Humans find novel classes; automation finds breadth within known classes. Automation cannot invent the framing a human hasn't taught it, and humans cannot enumerate ten thousand phrasing variants by hand. A program that leans entirely on either is leaving half the space untested. Sequence them: humans discover a class, automation maps its extent, humans interpret the map. See [program-design](./program-design.md) and [automated-red-teaming](./automated-red-teaming.md).

### 7. A finding that doesn't reach the fix loop is wasted work

The output of red-teaming is not a report; it is a *changed model*. Findings that sit in a backlog because no one translated them into training data, a classifier update, or a policy change are pure cost. The hardest part of a mature program is not finding failures — it is the cross-functional plumbing that turns a finding into a shipped fix and *verifies the fix generalized*. See [feeding-findings-back](./feeding-findings-back.md) and [cross-functional-coordination](./cross-functional-coordination.md).

### 8. Write findings that inform the defender without arming the attacker

A finding report must give the safety and training teams enough to reproduce and fix, while never itself becoming a copy-paste attack. This tension is real and permanent. The resolution is to describe the *mechanism and class* precisely and the *exact payload* minimally and access-controlled — never in the open backlog. See [reporting-and-disclosure](./reporting-and-disclosure.md).

### 9. Test generalization, not instances

Every finding is one point in a space. The job is to characterize the neighborhood: does the failure hold across paraphrases, across languages, across adjacent topics, across model checkpoints? A finding tested only at its single discovered point tells you almost nothing about the model's actual robustness. See [robustness-evaluation](./robustness-evaluation.md) and the `fix-verification-tracer` subagent.

### 10. Escalate on consequence, not on volume

A single critical finding (credible uplift toward serious harm) outranks a thousand low-severity ones. Escalation paths exist so that the one finding that matters does not wait in the same queue as cosmetic issues. Know your escalation triggers cold, before you need them. See [severity-and-triage](./severity-and-triage.md).

---

## How the pieces fit

```
        harm taxonomy  ──►  coverage matrix  ──►  program design
             │                     │                    │
             ▼                     ▼                    ▼
        attack taxonomy  ──►  human + automated testing  ──►  findings
                                                              │
                        ┌─────────────────────────────────────┤
                        ▼                     ▼                ▼
                 severity & triage    robustness eval    reporting
                        │                     │                │
                        └──────────►  feeding findings back  ◄─┘
                                              │
                                              ▼
                                   cross-functional coordination
                                              │
                                              ▼
                                        changed model
                                              │
                                              ▼
                                   (verify fix generalized — back to top)
```

Read the principles docs in roughly this order. If you are here to *do* something specific, jump to a guide:
- Building a program → [build-a-red-team-program](../guides/build-a-red-team-program.md)
- Reviewing someone else's program → [analyze-an-existing-program](../guides/analyze-an-existing-program.md)

## When NOT to apply this KB

- **You need an actual attack.** This KB will not help; it is methodology only, by design. That is a feature.
- **You are doing capability evals, not safety red-teaming.** Different discipline — measuring what the model *can* do well, not what it can be manipulated into doing badly. Some overlap in tooling, different judgment.
- **You are responding to a live abuse incident on a deployed system.** That is trust-and-safety incident response; red-teaming is the pre-deployment and ongoing-assurance discipline that should have caught it first. Feed the incident back in as a finding afterward.
