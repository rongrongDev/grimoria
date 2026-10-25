# Playbook — Assess an Existing Cloud Spend Setup

**Use when:** you inherit an unfamiliar cloud account/org/billing setup — new job, acquisition due diligence, consulting engagement, or the quarterly self-audit of your own shop — and must produce a defensible picture of where the money goes and what to fix first, in a bounded budget (days, not weeks).
**Skill counterpart:** `finops-engineer/skills/spend-posture-assessor/SKILL.md` is the compressed executable form with the same output contract; agents should invoke that. This document carries the judgment and the *why* behind each check.
**Applies to:** AWS / GCP / Azure as of mid-2026.
**Last verified:** 2026-07-25

## Stance

You are assessing the **practice**, not just the bill. A $400k/month bill with 95% allocation, laddered commitments, and working anomaly detection is a healthier estate than a $150k/month bill where nobody can say who owns what — the second one is where the surprises live. Read access only, throughout: billing exports, resource inventories, utilization metrics, IaC repos, and interviews. An assessor who "fixes" things mid-assessment contaminates the baseline and, worse, may fix the wrong thing — the idle-looking resource that is the DR standby (`finops-engineer/orchestration/README.md`).

Order of phases matters: allocation before optimization, because an opportunity list built on unattributed spend misassigns both the savings and the blame.

## Phase 0 — Establish the data (half a day)

Get read access to: billing export or console (12 months if possible — you need at least one full seasonal cycle to distinguish trend from season), resource inventory, utilization metrics, commitment/agreement inventory (including any EA/EDP/MACC — ask finance, not just engineering; agreements are the thing engineering forgets exists), the IaC repos, and 30 minutes each with: whoever pays the bill, whoever gets paged, and one line engineer (their answers to "what does your service cost?" *are* assessment data — silence is a Finding for the maturity section).

Establish the **cost basis** of every number you'll quote (amortized net; per `finops-engineer/principles/commitments-and-discounts.md`) and note total monthly spend, 12-month trend, and top 10 services/accounts by spend. Everything below reports against this frame.

## Phase 1 — Tagging coverage & unallocated spend (day 1)

Per `finops-engineer/principles/cost-visibility-and-allocation.md`:

1. **Allocation coverage number:** % of spend attributable to an owner via tags + account boundaries. Segment by account and service family — a healthy aggregate hides the one 20%-coverage account.
2. **The unallocated bucket, ranked largest-dollar-first.** At org scale, dispatch `finops-engineer/agents/unallocated-spend-scanner.md` rather than mining inline.
3. **Enforcement reality check:** is there a schema? Is it enforced at creation (IaC defaults + CI policy + provider policies) or by periodic nagging? Are AWS cost-allocation tags even activated (a shockingly common miss — check the activation date vs. account age; every month before it is permanently dark)?
4. **Correctness spot-check (the quiet failure):** sample 10 tagged resources — do the `owner` teams still exist? Does that team's on-call agree they own it? Wrong tags are worse than missing ones; confidently wrong reports get built on them.
5. **Shared-cost rules:** does any written split rule exist for the shared cluster/VPC/observability/CI spend, or is it all billed to whoever provisioned it (the misattribution trap)?

**Output:** coverage % (org + worst segments), top-10 unallocated items with probable owners, enforcement grade (creation-time / scan-only / none), shared-cost rule inventory.

## Phase 2 — Optimization opportunities, each with its reliability flag (days 2–3)

Per `finops-engineer/principles/cost-optimization.md`, in its sequence:

1. **Waste (no consumer):** orphaned volumes/snapshots/IPs/LBs, stopped-instance storage, 24/7 non-prod, hot storage never read, dead-end data transfer (NAT for endpoint-eligible traffic, unread cross-region replication). Also: environments with no TTL mechanism — a *structural* finding beyond the instances found.
2. **Pricing-model gaps:** untiered storage, previous-generation volume types (gp2-class), on-demand floors with no commitment coverage (that one goes to Phase 3).
3. **Rightsizing candidates:** sustained-low-utilization resources — flagged with **peak-inclusive evidence only** (max/p99 over a full seasonal window). If only averages are available, say so and downgrade confidence; averages are how the rightsizing-outage story happens.
4. **Autoscaling ceilings:** any max set for cost reasons now sitting ≥80% occupied at peak — that's a capped-growth incident scheduled for later.
5. **Spot posture:** interruption-tolerant workloads on on-demand (opportunity); *and the reverse* — anything on spot without tested interruption handling (a reliability regression already in production).

**Every line in the opportunity list carries three fields:** estimated monthly saving (order-of-magnitude honest), **reliability tradeoff** (`none — pure waste` / `margin change: <what>, needs owner + reliability sign-off per reliability-engineer/principles/capacity-planning.md` / `depends on untested assumption: <what>`), and effort class (ticket / project / roadmap). An opportunity list without the middle column is a list of ways to cause an outage, alphabetized by savings.

## Phase 3 — Commitment & agreement posture (day 3)

Per `finops-engineer/principles/commitments-and-discounts.md`:

1. **Both numbers, labeled:** utilization (of what's committed, how much is used — <95% sustained = waste) and coverage (of eligible usage, how much is discounted — steady on-demand floor ≥3 months = missed savings). At portfolio scale, dispatch `finops-engineer/agents/commitment-utilization-analyzer.md`.
2. **Portfolio shape:** instrument mix vs. the flexibility ladder (pinned-deep on bedrock only?), expiration laddering (a single renewal cliff is both a fire drill and lost negotiation leverage), auto-renew status (should be off), scope/family stranding (RIs pointing at families no longer run).
3. **Process:** is there a purchase cadence and review gate, or were these one-off big-bangs? When was the last purchase reviewed against updated usage?
4. **Enterprise agreement:** burn-down vs. pro-rata line; renewal date (inside 9 months = negotiation prep is already late — `finops-engineer/topics/vendor-negotiation.md`); shortfall exposure under a conservative scenario.
5. **Reconciliation:** does anyone reconcile invoice ↔ export ↔ internal reports monthly? Ask to see last month's. "We don't really" is a Finding — discount-stack opacity is where reconciliation errors hide.

## Phase 4 — Practice maturity (half a day, mostly from interview notes)

Grade against `finops-engineer/principles/operating-model-and-maturity.md`: anomaly detection and time-to-detection of the last real incident (`finops-engineer/principles/cost-anomaly-detection.md`); alert-channel health (volume vs. action rate — a muted channel counts as no detection); showback existence and whether teams *read* it; unit metrics and whether any decision ever cited one (`finops-engineer/principles/unit-economics.md`); forecast existence and last variance review (`finops-engineer/topics/budgeting-and-forecasting.md`); standing cadences with named owners; and the posture question — do teams experience FinOps (if it exists) as a service or as surveillance? The engineer interview answers this more honestly than the FinOps team does.

## Output contract

```markdown
# Cloud Spend Assessment — <org/account> — <date> — basis: amortized net — window: <dates>
## Headline: monthly spend, 12-mo trend, allocation coverage, commitment utilization/coverage, maturity phase (Crawl/Walk/Run)
## Tagging & allocation: coverage by segment | top unallocated items → probable owners | enforcement grade | shared-cost rules present/absent
## Optimization opportunities (ranked by savings × confidence ÷ effort)
[item | est. $/mo | reliability tradeoff (the mandatory column) | effort | evidence]
## Commitment posture: utilization | coverage | shape/ladder findings | EA burn-down & renewal runway | reconciliation status
## Practice findings: detection, reporting, unit economics, cadences, posture
## Remediation plan: ≤3 P0 (this month), ≤5 P1 (this quarter), sequenced per the maturity arc — visibility before optimization
## Data caveats: what you couldn't see, and what that hides
```

**Prioritization rule for the remediation plan:** P0s follow the maturity arc, not the savings ranking. If coverage is <80%, the top P0 is allocation even though the optimization list glitters — an org that fixes visibility first fixes everything else cheaper. The exception: an active runaway or a commitment expiring within 60 days jumps the queue; bleeding outranks blueprints. Cap P0s at three — a 40-item all-P0 plan is how assessments get filed and forgotten (the report-layer version of alert fatigue).

## Related

Executable form: `finops-engineer/skills/spend-posture-assessor/SKILL.md` · fan-out across many accounts: `finops-engineer/orchestration/README.md` · fixing what you find: `finops-engineer/playbooks/build-a-finops-practice-from-scratch.md` (enter at the phase matching the maturity grade)
