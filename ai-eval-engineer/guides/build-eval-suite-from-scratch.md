# Guide: Build an Eval Suite From Scratch

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Applies to:** any LLM/agent feature; harness-agnostic (promptfoo, Braintrust, LangSmith, custom) with generic config sketches
**Audience:** an engineer or agent who has a system to evaluate and no eval. Follow the steps in order; each step names its exit criterion. Deep dives are linked, but this guide is complete enough to execute alone. Expect the first pass to take days, not hours — and to be 10× cheaper than discovering in production that you had no eval.

---

## Step 0 — Decide what decision the eval serves (30 min, on paper)

Write the claim sentence (from `../principles/eval-design.md`):

> "This eval measures whether **[system]** can **[capability]** for **[input population]**, scored by **[method]**; a score of X means **[operational claim]**, and it exists to gate **[decision: PR merges / releases / model swaps]**."

The *decision* determines everything downstream: a per-PR gate needs speed and determinism; a model-selection eval needs sensitivity (large n); a safety gate needs over-weighted rare cases. If stakeholders disagree on the sentence, stop — an eval built on an unresolved disagreement gets ignored by whoever lost.

**Exit criterion:** the sentence, written down, with the decision named and a stakeholder having read it.

## Step 1 — Define success criteria (half a day)

1. List what "good" means for this task as candidate criteria. Then ruthlessly convert each to **binary, observable checks** — "helpful" is not a criterion; "answers the question actually asked (Y/N)" is (`../principles/eval-design.md` §success criteria).
2. For each criterion, choose the **highest rung on the metric-trust hierarchy** it can be scored at (execution > structural > exact-match > calibrated-judge-binary > judge-Likert > embedding-similarity — definitions in `../principles/eval-design.md`). Code checks everything code can check.
3. Write the pathological-case policy: what does each criterion do with a refusal, an empty output, an off-topic answer? Undefined cases become scorer house rules later.
4. Attach a one-line **gaming note** to each metric: the cheapest way to raise it without getting better. If the note is easy to write and scary, redesign the metric now.

**Exit criterion:** rubric drafted, every item binary or short-categorical, pathological policy written. Run `.claude/skills/eval-rubric-reviewer/` on it before proceeding — it catches the ambiguities you can no longer see because you wrote them.

## Step 2 — Build the golden set (1–3 days)

1. **Source inputs, in priority order:** (a) real production traffic, stratified-sampled and privacy-scrubbed (`../principles/production-offline-gap.md` §4 pipeline — if the system isn't live yet, use pilot/dogfood traffic); (b) domain-expert-authored cases; (c) synthetic generation *last*, reviewed by a human, tagged `synthetic` (synthetic-only sets encode the generator's imagination, not your users').
2. **Stratify deliberately:** ~60–70% representative (traffic-weighted), ~20–30% known edge cases (build the coverage matrix: length × language × format × intent; fill cells that exist in production), ~10% adversarial/malformed (category taxonomy from `../topics/adversarial-evaluation.md` — categories and severity, no payload imports). Tag every item with its stratum.
3. **Ground truth with provenance:** every expected output/label records who decided it and how (`../principles/eval-design.md` §hygiene rule 4). Correctness-bearing labels need qualified raters (`../principles/human-evaluation.md` §3).
4. **Size it against your MDE:** decide the smallest delta the gate must detect, apply n ≈ 16·p(1−p)/Δ² (`../principles/statistical-rigor.md` §sample size). Typical honest answer: ~400 items detects ~5-point moves around 85%; write the suite's actual MDE in its README rather than promising sensitivity you didn't buy.
5. **Split tiers immediately, before any iteration happens:** dev set (iterate freely) / held-out (~15–20%, scored per-release only) — day-one prevention of iteration leakage (`../principles/contamination-and-leakage.md` §3). If the inputs came from anywhere public or shared-provenance, run `contamination-scanner` (`.claude/agents/contamination-scanner.md`) before trusting the set.
6. **Version it:** items in git/content-addressed store, immutable per version, provenance metadata required per item.

**Exit criterion:** versioned set with strata tags, provenance, dev/held-out split, documented MDE. *(Agentic systems: items are (initial state + goal + environment + executable verification) — see `../topics/agentic-task-evals.md` before this step.)*

## Step 3 — Choose and calibrate the judging method (1–2 days + human-label turnaround)

Decision tree:
- All criteria at hierarchy rungs 1–3 (programmatic)? → no judge needed; skip to step 4.
- Judgment-requiring criteria + domain within generalist competence → **LLM-as-judge**, calibrated (below).
- Domain-expert judgment required (medical/legal correctness) → **humans for correctness items**, judge for the rest (`../principles/human-evaluation.md` §3 split-rubric pattern).
- Comparative eval (A vs B) rather than absolute → pairwise judge with **position swapping built in** and an A/A test before first use (`../principles/llm-as-judge.md` §2).

For an LLM judge:
1. Write the judge prompt: full context, binary checklist, pathological-case rules, 2–3 anchored examples per tricky criterion, reasoning-then-verdict JSON, temperature 0, pinned model (`../principles/llm-as-judge.md` §prompt design).
2. **Calibrate:** 100–200 stratified items, human-labeled via a real pipeline (qualification, double-labeling, IRR ≥ 0.7 kappa on the pilot — `../principles/human-evaluation.md`); require judge–human kappa ≥ 0.7 per item to gate; read every disagreement and fix rubric → prompt → model → scope, in that order.
3. Run the bias probes once before trusting it: A/A position test (if pairwise), length-vs-score correlation, compression probe — or just run `.claude/skills/judge-bias-auditor/`.
4. Hash judge model+prompt+params into every score record.

**Exit criterion:** scoring method with recorded calibration evidence (kappa, disagreement notes) and a judge-config hash. An uncalibrated judge may be used for *triage only*, labeled as such.

## Step 4 — Build the harness run (1–2 days)

Requirements checklist, framework-agnostic:
- [ ] Run record = {eval-set version, judge-config hash, system-under-test commit/config hash, decoding params, dependency snapshot IDs, sample seed, timestamp}. If a score can't cite all of these, comparisons are unverifiable (`../principles/regression-testing-and-edd.md` §4).
- [ ] Deterministic gating mode: temperature 0 (or k-samples with aggregate scoring where sampling is the product), pinned everything, mocked/pinned external dependencies.
- [ ] Hermetic per-item execution; then run the **shuffle test** (two orderings, scores must match within noise) and an **A/A run** (same config twice) to measure the flake band (`../principles/cost-and-scalability.md` §3, `../principles/regression-testing-and-edd.md` §1).
- [ ] Caching: generations keyed on (input, system hash); verdicts on (input, output, judge hash).
- [ ] Output: per-item results with transcript refs + per-stratum scores with **Wilson/bootstrap CIs** — never a bare topline (`../principles/statistical-rigor.md`).

**Exit criterion:** two consecutive A/A runs with recorded band; shuffle test flat.

## Step 5 — Wire the CI gates (half a day)

Tiered per `../principles/regression-testing-and-edd.md`:
- **Tier 0 (per-PR, blocking):** deterministic checks + 30–100-item smoke slice, minutes.
- **Tier 1 (per-merge/nightly, blocking):** full dev set, paired comparison (McNemar / paired bootstrap) against a *pinned baseline run*; blocking threshold ≥ max(A/A band, MDE) — derived, not vibed; warn band below it.
- **Tier 2 (per-release):** held-out set + human-eval sample + judge recalibration check; baselines re-pinned; suite CHANGELOG updated.
- Overrides allowed, logged with written reasons; harness refuses cross-version comparisons without an explicit flag.

**Exit criterion:** a deliberately-broken test change gets blocked by Tier 0/1; the override path works and logs.

## Step 6 — Institutionalize maintenance (ongoing; schedule it now or it won't happen)

- **Weekly:** A/A canary; flake-quarantine review.
- **Per incident:** production failure → scrubbed/synthesized item in the suite within a week (`../principles/production-offline-gap.md` §4).
- **Quarterly:** traffic-weight audit; distribution-drift check; judge recalibration; held-out refresh from the never-seen vault; coverage review vs. current product shape; read the override log.
- **On any instrument change** (labels, judge, strata): same-day baseline re-run + CHANGELOG discontinuity note.
- Name an owner. Suites without owners rot in ~2 quarters (`../principles/regression-testing-and-edd.md` §3).

**Exit criterion:** the calendar entries exist and name a human.

---

## Compressed checklist (print this)

0. Claim sentence + decision named ▢
1. Binary criteria, gaming notes, pathological policy, rubric reviewed ▢
2. Stratified versioned golden set, provenance, dev/held-out split, MDE documented, contamination-scanned ▢
3. Scoring at highest trust rung; judge calibrated (κ ≥ 0.7) and bias-probed; config hashed ▢
4. Hermetic harness; A/A band measured; shuffle test flat; CIs on everything ▢
5. Tiered gates with derived thresholds; override logging ▢
6. Maintenance calendar + owner ▢

## Related
Every step deep-links above. For auditing an eval someone else built: `audit-existing-eval-setup.md`. For orchestrating agents to parallelize steps 2–4: `../principles/multi-agent-orchestration.md`.
