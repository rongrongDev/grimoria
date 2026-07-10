# Red-Teaming the Guardrail Layer

> **Version 1.0 — 2026-07-06.** Extended tier — production-patterns + common-pitfalls. Applies to: deployments with input/output classifiers or policy filters around the base model. Read [attack-taxonomy](../principles/attack-taxonomy.md) and [feeding-findings-back](../principles/feeding-findings-back.md) first.

Most production systems wrap the base model in a *guardrail layer*: input classifiers, output classifiers, and policy filters that catch what the base model lets through. Red-teaming the guardrail is a distinct target from red-teaming the base model — the guardrail has its own failure modes, and a program that only tests the base model is blind to the layer that actually gates production traffic.

---

## Why the guardrail is its own target

The base model and the guardrail fail differently. The base model fails by *behaving badly*; the guardrail fails by *classifying wrongly* — false negatives (harmful content passes) and false positives (benign content blocked). A finding against the guardrail is "the classifier missed this class" or "the classifier over-blocks this benign class," which is a different fix ([feeding-findings-back](../principles/feeding-findings-back.md) altitude 2) than a base-model alignment change.

Critically, the guardrail is often the *only* thing standing between a jailbroken base model and the user. If the base model can be manipulated but the output classifier catches the result, the system holds. So guardrail robustness is load-bearing — and guardrails are themselves attackable.

## Production patterns

- **Test the layer independently and the stack together.** Probe the classifier in isolation (does it catch the class?) and probe the full system (does base-model-jailbreak + guardrail together fail?). A base-model finding that the guardrail catches is lower system-severity; a finding that defeats both is higher.
- **Classifier evasion is an attack class.** The obfuscation/encoding class ([attack-taxonomy](../principles/attack-taxonomy.md) class 3) targets classifiers specifically — inputs crafted so the classifier's representation misses what the model's does. Test the *gap between what the filter sees and what the model comprehends*; that gap is the guardrail's core vulnerability.
- **Both error directions matter.** Track false-negative rate (harmful passes — a safety hole) *and* false-positive rate (benign blocked — a helpfulness hole that pushes users toward evasion). A guardrail tuned only for recall becomes uselessly over-blocking and gets routed around.
- **Guardrail + base-model as defense-in-depth.** The strongest posture fixes both layers for a serious class ([feeding-findings-back](../principles/feeding-findings-back.md)): base-model alignment so the behavior is unlikely, guardrail so the residual is caught. Neither alone is closure.
- **Version the guardrail like the model.** Guardrails update independently and can regress independently — differential-test them ([differential-testing](./differential-testing.md)) across versions.

## Common pitfalls

| Pitfall | Why it bites | Guard |
|---|---|---|
| Only testing the base model | The layer gating production traffic is untested | Test guardrail independently + stacked |
| Guardrail keyed on surface form | Same phrasing-patch whack-a-mole, one layer up | Classify on reconstructed meaning; test evasion |
| Recall-only tuning | Over-blocks benign; users route around it | Track false-positive rate as paired metric |
| Guardrail treated as full fix | Base model still vulnerable underneath | Guardrail is depth, not closure |
| Guardrail version drift | Classifier regresses silently | Differential-test guardrail versions |
| Assuming the guardrail is always on | Some surfaces/paths bypass it | Map every path; test unguarded surfaces |

## The subtle one: the guardrail is a model too

An LLM-based classifier is itself susceptible to the same manipulation classes as the base model — it can be confused, injected, or evaded. Do not assume the guardrail is a simple deterministic filter immune to adversarial input. Red-team the guardrail *with the attack taxonomy*, the same way you red-team the base model.

## Related
- [attack-taxonomy](../principles/attack-taxonomy.md) · [feeding-findings-back](../principles/feeding-findings-back.md) · [differential-testing](./differential-testing.md)
