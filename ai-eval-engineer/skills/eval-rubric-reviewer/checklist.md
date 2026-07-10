# Per-Criterion Review Checklist (supporting file for eval-rubric-reviewer)

Apply every check to every criterion. Cite the check ID in findings (e.g., "A3").

## A. Ambiguity
- **A1 — Two-readings test:** can two competent scorers construe the criterion differently on a plausible output? Demonstrate both readings or don't file it.
- **A2 — Undefined qualifier:** words like *helpful, appropriate, sufficient, clear, relevant, high-quality, concise* without an operational definition or anchored example.
- **A3 — Inference boundary:** does the criterion decide whether reasonable inference counts (faithfulness/completeness criteria especially)? The classic kappa-killer — see the 0.41→0.78 case in `ai-eval-engineer/principles/human-evaluation.md` §1.
- **A4 — Reference-dependence:** does scoring require a reference answer, and does the rubric say what to do when the output is correct but different from the reference?

## B. Structure
- **B1 — Compound criterion:** two decisions in one item ("accurate and complete") — split.
- **B2 — Scale where binary would do:** 1–10 or 1–5 ratings for things decomposable into Y/N checks. Scales cost agreement; require justification.
- **B3 — Missing anchors:** judgment-heavy items without 2–3 worked examples (output + verdict + one-line why).
- **B4 — Aggregation undefined:** how do item verdicts combine into a score, and are weights stated? Who decided the weights?

## C. Coverage of the ugly cases
- **C1 — Refusal policy** (justified and unjustified refusals distinguished?)
- **C2 — Empty / truncated / malformed output policy
- **C3 — Partial success** (half the task done well — pass, fail, or partial? with the rule stated)
- **C4 — Right-answer-wrong-behavior** (correct content via prohibited means, e.g., fabricated citation that happens to be right; for agentic rubrics see `ai-eval-engineer/topics/agentic-task-evals.md` illegitimate-success rule)

## D. Fit to scorer and decision
- **D1 — Expertise mismatch:** correctness calls assigned to raters/judges who can't make them (`ai-eval-engineer/principles/human-evaluation.md` §3 — confidence-vs-correctness divergence is exactly what non-experts miss).
- **D2 — Judge-hostile phrasing:** criteria relying on context the judge prompt won't contain (product history, "as discussed", implicit user intent).
- **D3 — Gaming note:** cheapest way to score well without being good. Alarming + easy = redesign (`ai-eval-engineer/principles/eval-design.md` §2).
- **D4 — Decision linkage:** does anything in the rubric not affect the stated decision? Dead criteria dilute attention; flag for deletion.
