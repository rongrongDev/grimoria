# Guide: Build a Red-Team Program From Scratch

> **Version 1.0 — 2026-07-06.** Capability A. A start-to-finish runbook for standing up a model red-team program at the methodology level. Assumes you have read [core-principles](../principles/core-principles.md); each step links the principle it operationalizes. Produces no attack content at any step.

Use this when you have a model (or a plan for one) and no program, or an ad-hoc effort you need to formalize. Follow the phases in order; each produces a concrete artifact. By the end you have a coverage matrix, a human+automated testing approach, a severity/triage system, and a reporting pipeline that feeds verified fixes back into the model.

---

## Phase 0 — Frame the program (before any testing)

**Do:**
- Write the *scope*: which model/checkpoint, which deployment surfaces (chat, API, agentic, each language and modality), which harm categories are in-scope for the first cycle. Under-scope deliberately; a small program that finishes beats a grand one that stalls.
- Decide *program maturity target* for this cycle: are you standing up basics, or hardening an existing effort? Set expectations accordingly.

**Artifact:** a one-page scope doc.
**Principle:** [program-design](../principles/program-design.md).

## Phase 1 — Build the coverage matrix

**Do:**
- Rows = harm categories from [harm-taxonomy](../principles/harm-taxonomy.md). Include the catastrophic-potential and child-safety rows even if you won't test them yourself yet (they may need external experts — [external-third-party-programs](../topics/external-third-party-programs.md)).
- Columns = attack classes from [attack-taxonomy](../principles/attack-taxonomy.md).
- Third axis = deployment surfaces, *including every supported language and modality*. This is where the most common gap gets designed out or designed in.
- Mark every cell's current depth: untested / lightly / systematically / generalization-verified. At the start, almost all are "untested" — that honesty is the point.

**Artifact:** the coverage matrix, with depth annotations.
**Principle:** [program-design](../principles/program-design.md), [harm-taxonomy](../principles/harm-taxonomy.md), [attack-taxonomy](../principles/attack-taxonomy.md).
**Check:** run the [coverage-gap-reviewer](../skills/coverage-gap-reviewer/SKILL.md) logic on your own draft matrix — does it have a language axis? Multi-turn cells? Intersection cells? Fix before proceeding.

## Phase 2 — Set the severity and triage system

**Do:**
- Adopt the three-factor rubric (harm potential × ease of reproduction × breadth) and the decision structure from [severity-and-triage](../principles/severity-and-triage.md).
- Define escalation paths *with named people*: who gets the out-of-band call on a critical, who owns the child-safety dedicated channel, what the SLA is per severity. Write these down now, not during the first crisis.
- Define the cluster-escalation rule so batches of lows get re-triaged.

**Artifact:** a severity rubric + escalation table with named owners.
**Principle:** [severity-and-triage](../principles/severity-and-triage.md), [cross-functional-coordination](../principles/cross-functional-coordination.md).

## Phase 3 — Design the testing approach (human + automated)

**Do:**
- **Recruit** for diversity — languages, domains, adversarial styles ([program-design](../principles/program-design.md) recruiting). Line up domain experts for catastrophic-category judgment.
- **Brief** every tester: scope, ROE (what to do with a dangerous finding — stop, document per protocol, do not propagate), severity rubric, and which matrix cells they own. Include wellbeing support and category opt-outs.
- **Sequence the effort:** unstructured human discovery → structured coverage of the matrix → automated generalization/extent mapping → human interpretation ([program-design](../principles/program-design.md)).
- **Stand up automation safely** per [automated-red-teaming](../principles/automated-red-teaming.md): it captures *signal, not payloads*; outputs are filtered and access-controlled; catastrophic cells stay human-in-the-loop. If you cannot yet build automation safely, do human-only first — unsafe automation is worse than none.

**Artifact:** a testing plan (who tests what, in what sequence, with what tooling) + a briefing doc.
**Principle:** [program-design](../principles/program-design.md), [automated-red-teaming](../principles/automated-red-teaming.md).

## Phase 4 — Build the reporting pipeline

**Do:**
- Adopt layered reporting ([reporting-and-disclosure](../principles/reporting-and-disclosure.md)): open layer (class, mechanism, severity, generalization profile) in the normal tracker; controlled layer (reproduction detail) access-controlled, minimum-necessary, never in the open backlog.
- Make the report template *require* the mechanism and the generalization profile — these are what prevent whack-a-mole downstream.
- Route by severity automatically; criticals go out-of-band.
- Set up child-safety and catastrophic-category handling on dedicated channels, separate from general tooling.

**Artifact:** a report template + a routing/intake pipeline.
**Principle:** [reporting-and-disclosure](../principles/reporting-and-disclosure.md).

## Phase 5 — Wire the feedback loop

**Do:**
- For each finding above LOW, assign a *named fix owner on the receiving team* at triage ([cross-functional-coordination](../principles/cross-functional-coordination.md)).
- Decide fix altitude per finding (training-data / guardrail / system) using the decision tree in [feeding-findings-back](../principles/feeding-findings-back.md).
- Make training-data fixes span the *generalization profile*, not the single phrasing.
- Give the red team *verification standing*: it re-probes the profile after a fix and can reopen if the fix didn't generalize. Verification is not owned by the fixer.

**Artifact:** a fix-loop process doc + ownership/SLA agreement with training/classifier/policy teams.
**Principle:** [feeding-findings-back](../principles/feeding-findings-back.md), [cross-functional-coordination](../principles/cross-functional-coordination.md).

## Phase 6 — Instrument the program's own health

**Do:**
- Track the *right* metrics: cells-newly-covered and cells-at-each-depth (not finding count — vanity); time-to-verified-fix by severity (not time-to-report); reopened-fix rate.
- Build the honest dashboard for leadership: coverage state + fix throughput. This is what keeps the loop resourced ([cross-functional-coordination](../principles/cross-functional-coordination.md)).
- Schedule a coverage-gap review ([coverage-gap-reviewer](../skills/coverage-gap-reviewer/SKILL.md)) before every ship gate.

**Artifact:** a program dashboard + a per-gate review cadence.
**Principle:** [program-design](../principles/program-design.md), [cross-functional-coordination](../principles/cross-functional-coordination.md).

## Phase 7 — Iterate

**Do:**
- Each cycle: revisit the taxonomy (new capabilities → new harm rows — [harm-taxonomy](../principles/harm-taxonomy.md)); differential-test the new checkpoint against the fixed regression set ([differential-testing](../topics/differential-testing.md)); rotate assignments to break tunnel vision; fill the darkest cells first.
- Re-run this guide's checklist each cycle; a program is never "done."

**Artifact:** a per-cycle checklist.

---

## The end-to-end checklist

```
[ ] Scope doc (model, surfaces, languages, in-scope categories)
[ ] Coverage matrix (category × class × surface, depth-annotated, language axis present)
[ ] Coverage-gap self-review passed
[ ] Severity rubric + escalation table with named owners
[ ] Dedicated child-safety / catastrophic-category channels
[ ] Recruiting for diversity; domain experts for catastrophic judgment
[ ] Briefing doc (scope, ROE, rubric, cell assignments, wellbeing)
[ ] Testing sequence: unstructured → structured → automated → interpret
[ ] Automation (if any) captures signal-not-payload, filtered, access-controlled
[ ] Layered report template (mechanism + generalization profile required)
[ ] Severity-based routing; criticals out-of-band
[ ] Named fix owner per finding above LOW
[ ] Fix altitude decided per finding; training spans the profile
[ ] Red team holds verification standing (can reopen)
[ ] Health dashboard: coverage depth + time-to-verified-fix
[ ] Per-gate coverage-gap review scheduled
[ ] Per-cycle iteration checklist
```

If you can tick all of these, you have a program, not an effort. To review someone *else's* program against this same bar, use [analyze-an-existing-program](./analyze-an-existing-program.md).
