# Experiment Design & A/B Testing Statistics

**Version 1.0.0 · 2026-07-06 · Core tier — full depth.**
Applies to: fixed-horizon frequentist testing as the default methodology, with
sequential/Bayesian alternatives noted where they change the rules. Standalone doc;
the pre-launch review procedure built on it is the `experiment-design-reviewer`
skill (`.claude/skills/experiment-design-reviewer/`), which also carries a
sample-size reference table.

An A/B test is a measurement instrument. Every failure below is a way of building an
instrument whose needle moves for reasons other than the treatment — and then reading
the needle anyway.

---

## 1. Underpowered tests (decide sample size BEFORE, never after)

**Failure mode.** Launching without computing the sample size needed to detect the
effect you care about. Underpowered tests don't just miss real effects — when they
*do* show significance, the estimated effect is inflated (winner's curse / Type M
error), so you ship "wins" that shrink or vanish at full rollout.

**War story — "the +4% that wasn't"** (told fully in
`../principles/core-principles.md` §1): p = 0.11 on a test powered only for 8% lifts,
shipped anyway, real effect ≈ 0. The tell was available *before launch*: one power
calculation would have said "this test cannot answer your question in two weeks."

**The pre-launch arithmetic (memorize the shape, not the constants):**
```
n per arm ≈ 16 × p(1-p) / MDE²          -- proportions, α=.05 two-sided, power=.80
```
Example: baseline conversion p = 5%, minimum detectable effect (MDE) = 0.5pp
absolute → n ≈ 16 × 0.0475 / 0.000025 ≈ **30,400 per arm**. If you get 3,000
users/day/arm, that's 10 days minimum — *and you committed to that horizon*.
For means: `n ≈ 16σ²/MDE²`. The `experiment-design-reviewer` skill ships a lookup
table (`power-reference.md`) so no one re-derives this under deadline pressure.

**Detection (of an already-run underpowered test).** Compute the MDE the achieved
sample *could* detect. If observed |effect| needed to be ≥ MDE to reach significance
and the business case assumed something smaller, the test was unanswerable as run.

**Fix.** More sample (longer run, higher traffic %), a bigger-MDE question, variance
reduction (CUPED — using pre-experiment behavior as a covariate typically cuts
required sample 20–50% on retention/engagement metrics), or an honest "we cannot
measure this."

**Prevention.** Power calculation is a *launch gate*: no experiment enters the queue
without (baseline, MDE, α, power, computed n, committed end date) written in the
experiment doc. That's checklist item #1 in the `experiment-design-reviewer` skill.

---

## 2. Randomization unit (and the unit-of-analysis trap)

**Failure mode A — wrong unit for the treatment.** Randomize by session or request
when the treatment is visible to users → the same user sees both variants,
contaminating both arms (and infuriating users on price tests).

**Failure mode B — analyze at a finer grain than you randomized.** Randomize by
user, analyze per-pageview: pageviews from the same user are correlated, your
effective sample size is far smaller than your row count, and standard errors are
understated → false positives at several times the nominal rate. This is the most
common *silent* validity bug in homegrown experiment analysis.

**Detection.** Ask two questions of any results readout: "what unit was randomized?"
and "what unit is a row in the analysis?" If they differ, demand to see how the
correlation was handled. Symptom-level tell: implausibly many significant results
from a modestly-sized test.

**Fix.** Analyze at the randomization unit (aggregate to one row per user first), or
use the delta method / cluster-robust standard errors for ratio metrics like
CTR-per-user.

**Prevention.** Decision tree, applied at design time:
- Treatment visible to a logged-in user across visits → **randomize by user** (stable ID, not cookie, if cross-device matters).
- Pure backend change invisible to users (ranking latency, cache policy) → session or request randomization is acceptable *and* gives more power.
- Marketplace/social/network products → user-level randomization leaks through interference (both arms share the same seller pool / feed content); consider cluster (geo, time-slice) randomization and say so explicitly in the design.

Also at design time: define the **exposure point** (randomize at the moment of
eligibility, not at account creation) — diluting the test with never-exposed users
destroys power silently.

---

## 3. Peeking / early stopping

**Failure mode.** Checking results daily and stopping when p < 0.05. Each look is
another chance for noise to cross the line: peeking daily at a 4-week fixed-horizon
test pushes real false-positive rate from 5% toward 25–30%. The dashboard *invites*
this — significance is most likely to appear spuriously early, when samples are
small and estimates wild.

**Detection (auditing a past test).** Compare declared end date vs. actual stop
date. Stopped early "because it hit significance" with no sequential design on file
⇒ treat the result as unproven. No declared end date at all ⇒ same.

**Fix / legitimate alternatives.** (1) Fixed horizon: commit to n and end date, look
at guardrails during the run (for safety aborts only — see §6), read the decision
metric once, at the end. (2) If business genuinely needs early decisions, use a
*pre-registered* sequential method — group-sequential alpha-spending (O'Brien-Fleming
bounds) or always-valid inference (mSPRT, as in several commercial platforms). These
buy legal peeking by paying with a wider final confidence interval — a fair price,
but only if chosen *before* launch, never retrofitted.

**Prevention.** The experiment platform/dashboard should not display the decision
metric's p-value before the committed horizon (show guardrails + sample-ratio
checks instead). Culture rule: "stopped early = didn't happen" unless a sequential
plan was on file.

---

## 4. Multiple comparisons

**Failure mode.** Twenty metrics × five segments = 100 tests: five will be
"significant" by chance. The failure has a signature: the shipped result is a
significant effect *in a segment nobody planned to examine* ("it works for Android
users in DE!"). Also known as HARKing when the story gets written afterward.

**Detection.** Count the tests actually examined (metrics × segments × variants),
not the ones reported. If the writeup's headline effect wasn't in the pre-registered
hypothesis, it's exploratory, whatever the p-value says.

**Fix.** One **primary decision metric**, declared in advance — that one keeps
α = 0.05. Secondary metrics: report with Benjamini-Hochberg FDR correction, labeled
"supporting evidence." Post-hoc segment findings: label as hypotheses; confirm in a
follow-up test before acting. Bonferroni for the rare case where several metrics are
each individually decision-carrying.

**Prevention.** The experiment template has exactly one primary-metric slot. Segment
analyses planned in advance are listed in the doc; anything else is automatically
labeled exploratory in the readout. The `analysis-narrative-drafter` subagent
enforces that labeling in write-ups.

---

## 5. Novelty and primacy effects

**Failure mode.** A visible change spikes engagement because it's *new* (novelty) or
tanks because users must relearn (primacy). A two-week readout captures the
transient, you ship, the effect decays. Recommendation-feed and UI-redesign tests
are the classic victims.

**Detection.** Plot the treatment effect *by day-of-exposure* (not calendar day). A
lift that shrinks monotonically across exposure days is decaying novelty. Also
compare effect on brand-new users (no prior habit → no novelty/primacy) vs. tenured
users: divergence is the signature.

**Fix.** Extend the run until the day-over-day effect stabilizes; base the ship
decision on the plateau (or on the new-user cohort, who best represent the long-run
future population).

**Prevention.** Any user-visible change: minimum two full weeks (also covers
weekday/weekend cycles — never run 10 days; run 7 or 14), day-of-exposure curve
included in the standard readout template.

---

## 6. Guardrail metrics & sample-ratio mismatch

**Guardrails** (see `metric-design.md` §5 for choosing them): every test declares
2–5 metrics it must *not* degrade (latency, crash rate, unsubscribe, revenue when
optimizing engagement, long-run retention when optimizing short-run conversion).
Guardrails are the one thing you *may* monitor mid-run — with a stricter threshold
(e.g., α = 0.01 and a practical-significance floor) since they're safety brakes, not
decision metrics.

**Sample-ratio mismatch (SRM) — the smoke detector.** A 50/50 test that lands
50.4/49.6 on a million users is *not fine* — a chi-square test will flag it
(p < 0.001 territory). SRM means the assignment or logging mechanism is broken
(bot filtering differs by arm, variant crashes drop users, redirect drops slow
clients), and **every downstream number is untrustworthy, especially the flattering
ones**. Check SRM before reading any result; automate it into the platform. An SRM'd
test is rerun, not "corrected."

---

## 7. Reading the result honestly

- Report effect size + CI first, p-value second: "+1.8pp conversion, 95% CI
  [+0.3, +3.3], p = 0.02" — the CI is what the decision-maker needs.
  Translation patterns for stakeholders: `stakeholder-communication.md` §3.
- **Statistical ≠ practical significance:** with huge n, +0.05% can be p < 0.001 and
  still not worth the code complexity. The MDE you set in §1 was the practicality
  bar — hold to it.
- A non-significant result is "the effect, if any, is smaller than our MDE" — not
  "there is no effect," and not "it failed." With the CI, that's often a genuinely
  useful answer ("any true lift is under 2%; not worth the maintenance cost").

---

## Failure-mode summary table (for auditors)

| Failure | Detection | Fix | Prevention |
| --- | --- | --- | --- |
| Underpowered launch | recompute achievable MDE vs. business-case effect | more n / CUPED / bigger question / don't run | power calc as launch gate |
| Unit mismatch (randomize user, analyze pageview) | compare randomization unit vs. analysis row grain | aggregate to user / delta method / cluster SEs | unit decision tree in design doc |
| Peeking / early stop | stop date vs. committed horizon; no horizon on file | rerun, or pre-registered sequential design next time | hide decision-metric p until horizon; "stopped early = didn't happen" |
| Multiple comparisons | count tests examined; headline ≠ pre-registered hypothesis | BH-correct secondaries; re-test post-hoc findings | single primary-metric slot in template |
| Novelty/primacy read as durable | day-of-exposure effect curve; new vs. tenured split | run to plateau; decide on stabilized effect | ≥2 full weeks for visible changes; curve in readout template |
| SRM (broken assignment) | chi-square on arm counts | find mechanism bug; rerun | automated SRM check blocking readouts |

**Cross-references:** pre-launch review procedure — `experiment-design-reviewer`
skill; what to do when you can't randomize — `causal-inference.md`; the pitfalls
that bite when interpreting segments and cohorts — `statistical-pitfalls.md`;
communicating results — `stakeholder-communication.md`.
