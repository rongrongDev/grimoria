# GLOSSARY — reliability-engineer

**Last verified:** 2026-07-14 · One glossary for the whole KB. Docs link here; do not redefine these terms elsewhere except as a one-line restatement for standalone readability.

Terms are grouped, then alphabetical within groups.

## Service levels

- **SLI (Service Level Indicator)** — a *measurement* of some aspect of service behavior that users experience, expressed so it can be evaluated as a ratio of good events to total events (or good time to total time). Example: "fraction of HTTP requests to `/checkout` that return non-5xx in < 800 ms, measured at the load balancer." An SLI is a number; it carries no target.
- **SLO (Service Level Objective)** — a *target* for an SLI over a window: "99.9% of checkout requests succeed in < 800 ms over a rolling 28 days." Internal engineering commitment; drives error budgets and alerting. See `reliability-engineer/principles/slos-and-error-budgets.md`.
- **SLA (Service Level Agreement)** — a *contract* with a customer with financial or legal consequences for missing it. Always set looser than the SLO backing it; if your SLA equals your SLO, a normal bad week becomes a legal event.
- **Error budget** — `1 − SLO target`, converted to an allowance of bad events (or bad minutes) per window. A 99.9% monthly SLO on 100M requests is a budget of 100k failed requests. The budget is *meant to be spent* — on releases, experiments, and maintenance — not hoarded.
- **Error budget policy** — the pre-agreed, management-signed document stating what changes when the budget is exhausted (e.g., feature freezes, mandatory reliability work). If it isn't enforced when tested, it doesn't exist. See the "paper policy" failure mode in `reliability-engineer/principles/slos-and-error-budgets.md`.
- **Burn rate** — how fast the error budget is being consumed relative to the sustainable pace. Burn rate 1 = exactly spending the budget over the window; burn rate 14.4 on a 30-day window = the whole budget gone in ~2 days. The basis of modern SLO alerting (multi-window multi-burn-rate). See `reliability-engineer/principles/alerting.md`.
- **Nines** — shorthand for availability targets: 99.9% ("three nines") ≈ 43.8 min/month of full downtime; 99.95% ≈ 21.9 min; 99.99% ≈ 4.4 min. Each added nine roughly 10×es the cost and constrains architecture; see the target-setting decision tree in `reliability-engineer/principles/slos-and-error-budgets.md`.

## Observability

- **Cardinality** — the number of distinct time series a metric produces, i.e., the product of its label value counts. A latency metric labeled by `user_id` has cardinality ≈ your user count and will melt your metrics backend. See `reliability-engineer/principles/observability.md`.
- **Golden signals** — latency, traffic, errors, saturation: the four things to measure for every user-facing service, per the Google SRE book. A starting set, not a finish line.
- **Head sampling / tail sampling** — trace-sampling strategies. Head: decide at request start (cheap, unbiased, misses rare-bad traces). Tail: decide after the request completes, keeping errors/slow traces (catches what matters, costs buffering infrastructure). See `reliability-engineer/principles/observability.md`.
- **RUM (Real User Monitoring)** — measurement collected from actual clients (browser/mobile), capturing failures server-side telemetry cannot see: DNS, TLS, CDN, client-network errors. Counterpart of **synthetic monitoring** (scripted probes from fixed vantage points).
- **Structured logging** — emitting logs as key-value records (usually JSON) rather than prose, so they can be queried like data during an incident instead of grepped like a novel.
- **USE method** — Utilization, Saturation, Errors: the per-*resource* analog of the golden signals (which are per-*service*). Useful for infrastructure dashboards.

## Incidents

- **Incident Commander (IC)** — the single person running an incident: sets priorities, assigns work, makes the calls. Explicitly *not* the person typing the fix. See `reliability-engineer/principles/incident-management.md`.
- **Communications lead (comms)** — the incident role that owns stakeholder and customer updates so the IC and responders don't have to; the countermeasure to "customers found out from Twitter."
- **Severity (SEV)** — the incident's impact class (this KB uses SEV1 = critical user-facing outage → SEV4 = minor/no user impact), which determines response mechanics: who is paged, update cadence, whether a postmortem is mandatory. Severity is about *impact*, not effort or blame; it is classified by rubric, not vibes.
- **MTTR / MTTD** — mean time to recovery / to detection. Treat as diagnostic aggregates, never as individual performance targets — a team incentivized on MTTR will declare incidents over early (see "premature all-clear" in `reliability-engineer/principles/incident-management.md`).
- **On-call rotation** — the schedule that determines who gets paged. Health metrics: pages per shift, sleep-hours pages per week, time-to-ack. See `reliability-engineer/principles/alerting.md` for the page-worthiness bar.
- **Runbook** — the per-alert or per-procedure document telling the responder what the alert means, how to confirm real impact, and what to do. An alert without a runbook link fails the actionability audit (`reliability-engineer/skills/alert-actionability-auditor/`).
- **Status page** — the externally visible incident-communication surface. Update it before customers ask, not after.

## Alerting

- **Actionable alert** — an alert whose receiver must *do something now that a machine could not do*, and knows what. The page-worthiness bar in `reliability-engineer/principles/alerting.md`.
- **Alert fatigue** — the state where pages are frequent and mostly noise, so responders slow-ack, auto-ack, or mute — and then miss the real one. A measurable condition (pages/shift, actionable fraction), not a mood.
- **Flapping** — an alert repeatedly firing and resolving as a metric oscillates around a threshold; a design defect (missing hysteresis/`for:` duration), not weather.
- **Symptom-based / cause-based alerting** — paging on what users experience (error rate, latency) vs. on internal states presumed to cause it (CPU, queue depth, disk). Symptoms page; causes inform. See the decision tree in `reliability-engineer/principles/alerting.md`.

## Postmortems & learning

- **Blameless postmortem** — an incident analysis that treats the humans involved as having acted reasonably given what they knew and what the system showed them, so the analysis can reach the systemic causes. Blameless does not mean consequence-free for negligence; it means the *document* hunts for system fixes, not culprits. See `reliability-engineer/principles/postmortems.md`.
- **Contributing factors** — the modern replacement for a single "root cause": significant incidents have several interacting causes, and naming only one guarantees the others recur.
- **Five whys** — an iterative "why?" technique for cause analysis. Useful as a floor, dangerous as a method: it biases toward a single linear chain. See the critique in `reliability-engineer/principles/postmortems.md`.
- **Action item (AI)** — a concrete, owned, dated change coming out of a postmortem. Untracked action items are the #1 way postmortem programs die; see the follow-through mechanism in `reliability-engineer/principles/postmortems.md`.

## Capacity & resilience

- **Blast radius** — the scope of impact if a change, experiment, or failure goes wrong. Chaos experiments and rollouts are designed by *bounding* blast radius first. See `reliability-engineer/topics/chaos-engineering.md`.
- **Coordinated omission** — the load-testing measurement error where a blocked load generator stops sending (and thus stops measuring) during the exact moments the system is slow, making latency reports optimistic. Use open-model load generation. See `reliability-engineer/principles/capacity-planning.md`.
- **Headroom** — capacity above current peak demand, expressed as a fraction of peak (not of mean). What absorbs organic growth, failover load, and launch spikes.
- **N+1 / N+2** — provisioning so the system meets demand with one (or two) units — hosts, zones, regions — failed. The unit matters: N+1 *servers* does not give you N+1 *availability zones*.
- **RTO (Recovery Time Objective)** — maximum tolerable time to restore service after a disaster. **RPO (Recovery Point Objective)** — maximum tolerable data loss, measured as time (e.g., "≤ 5 minutes of writes"). Both are *business* decisions that must be validated against technical reality; see `reliability-engineer/topics/disaster-recovery.md`.
- **Toil** — operational work that is manual, repetitive, automatable, reactive, and scales with service growth while carrying no enduring value. Measured in hours/week per team; budgeted and reduced deliberately. See `reliability-engineer/topics/toil.md`.
