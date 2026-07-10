# Automated Adversarial Testing

> **Version 1.0 — 2026-07-06.** Applies to: programs using models to scale probing. Read [core-principles](./core-principles.md), [program-design](./program-design.md), and [robustness-evaluation](./robustness-evaluation.md) first.

Automation is how a program achieves breadth no human team can. It is also the single most dangerous tool the program owns, because a system built to *generate attacks at scale* can, if uncontrolled, produce exactly the reusable harmful artifact the whole program exists to prevent. This doc is about getting the breadth without manufacturing the weapon.

---

## What automation is good for (and what it is not)

**Good for — breadth within a known class:**
- Mapping the *extent* of a discovered vulnerability: paraphrase-space, language transfer, adjacent topics (the generalization profile in [robustness-evaluation](./robustness-evaluation.md)).
- Regression-testing a fix across a fixed test set every checkpoint ([differential-testing](../topics/differential-testing.md)).
- Surfacing *weak areas* at scale — running broad probes across the coverage matrix to flag cells where the model looks soft and humans should focus.
- Generating probe *categories* and structural variations for humans to review and direct.

**Not good for — discovery of genuinely novel classes.** Automation extends what it was seeded with; it does not invent the framing a creative human hasn't taught it. A fully-automated program only ever finds variants of what it already knew ([program-design](./program-design.md) on sequencing human→auto→human).

**The distinction that keeps you safe:** automation should produce *coverage signal* (which cells are weak, how wide a known vulnerability generalizes) — not a *library of working attacks*. The output you want is "category X, class Y, non-English surface looks under-defended, here is the aggregate success signal," not a file of ready-to-run payloads. If your automation's artifact is the latter, you have built the weapon.

## The core risk: manufacturing reusable harm

An automated adversarial system, by construction, tries to produce inputs that elicit prohibited outputs — and it will sometimes succeed at producing *both* a working attack *and* a genuinely harmful model output. Left uncontrolled, these accumulate in logs, databases, and shared repos. Now the program's own infrastructure is a store of weapons.

This is not hypothetical tail risk; it is the default outcome of naive automation. Guarding against it is a first-class design requirement, not a compliance afterthought.

### Controls that make automation safe

1. **Capture the vulnerability signal, not the payload.** Persist *that* a cell is weak and *how widely* a class generalizes — aggregate metrics, class labels, coverage deltas. Do not persist the generated harmful outputs or the working inputs in open storage. Where a specific payload must be retained to drive a fix, it goes to access-controlled storage handled per [reporting-and-disclosure](./reporting-and-disclosure.md), never the general pipeline.
2. **Output filtering on the generation system itself.** The automated generator's outputs pass through the same (or stricter) classifiers used in production, and genuinely harmful generated *content* is discarded after the boolean "did it succeed" is recorded. You need to know the attack worked; you do not need to keep what it produced.
3. **Access control and audit from day one.** Who can run the generator, who can read its outputs, and every access logged. An automated red-team system is one of the most sensitive assets in the org; treat it like production credentials.
4. **Rate and scope limits.** Constrain what categories the automation targets and cap volume, so a misconfigured run cannot mass-produce catastrophic-category content.
5. **Human-in-the-loop for catastrophic categories.** Automation may *flag* weakness in a catastrophic-potential cell ([harm-taxonomy](./harm-taxonomy.md)); it must not autonomously generate and store elaborated content in those categories. A human, under protocol, handles anything past the flag.
6. **Segregation from production.** The generation system runs in an isolated environment that cannot leak its outputs into training data unfiltered, into deployed systems, or into general-purpose logs.

**The design test:** if an attacker exfiltrated your automated red-team system's entire output store, how much uplift would they gain? If the answer is "a lot," you have built the artifact you exist to prevent, and the controls above have failed. The target answer is "coverage signal and aggregate metrics — nothing directly weaponizable."

## Using models to generate probe *categories* (the safe pattern)

The safe, high-value use is meta: use a model to help enumerate *what kinds of things to test* — probe categories, structural variation axes, under-considered cells — rather than to author finished attacks. This produces a testing *plan* a human executes and directs, and its artifact (a list of categories and axes to probe) is safe to store and share. It scales the *imagination* of the program without scaling the *weaponry*.

## Automation feeds robustness, not replaces judgment

Automated results are input to human interpretation, never a verdict. A low automated ASR across a cell is a hypothesis ("this cell may be defended"), subject to all the caveats in [robustness-evaluation](./robustness-evaluation.md) — it does not close the cell. The human reads the automated map and decides what it means.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Generator stores working attacks | Output store contains weaponizable content | Purge; record only success-boolean + metrics | Design for signal-not-payload from day one |
| Harmful outputs pool in logs | Generated content persisted unfiltered | Filter generator output through classifiers | Segregate generation from general logging |
| Catastrophic content auto-elaborated | Automation produces detailed catastrophic-category content | Gate those cells behind human-in-loop | Cap automation at "flag weakness" for those cells |
| Automation mistaken for discovery | Only known-class variants ever found | Add human unstructured discovery | Sequence human→auto→human |
| Auto ASR treated as verdict | Cells "closed" on automated pass alone | Human interprets; cell stays open | Automation is signal, humans decide |
| Uncontrolled access | No audit trail on generator | Access control + full audit | Treat generator as production-sensitive |

## Related

- Where automation sits in the human/auto sequence: [program-design](./program-design.md)
- What automation measures and its limits: [robustness-evaluation](./robustness-evaluation.md)
- Handling any payload that must be retained: [reporting-and-disclosure](./reporting-and-disclosure.md)
- Category ceilings that gate human-in-loop: [harm-taxonomy](./harm-taxonomy.md)
- Orchestrating automated + human agents safely: [multi-agent-orchestration](./multi-agent-orchestration.md)
