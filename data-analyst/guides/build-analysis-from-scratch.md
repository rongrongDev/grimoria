# Guide: Build an Analysis From Scratch

**Version 1.0.0 · 2026-07-06.** The end-to-end path from raw business question to
presented finding (Capability A). Standalone: each phase names its deep-dive doc,
but the checklists here are sufficient to execute. Written to be followed
literally by a junior analyst or a smaller model.

The phases are ordered so that **each one can kill the project cheaply before the
next one gets expensive.** Do not reorder; most analysis disasters are a later
phase run before an earlier one (SQL before metric definition; presentation before
power).

---

## Phase 0 — Interrogate the question (30–60 min, mostly conversation)

Raw questions arrive broken: "How is engagement doing?" "Did the redesign work?"
Convert to an answerable form by extracting four things from the asker:

1. **The decision:** "What will you do differently depending on the answer?" (`principles/core-principles.md` §1 — no decision, no analysis; offer a dashboard link instead.)
2. **The population:** which users/orders/period, and — always ask — who should be *excluded* (internal, test, bots, enterprise)?
3. **The comparison:** "doing well" against what — last quarter, target, another segment? A number without a comparator is trivia (`topics/data-visualization.md` §4).
4. **The bar and the deadline:** what result size would change the decision (this becomes the MDE in Phase 4 and the decision threshold in Phase 5 — get it *now*, before results exist, per `topics/stakeholder-communication.md` §2), and when is the decision being made regardless of you?

Write the reformulated question in one sentence and get a "yes, that's it" from
the asker **in writing**. Example conversion: "How is engagement doing?" →
"Did weekly core-action rate per activated user change after the June pricing
change, relative to the pre-June trend, excluding internal and API-only accounts?"

## Phase 1 — Define the metric before touching data (30 min)

Fill the metric spec from `topics/metric-design.md` §2 — even for a one-off,
because the act of filling it surfaces the ambiguities cheaply: population,
numerator, **denominator**, grain, time basis + zone, NULL policy, sources.

- First check whether a governed definition already exists (semantic layer, dbt metrics, spec repo). **Using an existing definition beats writing a better one** — a locally-better variant that disagrees with the dashboard everyone watches becomes a reconciliation fire (`topics/metric-design.md` §1).
- If your question needs a variant, name it as a variant (`activation_rate_7d_strict`), never reuse the canonical name.

## Phase 2 — Profile the sources before trusting them (30–60 min)

Principle 7: the data model lies to newcomers. For every source table, run and
*record* (in the analysis doc/notebook — these numbers are your later alibi):

```sql
SELECT COUNT(*), COUNT(DISTINCT <expected_key>),          -- grain check: equal?
       MIN(<event_ts>), MAX(<event_ts>),                  -- coverage & freshness
       COUNTIF(<key_column> IS NULL)                      -- NULL burden
FROM source;                                              -- + top-10 values of each
                                                          --   categorical you'll filter on
```

Kill criteria at this phase: the grain isn't what the schema implies; the history
doesn't cover your window; a filter column is 40% NULL with no documented policy.
Any of these → back to Phase 1 (redefine against real data) or escalate the data
gap as the finding (`principles/core-principles.md` §10) — do not push through.

## Phase 3 — Write the SQL under the correctness rules (varies)

Apply `topics/sql-correctness.md` as you write, not as a post-hoc check:

- CTE pipeline, each CTE ending at a **stated grain** (`-- grain: one row per user per day`); row-count sanity check after each join against the expected grain (§1 fan-out);
- Half-open date ranges only (§4); explicit timezone conversion exactly once (§3); NULL policy from the Phase 1 spec made explicit with `COALESCE`/`IS DISTINCT FROM` (§2);
- Partition-column filters for scan discipline (§6).

Then validate against **external anchors** before believing any number: does the
population total roughly match a known dashboard / finance number / last quarter's
deck? A 3× mismatch at this step is almost always your join or their definition —
find out which *now*, not after publishing. If the metric is decision-critical,
run the `metric-definition-auditor` skill on your own SQL — self-review catches
about half of what it catches when run by someone else, but half is worth ten
minutes.

## Phase 4 — If the question is causal, get a design (gate, not a step)

The question contains "did X cause/drive/work?" → descriptive data cannot answer
it at any sample size (`topics/statistical-pitfalls.md` §2). Route:

- Randomization possible (including holdouts/staged rollouts/encouragement) → design the experiment per `topics/experiment-design.md`: **power first** (n from baseline + the MDE the asker gave you in Phase 0 — the `experiment-design-reviewer` skill's reference table does the arithmetic), randomization unit via the §2 decision tree, one primary metric, guardrails, committed horizon. Run the plan through the `experiment-design-reviewer` skill before launch.
- Not possible → `topics/causal-inference.md` §1 decision tree (DiD / RDD / honesty-tier matching), with the assumption and falsification checks named in the deliverable.
- Neither available and the deadline is now → answer descriptively with the causal question explicitly left open: "adopters retain 8pp better; we cannot yet say the feature causes this; here's the test that would."

**The asker will pressure you to skip this phase** ("we just need directional").
The +4%-that-wasn't (`principles/core-principles.md` §1) was "just directional."
The compromise that works: give the descriptive number *labeled as such*, plus the
cost of being wrong and the design that would settle it.

## Phase 5 — Analyze with uncertainty attached (varies)

- Effect size + CI first, p-value second (`topics/experiment-design.md` §7); Welch not Student's, `validate=` on merges, seeds set if in Python/R (`topics/python-r-analysis.md`);
- Run the pitfall sweep on your own result before anyone else sees it — the five detectors in `topics/statistical-pitfalls.md`'s summary table (mix shift? selection in the cohort? extreme-selection remeasured? survivors only? who-chose-the-treatment?);
- Compare the result against the Phase 0 bar: cleared / missed / straddles. "Straddles" is a legitimate finding with its own recommendation shape (`topics/stakeholder-communication.md` §2's second example).

## Phase 6 — Present for the decision (1–2 hrs)

Build the deliverable per `topics/stakeholder-communication.md`: BLUF structure,
estimate + range + recommendation-with-confidence, p-values translated, caveats
ranked by decision impact (≤3 in the body), charts chosen per
`topics/data-visualization.md` §1 (claim first, form second; bars from zero;
no dual axes). Appendix links the exact queries and pins snapshot dates
(`principles/core-principles.md` §6 — if you can't regenerate it, don't publish).
For exec-facing or launch/kill results, route through the validity-gate pipeline
(`principles/multi-agent-orchestration.md` §2) — the `analysis-narrative-drafter`
subagent drafts *after* the gate, never before.

## Phase 7 — Close the loop (15 min, weeks later — calendar it now)

Log what was decided and predicted. When ground truth arrives (the rollout's
actual numbers), compare. This is the only calibration signal an analyst gets, it
is the fastest credibility-builder that exists in this job, and almost nobody does
it. Book the reminder before you archive the project.

---

## The whole guide as a kill-switch checklist

| Phase | Proceed only if |
| --- | --- |
| 0 | a decision + comparator + bar are written and confirmed |
| 1 | spec complete; canonical definition reused or variant explicitly named |
| 2 | grain/coverage/NULL profile recorded; no kill criterion tripped |
| 3 | grains stated; row counts reconcile; external anchor within explanation |
| 4 | causal claim has a design, or deliverable demoted to descriptive |
| 5 | pitfall sweep run; result stated as estimate + interval vs. the bar |
| 6 | BLUF; queries linked; gate passed if exec-facing |
| 7 | prediction logged; follow-up scheduled |
