# Statistical Rigor for Eval Scores: Is That Delta Real?

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Applies to:** any eval producing scores/pass-rates; math is timeless, tooling examples generic (Python/scipy, or the built-in CI support in Braintrust/promptfoo-style harnesses)
**Audience:** standalone. Written for engineers who don't do statistics daily — recipes first, theory only where skipping it causes wrong decisions.

---

## The single most important habit

**Never report, read, or act on an eval score without an uncertainty estimate.** "87.3%" is not a measurement; "87.3% ± 3.1 (n=450)" is. Half of all bad eval-driven decisions I've witnessed reduce to someone treating the noise band as if it were zero width.

**War story (the one to remember).** A team celebrated a prompt change: 84% → 87% on a 200-item suite. The 95% CI on that difference was roughly ±5 points. Two weeks later a different change "regressed" 87% → 85%, triggering a rollback and a three-day investigation. Both moves were sampling noise on the same underlying ~85.5% system. The suite could not detect anything smaller than ~8 points, and nobody had ever computed that. The team was doing random-walk engineering with extra steps — celebrating and mourning coin flips.

---

## Recipes

### Confidence interval on a single pass rate

For pass rate p on n items, use the **Wilson interval** (not the normal approximation — it misbehaves near 0%/100%, exactly where safety evals live):

```python
from statsmodels.stats.proportion import proportion_confint
lo, hi = proportion_confint(count=passes, nobs=n, alpha=0.05, method="wilson")
```

Rules of thumb for the 95% CI half-width near p≈0.85: **n=100 → ±7 pts; n=400 → ±3.5; n=1000 → ±2.2.** Quadrupling n halves the interval. When someone asks "why is the golden set 400 items?", this is why.

For non-binary scores (mean of per-item Likert/judge scores) or anything aggregated weirdly (per-conversation, per-cluster): **bootstrap** — resample items with replacement 10k times, take the 2.5/97.5 percentiles of the metric. The bootstrap is the duct tape of eval statistics: almost always applicable, rarely misleading at eval sample sizes, and it works for *any* metric you can compute.

### Comparing two models/prompts on the same eval set

Your data is **paired** (same items, both systems) — exploit it, it's free power:

- Binary pass/fail → **McNemar's test**: only the discordant items (A passed/B failed, and vice versa) carry information. Also *read* those discordant items — the test says whether the delta is real; the transcripts say what it is.
- Continuous scores → **paired t-test** (or Wilcoxon signed-rank if wildly non-normal), or bootstrap the per-item deltas.
- Report the **CI on the difference**, not two overlapping CIs on the individual scores — overlapping individual CIs do *not* imply "no significant difference"; the paired comparison is far more sensitive than the two marginal CIs suggest. This mistake goes in both directions and both are common.

Also run both systems with identical harness conditions — same eval-set version, same judge config hash (`llm-as-judge.md` §prompt sensitivity), same decoding params. A confounded comparison with perfect statistics is still wrong.

### Sample size / power ("can this suite even see the difference I care about?")

Decide the **minimum detectable effect (MDE)** you care about *before* building. Approximate n per arm to detect a difference Δ in pass rate around p with 80% power at α=0.05 (unpaired, conservative for paired):

n ≈ 16 · p(1−p) / Δ²

- Detect 10 pts around 80%: n ≈ 260. Detect 5 pts: n ≈ 1000. Detect 2 pts: n ≈ 6400.

That last number is why "we'll detect small regressions with our 300-item suite" is a false promise, and why mature orgs either (a) accept a coarse MDE for fast gates and run big suites weekly, or (b) invest in cheap items so n can be large (`cost-and-scalability.md`). **State your suite's MDE in its README.** An eval whose users think it's more sensitive than it is causes worse decisions than no eval — see the war story above.

### A latency/nondeterminism aside

If the system under test is nondeterministic (temperature > 0, tool-use variance), a single run per item measures (system + seed). Either fix decoding to deterministic for the gate, or run k samples per item and score pass@k / mean — but then your unit of noise is the item×seed pair, and your CI must account for it (bootstrap over items, not over samples). See `regression-testing-and-edd.md` on flake.

---

## Failure modes

### 1. Score without a confidence interval

- **Detection:** grep your dashboards and eval reports for bare percentages. That's the audit.
- **Fix:** compute Wilson/bootstrap CIs everywhere; retrofit the last few decisions ("was that 3-point 'win' inside the noise band?") — expect at least one uncomfortable discovery.
- **Prevention:** the harness emits CI with every score; reporting templates have no slot for a bare number. Culturally: anyone can ask "what's the n and the interval?" and expect an answer.

### 2. Comparing models on too few examples

- **Detection:** compute the MDE for your suite size (formula above); compare against the deltas your team routinely celebrates. If the MDE is 8 points and last quarter's wins were 2–4 points each... condolences.
- **Fix:** grow n (see `cost-and-scalability.md` for making that affordable); use paired tests to squeeze sensitivity from existing n; batch small changes and evaluate the batch (detectable aggregate) rather than each dust-sized change alone.
- **Prevention:** MDE documented per suite; CI gate thresholds set ≥ the MDE (a gate that triggers on sub-noise deltas is a random number generator with opinions — `regression-testing-and-edd.md`).

### 3. Multiple comparisons across many dimensions

**War story.** A release report sliced one eval into 24 sub-metrics (per-category × per-difficulty). One category showed a "significant regression" (p ≈ 0.03). A week of investigation found nothing. Of course it didn't: with 24 tests at α=0.05, the expected number of false alarms *under no true change* is ~1.2. The process was designed to hallucinate one regression per release. It did, every release, and every release someone chased it.

- **Detection:** count the hypotheses your report effectively tests (every sliced metric × every comparison). If it's > 5 and there's no correction, some of your historical "findings" were manufactured by arithmetic.
- **Fix:** Benjamini-Hochberg (FDR) correction across the family of comparisons is the pragmatic default (Bonferroni if false alarms are very expensive and tests are few). Or restructure: 1–3 *primary* pre-registered metrics gate the decision; everything else is explicitly labeled exploratory — investigate only with corroborating evidence (transcripts, repeat on fresh sample).
- **Prevention:** report template separates "primary (gating, corrected)" from "exploratory (uncorrected, hypothesis-generating)". New slices default to exploratory.

### 4. Treating a noisy delta as a real regression/improvement

The compound failure: no CI + small n + many comparisons + human narrative-craving. Deltas get names ("the tone regression") and once named, they're real to the org — even when they were never distinguishable from noise.

- **Detection:** before investigating any delta, two questions in order: (1) is it outside the CI on the difference? (2) does it survive a **rerun on a fresh or held-out sample**? A real effect replicates; noise doesn't. This two-step filter kills most ghost-chases for the price of one extra eval run.
- **Fix:** for a suspected-real delta, triangulate before acting: read the discordant items (McNemar's set — the actual flipped cases), check whether the change plausibly touches that category, replicate. *Then* decide.
- **Prevention:** encode the two-step filter in the regression-triage runbook (`eval-regression-tracer` subagent does exactly this — significance check before clustering, `.claude/agents/eval-regression-tracer.md`). Track your suite's historical run-to-run variance (A/A runs); any delta within that band is auto-labeled "noise-consistent" by the harness before a human ever sees it.

### 5. (Bonus, seen constantly) Simpson's paradox in blended scores

A model improves on every category but the blended score *drops* because the category mix in the eval shifted (new items landed in a hard category). Or vice versa — blended "improvement" that's pure mix-shift.

- **Detection:** any time the eval set changed between runs, decompose deltas into within-category movement vs. mix effect before believing the topline.
- **Fix/Prevention:** compare like-for-like set versions (`regression-testing-and-edd.md` §versioning); report per-stratum scores alongside any blended number (`eval-design.md`).

---

## Decision-grade reporting: the minimum viable table

Every eval result that feeds a decision includes: metric definition + eval-set version + n · score with 95% CI · for comparisons: paired delta with CI and p (corrected if part of a family) · judge/scorer config hash · suite MDE · link to raw transcripts. If a result can't fill that row, it's an anecdote, not an eval result — anecdotes are allowed, but they don't gate launches.

---

## Related

- Where n comes from and what items to buy with it: `eval-design.md`, `cost-and-scalability.md`
- Flake vs. noise vs. regression: `regression-testing-and-edd.md`
- IRR statistics (kappa/alpha): `human-evaluation.md` + GLOSSARY
- Subagent that applies this triage automatically: `.claude/agents/eval-regression-tracer.md`
