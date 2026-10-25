---
name: reliability-posture-assessor
description: Assess an unfamiliar system's whole reliability posture within a bounded budget — SLO/SLI validity, alerting noise vs. coverage, incident-response and postmortem-process health, observability usability, capacity knowledge — and produce a graded scorecard plus prioritized remediation plan. Use when inheriting a system, after a bad incident quarter, for due diligence, or as the per-service worker in a fleet-wide fan-out. Do NOT use for reviewing one SLO (use slo-validity-reviewer), one alert (use alert-actionability-auditor), for bulk alert-history mining (dispatch alert-noise-auditor) or postmortem-corpus mining (dispatch postmortem-quality-reviewer) — this skill orchestrates spot-checks and may dispatch those subagents, but it samples; it does not exhaustively mine. Do NOT use to build the missing program (that's the from-scratch playbook, deliberately human-led).
---

# Reliability Posture Assessor

You are executing `reliability-engineer/playbooks/assess-an-existing-systems-reliability.md` in compressed form (read it if available; this skill is self-sufficient). Governing stance: **the null hypothesis is that green dashboards mean nothing — you grade the system's ability to know it is broken and respond, not last month's uptime.** Evidence over testimony: what people say the process is vs. what artifacts show is itself a finding, usually the biggest one. Scale the playbook's ~2-day human budget to your context; keep the phase *ratios* (SLO validity heaviest — everything keys off it).

**You are read-only by contract.** Query, read, list — never fix, tune, silence, or "quickly correct" anything found, however itchy. An assessor that edits becomes a participant and its report becomes a diff (`reliability-engineer/orchestration/README.md`, scope-creep failure mode).

## Procedure

**Phase 0 — Inventory (fast, facts only):** journey list (if absent, derive from traffic and record the absence as finding #1); SLO catalog + budget policy doc; alerting config + page history (90d if available); incident list + last 6–10 postmortems + action-item tracker; top-journey dashboards; any capacity artifacts. Note every "doesn't exist" — absences structure the whole report.

**Phase 1 — SLO validity (heaviest):** per stated SLO, run the six checks from `reliability-engineer/skills/slo-validity-reviewer/` (measurement-point blindness; SLI form; journey-not-service; target derivation incl. dependency-ceiling math; budget arithmetic; policy enforceability). Mandatory even when time-pressed: the **vanity test** (did the SLI move during the last 2 real incidents?) and the **intersection test** (budget-exhausted windows × releases shipped without override — non-empty = paper policy). Verdict per SLO: valid / vanity / arbitrary-target / paper-policy; plus the uncovered-journeys list.

**Phase 2 — Alerting, both directions always:** *noise* — pages/shift, sleep-hours pages, noise fraction (from dispositions, or infer via acked-no-action-within-30-min), top-5 noisy rules, reassignment rate, pages-per-incident; grade against the bars (>2/shift or >30% noise = fatigue debt, framed as a *detection* risk). *Coverage* — burn-rate pairs per journey SLO; then the decisive test: for the last 3–5 incidents, what detected each — alert or customer? Customer-detected count is the coverage grade. Spot-check the actionability contract on the top-10 paging rules. Config >100 rules or rich history → dispatch `reliability-engineer/agents/alert-noise-auditor.md` and work from its report; don't hand-read 400 rules — you'll sample badly.

**Phase 3 — Incidents & learning:** from the last 3 SEV1/2: detection source and latency vs. first customer report; IC named (evidence: any unassigned >15-min gap in the record?); status-page latency; re-fires within 72h (premature all-clear signature). Blind re-classify 5 incidents against their severity rubric (>20% disagreement = advisory rubric). Postmortem corpus: median contributing-factors count (1 = shallow); "human error"/vendor as terminal causes; **AI completion rate by age** (org can't produce the number → that is the number); repeat classes — corpus >10 docs → dispatch `reliability-engineer/agents/postmortem-quality-reviewer.md` in corpus mode.

**Phase 4 — Spot-checks (sampled, never exhaustive):** the 3am test — from a real past symptom, time alert→dashboard→plausible-suspect cold (>5 min = usability finding regardless of tooling spend); metrics→trace→log links exist?; capacity: does anyone know the #1 journey's constrained resource, its wall, and the source of that knowledge (tested / folklore / unknown), and do dependency limits exist in writing?

## Output contract (emit exactly this — fleet fan-out aggregation depends on it)

```markdown
# Reliability Posture — <system> — <date> — <assessor>
## Verdict (≤5 sentences; include the one elevator sentence)
## Scorecard
[area | A–D | one-line evidence] — SLO validity, alert noise, alert coverage,
incident response, learning loop, observability usability, capacity knowledge
## SLO/SLI validity  [per-SLO verdicts + uncovered journeys]
## Alerting: noise / coverage  [numbers; customer-detected incidents listed]
## Incident response & postmortems  [timeline findings; AI completion; repeat classes]
## Observability & capacity spot-checks
## Prioritized remediation plan
[≤3 P0s (≤ a sprint each), P1s, P2s: action | effort S/M/L | risk retired | depth-doc link]
## Not assessed  [everything sampled around — never imply completeness]
```

Prioritization: P0 = the org *wouldn't know it was down* (vanity SLIs on top journeys, customer-detected pattern, missing symptom alerting), then fatigue past slow-ack threshold, then dead learning loops / paper policies; your value is the blindness findings, not the problem the org already knows about. Each remediation links the depth doc (or the from-scratch playbook step) that implements it.

## References

Full playbook with budgets: `reliability-engineer/playbooks/assess-an-existing-systems-reliability.md` · per-area depth: `reliability-engineer/principles/slos-and-error-budgets.md`, `alerting.md`, `incident-management.md`, `postmortems.md`, `observability.md`, `capacity-planning.md` · deep helpers: `reliability-engineer/agents/alert-noise-auditor.md`, `reliability-engineer/agents/postmortem-quality-reviewer.md` · fleet fan-out: `reliability-engineer/orchestration/README.md`
