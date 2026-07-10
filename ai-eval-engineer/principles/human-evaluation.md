# Human Evaluation Pipelines: Rubrics, Raters, and Reliability

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Applies to:** human annotation for LLM/agent evals; tooling-agnostic (Label Studio, Argilla, Scale/Surge-style vendors, spreadsheets-if-you-must)
**Audience:** standalone. Human eval is the ground-truth layer that LLM judges are calibrated against (`llm-as-judge.md`) — if this layer is broken, everything downstream inherits the breakage.

---

## When human eval is worth its cost

Human eval is slow and expensive; use it where it's irreplaceable, sample everywhere else.

**Use humans when:** establishing ground truth to calibrate an LLM judge; the domain needs real expertise (medical, legal, financial correctness); the criterion is genuinely subjective taste you're trying to *define*; safety-critical launch gates; or you're building the first golden set for a new task and don't yet know what failure even looks like.

**Don't use humans when:** the check is programmatic (exact match, tests pass); a *calibrated* judge already agrees with humans at kappa ≥ 0.7 on this item type; or you need per-commit turnaround — humans are a batch process, wire them in weekly/at-release, not per-PR (`regression-testing-and-edd.md`).

The stable production pattern is **hybrid**: humans define and periodically re-verify ground truth; a calibrated LLM judge scales it; disagreement and drift route back to humans.

---

## Rubric design for humans

Everything in `eval-design.md` about criteria applies double here, because human attention is your scarcest resource.

- **Binary or short-categorical items, not 1–10 scales.** Humans can't hold a stable 10-point scale across a session; two raters *each internally consistent* will still anchor differently. Every point of scale resolution you add costs you agreement.
- **One decision per item.** "Is it accurate and complete?" is two questions; raters resolve conflicts between them differently, and you can't tell which one failed.
- **Define the boundary, not the center.** Raters don't disagree on clearly-good or clearly-bad; they disagge at boundaries. The rubric earns its keep by legislating the boundary: "counts as an action item if the customer explicitly requests it, even conditionally ('if X, please Y')."
- **Include a decision rule for pathological cases:** refusals, empty outputs, off-topic-but-charming answers. Undefined cases become per-rater house rules — invisible until they diverge.
- **Pilot on 30 items with 2 raters before scaling.** Every rubric survives contact with real outputs worse than its author expects. Budget two pilot-revise cycles.

---

## Failure modes

### 1. Rubric ambiguity → low inter-rater reliability (IRR)

**War story.** A "faithfulness to source" rubric for a summarization eval: two expert raters, kappa 0.41. Root cause after adjudication: one rater counted *reasonable inference* from the source as faithful; the other counted anything not literally stated as a hallucination. Both were defensible readings of the rubric. Every downstream number — including the LLM-judge calibration that used these labels as "ground truth" — was measuring the rater lottery. The fix was one added sentence in the rubric ("inferences a careful reader would draw are faithful; new facts are not") plus 4 anchored examples; kappa went to 0.78.

- **Detection:** Always double-label a subset (≥ 20% or ≥ 50 items). Compute Cohen's kappa (2 raters) / Krippendorff's alpha (≥ 3, or missing labels) *per rubric item*, not just overall — an overall 0.75 can hide one item at 0.3. Never report raw percent agreement alone; 85% raw agreement on a 90%-pass-rate task is *worse than chance-corrected mediocre* (see GLOSSARY: inter-rater reliability).
- **Fix:** Adjudicate disagreements in a session with both raters; classify each as (a) rubric gap → rewrite the boundary rule, (b) rater error → retrain, (c) genuine irreducible subjectivity → either drop the item type from the eval or explicitly model it as distributional (report agreement rate as the signal). Re-pilot after rewriting.
- **Prevention:** IRR gate before any batch counts: kappa ≥ 0.7 on the pilot, or the rubric goes back. Rubric changes re-trigger the pilot. Run `.claude/skills/eval-rubric-reviewer/` on every new rubric before it ever reaches raters — cheaper than discovering ambiguity via kappa.

### 2. Annotator fatigue and drift

**War story.** A 400-item batch labeled by one expert across a long day. Items were served in fixed order. Pass rate for the first 100: 62%. Last 100: 79%. The model outputs were randomized across the batch — the *rater* drifted, getting more lenient as fatigue set in and edge cases stopped feeling edgy. Because item order correlated with nothing, this was pure luck to catch: someone plotted score vs. annotation timestamp on a hunch. That plot is now standard.

- **Detection:** Plot label distribution against annotation sequence/timestamp per rater. Trends = drift. Insert **gold items** (pre-adjudicated, known-answer items) at random positions throughout the session, ~5–10% of volume; per-rater gold accuracy over time is your drift alarm. A rater whose gold accuracy sags after item 150 is telling you the session is too long.
- **Fix:** Cap sessions (60–90 min or ~50–100 judgments, task-dependent); force breaks; randomize item order per rater (also decorrelates drift from any real temporal pattern in the data); re-anchor at session start with 3 known examples.
- **Prevention:** Bake session caps and gold-item injection into the annotation tool config, not into a guideline doc nobody re-reads. Dashboards show per-rater gold accuracy; a rater below threshold pauses automatically rather than contaminating the batch.

### 3. Insufficient annotator expertise

**War story.** Generalist crowd raters scored a medical-QA eval "for tone and helpfulness" — but the rubric included "is the medical claim accurate?" They Googled. A confidently-worded, dangerously-wrong dosage answer passed 5/5 raters because it *sounded* authoritative and matched the top search result's phrasing. A physician later flagged it in ten seconds. Confidence and fluency are precisely what non-experts use as proxies for correctness — the same bias LLM judges have (`llm-as-judge.md` §miscalibration), so using non-expert humans to calibrate a judge on expert content launders the bias into "ground truth."

- **Detection:** Qualification exam with items where surface plausibility and correctness *diverge* (plausible-wrong and awkward-right). Raters who can't separate them aren't qualified for correctness items, whatever their agreement stats look like — high IRR among unqualified raters means they share the same wrong proxy, not that they're right.
- **Fix:** Split the rubric by required expertise: generalists score format/tone/completeness; domain experts score only the correctness items (keeps expert cost bounded). If experts are unaffordable at volume, experts label a reference set that qualifies and audits everyone else.
- **Prevention:** Every rubric item declares its required rater qualification. The annotation pipeline enforces routing. Periodic expert audit of a random slice of generalist-labeled correctness calls.

### 4. Aggregation methodology (what to do with disagreement)

Majority vote is the default and it's often wrong:

- **Majority vote** treats a 2–1 split the same as 3–0. Fine for cheap triage; loses exactly the information (contested items) you most need for judge calibration and rubric improvement.
- **Better defaults:** record the *vote split*, not just the winner. Use unanimous items as high-confidence ground truth (judge calibration set); route split items to adjudication by a senior rater; track "% contested" as a rubric-health metric over time.
- **Weighted schemes** (weight raters by gold-item accuracy — lightweight Dawid-Skene): worth it at scale (many raters of varying quality); overkill for a 3-expert panel.
- **Never silently average Likert scores across raters** with different anchoring — you're averaging different rulers. Normalize per-rater (z-score) or use ranks, or better, don't use Likert (§rubric design).
- **Disagreement is data.** A stable 60/40 split on an item type usually means the rubric hasn't decided what quality means there. Either legislate it or report it as genuinely contested — don't let aggregation launder it into a crisp fake number.

---

## Pipeline architecture that holds up

1. **Intake:** versioned batch = (items, rubric version, rater pool, gold items seeded). Batch is immutable once launched.
2. **Qualification:** exam per rubric-item qualification level; store per-rater quals.
3. **Labeling:** randomized order, session caps, gold injection, blind to model identity/version ("which model made this" leaks preference exactly like judge metadata leaks — `llm-as-judge.md`).
4. **Reliability check:** per-item IRR on the double-labeled slice; fail → adjudicate → possibly re-run batch. This happens *before* anyone sees topline scores, or motivated reasoning will find a way to accept the batch.
5. **Aggregation:** per the rules above; contested items adjudicated; splits recorded.
6. **Storage:** labels stored with rater ID (pseudonymous), rubric version, timestamps — you will need to re-slice by all of these when something looks weird later. You always do.

**Cost reality check:** expert double-labeling runs $2–15+/item. This is why the calibrated-judge hybrid exists, and why every rubric ambiguity you fix *before* labeling pays for itself ~30× (pilot rework vs. batch rework). See `cost-and-scalability.md`.

---

## Related

- Rubric fundamentals and golden sets: `eval-design.md`
- What the human labels feed: `llm-as-judge.md` (calibration)
- Whether your IRR/sample sizes support the claims you make: `statistical-rigor.md`
- RLHF/preference-specific human-data issues: `../topics/rlhf-preference-data-evals.md`
- Skill: `.claude/skills/eval-rubric-reviewer/SKILL.md`
