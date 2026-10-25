# Capacity Planning: Running Out Is a Choice You Made Earlier

**Applies to:** tool-agnostic; load-tool notes reference k6/Locust-class generators; autoscaling notes assume Kubernetes-HPA/ASG-class mechanisms · **Last verified:** 2026-07-14

**Working definitions** (full glossary: `reliability-engineer/GLOSSARY.md`): **headroom** is capacity above current *peak* (not mean) demand. **N+1** means meeting demand with one unit failed — and the unit (host, zone, region) must be named, or the claim is empty.

Capacity incidents are the most preventable class of outage there is, because unlike bugs, capacity exhaustion *announces itself in advance* — every one of them was a trend line somebody could have seen. When you still get one, the failure was in the looking, not the load. This doc is about building the looking.

## The demand model: forecast, don't extrapolate vibes

A capacity plan is three numbers per constrained resource, refreshed on a cadence:

1. **Current peak demand** — peak, never average. A service averaging 30% utilization with a daily peak at 85% has 15 points of headroom, not 70. Use the p99 of daily peaks over the last month, so one anomalous spike doesn't set your baseline but a *pattern* of spikes does.
2. **Organic growth rate** — fit on 3–6 months of peaks. Know your seasonality before trusting the fit (retail Q4, B2B Monday mornings, payroll month-end); a linear fit through a seasonal curve is confidently wrong in both directions.
3. **Step-function events** — launches, marketing pushes, big-customer onboardings, migrations. These don't appear in trend data *by definition*, which is why capacity planning is partly a relationships job: you need product and sales roadmaps flowing into the review, or your first notice of the 10× campaign is the pager. Give product a one-line contract: "tell us expected peak multiplier two weeks out; we'll tell you within two days if it needs work."

From these, compute **time-to-exhaustion** per resource: when does forecast peak cross (capacity × safe-utilization)? That date, minus your *lead time to add capacity* (minutes for stateless autoscaling; weeks for database vertical scaling + testing; months for new regions or hardware), is your decision deadline. **Lead time is the number people forget:** capacity you can't add faster than demand arrives is capacity you already need.

### Safe utilization is resource-specific

The utilization at which behavior degrades is not 100% and is not uniform: stateless CPU-bound services degrade gracefully to ~75–80%; queue-backed workers can run hotter if latency tolerates it; databases and other stateful systems fall off cliffs (lock contention, cache-hit collapse, compaction debt) as low as 60–70%; network and connection pools are binary walls. Learn each critical resource's cliff by load test (below), not in production. And remember failover math: N+1 across 3 zones means each zone must absorb 50% more load the moment one fails — a fleet at 70% utilization per zone is *over* capacity for surviving a zone loss. If you claim N+1, your safe-utilization ceiling includes the failover surge.

## Failure mode: reactive scaling that loses the race

- **Failure mode:** demand rises faster than the reaction loop — autoscaler lag (metric delay + decision interval + instance boot + warmup), or worse, human-in-the-loop scaling ("page on-call to add nodes") — and the outage happens *while capacity is being added*. Retry storms then multiply the load on the still-short fleet, so the system digs itself deeper exactly when it's weakest; half the capacity incidents I've reviewed had a retry amplification chapter.
- **Detection:** measure your reaction loop end-to-end (spike start → new capacity serving) with a game-day test; compare against your fastest historical demand ramp. If ramp beats reaction, you are betting the SLO on demand politeness. Leading indicators to watch: queue depth growth rate, utilization slope, autoscaler at max.
- **Fix:** pre-scale for known events (the step-function pipeline above); raise the floor (min replicas) so the loop starts from strength; cut reaction time (faster boot: smaller images, pre-warmed pools — mechanics in `devops-engineer/`); and add load shedding so the worst case is degraded service, not collapse.
- **Prevention:** *headroom absorbs what reaction can't.* Policy: every critical service holds enough standing headroom to survive its own historical worst 15-minute ramp with zero scaling response. Plus ticket-tier alerts (never pages — this is the canonical "ticket" example in `reliability-engineer/principles/alerting.md`) at forecast-crosses-threshold-in-30-days, so capacity work happens on calendars, not pagers. Plus retry budgets/backoff-with-jitter as production-readiness requirements, so the amplifier is capped before you need it.

## Failure mode: over-provisioning by fear

- **Failure mode:** the org runs 5× headroom everywhere because nobody can say what's safe, usually after one traumatic capacity incident; reliability budget burns as compute spend, and — the subtle cost — real growth signals drown in slack, so the *next* wall (often a non-obvious one: connection counts, IOPS) arrives unwatched. Fear-provisioning on the resource you watched last time does nothing for the resource you weren't watching.
- **Detection:** utilization review: fleets at <30% peak utilization with no written failover/event rationale. The tell that distinguishes fear from planning is the *absence of a stated reason* — N+1 surge absorption is a reason; "we got burned in 2024" is a scar.
- **Fix:** replace fear with the demand model — load-tested cliffs + measured ramps + failover math produce a defensible utilization target per service; scale down to it *gradually while watching* (fear is sometimes encoding a real constraint nobody wrote down; discover it in the descent, gently).
- **Prevention:** headroom targets are written, per-service, with rationale, reviewed quarterly alongside the forecast. Headroom without a reason attached expires.

## Load testing: a pass must mean something

A load test exists to answer one question: *at what point, and in what way, does this system stop meeting its SLOs?* A test that doesn't find that point — that "passes" — has told you only that the wall is somewhere beyond where you looked. The classic failure is the load test that passes at 2× projected traffic, followed by production falling over at 1.2×, because the test traffic resembled production the way a crash-test dummy resembles a gymnast:

- **Match the shape, not just the volume.** Real traffic has burstiness, a read/write mix, a hot-key skew (20% of keys take 80% of traffic — synthetic uniform keys make caches look heroic), sessions with think-time, and mobile clients that retry. Derive the profile from production access logs, not imagination; replay-based generation where feasible.
- **Open model, not closed loop.** Closed-loop generators (N virtual users waiting for responses) slow down when the system slows down — the generator politely backs off exactly when production users would be piling on, and the latency report omits the worst moments. This is **coordinated omission**, and it makes broken systems look fine. Use open-model arrival rates (k6 `constant-arrival-rate`/`ramping-arrival-rate` executors or equivalent).
- **Test the data, too.** A load test against a 1 GB staging database says nothing about the 2 TB production one — the cache-hit ratio, the index depth, and the compaction behavior are all different animals. Production-scale (or production-shaped-sampled) data, or write the caveat on the result in red.
- **Run to failure, on purpose, and characterize the failure mode.** The most valuable load-test output isn't "handles 3×" — it's "at 3.4×, connection pool exhausts, latency spikes to 30 s, and it does *not* recover when load drops" (that last clause — hysteresis — is a finding worth more than the number). Knowing your wall's shape is what makes the incident, when it comes, a runbook instead of a mystery.
- **Where:** production with shadow/dark traffic if your isolation story allows (see blast-radius discipline in `reliability-engineer/topics/chaos-engineering.md`); a prod-parity environment otherwise; and say which one on the report, because the parity caveats *are* part of the result. Tool mechanics live with `quality-dev` (`quality-dev/tools/k6.md`, `quality-dev/principles/performance-and-load-testing.md`) — that KB owns load-test *engineering*; this doc owns what the test must establish for capacity decisions.

- **Failure mode / detection / fix / prevention:** the unrepresentative-load-test chain is: **failure** — test passes, production fails below tested volume; **detection** — post-incident, diff test-traffic profile vs. production access logs (mix, skew, burstiness, data scale); the diff is always obvious in hindsight; **fix** — rebuild the profile from production logs; **prevention** — load-test review checklist requires stating: traffic-derivation source, open/closed model, data scale vs. production, and the discovered failure point + mode. A load-test result missing any of the four is marketing.

## Failure mode: the dependency you didn't plan

- **Failure mode:** your capacity plan covers *your* fleet; the wall you actually hit is someone else's — the payment provider's rate limit, the managed database's connection cap, the auth service's own headroom, a cloud API quota. Your 3× scale-up succeeds and *becomes the DDoS* that takes down the shared dependency; your capacity success is the incident's cause. (I have run this incident from both sides. The downstream side is angrier.)
- **Detection:** for every critical dependency, ask: what's our current peak usage, what's the hard limit (quota/contract/their stated capacity), and would our own 3× event exceed it? If any answer is "don't know," that's the finding. RED-per-dependency metrics (`reliability-engineer/principles/observability.md`) give you the usage half for free; 429/throttle response rates from dependencies are the early warning.
- **Fix:** get limits in writing (contract tier, quota console, or a direct conversation with the owning team); raise them ahead of events; add client-side rate limiting *below* the dependency's cap so your traffic physically can't exceed the agreement.
- **Prevention:** the capacity review covers a **dependency ledger** — per dependency: peak usage, known limit, headroom, contact/escalation path — refreshed on the same cadence as the fleet forecast. Step-function events (launches) require checking the ledger, not just your own fleet: the launch checklist line is "which dependencies see our multiplier, and have they agreed to it?"

## The operating rhythm

Capacity planning that lives in a spreadsheet someone once made is dead. The living version is a **monthly one-hour review** per system area: forecast vs. actual for last month (the *forecast-error* trend is your model's quality signal — a model off by 2× is a finding even when nothing broke); time-to-exhaustion table for constrained resources (anything < 2× lead time is an action item now); dependency ledger deltas; step-function calendar for the next quarter. Twenty minutes of preparation if the dashboards exist; the from-scratch setup is Step 6 of `reliability-engineer/playbooks/build-a-reliability-program-from-scratch.md`.

## Where to go next

- Ticket-vs-page for capacity alerts: `reliability-engineer/principles/alerting.md`
- Utilization/saturation telemetry: `reliability-engineer/principles/observability.md`
- Finding the wall safely in production: `reliability-engineer/topics/chaos-engineering.md`
- Surviving the loss of a whole zone/region (the biggest step function of all): `reliability-engineer/topics/multi-region.md`, `reliability-engineer/topics/disaster-recovery.md`
- Load-test tooling depth: `quality-dev/principles/performance-and-load-testing.md`
