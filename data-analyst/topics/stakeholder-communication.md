# Data Storytelling & Stakeholder Communication

**Version 1.0.0 · 2026-07-06 · Core tier — full depth.**
Standalone doc. Operationalized by the `analysis-narrative-drafter` subagent
(`.claude/agents/analysis-narrative-drafter.md`), which turns finished analyses
into stakeholder documents under these rules.

The analysis isn't done when the number is right. It's done when the decision-maker
understands what the number does and doesn't license — and most analytical value is
destroyed in this last mile, in one of two symmetric ways: overclaiming (uncertainty
stripped) or hedging into uselessness ("more research is needed").

---

## 1. Structure: answer first (BLUF)

Stakeholders read the first two sentences and skim the rest; write accordingly.

```
1. ANSWER      — the finding, in decision language, with the uncertainty inline
2. SO WHAT     — the recommended action and what evidence would change it
3. EVIDENCE    — the 2–3 load-bearing charts/numbers (not all of them)
4. CAVEATS     — the ones that could flip the decision (not a liability dump)
5. APPENDIX    — method, queries (linked, per core-principles.md §6), full tables
```

**Failure mode:** the methodology travelogue — three pages of "first we pulled the
data, then we joined…" before any finding. Its cause is usually the analyst writing
in the order they worked. Write the answer first; the reader's chronology is not
your chronology. **Detection:** can a reader who stops after two sentences act
correctly? **Prevention:** the narrative-drafter subagent structurally enforces
BLUF.

The caveats section has its own failure mode: **the 15-caveat liability dump**,
which buries the two caveats that matter under thirteen that don't and reads as
"ignore this section." Rule: caveats that could plausibly change the decision go in
the body, ranked; the rest go to the appendix.

## 2. Framing uncertainty honestly — without hedging into uselessness

The trap has two jaws. Overclaim ("conversion is up 2.1%") and the stakeholder
treats a noisy estimate as fact. Hedge everything ("it depends, more research
needed") and the stakeholder — who **will decide anyway, with or without you** —
decides uninformed, and stops inviting you.

The escape is a three-part sentence pattern: **estimate + range + recommendation
with confidence attached.**

> "Best estimate +2.1%, plausibly anywhere from +0.4% to +3.8%. Even the low end
> clears our 0.3% ship bar, so I recommend shipping — this is a call I'd make at
> roughly 90% confidence."

> "Best estimate +1.2%, but the range includes zero (−0.4% to +2.8%). If the
> decision can wait two weeks, we'll have enough data to tell; if it can't, I'd
> ship, because downside exposure is capped by the rollback plan — a 60/40 call."

Notice what does the work: the **decision threshold** (0.3% ship bar) turns an
interval into an answer. Whenever possible, establish that threshold with the
stakeholder *before* results exist ("what lift would justify shipping?") — it
converts "is it significant?" conversations into "did it clear the bar we agreed
on?" conversations, which are shorter and less political.

Visual version of the same rule: show the CI band, not just the point line; show the threshold as a
horizontal rule. A point estimate crossing a threshold reads differently when its
band straddles the line.

## 3. Translating statistics into decision language

Never hand a stakeholder a raw p-value; hand them what it licenses. Patterns:

| Instead of | Say |
| --- | --- |
| "p = 0.03" | "If the change truly did nothing, we'd see a difference this large about 3% of the time — strong but not overwhelming evidence it's real." |
| "not statistically significant (p = 0.20)" | "We can't distinguish this from no effect **with this much data** — and note we could only have detected lifts above ~2% (that was the test's resolution). It is NOT evidence of zero effect." |
| "95% CI [0.4, 3.8]" | "The data is consistent with anything from a small +0.4% to a large +3.8% improvement." |
| "the result was significant" (n=10M, +0.05%) | "Real but tiny: +0.05%. At our scale that's ~$40K/yr — against the maintenance cost of the feature, your call." |

The second row is the one that prevents wrong decisions: **absence of evidence
misread as evidence of absence** kills good features ("the test showed it doesn't
work") when the test was merely too small (see `experiment-design.md` §1, §7).

## 4. Pushback: when the number is being shopped for

The situation: a stakeholder has decided, and wants a number to armor the decision.
Signals: the request specifies the *conclusion* ("pull the data showing churn is
driven by pricing"), date ranges arrive pre-chosen and flattering, unfavorable
segments get requested-removed one at a time ("can we exclude enterprise? and
EMEA?").

**The scripts that work** (in escalating order):

1. **Reframe to the question.** "So the underlying question is what's driving churn — let me pull that properly. If it turns out to be pricing, you'll have a much stronger version of your slide, because it'll survive finance's scrutiny."
2. **Make the filtering visible instead of fighting it.** Show all segments/date ranges *including* the requested cut, labeled: "March–May shows +8%; full year shows −1%; here's both, with why they differ." You haven't accused anyone; the room can see. (An analyst who silently delivers only the flattering cut has co-signed it — their name is on the file.)
3. **Name the cost of being wrong, not the ethics.** "If we present the March-only number and the board asks about H2, we'll lose the room. Presenting the honest number with the March acceleration highlighted survives questions." Decision-makers respond to blast-radius arguments faster than to methodology arguments.
4. **The line that cannot be crossed:** you can present *their* preferred frame alongside the full picture; you cannot put your name on the flattering cut alone. Twenty years' observation: analysts who held this line were trusted with bigger questions within a year; the accommodating ones became report-pullers, then got automated.

**Prevention** beats scripts: agreed decision thresholds before results (§2),
pre-registered experiment metrics (`experiment-design.md` §4), and metric specs
(`metric-design.md` §2) all shrink the space available for shopping.

## 5. Know the altitude of your audience

Same finding, three altitudes — misjudging this is a comprehension failure you'll
misdiagnose as disinterest:

- **Exec:** decision, dollar/strategic impact, confidence, one chart. 5 sentences. They fund things — give the answer, not the journey.
- **PM/operator:** the above + which segments/mechanisms, what to do differently Monday, the interactive dashboard link.
- **Analyst peer:** the full appendix — queries, assumptions, robustness checks. This audience exists to find your mistakes; make it easy (that's a feature: better a peer finds the fan-out than the CFO).

---

## Failure-mode summary table (for auditors)

| Failure | Detection | Fix | Prevention |
| --- | --- | --- | --- |
| Methodology-first writeup | answer not in first 2 sentences | rewrite BLUF | narrative-drafter enforces structure |
| Uncertainty stripped in retelling | point estimate quoted without range downstream | range + threshold sentence pattern | agree thresholds before results |
| Hedge-everything paralysis | deliverable contains no recommendation | "what I'd decide at X% confidence" line required | same |
| p-value handed over raw | stakeholder asks "so is it good?" | §3 translation table | readout template uses translations |
| Number-shopping accommodated | conclusion-specified requests; serial segment removal | show-all-cuts-labeled; escalation scripts §4 | pre-registration + specs shrink the surface |
| Caveat liability dump | >5 caveats, unranked | rank by decision impact; rest to appendix | template caps body caveats |

**Cross-references:** what the statistics actually license —
`experiment-design.md` §7; causal-language rules —
`statistical-pitfalls.md` §2; the subagent that drafts under these rules —
`analysis-narrative-drafter`.
