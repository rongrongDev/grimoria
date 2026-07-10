# Core Principles of Trustworthy Analysis

**Version 1.0.0 · 2026-07-06 · Applies to: all analytical work regardless of tool.**
Standalone: readable with no other doc. Everything else in this KB is these ten
principles applied to a specific surface.

Twenty years of this job compresses to one sentence: **the expensive failures were
never math failures — they were failures to ask what the number would be used for,
what could make it wrong, and who would check.** The principles below exist because
I watched each one get violated at real cost.

---

## 1. The deliverable is a decision, not a number

Before touching data, write down: *what decision changes depending on what this
analysis finds?* If no decision changes, stop — you are producing a vanity artifact.
If a decision changes, the decision defines everything downstream: the metric, the
required precision, the deadline, and how honest you must be about uncertainty.

**War story — "the +4% that wasn't" (referenced KB-wide by this name):** A team ran a
two-week checkout test, saw +4% conversion at p = 0.11, and shipped because the
quarter was ending and the point estimate was positive. Nobody had computed power
beforehand; the test could only detect an 8% lift reliably. The true effect, measured
properly a quarter later on 5× the traffic, was indistinguishable from zero — but by
then two other teams had built roadmaps on the "4% win." The failure wasn't the
statistics; it was that nobody agreed *before launch* what evidence would justify
shipping. See `../topics/experiment-design.md` §1.

## 2. Every metric disagreement is a definition disagreement until proven otherwise

When two numbers for "the same thing" differ, the cause is almost never a bug in
arithmetic. It is: different populations, different denominators, different time
zones, different join paths, or different freshness. Ask "what exactly is the
numerator, the denominator, the population, the grain, and the time window in each?"
before reading a single line of SQL. This question resolves ~80% of reconciliations
in minutes. The full protocol lives in `../topics/metric-design.md` §4 and is
automated by the `dashboard-reconciliation-scanner` subagent.

## 3. Row counts before math

The single highest-yield habit in analytical SQL: after every join or filter, know
how many rows you expect and check how many you got. Silent join fan-out — a 1:N
join duplicating rows and inflating every downstream SUM — has produced more wrong
executive numbers than every statistical subtlety in this KB combined. Mechanics in
`../topics/sql-correctness.md` §1.

## 4. Decide the analysis before seeing the results

Sample size before launching, hypotheses before querying, success criteria before
peeking. Every degree of freedom you exercise *after* seeing data (choosing the
metric that moved, the segment that's significant, the date range that flatters) is
p-hacking, whether or not you meant it. The honest workaround when exploration is
the point: label it exploration, and confirm any finding on data that didn't
generate the hypothesis. See `../topics/experiment-design.md` §3–4 and
`../topics/statistical-pitfalls.md`.

## 5. Uncertainty is part of the answer, not a disclaimer

"Conversion rose 2.1% (95% CI: 0.4%–3.8%)" and "conversion rose 2.1%" are different
claims; only one is true. But hedging into uselessness is the equal-and-opposite sin
— a stakeholder who hears "it depends" makes the decision without you. State the
finding, the uncertainty, and *what you would decide* given both. Scripts and framing
in `../topics/stakeholder-communication.md`.

## 6. Reproducibility is table stakes

Any number you publish must be regenerable by someone else: the query saved and
linked, source tables and their snapshot/partition dates pinned, filters explicit,
random seeds set. "I can't reproduce my own March number" is not an anecdote — it's
the default outcome when this rule is skipped, because data beneath an unpinned query
keeps moving. If the number matters enough to share, it matters enough to link the
query.

## 7. The data model lies to newcomers

Column names describe intentions, not contents. `revenue` may be gross or net, may
include refunds or not, may be in cents. `user_id` may be nullable for guests.
`created_at` may be UTC or the office time zone of whoever built the pipeline in
2019. Profile before you trust: `COUNT(*)`, `COUNT(DISTINCT key)`, `MIN`/`MAX` of
dates, NULL rates, top-10 values of every categorical you rely on. Ten minutes of
profiling has killed more wrong analyses than any review process I ran.

## 8. Guard the guardrails

Any optimization pushed hard enough degrades something you didn't measure. Every
experiment ships with guardrail metrics (latency, unsubscribes, support tickets,
long-run retention); every north-star metric gets a counterweight. A team rewarded
on "emails opened" will send more email; only a paired guardrail (unsubscribe rate)
makes the metric safe to optimize. See `../topics/metric-design.md` §5.

## 9. Correlation earns a causal claim only through design

Not through sample size, not through a regression with controls, not through
conviction. Randomized assignment is the one clean path; when it's unavailable,
quasi-experimental designs (`../topics/causal-inference.md`) buy a weaker version at
the price of assumptions you must state and test. The phrase "drives," "causes," or
"because of" in a deliverable is a claim about design, and a reviewer should be able
to ask "what design?" and get an answer.

## 10. If you can't find it, that's a finding

An audit that reports "the metric's SQL is not version-controlled anywhere I can
locate" has found the biggest problem first. Never paper over missing lineage,
missing definitions, or missing experiment logs by reconstructing what they
"probably" were. Report the gap; the gap is the risk.

---

## Where each principle gets operational

| Principle | Deep dive | Callable |
| --- | --- | --- |
| 1, 4, 8 | `../topics/experiment-design.md` | `experiment-design-reviewer` skill |
| 2, 8 | `../topics/metric-design.md` | `metric-definition-auditor` skill |
| 3, 6, 7 | `../topics/sql-correctness.md` | `metric-definition-auditor` skill |
| 2, 10 | `../topics/dashboard-reliability.md` | `dashboard-reconciliation-scanner` subagent |
| 5 | `../topics/stakeholder-communication.md` | `analysis-narrative-drafter` subagent |
| 9 | `../topics/causal-inference.md`, `../topics/statistical-pitfalls.md` | — (judgment, not procedure) |
| all | `../guides/build-analysis-from-scratch.md`, `../guides/audit-existing-analytics.md` | — |
