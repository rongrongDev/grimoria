# Harm Taxonomy and Severity Categories

> **Version 1.0 — 2026-07-06.** Applies to: all model versions. Read [core-principles](./core-principles.md) first. Pairs with [severity-and-triage](./severity-and-triage.md) (this doc defines *what* categories of harm exist; that doc defines *how bad* a given finding is).

**Scope discipline:** This document classifies harm *categories* — the columns of a coverage matrix. It describes what each category *is about* and what makes it more or less severe, never any actual harmful content, method, or example within a category. Naming "CBRN uplift" as a category is safe and necessary; describing anything within it is out of scope and prohibited.

---

## Why categorize harm at all

The harm taxonomy gives the coverage matrix its rows. Without a shared, exhaustive-enough list of harm categories, a program cannot know what it is *not* testing — and the untested category is the one that ships broken. The taxonomy also drives severity: not all harm categories carry the same worst-case consequence, and triage ([severity-and-triage](./severity-and-triage.md)) depends on knowing which category a finding lands in.

A category list is never truly complete; new capabilities create new harm surfaces. Treat the list as versioned and revisited every cycle, and treat "does this finding fit no existing category?" as a signal that the taxonomy itself needs an update, not that the finding is invalid.

## The categories

Organized by the dominant axis of concern. These are classification buckets only.

### Catastrophic-potential categories (highest inherent ceiling)

These are categories where a genuine model contribution could meaningfully raise the ceiling of harm a motivated actor can reach. They carry the highest inherent severity and the strictest handling.

- **CBRN uplift** — whether the model provides meaningful uplift toward chemical, biological, radiological, or nuclear harm. Severity here turns on *uplift over already-available resources*, not mere topicality. The bar is "does this help a capable actor do something they otherwise could not," judged conservatively.
- **Cyberweapon / offensive-cyber uplift** — meaningful assistance in developing or deploying capabilities for large-scale or high-severity cyber harm. Again scored on uplift, not on the model merely discussing security concepts.

Findings in these categories escalate immediately regardless of how hard they were to elicit (see [severity-and-triage](./severity-and-triage.md) escalation triggers). Handling of any actual finding content is access-controlled and never enters an open backlog.

### Acute individual-harm categories

- **Child safety** — the highest-priority category for immediate escalation; any credible finding is treated as critical and routed through dedicated, legally-constrained channels that differ from the normal pipeline. Do not handle these findings through general tooling.
- **Self-harm and suicide** — whether the model's responses could contribute to harm to self. Severity considers vulnerability of the affected population.
- **Violence and incitement / targeted harm** — assistance toward harm against specific people or groups.

### Broad societal-harm categories

- **Misinformation and disinformation** — generation of persuasive false content, especially at scale or in high-stakes domains (health, elections). Severity turns on plausibility, scale, and domain stakes.
- **Bias, fairness, and discrimination** — systematically different or demeaning treatment across protected attributes. Distinct methodology; see [bias-fairness-red-teaming](../topics/bias-fairness-red-teaming.md).
- **Privacy and personal data** — extraction, inference, or aggregation of personal information about real individuals.

### Deception, manipulation, and integrity categories

- **Manipulation and persuasion** — the model steering users against their interests, including in emotionally charged contexts.
- **Fraud and deception enablement** — assistance toward scams, impersonation, or deceptive operations.
- **Model integrity / unsafe autonomy** — behaviors relevant to a model taking consequential actions without appropriate constraint, especially in agentic deployments.

## The two axes every category is scored on

Every finding sits at the intersection of a *harm category* (this doc) and a *severity* (independent — [severity-and-triage](./severity-and-triage.md)). A finding in a catastrophic-potential category is not automatically critical severity — it depends on real uplift, reproducibility, and breadth — but the category raises the ceiling and the escalation urgency. Conversely, a finding in a lower-ceiling category can still be critical if it is trivially reproducible and hits a broad population.

Do not collapse category into severity. "It's CBRN so it's critical" skips the analysis; "it's only bias so it's low" is exactly the reasoning that ships a discriminatory model to millions. Keep the axes separate.

## Using the taxonomy in a coverage matrix

Each category becomes a row; attack classes ([attack-taxonomy](./attack-taxonomy.md)) become columns; deployment surfaces (chat, API, agentic, each supported language/modality) become a third dimension. The cells are what you track coverage over. Empty cells in a catastrophic-potential row are the most urgent to fill; empty cells in the non-English columns are the most commonly ignored. See [program-design](./program-design.md) for building the matrix and [coverage-gap-reviewer](../skills/coverage-gap-reviewer/SKILL.md) for auditing one.

## Failure mode → detection → fix → prevention

- **Failure mode:** a harm category exists in the world but not in your taxonomy, so it is never assigned coverage and never tested.
  **Detection:** findings that fit no category; incidents in deployment that map to no row; new model capabilities with no corresponding harm row.
  **Fix:** version the taxonomy; add the row; assign coverage; backfill testing.
  **Prevention:** scheduled taxonomy review every cycle and on every capability change; treat "unclassifiable finding" as a taxonomy bug, not a filing error.

## Related

- Scoring a finding within a category: [severity-and-triage](./severity-and-triage.md)
- Building rows into a matrix: [program-design](./program-design.md)
- Auditing category coverage: [coverage-gap-reviewer](../skills/coverage-gap-reviewer/SKILL.md)
- Bias/fairness as a specialized track: [bias-fairness-red-teaming](../topics/bias-fairness-red-teaming.md)
