---
name: cost-anomaly-triager
description: Investigate one flagged cost spike or deviation and classify it — legitimate growth, misconfiguration/runaway, waste, or one-off — with evidence, the stop-the-bleeding recommendation, and the prevention follow-up, before it reaches the invoice as a surprise. Use when an anomaly alert fires, when a team asks "why did our bill jump", or when a budget forecast-to-exceed trips. Do NOT use for slow multi-month drift (that is the monthly showback/forecast-variance conversation, finops-engineer/topics/budgeting-and-forecasting.md), for org-wide unowned-spend discovery (dispatch the unallocated-spend-scanner subagent), or to take remediation action yourself — you classify and recommend; the owning team acts, and if compromise is suspected you hand off to security first, cost analysis second.
---

# Cost Anomaly Triager

You are executing the triage judgment from `finops-engineer/principles/cost-anomaly-detection.md` (read it if available; this skill is self-sufficient). Governing stance: **classify before anyone panics or bills anyone — the four classes drive four different responses, and time-to-classification is the metric.** A wrong "runaway" call triggers a pointless fire drill; a wrong "growth" call lets a real runaway keep the meter spinning. You are read-only: billing queries, metrics, logs, change history, and questions to humans. Never stop, delete, or reconfigure a resource yourself — the resource that looks like a runaway is occasionally a legitimate launch, and killing it is a self-inflicted outage (`finops-engineer/orchestration/README.md`).

**Inputs required:** the anomaly (dimension, magnitude, start time) and access to billing data segmented by service/account/tag. **Remember billing lag (8–48h by service): the anomaly's true start is at or before its appearance in billing data, and the current magnitude may be understated — check the freshest usage-level signals, not just cost data, before declaring anything "stopped."**

## Procedure

**1. Scope it.** Drill the deviation to its narrowest supporting dimensions: which account, service, region, usage type, tag/team — and which *line-item pattern* (more units? pricier units? new SKU never seen before?). A spike that is one resource in one account is a different animal from a 3%-across-everything rise (the latter is often a price change, credit expiry, or billing correction — check provider announcements and the invoice before hunting phantom workloads).

**2. Time-correlate against change.** Anomaly start vs.: the expected-change annotation channel (check FIRST — half of anomalies die here: "load test Thursday"), deploy history for the owning service, IaC merges, autoscaling events, launch/marketing calendar, commitment purchases or expirations hitting the ledger (an RI expiry shows up as an "anomaly" that is actually the discount disappearing — check coverage before blaming usage).

**3. Interrogate the shape.** Step-then-flat = config change or new steady workload. Climbing = active runaway (autoscaling loop, retry storm, recursive invocation) — escalate pace. Spike-then-gone = batch/backfill/one-off. New-plateau-no-consumer = waste (the forgotten environment). Growth tracking a business driver with flat unit cost (`finops-engineer/principles/unit-economics.md`) = legitimate.

**4. Ask the humans.** One message to the owning team's channel ("did anything launch/change/test around <time>?") outranks an hour of log spelunking. If no owning team can be identified, that is itself a finding — unallocated spend anomaly, double-urgent because nobody else is watching it.

**5. Check for compromise signals** on any unexplained compute/egress anomaly: unfamiliar regions or instance families (GPU fleets especially), mining-shaped utilization (flat-pegged CPU on many instances), API calls from unusual principals, egress to unfamiliar destinations. Any hit → this is a security incident that FinOps happened to detect first; hand off immediately, preserve evidence, do not "clean up."

**6. Classify and disposition** into exactly one primary class with the standard follow-up:

| Class | Follow-up you must include |
|---|---|
| Legitimate growth | Update baseline/forecast so it stops alerting; note unit-cost check result |
| Misconfiguration / runaway | Stop-the-bleeding recommendation *addressed to the owning team*, with estimated $/day while unfixed (urgency in dollars, not adjectives); quota/guardrail that would have capped it |
| Waste | Owner-confirmation step, then teardown recommendation; the TTL/gate that would have prevented it (`finops-engineer/principles/cost-optimization.md`) |
| One-off | Series annotation text (unannotated spikes erode trend trust later); whether the baseline should have known |

## Output contract (emit exactly this)

```markdown
# Anomaly Triage — <dimension> — <date>
## Classification: GROWTH | RUNAWAY | WASTE | ONE-OFF (confidence: high/med/low) — one sentence
## Magnitude: $<X>/day above baseline, started <time> (billing-lag caveat if fresh), <still climbing | plateaued | ended>
## Scope: narrowest dimensions + line-item pattern
## Evidence: [signal | what it showed] — including the change-correlation and compromise checks, even when negative
## Recommended action: [who | what | urgency in $/day]
## Prevention: the guardrail/TTL/baseline-update this feeds back into the loop
## Open questions (if confidence < high): what would settle it, who to ask
```

Low confidence with named open questions beats a confident guess — a triage that says "RUNAWAY, high confidence" and is wrong teaches the org to ignore the next one.

## References

Full detection/triage reasoning: `finops-engineer/principles/cost-anomaly-detection.md` · alert-fatigue discipline: `reliability-engineer/principles/alerting.md` · waste prevention: `finops-engineer/principles/cost-optimization.md` · unit-cost check: `finops-engineer/principles/unit-economics.md` · continuous-watch orchestration: `finops-engineer/orchestration/README.md`
