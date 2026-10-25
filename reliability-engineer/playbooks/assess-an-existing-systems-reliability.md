# Playbook: Assess an Existing System's Reliability Posture

**Applies to:** any unfamiliar production system — tool-agnostic · **Last verified:** 2026-07-14
**You are:** handed a system you didn't build ("how reliable are we, actually?"), after an acquisition, a re-org, a bad quarter of incidents, or as the fan-out worker auditing one service of many. **Budget:** ~2 days human effort; phase weights below matter more than absolutes — an agent executing this compressed is the `reliability-engineer/skills/reliability-posture-assessor/` skill, which carries the output contract.

**Governing stance:** the null hypothesis is that green dashboards mean nothing. You are grading the system's *ability to know it is broken and respond*, not its uptime last month — luck and low traffic produce beautiful uptime. Evidence over testimony throughout: what people tell you the process is and what the artifacts show are different documents, and the gap between them is itself a finding (usually the most important one).

**Read-only by contract.** You assess; you do not fix, tune, or "quickly correct" anything you find, however itchy. An assessor who edits becomes a participant, and their report becomes a diff.

---

## Phase 0 — Inventory the ground truth (½ day, facts only)

Collect, without judging yet:

- **The journey list** — what do users actually do here? (If no one can name the critical journeys, write your own from traffic data; the absence is finding #1 and taints everything downstream.)
- **SLO catalog** if any: definitions, targets, rationale fields, measurement points, current compliance. Error-budget policy doc if any.
- **Alerting config + 90 days of page history** with per-page outcomes if tracked (ack-only? action taken? reassigned?).
- **Incident history** — count, severities, durations for 6–12 months; the last 6–10 postmortems; the action-item tracker state.
- **Observability surface** — dashboards for the top journeys, whether logs carry trace IDs, metric naming consistency, retention.
- **Capacity artifacts** — any forecast, load-test results, headroom statements, dependency limits doc.
- **Interviews (3, 30 min each):** the most senior on-call ("walk me through your last page"), the newest on-call ("what would you do if checkout broke right now?"), the eng lead ("what happens when the error budget runs out?"). The *delta between their answers* is data of the first order.

## Phase 1 — SLO/SLI validity (½ day; heaviest-weighted, because everything else keys off it)

For each stated SLO, grade against `reliability-engineer/principles/slos-and-error-budgets.md`:

- **Measurement point:** app-level self-reporting (blind to its own death), LB/edge, or client/RUM? Any synthetic full-journey probe? Grade the *SLO of record*, not the nicest dashboard.
- **Vanity check:** pick the last 2 user-visible incidents; did the SLI move? An SLI that stayed green through a real outage is disqualified, whatever its design.
- **Target honesty:** rationale written? Ever breached-while-users-fine or met-while-users-screamed (the two condemning questions)? Round number with no derivation = presumptively arbitrary.
- **Budget policy reality:** the intersection test — windows where budget hit zero × releases shipped in them without written override. Non-empty = paper policy, and say so in those words.
- **Coverage:** journeys from Phase 0 with *no* SLO at all — usually the real story.

Per-SLO verdict: **valid / vanity (green-while-broken risk) / arbitrary-target / paper-policy / absent**. The `reliability-engineer/skills/slo-validity-reviewer/` skill runs this per-SLO check standalone.

## Phase 2 — Alerting quality: noise vs. coverage (½ day)

Both directions, always — teams fixate on whichever hurt recently, and the other one is where the next incident comes from:

- **Noise:** from page history — pages/shift, sleep-hours pages, % noise-dispositioned (or infer: acked-with-no-action-within-30-min), top-5 noisiest rules, reassignment rates (wrong-team routing), pages-per-incident (stampede/duplication). Against the bars in `reliability-engineer/principles/alerting.md`: >2 pages/shift or >30% noise = fatigue debt, stated as a risk to *detection* ("real pages get slow-acked here"), not comfort.
- **Coverage:** does every journey SLO have burn-rate pairs (or any symptom-based page at all)? Then the harder test — take the last 3–5 real incidents and ask *what detected each*: alert, or customer/support/employee-noticed? Customer-detected incidents are the coverage grade, whatever the rule count. Check the actionability contract on the top-10 paging rules (runbook links that resolve, dashboards that load, owners that exist).
- **Volume note:** if the config is large (>100 rules) or history rich, dispatch `reliability-engineer/agents/alert-noise-auditor.md` for the mechanical pass and spend your time on its report — don't hand-read 400 rules; you'll sample badly.

## Phase 3 — Incident response & learning loop (½ day)

- **Response:** from the last 3 SEV1/2 timelines (dispatch `reliability-engineer/agents/incident-timeline-reconstructor.md` per incident if raw materials exist but timelines weren't kept): time-to-detect vs. time-to-first-customer-report; was an IC named (or findable in the transcript — "was anyone in charge?" has an evidence-based answer: look for unassigned 15-minute gaps); status-page latency; re-fires within 72h (premature all-clear signature). Severity consistency: re-classify 5 incidents blind against their rubric; >20% disagreement = rubric is advisory.
- **Learning:** grade the postmortem corpus per `reliability-engineer/principles/postmortems.md` — factors-per-postmortem median (1 = shallow), "human error"/vendor-blame as terminal causes, sanitized-voice tells; **action-item completion rate by age** (if the org can't produce this number, that *is* the number); repeat incident classes across the corpus (the single strongest program-health signal — dispatch `reliability-engineer/agents/postmortem-quality-reviewer.md` in corpus mode for this). On-call health: rotation size, escalation config, handoff practice (ask the newest on-call, not the doc).

## Phase 4 — Observability & capacity spot-checks (¼ day; sampled, not exhaustive)

- **The 3am test, live:** pick a past incident's symptom; sit a non-author (or yourself, cold) in front of the alert's linked dashboard; time symptom → plausible suspect. >5 min with good tooling access = usable-observability finding regardless of vendor count. Check: metrics→trace→log links exist? Cardinality incidents in history? Log volume vs. obvious signal (INFO-per-request at every hop)?
- **Capacity:** does *anyone* know the #1 journey's constrained resource and its wall, with a source (load test vs. folklore)? Time-to-exhaustion known? Dependency limits written anywhere? One question each, `reliability-engineer/principles/capacity-planning.md` grading: known-and-tested / known-folklore / unknown.

## Phase 5 — The report (½ day)

**Output contract** (the skill emits exactly this; humans should too — it's aggregation-ready for fleet fan-outs, see `reliability-engineer/orchestration/README.md`):

```markdown
# Reliability Posture — <system> — <date> — <assessor>
## Verdict (≤5 sentences: overall grade + the one sentence you'd say in the elevator)
## Scorecard
[area | grade A–D | one-line evidence]  — areas: SLO validity, alert noise, alert
coverage, incident response, learning loop, observability usability, capacity knowledge
## SLO/SLI validity
[per SLO: verdict + evidence; uncovered journeys]
## Alerting: noise / coverage
[the numbers; top noisy rules; customer-detected incident list]
## Incident response & postmortems
[timeline findings; AI completion rate; repeat classes]
## Observability & capacity spot-checks
## Prioritized remediation plan
[≤3 P0s (≤ a sprint each), then P1/P2: action | effort S/M/L | risk it retires | depth-doc link]
## Not assessed
[everything sampled around or skipped — never imply completeness]
```

**Prioritization rule, in order:** (P0 candidates) anything meaning the org *wouldn't know* it was down — vanity SLIs on top journeys, customer-detected incident pattern, missing symptom alerting; then fatigue past the slow-ack threshold (it silently disables everything else); then paper policies and dead learning loops (they mean the posture can't self-correct); then (P1/P2) everything else by user-risk per effort. Resist the temptation to P0 whatever is most *visible* — the org already knows about that one; your value is the blindness findings.

**Calibration for the verdict:** a system can be A-grade on tooling and D-grade on posture (all the vendors, none of the answers) — grade the *answers*. And deliver the report to whoever holds the Step-0-style mandate, not just whoever commissioned it; a posture report filed to someone who can't act on it is itself a paper policy.

## Related

Building the missing pieces the report names: `reliability-engineer/playbooks/build-a-reliability-program-from-scratch.md` (each remediation maps to one of its steps) · compressed agent form: `reliability-engineer/skills/reliability-posture-assessor/` · fleet-wide fan-out pattern: `reliability-engineer/orchestration/README.md`.
