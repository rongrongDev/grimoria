# LLM-as-Judge: Using a Model to Grade a Model Without Fooling Yourself

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Applies to:** any judge model (Claude 4.x/Fable 5, GPT-5.x, Gemini 3.x era); patterns are framework-agnostic (promptfoo `llm-rubric`, Braintrust scorers, LangSmith evaluators, custom)
**Audience:** standalone. Companion skill: `.claude/skills/judge-bias-auditor/SKILL.md`.

---

## The core mental model

An LLM judge is **an annotator you hired without an interview**. You wouldn't let an unvetted human annotator gate your launches; the judge gets the same treatment: a job description (judge prompt), a qualification exam (calibration against human labels), spot checks (drift monitoring), and known personality flaws you actively compensate for (biases below).

The judge is also *part of the eval system under test*. When you change the judge model or its prompt, your scores move even if the evaluated system didn't. Version the judge — model ID, prompt hash, temperature, everything — alongside the eval set (`regression-testing-and-edd.md`).

**A judge score is not ground truth. It is a prediction of what a competent human would say, and the calibration study is the only evidence that prediction is any good.**

---

## Judge prompt design

Rules that survived contact with production:

1. **Binary checklist items beat Likert scales.** "Rate helpfulness 1–10" produces scale drift, clustering at 7, and judge-model-version sensitivity. "Does the response include the refund amount? Y/N" is stable, auditable, and cheap to calibrate. Decompose holistic quality into 3–8 binary checks; aggregate in code, not in the judge's head.
2. **The judge sees the criteria, not your intent.** Everything the judge needs must be in the prompt: the input, the criteria, what to do with edge cases ("if the response refuses, score item 3 as N/A, not fail"). Judges resolve ambiguity *consistently but arbitrarily* — the most dangerous failure shape, because it looks like a working eval.
3. **Reasoning before verdict.** Require a short justification, then the verdict, in structured output (JSON). The reasoning is your audit trail — when calibration finds disagreements with humans, judge reasoning tells you whether the rubric or the judge is at fault. (Verdict-then-reasoning invites post-hoc rationalization of a snap verdict.)
4. **Give reference points.** For anything scale-like, include 2–3 anchored examples ("this response scores fail because..."). Few-shot anchors cut judge variance more than any other single intervention I've measured.
5. **Temperature 0, pinned model version, pinned prompt.** Any nondeterminism in the judge becomes flake in your CI gate (`regression-testing-and-edd.md`).
6. **Don't let the judge see metadata it shouldn't use.** Model names, "candidate A is the new version", timestamps — all leak preference. Blind the judge like you'd blind a human rater.

---

## The bias catalog: failure mode → detection → fix → prevention

### 1. Self-preference bias (judge favors its own family's style)

**War story.** We ran a pairwise eval between our system (Claude-based) and a competitor baseline, judged by the same Claude family. Our win rate: 68%. Re-judged with a different-family model: 55%. Re-judged by humans: 52% — a coin flip. The judge wasn't lying about quality; it was scoring "sounds like what I would have said" — same hedging idioms, same structure, same tone — as quality. We nearly shipped a "13-point win" that was style familiarity.

- **Detection:** Judge a fixed sample with two judges from different model families. If rankings flip or margins move by more than your CI noise band, you have judge-family effects. Cheaper tripwire: check whether the judge's win rate for same-family candidates exceeds its win rate for identical-quality cross-family pairs (build a small set where humans said "tie").
- **Fix:** For cross-family comparisons, use a judge from a third family, or a panel (2–3 judges from different families, majority/mean). For same-family comparisons (your model v1 vs v2), self-preference roughly cancels — panel is nice-to-have, not required.
- **Prevention:** Policy: any eval comparing across model families must not be judged solely by a model from a competing family in the comparison. Encode in eval-config review; the `judge-bias-auditor` skill checks this.

### 2. Position bias (pairwise comparisons favor a slot)

**War story.** A pairwise preference eval always put the new model's output second (the harness serialized "baseline, candidate" alphabetically by key name — nobody chose this). The judge favored the second position ~57/43 on literally identical outputs. Every candidate for a quarter got a free ~7-point tailwind. Discovered only when someone A/A-tested the harness — running model X against itself and getting 57% instead of 50%.

- **Detection:** **A/A test: run identical outputs through your pairwise judge.** Any deviation from 50/50 beyond sampling noise is harness/judge bias, full stop. This is the single cheapest, highest-value judge test; run it before trusting any pairwise number.
- **Fix:** Evaluate every pair twice with positions swapped. Consistent verdict → keep it. Contradictory verdicts → score as tie (or route to human). Report the flip rate — a flip rate above ~20% means the judge can't reliably distinguish the candidates at all, and your "win rate" is noise wearing a suit.
- **Prevention:** Position swapping is built into the harness, not left to eval authors. CI runs a periodic A/A canary; a drifting A/A result blocks the suite the same way a broken test would.

### 3. Verbosity bias (longer reads as better)

**War story.** A prompt change made outputs ~40% longer with zero new information — restated the question, added a summary of the answer it just gave. LLM-judged "quality" +6 points. Human raters, asked separately, *preferred the shorter one*. The judge conflated effort with value — length correlated with score at r ≈ 0.4 across the whole eval history once we finally plotted it. That plot should have existed from day one.

- **Detection:** Correlate judge score with output token count across your eval set. |r| > ~0.3 without a task reason (some tasks legitimately reward completeness) demands investigation. Direct test: take winning responses, produce meaning-preserving compressions (~60% length), re-judge. Scores dropping on content-identical text = verbosity bias, quantified.
- **Fix:** Add explicit anti-verbosity instructions and, more effectively, a binary conciseness item ("does the response contain sentences that add no information? Y = fail") so length is scored *against* separately instead of silently inflating other criteria. For pairwise: instruct "do not prefer a response for being longer; prefer the one a busy expert would rather receive."
- **Prevention:** The length-vs-score correlation is a standing dashboard panel on every judged eval. `judge-bias-auditor` runs the compression probe on demand.

### 4. Miscalibration against human ground truth

The umbrella failure: the judge systematically disagrees with competent humans, in any direction — too harsh on hedging, too lenient on confident nonsense (judges are notably bad at catching *fluent* wrongness — the classic case: a judge scoring a confidently-wrong math answer higher than a correct-but-awkward one, because it isn't actually redoing the math), or misreading domain-specific correctness it lacks expertise for.

- **Detection:** The **calibration study** — non-optional before a judge gates anything:
  1. Sample 100–200 items stratified across difficulty and score range (not just easy passes).
  2. Get human labels from qualified annotators using the same rubric (`human-evaluation.md`).
  3. Compute judge–human agreement (kappa for binary/categorical; also raw agreement per rubric item).
  4. **Read every disagreement.** The confusion matrix tells you *whether* it's broken; the disagreement transcripts tell you *what* is broken — rubric ambiguity, judge blind spot, or wrong human label (you'll find all three).
  - Rough bar: kappa ≥ 0.7 per item to gate launches; 0.5–0.7 usable for triage with human spot-checks; < 0.5, the judge is not measuring your rubric.
- **Fix:** Fix in this order — (1) rubric ambiguity (usually the real culprit), (2) judge prompt (add anchors covering the disagreement patterns), (3) judge model (upgrade or switch family), (4) scope reduction: route the item types the judge can't do to humans, keep the judge for what it's proven on.
- **Prevention:** Recalibrate on judge model change, judge prompt change, rubric change, or every quarter, whichever first. Keep the calibration set versioned and *held out* from prompt-iteration on the judge itself — otherwise you overfit the judge to its own exam (`contamination-and-leakage.md`).

### 5. Prompt sensitivity of the judge itself

**War story.** An engineer "clarified" a judge prompt — reworded one criterion, no semantic change intended. Suite-wide scores dropped 4 points. Three days of hunting a regression in the *product* before someone diffed the judge prompt. The scores were incomparable across the change, and nothing in the tooling had flagged it because judge prompts weren't versioned like code. That was the day they became versioned like code.

- **Detection:** Paraphrase-stability test: run 3 semantically equivalent judge prompt variants on a fixed 50-item sample. Score spread > your significance threshold means your metric is partly measuring judge-prompt wording. Also: any unexplained suite-wide shift → diff the judge config *first*, product second — it's the cheaper hypothesis.
- **Fix:** Reduce judge degrees of freedom: binary items, anchored examples, structured output. Wide variance across paraphrases usually means criteria are too holistic — decompose them.
- **Prevention:** Judge prompt + model + params live in version control with the eval set; changing any of them requires re-running the frozen baseline and recording a score-mapping note ("scores before/after this change are not comparable; baseline re-established"). CI refuses to compare scores across different judge-config hashes.

---

## Panels, ensembles, and when a judge is the wrong tool

- **Panel of judges** (2–3 different families, majority vote or mean): use for cross-family comparisons and high-stakes launch gates. Costs 2–3×; buys you independence from single-family quirks. Diminishing returns past 3.
- **Judge + programmatic hybrid:** let code check everything code can check (format, required fields, banned strings, length); the judge only scores what genuinely needs judgment. Cheaper, and shrinks the surface where judge bias can act.
- **Don't use an LLM judge when:** ground truth is programmatically checkable (rung 1–3 of the metric hierarchy in `eval-design.md` — a judge here adds noise and cost to something exact); the domain exceeds the judge's competence (specialist medical/legal — calibrate first, and expect to route to humans); or the eval's *purpose* is to detect judge-class biases (an LLM judging "is this LLM biased?" inherits the bias — see `multi-agent-orchestration.md` on judge-auditing-judge failure modes).

## Cost note

Judge calls often dominate eval cost — sometimes 10× the system-under-test cost when the judge is a frontier model scoring per-item checklists. Mitigations (details in `cost-and-scalability.md`): hybrid programmatic+judge scoring, smaller judge models *after* calibrating them against the big judge on your specific rubric, caching judge verdicts keyed on (input, output, judge-config hash).

---

## Related

- Rubric quality upstream of everything here: `eval-design.md`
- Human labels for calibration: `human-evaluation.md`
- Is that score delta real: `statistical-rigor.md`
- Skill: `.claude/skills/judge-bias-auditor/SKILL.md` — runs the detection probes above as a structured audit
