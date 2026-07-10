# Red-Teaming for Bias and Fairness

> **Version 1.0 — 2026-07-06.** Extended tier — production-patterns + common-pitfalls. Applies to: all deployed models. Read [harm-taxonomy](../principles/harm-taxonomy.md) (bias category) first.

Bias/fairness red-teaming differs from the rest of the discipline in a way that trips up teams who treat it as "just another category": the harm is usually *not* a dramatic single output. It is a *systematic difference in treatment* that only appears in aggregate, across many outputs, sliced by a protected attribute. You cannot find it one clever prompt at a time.

---

## Why it needs its own methodology

Most red-teaming hunts for a discrete failure: one input, one prohibited output. Bias is statistical: the model may give a perfectly acceptable answer to any single prompt, while *systematically* giving subtly worse, more-stereotyped, or demeaning answers to one group across a distribution of prompts. The "finding" is a *disparity*, not an output. This reframes everything:

- **Severity is about the pattern, not the instance** — a single mildly-stereotyped output is low; a consistent measurable disparity across a population is the real harm ([severity-and-triage](../principles/severity-and-triage.md) cluster-escalation logic applies strongly here).
- **Detection requires controlled comparison**, not creative single-shot probing.

## Production patterns

- **Matched-pair / counterfactual probing.** Hold the prompt constant and vary only the protected attribute, across a distribution, then compare output *quality, tone, refusal rate, and assumptions* statistically. The disparity — not any single output — is the finding.
- **Slice every other metric by protected attribute.** Refusal rates, helpfulness, over-refusal — all can differ across groups. A model that refuses benign requests more often for one group has a fairness bug hiding inside its "safety" behavior.
- **Intersectional coverage.** Disparities often appear only at intersections of attributes, not on any single axis. The coverage matrix ([program-design](../principles/program-design.md)) needs intersection cells, which are the ones teams forget.
- **Cross-lingual fairness.** Bias patterns differ by language and culture; a fairness pass in one language does not transfer. This compounds the general cross-lingual gap ([attack-taxonomy](../principles/attack-taxonomy.md) class 8).
- **Domain-specific stakes.** Bias in a high-stakes domain (hiring, lending, medical, legal advice) is far more severe than in casual chat. Weight coverage toward where a disparity does real damage.
- **Diverse red-teamers are a detection instrument here specifically.** A monoculture team cannot perceive disparities that don't affect them ([program-design](../principles/program-design.md) on recruiting as coverage).

## Common pitfalls

| Pitfall | Why it bites | Guard |
|---|---|---|
| Hunting single dramatic outputs | Bias is aggregate; single-shot probing misses it | Matched-pair statistical comparison |
| No protected-attribute slicing of safety metrics | "Safe" model refuses one group more | Slice refusal/helpfulness by attribute |
| Single-axis only | Intersectional disparities missed | Test attribute intersections |
| One-language fairness pass | Bias is culture/language-specific | Fairness coverage per language |
| Treating any disparity as equally severe | Over- or under-reacts | Weight by domain stakes and consistency |
| Fixing a flagged output, not the pattern | Whack-a-mole in fairness clothing | Fix the systematic disparity, verify aggregate |
| Team monoculture | Whole classes of disparity invisible | Diversify the red team |

## The fix side is different too

A bias fix must be verified *statistically across the distribution*, not by re-checking the one flagged output ([feeding-findings-back](../principles/feeding-findings-back.md)). And beware the over-correction failure: a fix that erases a disparity by making the model refuse or hedge for *everyone* has traded a fairness bug for a helpfulness regression. Verify the disparity closed *and* quality held for all groups — differential testing ([differential-testing](./differential-testing.md)) sliced by attribute.

## Related
- [harm-taxonomy](../principles/harm-taxonomy.md) · [program-design](../principles/program-design.md) · [severity-and-triage](../principles/severity-and-triage.md) · [differential-testing](./differential-testing.md)
