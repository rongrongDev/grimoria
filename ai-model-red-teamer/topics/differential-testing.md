# Differential Testing Across Versions and Checkpoints

> **Version 1.0 — 2026-07-06.** Extended tier — production-patterns + common-pitfalls. Applies to: any program that ships more than one model version (i.e. all of them). Read [robustness-evaluation](../principles/robustness-evaluation.md) first.

Differential testing compares safety behavior *between* model versions — new checkpoint vs. previous, base model vs. fine-tune, model A vs. model B. It exists to answer one question the absolute numbers cannot: *did this change make things better or worse, and where?*

---

## Why it matters: averages lie about regressions

A new checkpoint can improve blended safety metrics while *regressing* on a specific harm category — and the blended number hides it. Aligning harder on one category routinely loosens another; a capability improvement can reopen a class that was closed. If you only look at the aggregate, you ship the regression. Differential testing per-category, per-class, per-language is how you catch it before users do.

## Production patterns

- **Fixed, versioned regression set.** Maintain a frozen set of known findings (as generalization profiles, not raw payloads — [reporting-and-disclosure](../principles/reporting-and-disclosure.md)) and re-run it against every checkpoint. Because the set is fixed, ASR deltas are comparable ([robustness-evaluation](../principles/robustness-evaluation.md) on the denominator game). This is the backbone; without a frozen set, "better or worse" is unanswerable.
- **Per-category delta, never blended.** Report the change per harm category and attack class. A single "+3% safety" is meaningless and dangerous; "-1% CBRN, -4% cross-lingual, +8% cosmetic-refusal" tells you what actually happened.
- **Regression gates on the fix set.** Any previously-verified fix that reopens on a new checkpoint is a *release blocker*, treated as a fresh critical/high per its original severity. A checkpoint that un-fixes a critical does not ship.
- **Both directions.** Watch for over-refusal regressions too: a checkpoint that got "safer" by refusing benign requests has regressed on helpfulness, which is its own failure and pushes users toward jailbreak-shaped workarounds.
- **Pre/post fix verification.** When a fix ships, differential-test the pre- and post-fix checkpoints specifically to confirm the fix closed its class *and did not open another* ([feeding-findings-back](../principles/feeding-findings-back.md)).

## Common pitfalls

| Pitfall | Why it bites | Guard |
|---|---|---|
| Blended metric only | Category regressions hidden inside an improving average | Always slice per category/class/language |
| Regression set drifts | Set changes between runs → deltas not comparable | Freeze and version the set; change it deliberately, note it |
| Only testing the new model's new features | Regressions in *old* covered cells go unseen | Re-run the *whole* fixed set every checkpoint |
| Ignoring over-refusal | "Safer" number masks a helpfulness regression | Track benign-refusal rate as a paired metric |
| Fix-set rot | Old verified fixes never re-checked; silently reopen | Regression gate: reopened fix = release blocker |
| Comparing across changed harnesses | System-prompt/harness differs between runs, not just weights | Hold harness constant or attribute the delta |

## Relationship to the rest of the KB

Differential testing is where [robustness-evaluation](../principles/robustness-evaluation.md) (measure across checkpoints) meets [feeding-findings-back](../principles/feeding-findings-back.md) (verify a fix didn't regress elsewhere). The fix-verification reasoning in [fix-verification-tracer](../agents/fix-verification-tracer.md) is single-fix; differential testing is the checkpoint-wide version of the same discipline.

## Related
- [robustness-evaluation](../principles/robustness-evaluation.md) · [feeding-findings-back](../principles/feeding-findings-back.md) · [fix-verification-tracer](../agents/fix-verification-tracer.md)
