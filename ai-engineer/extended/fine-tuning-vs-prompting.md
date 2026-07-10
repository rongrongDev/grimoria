# Fine-Tuning vs. Prompting (Extended Tier)

**Last reviewed:** 2026-07-06 · **Applies to:** Claude 4.x–5 / GPT-5-era hosted models and open-weight models of the same generation. Extended-tier depth: production patterns + common pitfalls only. The decision tree lives in `principles/decision-trees.md` §1; this doc is the supporting detail.

The one-paragraph position: **fine-tuning is a specialization tool, not a
knowledge tool, and it is almost never the first move.** Prompting + context
(including RAG) improved faster than fine-tuning workflows every year of my
career; each new model generation deleted someone's fine-tuning project by
doing the task zero-shot. Fine-tune when the *shape* of the task is stable and
high-volume; never to teach facts.

## Production patterns that actually work

- **Style/format specialization at volume.** Tens of thousands of daily calls
  where output must match a house format a prompt approximates in 3,000 tokens —
  a tuned smaller model can beat a prompted larger one on cost and consistency.
  The economics only work at volume: amortize training + eval + MLOps against
  the per-call token savings, at *today's* token prices, then re-check the math
  each price drop (it keeps getting worse for tuning).
- **Distillation down a tier.** Use the big model to generate/validate training
  data for a small model on one narrow task (classification, routing,
  extraction). The pattern that most reliably survives contact with production —
  because the task is narrow, the eval is easy, and the fallback (route back to
  the big model) is cheap.
- **Latency-critical narrow tasks.** When a tuned small model does at 200ms what
  a prompted big model does at 2s, and the task justifies MLOps ownership.
- **Always paired with the eval suite first.** The eval (`topics/evaluation.md`)
  is what tells you prompting failed — the entry ticket — and it's the only way
  to detect the regressions tuning introduces. No eval, no tuning, no exceptions.

## Common pitfalls (each one observed in the wild)

- **Tuning to teach facts.** Facts change; weights are a terrible database with
  no update path short of retraining, no citations, and no deletion (a
  GDPR problem — `topics/safety-and-guardrails.md` §4 — you cannot delete a
  user from weights). Use RAG. This is the #1 misuse and it's not close.
- **Capability regression outside the tuned lane.** Tuning narrows. The model
  gets better at your format and quietly worse at instruction-following, edge
  cases, safety behavior. Teams eval the target task and ship the regression.
  Eval broadly, not just the tuned skill.
- **Training data quality debt.** "We have 50K historical examples" — of your
  *old* system's outputs, errors, biases, and PII included. You are freezing
  yesterday's behavior, including the parts you were trying to fix. Curate
  ruthlessly; a clean 2K beats a raw 50K.
- **The upgrade treadmill.** Your tune is anchored to a base model that the
  provider will deprecate. Every base-model generation: re-tune, re-eval,
  re-ship — an ongoing tax teams never budget. Meanwhile the prompted baseline
  upgraded for free. Re-run the "does zero-shot on the new generation beat my
  tune?" experiment at every generation; be emotionally prepared for yes.
- **Tuning as a prompt-engineering shortcut.** "The prompt is getting
  complicated" is not a tuning trigger; it's a prompt-refactoring trigger
  (`topics/prompt-design.md`). Tuning costs weeks and adds an artifact to own;
  a better prompt costs an afternoon and adds a diff.

**Related:** `principles/decision-trees.md` §1 (the decision) ·
`topics/cost-and-latency.md` §4 (the tier economics that tuning competes with) ·
`topics/evaluation.md` (the prerequisite machinery).
