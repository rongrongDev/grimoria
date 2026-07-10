# Probe Protocols (supporting file for judge-bias-auditor)

Exact procedures. Where a step needs code, write a small script in the session scratchpad; keep probe artifacts (inputs, verdicts, stats) in a single directory and link it from the report.

## P1 — Verbosity correlation (desk-only)
1. From stored results, extract (output_token_count, score) pairs; ≥ 50, ideally the full suite.
2. Pearson r (plus Spearman if scores are few-valued). Bootstrap a 95% CI on r.
3. Judgment step: is length *legitimately* quality-correlated for this task (e.g., "cover all 6 required sections")? If plausibly yes, run P3 to separate content from padding before concluding.
4. Report: r, CI, n, scatter description, legitimate-correlation assessment.

## P2 — A/A position test (pairwise judges)
1. Sample ≥ 30 items; construct pairs where **both slots contain the identical output** (byte-identical).
2. Run the pairwise judge normally (its usual prompt). Forced-choice judges: record slot chosen. Tie-allowed judges: record ties separately; the bias statistic uses non-tie verdicts only.
3. Binomial test of slot-A rate vs. 0.5; Wilson CI. Beyond CI → position bias with direction and magnitude.
4. If biased: recommend swap-and-require-consistency harness mode; estimate historical impact (which past win rates were within the bias magnitude).

## P3 — Compression probe
1. Take 20 outputs the judge scored well. Write compressions targeting ~60% length with **zero information loss** — no dropped claims, numbers, caveats, or steps. Self-check each compression against the original claim-by-claim; discard any where you cut content (this discipline is the probe's validity).
2. Re-judge compressions under identical config. Paired comparison of scores (original vs. compressed) — sign test or paired bootstrap.
3. Systematic drop on content-identical text = verbosity bias, effect size = mean paired delta. Also record the reverse (compressed scoring *higher*): some judges penalize redundancy — that's a finding too, just a different one.

## P4 — Cross-family re-judge
1. Pick a judge from a different model family, same judge prompt, same params, temperature 0.
2. Re-score 30–50 items (stratified across original score range — all-passes tells you nothing).
3. Report raw agreement + kappa, and the **direction structure** of disagreements: random disagreement = judge noise/prompt sensitivity; *patterned* disagreement (original judge lenient specifically on same-family-styled outputs, or on longer outputs) = named bias with evidence rows.
4. Caveat in report: the second family has its own biases; agreement ≠ correctness. This probe detects *family-dependence* of scores, which is the launch-relevant fact for cross-family comparisons.

## P5 — Config hygiene checklist (desk-only)
Temperature 0? · model version pinned (exact ID, not alias)? · judge prompt hashed into run records? · structured output enforced? · reasoning-before-verdict order? · anchored examples present for judgment-heavy items? · metadata blindness (no model names, no candidate/baseline labels, no timestamps in judge context)? · pathological-case rules in the judge prompt? Each "no" is a finding; cite `ai-eval-engineer/principles/llm-as-judge.md` §prompt design.

## P6 — Prompt-sensitivity spot check
1. Write 2 paraphrases of the judge prompt with meaning pinned (same criteria, same anchors, reworded connective text). Diff-review to confirm no semantic drift.
2. Run all 3 variants on the same 50 items, temperature 0.
3. Per-variant scores + max pairwise spread; compare against the suite's recorded A/A band (ask for it; if none exists, that's a P5-class finding and this probe's result can't be fully interpreted — say so).
4. Spread ≫ band → recommend degrees-of-freedom reduction (binary items, more anchors) per `ai-eval-engineer/principles/llm-as-judge.md` §5.

## Reporting floor (applies to all probes)
n, statistic, CI, and the sentence "this probe can detect effects of roughly ≥ X at this n" — computed, not vibed (`ai-eval-engineer/principles/statistical-rigor.md` §MDE). Underpowered probes are reported as underpowered, with the n that would fix them.
