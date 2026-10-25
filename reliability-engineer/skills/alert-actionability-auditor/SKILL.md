---
name: alert-actionability-auditor
description: Review one alert definition (or a small batch in a PR) for actionability and noise risk BEFORE it is allowed to page a human — tier correctness (page/ticket/dashboard), symptom-vs-cause justification, the actionability contract (runbook, dashboard, owner, duration), flap and stampede risk. Use as the review gate on any new or modified paging rule, when an on-call disputes a page's right to exist, or per-rule inside a planner/implementer/reviewer alerting overhaul. Do NOT use for auditing an entire alerting config against paging history (dispatch the alert-noise-auditor subagent — bulk history would drown this context), for SLO definition problems (use slo-validity-reviewer), or for deciding what to do when a page fires (that's the runbook's job, see reliability-engineer/principles/incident-management.md).
---

# Alert Actionability Auditor

You are executing the page-worthiness bar from `reliability-engineer/principles/alerting.md` as a pre-merge review (read it if available; this skill is self-sufficient). Governing stance: **every page is a withdrawal from the on-call's trust account, and the tenth noisy page buys the incident where the real one gets slow-acked — so the alert must prove it deserves to wake someone; the reviewer's default answer is "ticket" or "dashboard," and "page" must be earned.** Deleting or demoting a bad alert removes risk; it does not add it.

**Inputs required:** the rule definition (condition, threshold, duration, labels, routing) and its intended tier. Helpful if available: the linked runbook, recent firing history, what SLO/journey it protects.

## Checklist

**1. Tier test (the three-question gate for "page"):** (a) users hurt now, or budget burning fast enough they will be within hours? (b) is there a human action a machine couldn't take? (c) do minutes matter? All three yes → page is justifiable. Any no → demote: hours-tolerant human action → ticket; no defined action ("look and see") → dashboard panel, and say so plainly — "for awareness" is the empty fourth tier where trust goes to die.

**2. Symptom vs. cause.** Symptom-based (SLI error rate/latency/journey down) → preferred; check it's the burn-rate form, not instantaneous (a 30-second blip must not page; a fast burn must — multi-window multi-burn-rate is the standard: e.g. 14.4× over 1h AND 5m for a 99.9%/30d SLO). Cause-based (CPU, queue depth, disk, lag) → apply the exception test: **irreversible harm + imminent + known action** (disk-full trajectory, cert expiry, backup failure, replication lag > RPO pass; "CPU high" fails all three). Cause-based rules failing the test become dashboard context or, at most, tickets — note that the symptom alert already covers the user impact whatever the cause.

**3. The actionability contract (schema, not etiquette):** runbook link (present AND resolving AND its commands plausibly current — a stale runbook is worse than none); dashboard link landing on the diagnosis view; owner = the team that owns the *action* (if the runbook says "escalate to team X," the rule should page team X — routing by topology instead of ownership is the wrong-team failure); severity + one-sentence user-impact rationale; `for:`/duration present unless the condition is irreversible-imminent (this single field kills most flapping — flag any threshold-crossing rule with no hysteresis).

**4. Noise-risk prediction:** threshold vs. normal variance (a threshold inside the metric's daily range is a flap generator — if history is available, count how often the condition was true in the last 30 days vs. how often action would have been warranted); duplicate/stampede check (does an upstream-dependency alert or the journey burn-rate alert already fire for the same failure? → inhibition rule or demote this one); alert-on-absence handled (does the rule fail silent if the metric disappears — the crashed-emitter blind spot)?

**5. Fire-drill answerability.** Simulate: it's 3am, this fires, you know only what the page shows. Can you tell within one minute *whether users are affected* and *what to do first*? If the answer requires tribal knowledge, the alert text/runbook carries the finding.

## Output contract (emit exactly this)

```markdown
# Alert Actionability Review — <rule name> — <date>
## Verdict: PAGE-WORTHY | DEMOTE TO TICKET | DEMOTE TO DASHBOARD | REJECT (broken) — one sentence why
## Contract compliance
[runbook ✓/✗ | dashboard ✓/✗ | owner-matches-action ✓/✗ | duration ✓/✗ | rationale ✓/✗]
## Findings
[# | check | severity (blocker/should-fix/note) | evidence | fix]
## Predicted noise profile
[expected fires/month + basis; flap risk; stampede overlaps]
## Required before this may page (the blocker list, or "none")
```

Blockers: fails the three-question gate but routed as page; no runbook; no duration on a reversible condition; owner can't act. A verdict of PAGE-WORTHY with should-fixes is normal; a verdict you can't justify from the checklist items is not a verdict.

## References

Full decision trees, burn-rate tables, fatigue math: `reliability-engineer/principles/alerting.md` · what the paged human does next: `reliability-engineer/principles/incident-management.md` · bulk config-vs-history audit: `reliability-engineer/agents/alert-noise-auditor.md` · fan-out per rule batch in overhauls: `reliability-engineer/orchestration/README.md`
