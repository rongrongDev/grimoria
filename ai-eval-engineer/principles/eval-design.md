# Eval Design: Measuring What Matters

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Applies to:** any LLM/agent system (Claude 4.x/Fable 5, GPT-5.x, Gemini 3.x era); framework-agnostic (promptfoo, Braintrust, LangSmith, custom harnesses)
**Audience:** anyone designing an eval, from junior engineer to autonomous agent. Standalone — no other doc required, but see `../guides/build-eval-suite-from-scratch.md` for the end-to-end workflow.

---

## The one rule

**An eval is a proxy. The moment you forget it's a proxy, it starts lying to you.**

Every eval failure I've seen in production traces back to a gap between three things that people conflate:

1. **What you care about** (users get correct, safe, useful answers)
2. **What you defined** (the success criteria written in the rubric)
3. **What you actually measure** (what the scorer computes on the sample you have)

Eval design is the discipline of keeping those three aligned and *noticing when they drift apart*. Score going up is only good news if the chain 3→2→1 still holds.

---

## Task definition: write the claim before the eval

Before writing a single test case, write one sentence of the form:

> "This eval measures whether [system] can [capability] for [population of inputs], scored by [method], and a score of X means [operational claim]."

If you can't fill in the last clause — what a score *means* — you are about to build a dashboard number, not an eval. Real examples of the difference:

- ❌ "Measures summarization quality" — unfalsifiable, judges will disagree, score means nothing.
- ✅ "Measures whether support-ticket summaries preserve every customer-stated action item, scored by an item-level checklist; 95% means at most 1 in 20 tickets loses an action item."

**Decision tree — what kind of eval do you need?**

- Output has a single verifiable answer (code passes tests, SQL returns right rows, extraction matches ground truth) → **programmatic scoring**. Cheapest, most trustworthy. Always prefer when possible.
- Output is open-ended but decomposable into checkable claims (did it mention X, did it avoid Y, is it under N words) → **checklist/rubric scoring**, executed by LLM-as-judge per item ([llm-as-judge](./llm-as-judge.md) → `llm-as-judge.md`).
- Quality is genuinely holistic or domain-expert-dependent (medical advice tone, legal correctness) → **human eval** (`human-evaluation.md`), with LLM-judge only after calibration against those humans.
- You need "is A better than B" and can't define absolute quality → **pairwise comparison**, with position-bias controls (see `llm-as-judge.md`).

---

## Success criteria

### Failure mode: vague criteria that different judges interpret differently

**War story.** A team shipped a rubric with the criterion "the response should be helpful and accurate." Two human annotators scored a 200-item set: agreement was 61% — barely above chance for a 3-point scale. The eval had been "passing" for months because the LLM judge resolved the ambiguity *one consistent way* — consistently wrong. It counted hedging ("I'm not certain, but...") as inaccuracy, so a model update that correctly hedged on genuinely uncertain questions showed a fake 8-point regression. Two weeks were spent "fixing" behavior that was an improvement.

- **Detection:** Give the rubric to two humans (or two different judge models) on 30–50 items. Compute agreement (Cohen's kappa; see `statistical-rigor.md` and GLOSSARY). Kappa < 0.6 means the rubric, not the annotators, is broken. Also: read 10 items where the judge's score surprises you — if you can't predict the judge's score before seeing it, the criterion is vague.
- **Fix:** Decompose holistic criteria into binary, observable checks. "Helpful" becomes: "answers the question actually asked (Y/N)", "includes the specific figure requested (Y/N)", "does not require the user to ask a follow-up to act (Y/N)". Binary items force disagreement into the open, where you can adjudicate and rewrite.
- **Prevention:** CI gate — no rubric merges without a recorded two-rater agreement check ≥ 0.7 kappa on a pilot set. Make the `eval-rubric-reviewer` skill (`.claude/skills/eval-rubric-reviewer/`) part of rubric review.

### Failure mode: measuring what's easy instead of what matters

**War story.** A RAG team's headline metric was answer similarity (embedding cosine) to reference answers, because it was one line of code. The model learned — via prompt iteration guided by the eval — to produce answers *phrased like* the references, including confidently phrased wrong answers. Meanwhile the metric that mattered (does the cited source actually support the claim?) was unmeasured because it needed a judge. Production complaint rate rose while the eval improved. The metric was optimizing sound-alike-ness.

- **Detection:** For each metric, ask "what's the cheapest way for the system to raise this number without getting better?" If you can name one in under a minute, the model (or the prompt-iterating engineer) will find it too. Also: correlate eval scores with any downstream signal you have (thumbs-down rate, escalations). Weak or negative correlation = proxy failure. See `production-offline-gap.md`.
- **Fix:** Replace or pair every convenience metric with a validity-bearing one, even if it's more expensive to run — run the expensive one on a sample (`cost-and-scalability.md`). Delete metrics nobody would act on; they dilute attention.
- **Prevention:** Every metric in the suite carries a one-line "gaming note" documenting how it can be gamed, reviewed when the metric is added. Quarterly proxy-validity review comparing eval deltas against production signals.

---

## Golden sets

A golden set is the versioned collection of inputs (+ expected outputs or rubrics) that defines the eval. Its composition *is* the eval's meaning.

### Failure mode: missing edge cases and adversarial inputs

**War story.** An intent-classification golden set was built by sampling "typical" tickets. It contained zero examples of: mixed-language input, messages that were 90% pasted stack trace, empty messages, and users asking two things at once. All four were common in production. The eval said 97%; the first week of production said ~80%, and every failure was in a category the golden set structurally could not see. The eval wasn't noisy — it was *blind*.

- **Detection:** Build a coverage matrix: rows = input dimensions (length, language, format, topic, user intent, adversariality), columns = buckets. Any empty cell that exists in production is a blind spot. Cross-check against a week of real traffic, not your imagination — production is more creative than you.
- **Fix:** Deliberately stratify: ~60–70% representative cases, ~20–30% known edge cases, ~10% adversarial/malformed inputs. Tag every item with its stratum so you can report per-stratum scores — a single blended number hides "great on easy, broken on hard."
- **Prevention:** Golden-set additions require a stated stratum. Every production incident adds its (sanitized) trigger input to the set within a week — the incident-to-golden-set pipeline is the single highest-ROI eval habit I know (`production-offline-gap.md`).

### Failure mode: golden set doesn't reflect production distribution

- **Detection:** Compare distributions (length, language, topic clusters via embedding, time-of-day if relevant) between golden set and a recent production sample. Large divergence on any axis the model is sensitive to = distribution rot. Re-check quarterly; production drifts.
- **Fix:** Refresh with stratified samples of real (privacy-scrubbed) traffic. Keep the old set frozen and versioned — you need it for longitudinal comparison — and report both until the new set is trusted.
- **Prevention:** Date-stamp golden sets. Treat one older than ~2 quarters (or one product pivot) as suspect by default. Version them like code (`regression-testing-and-edd.md`).

### Golden set hygiene rules (non-negotiable)

1. **Version it.** Content-hash or git-track every item. A score is meaningless without the exact set version it was computed on.
2. **Never edit an item in place** to make a failing case pass. Add a new version, keep the old, document why. In-place edits are how teams silently grade themselves on an easier test.
3. **Hold out a fresh slice.** Any set you iterate against gets overfit through your own decisions — see `contamination-and-leakage.md` on iteration leakage. Keep 10–20% untouched, evaluated rarely.
4. **Expected outputs need provenance.** Who decided this is the right answer, and would a domain expert agree? Wrong ground truth is worse than no ground truth: it penalizes correct behavior forever, invisibly.
5. **Size for the decision, not for comfort.** 50 items cannot detect a 3-point difference; see `statistical-rigor.md` for the actual math before you promise sensitivity you don't have.

---

## Choosing metrics: the hierarchy of trust

From most to least trustworthy — always use the highest rung the task allows:

1. **Execution-based** (tests pass, code runs, API call succeeds, answer string-matches after normalization)
2. **Deterministic structural checks** (valid JSON, required fields present, length bounds, regex/link validity)
3. **Reference-based with exactness** (exact match, F1 on extracted spans)
4. **Calibrated LLM-as-judge with binary checklist items** — calibrated means validated against human labels, not "we read a few and it seemed fine" (`llm-as-judge.md`)
5. **Calibrated LLM-as-judge with Likert scales** (noisier; scale drift)
6. **Uncalibrated LLM-as-judge** — a hypothesis generator, not a metric. Fine for triage, never for a launch decision.
7. **Embedding similarity / BLEU / ROUGE** for open-ended generation — legacy; correlates weakly with quality precisely where you care (subtle wrongness reads as similar). Use only as a cheap tripwire, never a headline number.

Mixing rungs is normal: gate launches on rungs 1–4, use 5–7 as monitoring tripwires.

---

## Anti-patterns summary

| Anti-pattern | Why it bites | Cross-ref |
|---|---|---|
| One blended score for a multi-dimensional task | Hides regressions in one dimension behind gains in another | `statistical-rigor.md` (multiple comparisons done right) |
| Rubric criteria only the author understands | Judge resolves ambiguity arbitrarily but consistently — looks stable, measures nothing | `human-evaluation.md` |
| Golden set built from imagination, not traffic | Eval is blind to real failure modes | `production-offline-gap.md` |
| Editing failing cases instead of fixing the system | Silent difficulty decay; score inflation | `contamination-and-leakage.md` |
| Metric chosen because it was easy to compute | Optimizes the proxy, not the target | this doc, §success criteria |
| No per-stratum reporting | "97% overall" while a critical segment is at 60% | `statistical-rigor.md` |

---

## Related

- End-to-end workflow: `../guides/build-eval-suite-from-scratch.md`
- Auditing someone else's eval: `../guides/audit-existing-eval-setup.md`
- Skills: `eval-rubric-reviewer` (rubric ambiguity review) — `.claude/skills/eval-rubric-reviewer/SKILL.md`
- Subagent: `contamination-scanner` before adopting any external benchmark — `.claude/agents/contamination-scanner.md`
