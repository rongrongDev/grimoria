# Multi-Agent Orchestration for Analytics Work

**Version 1.0.0 · 2026-07-06.** Standalone doc. Audience: humans coordinating AI
agents on analytics tasks, and orchestrating models deciding when to spawn
subagents. This doc is about *work topology* — it deliberately does not restate
the analytics content it routes to.

The organizing question is never "would more agents be nice?" but **"what property
does splitting buy — isolation, independence, or adversarial checking — and is it
worth the coordination tax?"** Most analytics tasks fit in one context and should
stay there.

---

## 1. The three legitimate reasons to split

**Context isolation.** The task requires reading volumes of material (every
dashboard in a BI instance, a full quarter of experiment readouts) where the raw
material would bury the calling conversation, and only a verdict needs to return.
This KB's `dashboard-reconciliation-scanner` and `analysis-narrative-drafter`
subagents exist for exactly this; their files state it as their reason.

**Independent judgment.** A reviewer who inherits the author's context inherits
the author's framing — including the wrong parts. A statistical-validity review
run in the thread that produced the analysis will anchor on the thread's
conclusion. Independence requires a *fresh context* given only the artifact and
the standards, not the journey. (Same reason human review works better on the doc
than over the author's shoulder.)

**Parallel fan-out.** N same-shaped, independent audit units (dashboards, metric
definitions, workbooks). Independence is a real constraint: units that write
shared state are not fan-out-able (§4).

If none of the three applies, don't split. A planner/implementer split for a
single funnel analysis is ceremony — one competent context does it better,
faster, with no relay loss.

## 2. The gating pattern: statistical-validity review before results ship

The highest-value orchestration in analytics, because the failure it prevents
(a wrong number in an exec deck) is expensive and one-way (`stakeholder trust,
once spent, doesn't refund`). Pipeline for any experiment readout or
board-level analysis:

```
author (analysis)  →  validity reviewer (fresh context, GATE)  →  narrative draft  →  human sign-off
```

- The **reviewer** receives: the analysis artifact, the experiment design doc, and the relevant KB checklists (`experiment-design.md`'s summary table, `statistical-pitfalls.md`'s five detectors, `sql-correctness.md`'s audit table). NOT the author's chat history — that's the independence property (§1). Its verdict is blocking: pass / pass-with-edits / rerun.
- The reviewer's charter is *validity only*: power actually computed? peeking? unit mismatch? fan-out in the SQL? causal verbs licensed by design? It does not opine on narrative or strategy — scope creep here turns a gate into a second author, and the two then negotiate instead of check.
- Only after the gate passes does `analysis-narrative-drafter` produce the stakeholder document — drafting before validation produces beautifully-worded wrong numbers, and (the empirical failure) **a polished narrative creates pressure to not re-open the analysis** when the reviewer then finds the flaw. Sequence is load-bearing: check, then polish. Never polish-then-check.

**When to invoke the full pipeline:** results feeding launch/kill decisions,
anything quoted to execs, any quasi-experimental causal claim
(`causal-inference.md` §1 explicitly routes high-stakes designs here). A weekly
metrics email does not need it. The gate costs ~an hour; calibrate to blast
radius.

## 3. Fan-out for estate-wide consistency audits

Auditing metric consistency across 60 dashboards is one task shape repeated 60
times — the canonical fan-out (`bi-tools.md` §3's "in Tableau you audit every
workbook" makes this unavoidable at scale). Pattern:

```
planner:      inventory surfaces (from BI usage metadata), define the per-unit
              extraction schema, pick the comparison keys
workers (N):  per dashboard/workbook — extract each metric's population, numerator,
              denominator, grain, timezone, filters into the schema (the
              metric-design.md §1 diff dimensions). Extract, don't judge.
reducer (1):  cluster same-named metrics, diff definitions, rank disagreements by
              decision-blast-radius, produce the reconciliation report
```

Three rules learned the expensive way:

- **Workers extract; one reducer judges.** If workers each decide "which definition is canonical," you get N incompatible canons and the reducer inherits a fight instead of a dataset. Canonicalization is a *global* decision made once, with the full inventory visible (and often it's a human decision — the reducer's job is to force the choice, not make it).
- **Fix the extraction schema before spawning.** Workers that free-form their findings produce unmergeable prose; the reducer becomes a re-reader of N reports, which is the context flood you were avoiding, relocated. The schema (the §2 spec fields of `metric-design.md`) *is* the coordination.
- **Workers report gaps as gaps** ("workbook logic not extractable — embedded in a data blend") per `core-principles.md` §10, rather than reconstructing what the metric "probably" is. A fabricated-under-pressure definition poisons the whole reconciliation, and you won't know which row lied.

## 4. Failure modes specific to multi-agent analytics

| Failure | Mechanism | Prevention |
| --- | --- | --- |
| **Correlation upgraded to causation in relay** | author writes "associated with"; summarizing/drafting agent 2 hops later writes "drives" — each hop shaves a hedge, and hedges are exactly what compresses away | causal-verbs rule (`statistical-pitfalls.md` §2) enforced *at the last agent before humans* (the narrative drafter), which re-checks claims against the stated design rather than trusting upstream prose |
| **Conflicting metric definitions born in parallel** | two agents, two workstreams, each "defines" checkout conversion slightly differently — the `metric-design.md` §1 war story at machine speed | single-writer rule: one agent (or human) owns metric-spec creation; all others *consume* specs by reference or file a request. Definitions are global state; parallel writers on global state is the classic race |
| **Confidence laundering** | each relay hop restates conclusions minus the caveats; three hops turn "weak evidence, one segment, exploratory" into a fact | caveats travel *structurally* (a `caveats:` field in the artifact schema that agents must copy forward), not as prose that summarization eats |
| **Redundant computation with divergent results** | two agents independently compute "the same" number via different queries; both appear in deliverables; recipients reconcile-or-distrust | computed numbers carry provenance (query link + snapshot date, `core-principles.md` §6); reducer diffs provenance before merging numbers |
| **Gate capture** | validity reviewer drifts into co-authoring, then approves its own suggestions | reviewer outputs verdict + findings list only; edits go back to the author context; reviewer never edits the artifact |

## 5. Decision rubric (compressed)

| Situation | Topology |
| --- | --- |
| Routine analysis, one question | single context, no split |
| Launch/kill or exec-facing readout | author → validity gate → narrative drafter (§2) |
| Estate-wide audit (>~10 same-shaped units) | planner → schema'd workers → single reducer (§3) |
| High-stakes quasi-experimental claim | author + adversarial reviewer charged with *breaking* the identification (`causal-inference.md` §1) |
| Bulk material must be read, verdict returned | one isolation subagent (`dashboard-reconciliation-scanner` / `analysis-narrative-drafter`) |

**Cross-references:** the subagent definitions implementing §1 —
`.claude/agents/dashboard-reconciliation-scanner.md`,
`.claude/agents/analysis-narrative-drafter.md`; the skills usable as gate
checklists — `experiment-design-reviewer`, `metric-definition-auditor`; the audit
guide that embeds the fan-out — `../guides/audit-existing-analytics.md` Phase 4.
