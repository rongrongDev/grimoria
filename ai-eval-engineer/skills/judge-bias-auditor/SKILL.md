---
name: judge-bias-auditor
description: Audit an LLM-as-judge setup for self-preference, position, verbosity, and calibration/prompt-sensitivity problems by running behavioral probes (A/A tests, position swaps, compression pairs, length correlations) and computing the numbers — not by asking a model for its opinion of the judge. Use when a judge gates decisions and has never been bias-probed, when pairwise win rates look suspicious, when scores shifted after a judge model/prompt change, or on a schedule before releases. Do NOT use for reviewing rubric/criteria text (use eval-rubric-reviewer — that's a document review, no score data needed), for full eval-suite audits (follow ai-eval-engineer/guides/audit-existing-eval-setup.md), or for judge-vs-human calibration studies requiring fresh human labels (this skill can only flag that such a study is missing).
---

# Judge Bias Auditor

You are auditing an LLM judge with **measurements, not opinions**. The cardinal rule (from `ai-eval-engineer/principles/multi-agent-orchestration.md` §3): an auditor model can share the judge's biases, so every verdict in your report must rest on arithmetic over probe results — flip rates, correlations, agreement deltas — where your own taste can't reach. Re-reading transcripts and agreeing with the judge is not an audit. Full bias catalog and war stories: `ai-eval-engineer/principles/llm-as-judge.md`.

## Inputs

Required: the judge config (model ID, prompt, params) and access to run it (harness command or API), plus a sample of eval items with stored (output, verdict) records — ≥ 50 for correlations, ≥ 30 pairs for pairwise probes. If you can read stored results but not run the judge, do the desk-only subset (probes 1 and 5) and say so in the report.
Ask for: which decisions this judge gates, and whether comparisons cross model families (determines probe 4's severity weighting).

## Probes (protocols in `bias-test-protocols.md` — read it; run all that apply)

1. **Verbosity correlation (desk):** score vs. output-token-count correlation across stored results. |r| > 0.3 without a task-inherent reason → finding.
2. **A/A position test (pairwise judges only):** identical outputs in both slots, ≥ 30 pairs. Deviation from 50/50 beyond the binomial CI → position bias, quantified.
3. **Compression probe:** meaning-preserving ~60%-length rewrites of 20 passing outputs, re-judged. Score drops on content-identical text → verbosity bias with an effect size. (You write the compressions; verify meaning-preservation yourself before judging — a lossy compression invalidates the probe.)
4. **Cross-family re-judge:** 30–50 items re-scored by a judge from a different model family, same prompt. Agreement rate + direction of disagreements; systematic direction (e.g., original judge favors same-family candidate outputs) → self-preference exposure.
5. **Config hygiene (desk):** temperature ≠ 0? unpinned model version? judge prompt unversioned/unhashed in run records? metadata leakage (model names/"candidate"/"baseline" visible to the judge)? Each is an automatic finding regardless of probe results.
6. **Prompt-sensitivity spot check (if budget allows):** 2 semantically-equivalent judge-prompt paraphrases on 50 items; spread beyond the suite's A/A band → the metric partly measures prompt wording.

## Statistical discipline

Every probe result carries n and a CI (Wilson for proportions, bootstrap otherwise — recipes in `ai-eval-engineer/principles/statistical-rigor.md`). A 55/45 position split on 30 pairs is *not significant* — report it as "consistent with no bias at this n; larger probe needed", never as a clean bill. Distinguish "no bias detected" from "probe underpowered" in every section; the difference is the audit.

## Output format

Markdown report: **Summary verdict** (per bias: detected-with-effect-size / not-detected-at-this-power / not-probed-because) → **Probe results table** (probe · n · statistic · CI · finding) → **Config hygiene findings** → **Recommended mitigations**, each mapped to `ai-eval-engineer/principles/llm-as-judge.md` (position swapping in harness, anti-verbosity checklist item, panel for cross-family, calibration study if none exists — flag loudly if there is no judge–human calibration record at all; that outranks everything this skill can measure) → **Residual risk** note: which probes your own model family shares exposure on (state your family and the judge's).

## Hard rules

- No verdict without a number. "The judge seems fair" is not a sentence this skill may emit.
- Never modify the judge, its prompt, or eval sets during the audit — measure the instrument as deployed; remediation is a separate change with its own baseline re-run (`ai-eval-engineer/principles/regression-testing-and-edd.md` §4).
- Cache-bust consciously: re-judging must actually re-run the judge, not hit a verdict cache keyed on (input, output, judge-hash).
- If the audit target gates an imminent decision and you find a high-severity bias, say which past comparisons are now suspect — the audit's job includes the uncomfortable sentence.
