# Robustness Evaluation

> **Version 1.0 — 2026-07-06.** Applies to: all programs; especially relevant to differential testing across checkpoints ([differential-testing](../topics/differential-testing.md)). Read [core-principles](./core-principles.md) and [attack-taxonomy](./attack-taxonomy.md) first.

This doc is about measurement: what attack success rate actually tells you, what it hides, and how to test whether a vulnerability is *fixed* rather than *hidden*. It is the antidote to the two most expensive illusions in the field — "low ASR means safe" and "it refuses the reported prompt, so it's fixed."

---

## Attack success rate (ASR): what it measures and what it misses

ASR is the fraction of attempts, over some test set, that successfully elicit the prohibited behavior. It is useful and it is dangerous, for the same reason: it is a single number over a *chosen* set.

**What ASR measures:** how often the *phrasings you tested* succeed against the *model version you tested*. That's it.

**What ASR misses — every one of these has shipped a "safe" model that wasn't:**

1. **Everything you didn't test.** ASR over a test set says nothing about the space outside it. A 2% ASR on 500 tested phrasings is consistent with a 100% ASR on a phrasing class you never tried. Principle 1: absence of a finding ≠ absence of a vulnerability.
2. **The denominator game.** ASR drops if you add easy-to-refuse cases to the test set, with zero change in actual safety. ASR is only comparable across runs with a *fixed, versioned* test set. A falling ASR across cycles can mean "safer model" or "we diluted the test set" — you cannot tell from the number.
3. **Severity blindness.** ASR weights a trivial-harm success and a catastrophic-harm success equally. A 5% ASR that is entirely catastrophic-category is far worse than a 30% ASR of cosmetic refus_failures. Always report ASR *sliced by harm category and severity*, never as one scalar.
4. **The single-point trap.** ASR measured at the exact discovered phrasings tells you about those points, not the neighborhood. See generalization testing below.
5. **Best-effort vs. average adversary.** ASR over random phrasings measures the average attempt. Safety is set by the *best* adversary. Report worst-case (does *any* phrasing in the class succeed) alongside average-case.

**Rule:** never let ASR travel as a single number. It travels as (ASR, test-set version, per-category slice, worst-case-vs-average, coverage of the space it was measured over). A bare ASR in a report is a red flag that the author is measuring comfort, not safety.

## Generalization testing — the core methodology

A finding is one point. The vulnerability is the neighborhood around it. Generalization testing characterizes the neighborhood, and it is the difference between knowing you have a problem and knowing you fixed it.

Given a finding, probe systematically outward along these axes (all at the class level, using *variations of the discovered pattern*, never new attack construction):

- **Paraphrase:** does semantically-equivalent rewording still succeed? If yes, the vulnerability is about meaning, not surface — and a surface patch won't fix it.
- **Topic shift:** does the same *mechanism* work on an adjacent prohibited topic? If yes, the mechanism is the vulnerability, not the topic.
- **Language / modality:** does it transfer across languages or input modes? ([attack-taxonomy](./attack-taxonomy.md) class 8.)
- **Composition:** does it still work combined with, or stripped of, other classes?
- **Checkpoint:** does it hold across model versions? ([differential-testing](../topics/differential-testing.md).)

The output is a *generalization profile*: how wide is the failing region, along which axes. A finding with a wide profile is more severe (broader reproduction, factor 2 in [severity-and-triage](./severity-and-triage.md)) and demands a class-level fix. A finding with a narrow profile *might* be a genuine one-off — but treat "narrow" as a hypothesis to disprove, not a comfort, because narrowness is often just "we didn't probe far enough."

## The whack-a-mole dynamic — and how to escape it

The most expensive pattern in the field:

1. A finding is reported.
2. Someone patches the exact phrasing (adds it to training data as a refuse-example, or blocks its surface form).
3. ASR on that phrasing goes to zero. The finding is closed. Everyone moves on.
4. A week later, a synonym swap or a reframing resurfaces the *same underlying vulnerability*. New finding, new ticket, back to step 2.

The moles are infinite; the phrasing space is unbounded. You cannot win by patching moles.

**Escaping it requires fixing at the mechanism altitude:**
- Diagnose the *class* the finding belongs to ([attack-taxonomy](./attack-taxonomy.md)) and the mechanism that let it through.
- Verify the fix against the *generalization profile*, not the single phrasing. A fix is only real if the ASR drops across the neighborhood, not just at the point. This is exactly what [fix-verification-tracer](../agents/fix-verification-tracer.md) reasons about.
- If the fix only moved the single point, say so in the report: "phrasing patched, class open." That honesty is worth more than a green checkmark.

**The verification asymmetry:** driving ASR to zero on the reported phrasing is easy and proves almost nothing. Showing the ASR stayed low across the generalization profile is hard and is the only thing that proves a fix. Budget accordingly — verification of generalization is not optional cleanup, it is the fix.

## Robustness is a distribution, not a checkpoint

A single robustness number at ship time is a snapshot. Real robustness is measured *across*:
- versions/checkpoints (is it improving or regressing? — [differential-testing](../topics/differential-testing.md)),
- the generalization neighborhood of each known class,
- deployment surfaces and languages.

A model can improve on average ASR while *regressing* on a specific category — differential testing catches this; a single blended number hides it.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Bare ASR trusted as "safe" | Single scalar in reports, no slices | Report sliced + worst-case + coverage | Ban bare ASR; require the tuple |
| Test-set dilution flatters ASR | ASR falls but set changed | Version and freeze the test set | Compare only fixed-set runs |
| Single-point "fix" | Fix verified only at reported phrasing | Verify across generalization profile | Mandate generalization test on every fix |
| Whack-a-mole | Same vuln resurfaces reworded | Fix at mechanism altitude | Class-level diagnosis before patching |
| Category regression hidden in average | Blended number improves, category worsens | Per-category differential | Slice every robustness metric |
| Narrow profile assumed real | Only shallow probing done | Probe all generalization axes | "Narrow" is a hypothesis to disprove |

## Related

- The classes you test generalization over: [attack-taxonomy](./attack-taxonomy.md)
- Reproduction as a severity factor: [severity-and-triage](./severity-and-triage.md)
- Across-checkpoint robustness: [differential-testing](../topics/differential-testing.md)
- Reasoning about whether a fix generalized: [fix-verification-tracer](../agents/fix-verification-tracer.md)
- Scaling generalization probing: [automated-red-teaming](./automated-red-teaming.md)
- Closing the loop: [feeding-findings-back](./feeding-findings-back.md)
