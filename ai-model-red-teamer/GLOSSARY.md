# Glossary

> **Version 1.0 — 2026-07-06.** Terms defined *conceptually*, never with working examples. Each entry points to the doc where it lives in depth.

**Attack class** — a *category* of manipulation technique (e.g. multi-turn context erosion, persona framing, encoding/obfuscation), defined by the mechanism it exploits rather than any specific wording. The stable unit of the attack taxonomy; individual phrasings churn, classes persist. → [attack-taxonomy](principles/attack-taxonomy.md).

**Attack success rate (ASR)** — the fraction of attempts over a *chosen test set* that elicit the prohibited behavior. Useful and dangerous for the same reason: a single number over a set you picked. Says nothing about the space you didn't test. Never travels as a bare scalar. → [robustness-evaluation](principles/robustness-evaluation.md).

**Catastrophic-potential category** — a harm category whose worst-case ceiling is severe enough (CBRN uplift, large-scale cyber) that findings escalate immediately and content handling is strictly access-controlled. → [harm-taxonomy](principles/harm-taxonomy.md).

**Context erosion (multi-turn)** — an attack *class* in which a harmful objective is decomposed across many turns, none individually alarming, with the harmful synthesis emerging only from the whole. Defeats per-turn-only safety evaluation. → [attack-taxonomy](principles/attack-taxonomy.md).

**Coverage matrix** — the grid of (harm category × attack class × deployment surface, including language/modality) that a program tracks its testing against. Empty cells are the honest statement of what is untested. The spine of program design. → [program-design](principles/program-design.md).

**Differential testing** — comparing safety behavior *between* model versions/checkpoints to catch regressions an average metric hides. → [differential-testing](topics/differential-testing.md).

**Generalization profile** — the characterization of *how wide* a finding's failing region is, along axes: paraphrase, topic, language, composition, checkpoint. A finding is one point; its profile is the neighborhood. The spec a real fix must satisfy. → [robustness-evaluation](principles/robustness-evaluation.md).

**Generalization testing** — probing systematically outward from a finding along the profile axes to characterize the vulnerability, rather than trusting the single discovered point. → [robustness-evaluation](principles/robustness-evaluation.md).

**Guardrail layer** — input/output classifiers and policy filters wrapping the base model. A distinct red-team target with its own failure modes (false negatives, false positives, evasion). Itself attackable. → [guardrail-classifier-robustness](topics/guardrail-classifier-robustness.md).

**Harm category** — a classification bucket for a *type* of harm (CBRN, child safety, misinformation, bias, privacy, etc.). The rows of the coverage matrix. Defined as a category only, never by any content within it. → [harm-taxonomy](principles/harm-taxonomy.md).

**Jailbreak** — informal term for an input or interaction that successfully manipulates a model into producing output it is supposed to refuse. Used here to name the *phenomenon*; this KB never provides working ones. → [attack-taxonomy](principles/attack-taxonomy.md).

**Layered reporting** — the practice of splitting a finding into an *open layer* (class, mechanism, severity, generalization profile — safe to circulate) and a *controlled layer* (minimal reproduction detail — access-controlled, never in the open backlog). → [reporting-and-disclosure](principles/reporting-and-disclosure.md).

**Mechanism (of a finding)** — *why* an attack worked: the model behavior or system gap it exploited, as opposed to the surface wording. Fixes and clustering operate on mechanism, not surface. → [attack-taxonomy](principles/attack-taxonomy.md), [feeding-findings-back](principles/feeding-findings-back.md).

**Phrasing patch** — a fix that makes one exact input refuse without addressing the underlying class. Produces whack-a-mole. The characteristic failure of shallow remediation. → [robustness-evaluation](principles/robustness-evaluation.md).

**Prompt injection** — an attack *class* where content the model ingests from an untrusted channel (retrieved documents, tool output) carries instructions the model then follows, blurring data and command. Often a system-design vulnerability, not only a base-model one. → [attack-taxonomy](principles/attack-taxonomy.md).

**Refusal suppression** — an attack *class* that applies direct pressure on the model's refusal behavior (instructions to never refuse, to prefix compliance). Tied to instruction-hierarchy design. → [attack-taxonomy](principles/attack-taxonomy.md).

**Responsible / coordinated disclosure** — the discipline of timing and scoping the sharing of a finding so the defender is informed without arming an attacker: fix-first, catastrophic-never for reproduction detail, coordinate across affected parties. → [reporting-and-disclosure](principles/reporting-and-disclosure.md).

**Root-cause clustering** — grouping many findings by shared underlying mechanism (not surface wording) to reveal systemic patterns and to enable cluster-level severity escalation. → [severity-and-triage](principles/severity-and-triage.md), [finding-cluster-analyzer](agents/finding-cluster-analyzer.md).

**Severity** — a finding's real-world consequence, scored on three factors (harm potential × ease of reproduction × breadth of affected population). About the world, not the cleverness of the attack. → [severity-and-triage](principles/severity-and-triage.md).

**Structured probing** — testing that systematically walks the coverage matrix applying known attack classes to each cell. Produces defensible coverage. Complement to unstructured probing. → [program-design](principles/program-design.md).

**Tunnel vision** — the chronic program disease of over-investing in a few favorite attack classes while whole matrix cells stay dark, while finding-count looks healthy. → [program-design](principles/program-design.md).

**Uplift** — the *marginal* capability a model provides toward a harm, over and above what an actor could already obtain trivially. The correct basis for severity in catastrophic categories; requires domain expertise to judge. → [severity-and-triage](principles/severity-and-triage.md), [harm-taxonomy](principles/harm-taxonomy.md).

**Unstructured probing** — free-form human testing aimed at *discovering novel attack classes* automation and structured testing would never invent. Complement to structured probing. → [program-design](principles/program-design.md).

**Verification (of a fix)** — re-probing a fix against the *generalization profile*, not the single reported phrasing, to confirm the class closed rather than the instance. Owned by the red team, not the fixer. Verification *is* the fix. → [feeding-findings-back](principles/feeding-findings-back.md), [fix-verification-tracer](agents/fix-verification-tracer.md).

**Whack-a-mole** — the dynamic where patching individual phrasings drives their ASR to zero while the underlying vulnerability resurfaces reworded, indefinitely. Escaped only by fixing at mechanism altitude. → [robustness-evaluation](principles/robustness-evaluation.md).
