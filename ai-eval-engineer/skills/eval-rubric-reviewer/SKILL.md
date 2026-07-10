---
name: eval-rubric-reviewer
description: Review an eval rubric or success-criteria document for ambiguity, missing edge-case policies, gameable metrics, and judge/rater-unfriendly structure, producing a severity-rated findings list with rewrites. Use when the user asks to review/check/tighten a rubric, success criteria, judge prompt criteria, or annotation guidelines, or before any new rubric reaches raters or an LLM judge. Do NOT use for auditing a whole eval suite end-to-end (follow ai-eval-engineer/guides/audit-existing-eval-setup.md), for detecting judge-model bias in scoring behavior (use judge-bias-auditor — that needs score data, this reads documents), or for golden-set contamination questions (spawn the contamination-scanner subagent).
---

# Eval Rubric Reviewer

You are reviewing an eval rubric the way a principal eval engineer would: hunting the ambiguities that will silently become arbitrary judge/rater house rules, the criteria that measure what's easy instead of what matters, and the undefined edge cases that will produce garbage labels. Background judgment: `ai-eval-engineer/principles/eval-design.md` and `ai-eval-engineer/principles/human-evaluation.md` (§rubric design).

## Inputs

Required: the rubric / success criteria / judge-prompt criteria text (file or pasted). Ask for it if absent — do not review from a description of the rubric.
Strongly requested (proceed with a caveat if missing): 5–10 real system outputs the rubric will score, and one sentence on who scores (humans? which expertise? LLM judge?) and what decision the scores gate.

## Procedure

1. **Claim check.** Can you state what the rubric measures and what decision it serves? If not stated anywhere, that's finding #1 (severity: high).
2. **Per-criterion ambiguity pass.** For every criterion, apply the checks in `checklist.md` (same directory — read it). Core test: *predict-the-verdict* — for each provided sample output, commit to a verdict per criterion **before** reasoning at length; where you find yourself able to argue both verdicts, the criterion is ambiguous. Quote the ambiguous phrase exactly; describe the two defensible readings; state which reading a lazy scorer will default to.
3. **Boundary legislation check.** Rubrics earn their keep at boundaries, not centers. For each criterion, ask: does it decide the hard case (partial compliance, correct-but-incomplete, inferred-vs-stated)? Missing boundary rules → finding, with a proposed rule.
4. **Pathological-case policy.** Refusals, empty outputs, off-topic answers, format violations combined with correct content: does the rubric say what happens? Undefined = finding (these become per-scorer house rules — the most invisible failure in eval design).
5. **Structure for the scorer.** Likert scales where binary decompositions would do; multi-decision criteria ("accurate and complete"); criteria requiring expertise the stated raters lack; missing anchored examples for anything judgment-heavy. Each is a finding with the mechanical fix.
6. **Gameability pass.** For each criterion, write the one-line gaming note: cheapest way to score well without being good. Flag criteria where the gaming note is easy and alarming.
7. **Rewrite, don't just critique.** For every high/medium finding, propose replacement text — binary items, boundary rules, pathological policies — in the rubric's own voice and format.

## Output format

Markdown report: **Verdict line** (ready / needs-revision / not-scoreable-as-written) → **Findings table** (severity high/med/low · criterion quoted · problem · two-readings demonstration where applicable) → **Proposed rewrites** (drop-in text) → **What I couldn't check** (e.g., no sample outputs provided → predict-the-verdict untested; recommend the two-rater kappa pilot from `ai-eval-engineer/principles/human-evaluation.md` §1 before first real batch).

## Hard rules

- Never approve a rubric you couldn't score 5 outputs with yourself, consistently.
- Ambiguity findings must quote exact rubric text and show both readings — "this is vague" without the demonstration is not a finding.
- Do not invent domain ground truth: if a criterion's correctness calls need domain expertise you lack, say so and route per `ai-eval-engineer/principles/human-evaluation.md` §3 (split-rubric pattern) rather than guessing.
- This skill reads documents; it does not run evals, compute kappa, or probe judges. Recommend those as next steps where warranted (kappa pilot; `judge-bias-auditor` once scoring data exists).
