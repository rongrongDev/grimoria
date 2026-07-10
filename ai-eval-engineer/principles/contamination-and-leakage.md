# Data Contamination & Leakage: When the Test Set Isn't a Test Anymore

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Applies to:** public benchmarks and private golden sets; any model family (contamination risk scales with training-corpus recency vs. benchmark publication date)
**Audience:** standalone. Companion subagent: `.claude/agents/contamination-scanner.md` (runs dataset-scale scans in an isolated context).

---

## The core insight

A benchmark measures generalization **only while the model hasn't seen it**. Contamination converts your generalization test into a memorization test *without changing a single number's appearance* — the score still prints, the dashboard still renders, and everything it tells you is now about the training corpus, not the model's ability.

There are three distinct contamination channels, and teams routinely defend against only the first:

1. **Direct contamination:** benchmark items (or their sources) in the pretraining/fine-tuning data.
2. **Near-duplicate contamination:** paraphrased or templated variants of benchmark items in training data — survives exact-match dedup entirely.
3. **Iteration leakage ("soft contamination"):** no training on the set at all — but hundreds of engineer decisions (prompt tweaks, retrieval settings, judge adjustments) each selected *because they raised the score on this specific set*. The system overfits the eval through the engineers. This one has no training-data audit trail, and it is the most common of the three.

---

## Failure modes

### 1. Benchmark leaked into training data

**War story.** A model upgrade "improved" a public reasoning benchmark from 71% → 89%. Champagne was metaphorically opened. A skeptic ran the check that should have run first: prompt the model with the first half of a benchmark question, no instructions. It completed the second half **verbatim — including the original's typo**. The benchmark predated the new model's training cutoff and lived on GitHub. The 18-point "reasoning improvement" was recall. The kicker: on a freshly-authored private set of matched difficulty, the new model was ~2 points *worse*.

- **Detection:**
  - **Completion probe:** feed item prefixes, check for verbatim/near-verbatim continuation of the rest of the item (or of the answer key). Verbatim completion of a typo or unusual phrasing is a smoking gun.
  - **Cutoff arithmetic:** benchmark publication date vs. model training cutoff. Public + predates cutoff = assume contaminated until shown otherwise; that's the prior the base rates support.
  - **Metadata probes:** ask the model for the benchmark's item IDs, ordering, or answer key ("what is question 47 of X?"). Models sometimes know.
  - **Suspicious score shapes:** performance on public set ≫ performance on private matched-difficulty set; or accuracy uncorrelated with item difficulty (memorization doesn't care how hard the question was — real capability does).
- **Fix:** You can't decontaminate the model; decontaminate the *measurement*. Drop the compromised set for that model; build/buy a private post-cutoff set; if you must cite the public number, report it flagged with the contamination evidence next to it.
- **Prevention:** Any benchmark adopted for decisions passes a contamination scan first (`contamination-scanner` subagent — this is precisely the dataset-scale grind that belongs in an isolated context). Prefer private, freshly-authored sets for anything gating a decision. Never let your own golden set be published, pasted into public issue trackers, or shipped to third parties without contractual/practical training-exclusion — treat golden-set items with the handling discipline of credentials, because their value evaporates the same way: silently, on exposure.

### 2. Near-duplicate contamination (paraphrases and templates)

**War story.** A team dutifully ran exact-match dedup between their golden set and their fine-tuning corpus: clean. Scores on the fine-tuned model looked miraculous. An embedding-similarity sweep later found ~14% of golden items had cosine-0.95+ neighbors in the fine-tuning data — same questions, different surface form, because **both had been derived from the same upstream FAQ document** by different teams a year apart. Nobody copied anything; shared provenance did the contaminating. Exact-match dedup catches copy-paste; it does nothing against a shared ancestor.

- **Detection:** layered, cheapest first: (1) exact + normalized match (case/whitespace/punctuation-folded); (2) n-gram overlap (e.g., any 8-gram shared between eval item and training doc is a red flag; 13-gram matching is the classic pretraining-scale screen); (3) embedding similarity between eval items and training/fine-tuning corpus with human review of the top-similarity tail — thresholds are corpus-dependent; calibrate by reviewing a sample, don't pick 0.9 from vibes; (4) **provenance audit**: list the source documents/systems your eval items derive from, and check whether training data draws on the same sources. (4) is the one everyone skips and the one that caught the FAQ case.
- **Fix:** remove or replace flagged items; re-score historical runs on the cleaned set so trend lines stay honest (annotate the discontinuity in the CHANGELOG); if too much of the set is compromised, the set is dead — rebuild from sources disjoint from training provenance.
- **Prevention:** record provenance (source doc, author, derivation method) as required metadata on every golden-set item at creation time — retrofitting provenance is archaeology, recording it is a form field. Re-run the near-dup scan whenever the fine-tuning corpus grows.

### 3. Iteration leakage: the eval set you've "trained on" via your own decisions

**War story.** A team ran their 300-item golden set on every prompt-engineering iteration for two quarters — hundreds of runs, each followed by a human choosing whatever moved the number up. Score climbed 74% → 91%. Real-user quality metrics: flat. When they finally scored a held-out set of the same distribution: 76%. Fifteen of those seventeen points were overfit to the specific 300 items — hill-climbed via prompt wording that happened to suit particular items, few-shot examples chosen because they fixed specific failures, a judge tweak that stopped penalizing one recurring quirk. **No training run ever touched the set. The engineers were the gradient.**

- **Detection:** the tell is *divergence*: dev-set score drifting up over months while held-out score (or production quality signal) stays flat. If you have no held-out set, you cannot detect this — that absence is itself the finding. Secondary tell: prompt/config changes whose justifications reference specific eval items ("this fixes items 23 and 41").
- **Fix:** immediately split: **dev set** (iterate freely, burn it with a clear conscience) vs. **held-out set** (scored rarely — weekly or per-release — never used to choose between candidate changes). Re-baseline all standing claims on the held-out number; expect a humbling drop and communicate it as a measurement correction, not a product regression.
- **Prevention:** structural, not disciplinary — willpower loses to dashboards: harness supports set tiers with access controls (held-out runs require a release ticket); refresh the dev set periodically (rotate burned items out, new production-sampled items in — `production-offline-gap.md`); track "runs against this set" as first-class metadata — a set with 500 iteration runs on it is presumptively burned for fine-grained decisions; keep a small **never-seen vault** refreshed quarterly for the highest-stakes calls.

---

## Contamination triage decision tree

- Adopting a **public benchmark**? → cutoff arithmetic → completion + metadata probes on a sample → if pre-cutoff and probes are dirty: reject or use only with public disclosure of evidence. Spawn `contamination-scanner` for the full-set scan.
- Building a **private golden set**? → record provenance per item → near-dup scan against all fine-tuning corpora → split dev/held-out from day one.
- **Inheriting an old eval** (audit setting)? → ask: how many iteration runs? is there a held-out tier? do dev and held-out trends diverge? → see `../guides/audit-existing-eval-setup.md` §contamination.
- **Score jumped suspiciously after a model/data change**? → completion probes before celebration. Memorization looks exactly like a breakthrough on the dashboard; only the probes distinguish them.

## What contamination is *not*

Don't cry contamination for: honest distribution overlap (production-like items resembling production-derived training data is often *the point* — the question is whether the *specific held-out items* were seen, not whether the domain was); or high scores per se (models are genuinely good at lots of things — the probes exist so you don't have to argue from priors in either direction).

---

## Related

- Golden-set hygiene and versioning: `eval-design.md`, `regression-testing-and-edd.md`
- Held-out refresh from production traffic: `production-offline-gap.md`
- Judge calibration sets are contaminatable too (overfitting the judge to its exam): `llm-as-judge.md`
- Subagent: `.claude/agents/contamination-scanner.md` — the full scan protocol, isolated so megabytes of n-gram/similarity output never touch your main context
