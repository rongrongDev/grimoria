# Statistical Pitfalls in Observational Analysis

**Version 1.0.0 · 2026-07-06 · Core tier — full depth.**
Applies to: any analysis of non-randomized data — dashboards, cohort reports, funnel
analyses, "why did metric X move" investigations. Standalone doc. Companion docs:
`experiment-design.md` (when you *can* randomize), `causal-inference.md` (formal
methods when you can't).

These five pitfalls share one root: **the data you can see was selected by a process
you aren't modeling.** Each entry: failure mode → detection → fix → prevention, plus
the concrete wrong decision it has caused.

---

## 1. Simpson's paradox (aggregation reverses the truth)

**Failure mode.** A relationship that holds in every subgroup reverses in the
aggregate because group sizes differ across a confounding dimension. Real case: a
support org "proved" the new ticket flow was slower — average resolution time rose
15%. Per-category, it was *faster* in every category. The new flow had absorbed a
flood of hard billing tickets that the old flow used to route elsewhere; mix shift,
not slowdown. The org nearly rolled back an improvement.

**Detection.** Any time you compare rates or averages across two systems, periods,
or arms: break the comparison down by the 2–3 most plausible mix dimensions
(segment, category, platform, tenure). If subgroup and aggregate disagree, you've
found it. Trigger phrase in stakeholder requests: "overall average went up/down" on
a population whose composition is not fixed.

**Fix.** Report the stratified comparison, and if one number is required, use a
fixed-mix (standardized) average: apply both periods' per-group rates to a *common*
group-weight vector. Say which weights you chose and why.

**Prevention.** Dashboard convention: any headline rate whose population mix can
shift ships with a mix-monitor tile (group shares over time) next to it. Review
question: "could this average have moved because the *mix* moved?"

---

## 2. Correlation read as causation

**Failure mode.** "Users who enable feature X retain 2× better — let's push everyone
to enable X." Users who enable X are power users; the enabling didn't cause the
retention, the engagement caused both. Companies have spent quarters building
onboarding flows to force-feed a feature whose "effect" was 100% selection.

**Detection.** For any claim shaped like "doers of A have better B": ask *who
chooses to do A?* If the answer correlates with B on its own, the comparison is
confounded. Cheap falsification probe: check the *pre-period* — if future-X-enablers
already retained better **before** enabling X, selection is proven (this is the
observational analog of a pre-trend check).

**Fix.** To make the causal claim, get a design: randomize the nudge toward X
(encouragement design), or use the quasi-experimental toolkit
(`causal-inference.md`). To stay honest without a design, rewrite the claim:
"X-enablers retain better; we cannot yet attribute this to X" — and propose the test.

**Prevention.** Language rule enforced in review and by the
`analysis-narrative-drafter` subagent: *drives / causes / because of / impact of*
require an identified design; otherwise write *associated with*. It reads pedantic;
it prevents roadmaps built on selection effects.

---

## 3. Selection bias in cohort definitions

**Failure mode.** Defining a cohort by a condition that embeds the outcome. The
classics:
- "Users active in month 3" analyzed for what they did in months 1–2 → conditioning on survival.
- "Churned users all had few sessions in final week" → of course; they were leaving. (Direction of time confused.)
- Comparing "users acquired via channel A vs. B" on retention when channels launched in different quarters → cohort age confounded with channel.
- Dashboard filtered to `status = 'active'` used to study churn drivers → the churned rows were filtered out of the study of churn.

**Detection.** Write the cohort definition as a sentence and check: *does membership
depend on anything that happens after the analysis window starts, or on the outcome
itself?* Also compare cohort size against the known population — a cohort that's
suspiciously small usually lost people through the definition.

**Fix.** Define cohorts by conditions knowable **at cohort entry time only**
(acquisition date, first action, assignment), then follow everyone forward,
including the ones who disappear. Attrition is data, not noise to filter.

**Prevention.** Cohort-definition template with a mandatory field: "entry condition
(must be observable at entry)" + "does any filter reference post-entry behavior?
(must be NO)". This is a checklist line in `../guides/audit-existing-analytics.md`.

---

## 4. Regression to the mean

**Failure mode.** Select the extreme, watch it become less extreme, credit the
intervention. "We coached the 20 worst-performing sales reps; next quarter they
improved 30%!" — the bottom 20 by *one quarter's* numbers are disproportionately
unlucky, and would have bounced back untouched. Same mechanism: "we emailed lapsed
users and 25% came back" (some were coming back anyway), "the worst-performing
stores improved after the audit."

**Detection.** The tell is **selection on an extreme value of a noisy metric,
followed by remeasurement of the same metric**. Ask: how were these units chosen?
If the answer is "they were the worst/best," expect regression before crediting
anything.

**Fix.** A control group drawn from the same extreme: coach half the bottom-20,
compare against the uncoached half. No control possible → estimate the expected
bounce-back from historical cohorts of past extremes ("of past bottom-20 quarters,
the average untreated next-quarter improvement was 22%") and report the increment
over that, not over zero.

**Prevention.** Review checklist question: "was this population selected because it
was extreme on the metric now being remeasured?" If yes, the writeup must name
regression to the mean and quantify or bound it.

---

## 5. Survivorship bias

**Failure mode.** Studying only the entities that survived to be observed. "Our
10-year customers all onboarded with a sales call — sales calls create loyalty!"
(You never see the sales-call customers who churned in year one.) "Top apps all do
X" (so did the dead ones). Internally: averaging metrics over "currently active
accounts" and reading the trend as improvement, when the trend is churned accounts
exiting the denominator.

**Detection.** Ask: *what would this dataset look like if the effect were zero but
attrition were selective?* If indistinguishable, you have survivorship. Structural
tell: any table that only contains current/successful entities (an `active_users`
table, a CRM of current customers) being used to answer a question about causes of
success/failure.

**Fix.** Reconstruct the full entry cohort (from event logs / snapshots, which is
why `dashboard-reliability.md` §4 insists on snapshotting), and analyze survivors
*and* non-survivors. If the dead rows are truly unrecoverable, say the analysis is
conditional on survival and refuse causal framing.

**Prevention.** Warehouse convention: soft-delete + daily entity snapshots, never
hard-delete, so history is reconstructable. Review question: "who is missing from
this table, and did they leave for reasons related to the outcome?"

---

## The five, compressed (for auditors)

| Pitfall | One-line detector | One-line prevention |
| --- | --- | --- |
| Simpson's paradox | subgroup trend ≠ aggregate trend | mix-monitor tile beside any headline rate |
| Correlation→causation | "who chooses the treatment?" has an answer correlated with the outcome | causal verbs require a design (language rule) |
| Selection bias in cohorts | cohort membership references post-entry info | entry-time-only cohort template |
| Regression to the mean | selected on extreme, remeasured same metric | "how were units chosen?" checklist question |
| Survivorship | dataset contains only survivors | snapshots + "who's missing?" review question |

**Cross-references:** these checks run as Phase 3 of
`../guides/audit-existing-analytics.md`; the language rules are enforced by the
`analysis-narrative-drafter` subagent; formal fixes when causal answers are truly
needed — `causal-inference.md`.
