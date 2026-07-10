# Guide: Analyze an Existing Red-Team Program

> **Version 1.0 — 2026-07-06.** Capability B. A runbook for reviewing an unfamiliar red-team program — its coverage, triage, and reporting/feedback pipeline — and producing a gap analysis + remediation plan. Requires and produces *no* attack content; this is a review of *methodology and process*, using program artifacts (matrices, rubrics, dashboards, process docs), never live payloads.

Use this when you inherit a program, audit a peer team's, or assess a third party's before relying on their assurance. The output is a prioritized gap analysis and remediation plan, mapped to the same standard [build-a-red-team-program](./build-a-red-team-program.md) builds to.

---

## What to ask for (inputs) — and what NOT to ask for

**Request these artifacts:**
- The coverage matrix (or whatever stands in for it).
- The severity rubric and escalation paths.
- The report template and a sample of *open-layer* findings (mechanism/class/severity — NOT reproduction detail).
- The feedback-loop process and the program health dashboard.
- Recruiting/briefing docs.

**Do NOT request:** raw reproduction detail, working payloads, or the Layer-2 controlled content. You do not need them to assess methodology, and requesting them widens exposure ([reporting-and-disclosure](../principles/reporting-and-disclosure.md)). If a program hands you working attacks unprompted, that itself is a finding (leaky reporting hygiene).

## The review, phase by phase

Assess each area against the standard. For each, the diagnostic questions and the tell-tale gaps.

### 1. Coverage

**Ask:** Is there a matrix at all, or just an hour/finding count? Does it have a *language/modality axis*? Multi-turn cells? Agentic-surface cells? Intersection cells? Are cells *depth-annotated* or just binary? Which columns are lit every cycle and which are perpetually dark?

**Tell-tale gaps:**
- No matrix → the program cannot state what's untested (the cardinal gap — [program-design](../principles/program-design.md)).
- No language axis → non-English coverage is almost certainly absent.
- Same 2–3 attack classes lit every cycle → tunnel vision.
- Binary cells → "covered" hides "thinly probed."

**Tool:** run [coverage-gap-reviewer](../skills/coverage-gap-reviewer/SKILL.md) on their matrix for a structured gap list.

### 2. Severity and triage

**Ask:** Is severity scored on the three factors, or on cleverness/vibes? Is the severity *distribution* healthy, or is everything "high" (over-reaction) / everything "medium" (under-reaction)? Are escalation paths named and rehearsed? Is there a child-safety dedicated channel? A cluster-escalation rule?

**Tell-tale gaps:**
- Escalation paths undocumented → improvised in a crisis ([severity-and-triage](../principles/severity-and-triage.md)).
- No expert review for catastrophic categories → uplift misjudged, likely under-scored.
- No cluster re-triage → systemic issues hidden as piles of lows.
- Severity distribution all-high or all-medium → rubric not actually applied.

**Tool:** apply [finding-severity-triager](../skills/finding-severity-triager/SKILL.md) to a sample of their findings and compare to their assigned severities; systematic divergence is a finding.

### 3. Testing approach

**Ask:** Is there both unstructured discovery *and* structured coverage? Where does automation sit — is it discovering (a red flag; automation doesn't discover) or mapping extent (correct)? Does automation capture *signal or payloads*? Is the team diverse? Are catastrophic cells human-in-the-loop?

**Tell-tale gaps:**
- Automation-only → only known-class variants found ([automated-red-teaming](../principles/automated-red-teaming.md)).
- Automation stores working payloads → the weapon-factory risk; a serious finding in itself.
- No unstructured discovery → no novel classes.
- Monoculture team → shared blind spots.

### 4. Reporting and disclosure

**Ask:** Layered reporting, or reproduction detail in the open backlog? Do reports require *mechanism* and *generalization profile*? Is routing severity-driven? Are external/disclosure terms defined?

**Tell-tale gaps:**
- Reproduction detail in open tickets → both a security exposure and a hygiene failure.
- Reports lack mechanism/profile → downstream whack-a-mole guaranteed ([robustness-evaluation](../principles/robustness-evaluation.md)).
- No disclosure decision framework → risk of arming attackers or paralysis.

### 5. Feedback loop

**Ask:** Do findings get named fix owners? Is fix altitude chosen deliberately, or is everything a phrasing patch? Does the *red team* verify fixes against the generalization profile, or does the fixer self-certify? What's the *time-to-verified-fix*, and how big is the backlog of "reported, never verified-fixed"?

**Tell-tale gaps:**
- Findings die in backlog → high report volume, low verified-fix throughput ([feeding-findings-back](../principles/feeding-findings-back.md)).
- Fixer self-certifies → "fixed" means "ticket closed," recurrences follow.
- Only reported phrasings trained on → whack-a-mole ([robustness-evaluation](../principles/robustness-evaluation.md)).
- No differential testing across checkpoints → regressions ship ([differential-testing](../topics/differential-testing.md)).

### 6. Program health / metrics

**Ask:** Does the dashboard track coverage depth and time-to-verified-fix, or vanity finding-counts? Is there a per-gate coverage-gap review? Is the taxonomy revisited each cycle?

**Tell-tale gaps:**
- Finding-count as the headline metric → measures activity, not safety.
- No coverage-depth tracking → cannot distinguish defended from thinly-probed.

## Produce the output: gap analysis + remediation plan

For each area, write:
1. **Current state** — what they have.
2. **Gap** — measured against the [build-a-red-team-program](./build-a-red-team-program.md) standard.
3. **Severity of the gap** — a missing matrix or a payload-leaking backlog is critical; a vanity dashboard is medium.
4. **Remediation** — the specific phase/artifact from the build guide that closes it.

**Prioritize the remediation plan** by gap severity, and lead with the ones that mean the program is *flying blind* (no matrix, no verification loop, no escalation paths) over cosmetic ones. A program can have impressive findings and still be critically broken if nothing gets verified-fixed.

### Remediation priority order (default)

```
1. Flying-blind gaps first:
     no coverage matrix · no verification loop · undocumented escalation ·
     reproduction detail in open backlog · no child-safety channel
2. Systemic-blindspot gaps:
     no language axis · tunnel vision · automation stores payloads ·
     fixer self-certifies · reports lack mechanism/profile
3. Depth/maturity gaps:
     binary (not depth-annotated) cells · vanity metrics ·
     no differential testing · taxonomy never revisited
```

## The one-paragraph verdict

End with a plain statement a leader can act on: *Can this program credibly state what it has and hasn't tested, does it turn findings into verified fixes, and can it handle a critical without improvising?* If any answer is no, that is the headline, regardless of how many findings the program produces.

## Related
- The standard being reviewed against: [build-a-red-team-program](./build-a-red-team-program.md)
- Tools used in the review: [coverage-gap-reviewer](../skills/coverage-gap-reviewer/SKILL.md), [finding-severity-triager](../skills/finding-severity-triager/SKILL.md), [finding-cluster-analyzer](../agents/finding-cluster-analyzer.md)
- Every principle referenced above.
