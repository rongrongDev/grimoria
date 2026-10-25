# Cost Anomaly Detection — catching the spike before the invoice does

**Applies to:** AWS Cost Anomaly Detection / CUR-based custom detection, GCP budget alerts + BigQuery billing export, Azure Cost Management anomaly alerts, and third-party FinOps platforms, as of mid-2026. Provider billing data lags reality by **8–48 hours depending on service** — every detection design must assume it. Forecasting methodology (the baseline these detectors compare against) is `finops-engineer/topics/budgeting-and-forecasting.md`.
**Last verified:** 2026-07-25

**Definitions this doc depends on:** *Cost anomaly* = spend deviating from expected pattern — not necessarily bad (launch traffic is an anomaly and good news), but always worth *explaining*. *Billing lag* = the delay between resource usage and its appearance in billing data. Full glossary: `finops-engineer/GLOSSARY.md`.

## The one thing to internalize

**The unit of failure here is time-to-detection, and the invoice is the worst possible detector.** A misconfigured recursive Lambda, a runaway autoscaling loop, a crypto-mining compromise, or a forgotten load-test environment costs money *per hour*; found in 4 hours it's a Slack message, found on the invoice 5 weeks later it's a five-figure write-off and an executive escalation. The mysterious $20k/month plateau in `finops-engineer/principles/cost-optimization.md` (the 14-month forgotten perf-test environment) survived precisely because nothing watched the *daily* trend of that account — monthly reporting has a 30-day detection floor by construction.

This is the same discipline as production alerting, and it inherits `reliability-engineer/principles/alerting.md` wholesale: alerts must be actionable, routed to someone who can act, and rare enough to be trusted. A cost alert channel that cries daily gets muted in a month, and the real anomaly scrolls past unread — alert fatigue does not care whether the units are milliseconds or dollars.

## Designing detection

### Layer 1 — anomaly detection (fast, relative)
Daily-granularity (or better, where data supports it) deviation detection against an expected baseline, **segmented** by account × service × (team or cost category). Segmentation is what makes small-but-real anomalies findable: a $2k/day new mistake is invisible in a $80k/day org-wide total and obvious in the one account it lives in. Org-wide totals catch only catastrophes.

- Use the provider's native anomaly detector as the free floor (AWS Cost Anomaly Detection is genuinely decent as of 2026), custom baselines where you need business-aware expectations (deploy calendar, launch calendar, seasonality).
- **Expected-change annotation:** the single cheapest noise reduction is a channel where teams note "load test Thursday," "launch Monday," "migration this sprint." Half of all anomalies are explained in one glance at it, and the triage skill checks it first (`finops-engineer/skills/cost-anomaly-triager/SKILL.md`).

### Layer 2 — budget threshold alerts (slow, absolute)
Per-team/per-account monthly budgets with alerts at forecast-to-exceed (best — it fires mid-month with time to act), and actual 80%/100% as the backstop. Budgets catch slow drift that never trips a daily detector — 3% week-over-week growth forever is not an anomaly on any given day, and it's the most expensive pattern of all. Slow drift review belongs in the monthly showback conversation (`finops-engineer/principles/cost-visibility-and-allocation.md`), not in the alert channel.

### Layer 3 — real-time proxies for the worst cases
Billing lag means billing data cannot catch a runaway inside a day. For blast-radius-limited catastrophes, alert on *usage* signals, not cost: API-request rates, instance-count jumps, egress volume, GPU-fleet size. These belong to the observability stack (`reliability-engineer/principles/observability.md`) with cost as one more consumer of it. Cloud-provider spend caps mostly don't exist (billing alerts are not caps); *quotas* are the real pre-spend guardrail — sane service quotas on non-prod accounts are the difference between "the runaway hit the quota at 2am" and "the runaway ran until Tuesday."

## Triage: classify before you escalate

Every anomaly gets classified before anyone panics or bills anyone — the four buckets drive four different responses. This is executable as `finops-engineer/skills/cost-anomaly-triager/SKILL.md`; the judgment it encodes:

| Class | Signature | Response |
|---|---|---|
| **Legitimate growth** | Tracks a business/usage driver (orders, users, launch); unit cost flat (`finops-engineer/principles/unit-economics.md`) | No action on the spend; update the forecast baseline so it stops alerting |
| **Misconfiguration / runaway** | Step-change decoupled from any business driver; often one service/resource; may still be climbing | Stop the bleeding *via the owning team* — never by an automated actor or a unilateral FinOps kill (`finops-engineer/orchestration/README.md`); if it smells like compromise (mining-pattern compute, unfamiliar regions), it's a security incident first and a cost item second |
| **Waste** | New steady plateau, no consumer — the forgotten environment, the debug-logging left on | Confirm with owner, tear down, then the prevention question: what TTL/gate would have caught it (`finops-engineer/principles/cost-optimization.md`) |
| **One-off** | Known event: migration double-running, backfill, annual reserved purchase hitting the ledger, provider billing correction | Annotate the series (an unexplained spike in a trend chart erodes trust later); no other action |

**Close the loop or drown:** every resolved anomaly feeds back — legitimate growth updates baselines, misconfigurations become guardrails/quotas, waste becomes TTLs, one-offs become annotations. Detection without this loop generates the same alerts forever at rising volume; the loop is what makes the system quieter *and* smarter over time. This is also the forecasting feedback loop: `finops-engineer/topics/budgeting-and-forecasting.md`.

## Failure modes → detection → fix → prevention

### 1. Anomalies caught only on the invoice
- **Failure mode:** first cost review is the monthly close; every runaway gets a ~30-day head start. Common in orgs where "cloud cost" is a finance artifact rather than an operational signal.
- **Detection (of the meta-problem):** ask "when did we last catch a cost problem in under a week?" No answer = you're here. Post-incident: time-to-detection retro on every significant anomaly, same as an availability incident.
- **Fix:** stand up Layer 1 segmented daily detection this week — provider-native tooling makes the floor nearly free.
- **Prevention:** time-to-detection as a tracked FinOps metric; anomaly review as a standing weekly agenda item, not an on-demand activity.

### 2. Alert fatigue — the channel everyone muted
- **Failure mode:** thresholds too tight, no expected-change annotations, alerts routed to a channel with no owner → dozens of ignorable pings → the real one ignored too. I have seen a $40k runaway sit for 12 days *in an alert channel that had flagged it on day one*, because that channel had flagged something every day for a year.
- **Detection:** alert volume vs. action rate — if <~30% of alerts get even an acknowledgment, the channel is dead and you should assume nobody will see the next real one.
- **Fix:** raise thresholds until volume is actionable (a few per week org-wide, not per day); route by ownership (the owning team gets their alert, FinOps gets the aggregate); mandatory disposition (ack + class) per alert, which both forces triage and generates the action-rate metric.
- **Prevention:** treat cost-alert hygiene as `reliability-engineer/principles/alerting.md` treats pages — periodic noise audit, every alert must name an owner and an action, awareness-only alerts get demoted to the weekly digest.

### 3. Forecast/baseline ignores seasonality and planned growth
- **Failure mode:** flat baselines make every Black Friday an "anomaly" (noise → fatigue → see #2) and make gradual planned growth mask real problems (a runaway inside a growth curve looks like more growth).
- **Detection:** recurring alerts at predictable calendar points; anomalies repeatedly closed as "expected — launch" that the baseline should have known about.
- **Fix:** seasonally-aware baselines (provider detectors do basic day-of-week/trend; custom baselines from the billing export for real seasonality); wire the launch/marketing/migration calendar into expected-change annotations.
- **Prevention:** baseline review each quarter alongside the forecast cycle (`finops-engineer/topics/budgeting-and-forecasting.md`); every "expected" disposition asks "should the baseline have known?" and updates it if yes.

## What good looks like

Segmented daily detection with quota guardrails on the accounts that can hurt you; a triage path that classifies before it escalates; an alert channel quiet enough that people still read it; every anomaly dispositioned within a business day; and — the real test — **the last significant cost mistake was measured in hours-to-detection, not invoice cycles, and the retro produced a guardrail rather than a resolution to pay more attention.**

## Related

- Triage one flagged spike now: `finops-engineer/skills/cost-anomaly-triager/SKILL.md`
- Slow-drift and unowned-spend sweeps: `finops-engineer/agents/unallocated-spend-scanner.md`
- Baselines and forecasting methodology: `finops-engineer/topics/budgeting-and-forecasting.md`
- The alerting discipline this doc inherits: `reliability-engineer/principles/alerting.md`
- Continuous anomaly-watch orchestration (and why the watcher must be read-only): `finops-engineer/orchestration/README.md`
