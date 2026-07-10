# The Production–Offline Gap: When the Eval Improves and the Product Doesn't

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Applies to:** any deployed LLM/agent system with offline evals; privacy guidance assumes GDPR/CCPA-era norms — involve your privacy/legal function before sampling user data
**Audience:** standalone. The theme: an offline eval is a *model of production*, and models of production go stale the way all models do — silently, while still emitting numbers.

---

## Why the gap exists (know your enemy by name)

1. **Distribution shift:** golden set frozen in Q1; users changed in Q2. New intents, new slang, new attachment types, seasonal topics, a marketing campaign that brought a different user population.
2. **Context mismatch:** offline items are cleaned, single-turn, fully-specified. Production inputs arrive with seventeen turns of history, contradictory instructions, half-pasted logs, and a user who meant something else.
3. **System mismatch:** the eval tests the model+prompt; production runs model+prompt+retrieval+cache+truncation+rate-limiter+fallback logic. Many "model regressions" are a truncation rule biting; many offline gains are eaten by a retrieval cache serving stale chunks.
4. **Metric mismatch:** offline measures answer correctness; users churn over latency, tone, or having to ask twice. Correct-but-annoying scores 100% offline and loses the customer.
5. **Selection effects in feedback:** thumbs-down comes disproportionately from certain user types and failure shapes; the failures users silently abandon never appear in any feedback stream. Absence of complaints ≠ absence of failures.

---

## Failure modes

### 1. Offline improvement that doesn't translate

**War story.** Six weeks of prompt iteration: +9 points on the offline suite. Shipped behind an A/B flag. Production effect: nothing — flat thumbs, flat escalations, flat task-completion. Post-mortem found the nine points were real *on the suite*: mostly better handling of long-document summarization items, which were 30% of the golden set (a founding engineer's pet scenario) and **1.7% of production traffic**. Meanwhile the top production intent — short "where is my order?"-class lookups with account context — was 4% of the suite. The eval was a faithful map of a territory nobody lived in. (The near-dual failure — production regression the suite couldn't see — is the intent-classifier story in `eval-design.md` §golden sets. Same disease, opposite symptom.)

- **Detection:** *before* trusting any suite for launch decisions, compute the **traffic-weight audit**: for each production intent/segment (cluster a recent traffic sample by embedding + volume), what's its weight in the golden set vs. in traffic? Report the divergence. Post-hoc detection: track correlation between offline deltas and A/B outcomes across your last N launches — if offline movement doesn't predict online movement, your suite is decorative for launch decisions (it may still be fine as a regression tripwire; know which job it's doing).
- **Fix:** re-stratify the suite to production weights for the *headline* number; keep deliberately over-weighted strata (edge cases, safety, rare-but-catastrophic) as separately-reported gates — you want production weighting for "did we get better?", NOT for "is it safe?" (rare catastrophic failures deserve over-representation; a traffic-weighted safety eval is how you ship a 0.1%-of-traffic disaster).
- **Prevention:** quarterly traffic-weight audit on the calendar; suite README states the weighting policy and its last audit date. New-feature launches require items for the feature's expected traffic before launch (`regression-testing-and-edd.md` §rot).

### 2. Missing production-distribution shift in the golden set

- **Detection:** distribution monitoring on production inputs (length, language mix, intent cluster shares, tool-invocation rates) vs. the same stats over the golden set — a divergence dashboard, checked quarterly or on any product/marketing event that changes the user base. Leading indicator: a rising share of production traffic landing in "no matching golden-set stratum."
- **Fix:** refresh via stratified sampling of recent traffic (privacy pipeline below); freeze the old set version for trend continuity; run both for one cycle to measure the discontinuity you're introducing (`statistical-rigor.md` §Simpson's — mix-shift will move your topline even if the system didn't change).
- **Prevention:** treat golden-set staleness like dependency staleness — dated, visible, with an owner. `eval-design.md`'s rule: a set > 2 quarters old is suspect by default.

### 3. The feedback loop that samples only the complaints

**War story.** A team's "production failure feed" was built entirely from thumbs-down events. They dutifully added those to the golden set. A quarter later the suite was excellent at the failures *articulate, motivated users report* — formatting complaints, refusal complaints — and blind to the biggest real problem, discovered only via a churn analysis: users who got a subtly wrong answer didn't thumb-down, they just left. The feedback loop had a survivorship filter, and the eval inherited it. The suite got measurably better at the wrong distribution of failures.

- **Detection:** compare failure-mode distribution in (a) explicit feedback vs. (b) a *random* sample of traffic graded by your judge/humans vs. (c) indirect behavioral signals (immediate rephrase, session abandonment, escalation-to-human, copy-then-delete). If (a) looks unlike (b)/(c), your feedback stream is a biased sensor.
- **Fix:** build the failure feed from **stratified random sampling + judge triage** (grade a random slice continuously; sample *failures from that*), with explicit-feedback items as an additional stratum rather than the source. Weight indirect signals in.
- **Prevention:** document the sampling frame of every production-derived eval stratum ("this stratum = random 0.5% of traffic, judge-flagged, human-confirmed" vs. "user-reported"). An eval item's sampling provenance is as load-bearing as its label.

### 4. Closing the loop *safely*: production data → eval set

The highest-ROI eval habit (`eval-design.md`) — every real failure becomes a regression item — done wrong becomes a privacy incident or a contamination vector. The pipeline:

1. **Sample** (stratified random + incident-driven, per §3).
2. **Scrub:** PII removal (automated NER pass + human review for the golden tier — automated-only scrubbing misses composite identifiers like "the CFO of [small town] bakery"); drop items whose semantics *are* the PII (can't scrub "does my specific contract clause X mean Y" without destroying the item — synthesize a structurally equivalent replacement instead: same failure mechanism, fictional particulars, tagged `synthetic-from-incident`).
3. **Label:** ground truth via the human pipeline (`human-evaluation.md`) — the production system's output is the *failure exhibit*, never the reference answer.
4. **Check for leakage the other direction:** if production traffic feeds fine-tuning data too, an item can end up in both training and eval — the FAQ-provenance trap from `contamination-and-leakage.md` §2, now on a conveyor belt. Partition by conversation/user ID *at the pipeline level* so no conversation can feed both.
5. **Version in** with provenance metadata; the suite CHANGELOG notes the refresh.

- **Failure mode here — detection/fix/prevention:** the pipeline silently stops (upstream schema change, sampling job dies) and the suite quietly resumes aging. Detect: freshness metric — "% of suite items < 2 quarters old" and "days since last production-derived addition" on the eval dashboard. Fix: treat like any dead data pipeline. Prevent: the sampling job alerts on its own silence, not just on errors.

### 5. Offline/online metric divergence (measuring different "good")

- **Detection:** for each offline metric, name the online metric it's supposed to predict (task completion, retention, escalation rate, CSAT). If you can't name one, it's a proxy without a referent. Where both exist, check the sign and rough magnitude of correlation across launches.
- **Fix:** add offline metrics for the online-only dimensions where feasible (latency budget per item; turn-count-to-resolution for multi-turn items — see `../topics/agentic-task-evals.md`); accept and *document* that some dimensions (long-term retention) are only measurable online, so offline green + A/B is the actual launch bar, not offline green alone.
- **Prevention:** the launch checklist states which decisions offline evals are authorized to make alone (small prompt tweaks; regression blocking) and which require online confirmation (model swaps, major behavior changes). Writing this down once ends a lot of recurring arguments.

---

## The maturity ladder (where is your team?)

1. **L0:** offline suite only, hand-built, never refreshed. Gap unknown and unmeasured.
2. **L1:** production sampled into the suite once; feedback-driven additions ad hoc. Gap shrinking, survivorship-biased.
3. **L2:** continuous stratified sampling + privacy pipeline + traffic-weight audits + freshness metrics. Gap measured and managed.
4. **L3:** offline deltas validated against A/B outcomes routinely; suite weighting maintained against traffic; offline suite's *predictive power* is itself a tracked metric. The eval is now an instrument with a known error bar against reality.

Most teams believe they're at L2 and are at L1. The tell is whether "when did the suite last get production-derived items, and from what sampling frame?" has a crisp answer.

---

## Related

- Golden-set stratification and staleness rules: `eval-design.md`
- Contamination via the production→training→eval loop: `contamination-and-leakage.md`
- Set versioning and discontinuity handling on refresh: `regression-testing-and-edd.md`
- Trajectory-level metrics for multi-turn production traffic: `../topics/agentic-task-evals.md`
- Audit lens on someone else's gap: `../guides/audit-existing-eval-setup.md`
