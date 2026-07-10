# Evaluation

**Last reviewed:** 2026-07-06 · **Applies to:** model-agnostic methodology; judge examples assume Claude 4.x–5 family.
**Read this when:** before building any feature (yes, before), and whenever anyone says "it seems better now."
**Related:** skill: `eval-suite-planner` (plans a suite for a feature) · subagent: `eval-suite-runner` (runs one and analyzes failures).

Evals are to LLM systems what tests are to code, with one brutal difference: code
without tests usually *crashes* when wrong; LLM systems without evals keep smiling.
An eval suite is the only instrument that lets you tell improvement from movement.

---

## 1. Building an eval set that reflects real usage

**Failure mode.** The eval set is written by the team, from the team's imagination.
It scores 96%. Production users — who paste stack traces, ask three questions in
one message, write in Portuguese, and send empty strings — experience something
much worse. The eval measured "does this work on inputs like the ones we
imagined," which was never the question.

**War story.** A doc-QA feature launched at 94% on a 150-case eval, all cases
written by the two engineers who built it. Week one: users asked comparative
questions ("what changed between v2 and v3 of this policy?") — a category with
*zero* eval representation, and a 40%-accuracy category as it turned out. The eval
was not wrong; it was answering a different question.

**Fix — sourcing hierarchy (use every layer you have access to):**
1. **Production logs** — the only ground truth for what users actually ask. Sample
   *stratified*, not uniformly: by length, language, topic cluster, and outcome
   signal (thumbs-down, retry, escalation — failures are over-informative).
2. **Failure reports** — every production incident becomes a permanent eval case,
   *before* the fix lands. This is how the suite compounds in value.
3. **Adversarial/edge synthesis** — injection payloads (`topics/prompt-design.md`
   §2), empty/huge/malformed inputs, off-topic requests, abstention-required cases.
4. **Imagined happy path** — fine as scaffolding on day one, when no logs exist.
   The failure is still *having only this* at month six.

Include **abstention cases** (correct answer: "I don't know" / refuse) at
realistic proportion, or you will train-by-selection a system that always guesses
(`topics/hallucination-and-reliability.md`).

**Prevention.** A quarterly drift check: sample 100 fresh production inputs,
compare their distribution (topic, length, type) against the eval set's. Divergence
= your eval is aging out of relevance.

## 2. The offline-eval vs. production-monitoring gap

**Failure mode.** Offline eval is green; production is degrading. Nothing
contradicts the eval — the eval just can't see: input drift, corpus staleness
(`topics/rag.md` §5), upstream format changes (`topics/prompt-design.md` §4),
model-provider behavior shifts, and every input category you didn't sample.
Offline evals answer "did *we* change something for the worse?" Production
monitoring answers "did *anything* change for the worse?" Teams that have the
first believe they have the second.

**Fix — a monitoring layer with three tiers:**
1. **Deterministic online checks (100% of traffic, free):** schema validity,
   citation-ID validity, tool-invocation policy violations, refusal keywords,
   latency, token counts, budget-cap hits.
2. **Sampled LLM-graded checks (1–10% of traffic):** groundedness
   (`rag-grounding-auditor` procedure), instruction adherence, tone. Same rubrics
   as offline evals so numbers are comparable across the offline/online boundary.
3. **User signals:** thumbs, retries, rephrase-rate (a user immediately rephrasing
   is a soft thumbs-down), escalations, abandonment.

Alert on *distribution shifts* in all three, not just absolute thresholds —
LLM regressions are usually a 10-point drift, not an outage.

**Prevention.** Close the loop: monitoring findings feed §1's sourcing pipeline.
The offline suite is the fossil record of everything monitoring ever caught.

## 3. LLM-as-judge: pitfalls and protocol

Using a model to grade outputs is the only way to scale evaluation of open-ended
generation. It is also a measurement instrument with known, large biases. Use it;
never use it *uncalibrated*.

**The bias catalog (each has bitten a real team):**
- **Self-preference:** models rate their own family's outputs higher. Judging
  Claude-vs-GPT outputs with either family as sole judge tilts the result.
- **Position bias:** in pairwise A/B comparison, judges favor one position
  (often the first). A judge that flips its verdict when you swap A and B has
  told you it wasn't judging content.
- **Verbosity bias:** longer answers score higher at equal correctness. Left
  uncorrected, your "quality improvements" will actually be length inflation.
- **Sycophancy toward the rubric's phrasing:** ask "rate how helpful this is"
  and scores cluster high; ask "list the errors, then classify severity" and the
  same outputs score notably lower. The second framing is closer to true.
- **Inconsistency:** same output, same rubric, different day (or temperature) —
  different score. A judge is a noisy sensor; treat single readings accordingly.

**War story.** A team A/B-tested two prompts with a pairwise judge and shipped the
"winner" (58% preference). Someone later re-ran with positions swapped: the winner
now *lost* 55/45. The entire measured effect was position bias. The shipped prompt
was, per human review, slightly worse.

**The protocol (non-negotiable parts):**
1. **Judge one tier above the judged model, different family where feasible**
   (`principles/decision-trees.md` §3).
2. **Pairwise comparisons: always run both orderings**; count only consistent
   verdicts, report the flip-rate as judge noise.
3. **Rubrics are decomposed and anchored:** not "rate 1–10" but separate binary
   checks — "does the answer include the escalation link? (yes/no)", "is every
   cited chunk ID present in the context? (yes/no)". Binary decomposed checks are
   dramatically more consistent than scalar vibes.
4. **Calibrate against humans:** 50–100 outputs graded by both; measure agreement
   (Cohen's κ). Below ~0.7 on a check → the check's rubric needs work, not more
   volume. Re-calibrate whenever the judge model version changes.
5. **Judge prompts are prompts:** versioned, evaled, pinned model ID
   (`topics/prompt-design.md` §5). A judge upgrade can move every dashboard in
   the company; it must be a deliberate, calibrated change.

## 4. Regression testing prompts and pipelines like code

**Failure mode.** A prompt tweak fixes the complaint of the day and silently
breaks three other behaviors. Serial accumulation of these = slow quality rot
with no single culprit commit. This is exactly the failure unit tests exist to
prevent, and the fix is exactly CI:

**The pipeline (minimum viable):**
- Every change to a prompt, few-shot set, retrieval parameter, tool description,
  or model ID triggers the eval suite in CI.
- **Gate:** aggregate score must not drop; *no individual previously-passing
  critical case may flip to failing* (aggregate gates hide targeted regressions —
  the refund-escalation-link story in `principles/core-principles.md` §2 was an
  aggregate-invisible, criticality-maximal regression).
- Non-determinism handling: temperature 0 where the task allows; otherwise run
  flaky-prone cases N=3 and gate on majority, and track per-case flip-rate — a
  case that flips across identical runs is measuring noise, fix the case.
- Cost control: a fast smoke tier (~30 cases, every PR) and a full tier (nightly
  + pre-release). Judge costs money; smoke tier uses deterministic checks mostly.
- **Report per-slice, not just aggregate** (slices from §1 stratification) —
  "94% overall" hiding "40% on comparatives" is the §1 war story again, in CI.

**Prevention-of-the-prevention-rotting:** eval cases get owners and review like
test code; dead cases (feature removed) get deleted; the suite has its own
CHANGELOG discipline — an eval suite nobody maintains converges on measuring
nothing.

---

## Starting from zero (the 1-day version)

No eval exists and you need one today: (1) 30 cases — 15 from logs if any exist,
10 edge/adversarial, 5 abstention; (2) binary pass criteria per case, written as
assertions where possible; (3) a script that runs them and prints a table;
(4) wire into CI on prompt-file changes. This modest object immediately beats the
alternative, which is vibes. Grow it via §1's sourcing hierarchy. The
`eval-suite-planner` skill produces this plan for a specific feature;
the `eval-suite-runner` subagent runs the suite and clusters the failures.

**Related:** `topics/hallucination-and-reliability.md` (groundedness metrics) ·
`topics/rag.md` (retrieval-specific eval: recall@k, labeled sets) ·
`topics/agents-and-tool-use.md` (trajectory-level assertions).
