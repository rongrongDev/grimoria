# Cost Optimization — rightsizing, spot, autoscaling, and waste, without breaking production

**Applies to:** AWS / GCP / Azure compute, storage, and data-transfer pricing constructs as of mid-2026 (spot/preemptible markets, gp3/pd-balanced-class volumes, S3/GCS/Blob storage tiers). Commitment-based discounts (RIs, Savings Plans, CUDs) are their own discipline: `finops-engineer/principles/commitments-and-discounts.md`.
**Last verified:** 2026-07-25

**Definitions this doc depends on:** *Rightsizing* = matching a resource's provisioned capacity to its actual requirement. *Spot/preemptible capacity* = deeply discounted (60–90%) compute the provider can reclaim with minutes-or-less notice. *Waste* = spend producing no business value at any reliability level (the orphaned volume, the idle dev cluster at 2am). Full glossary: `finops-engineer/GLOSSARY.md`.

## The prime directive: cheaper-but-less-reliable is not a win

Every recommendation in this doc is subordinate to one rule: **an optimization that consumes a safety margin is a reliability decision wearing a cost costume, and reliability decisions belong to the service owner and `reliability-engineer/` judgment — not to FinOps unilaterally.** Headroom, replica counts, autoscaling limits, and capacity buffers exist on purpose (`reliability-engineer/principles/capacity-planning.md`). The cost saved by eating a margin is visible on next month's invoice; the cost of the outage it causes arrives later, larger, and on someone else's pager.

This is not theoretical caution. The formative incident: a rightsizing pass, driven from a month of **average** CPU utilization, shrank a stateless-looking fleet by 40%. Averages said 12% utilization; the daily peak said 70%, and the quarterly marketing-event peak — which was in the *previous* month's data, outside the analysis window — said 4×. The next campaign took the service down for 3 hours. Direct revenue loss exceeded two *years* of the projected instance savings, and the org's next three legitimate optimization proposals died in review because "remember last time." A bad optimization doesn't just cost an outage; it poisons the well for every future one.

**Practical rule:** every optimization recommendation ships with a filled-in **reliability-impact line**: what margin changes, what load evidence was used (peak-inclusive, per below), who signed off, and how it will be rolled back. "None — this is pure waste with no consumer" is a valid entry (orphaned volume) and the only entry that skips service-owner sign-off.

## Waste first: the free money with no reliability tradeoff

Before touching anything live, harvest the spend with *no* consumer — highest ratio of savings to risk, and it builds the credibility you'll need for the harder conversations:

- **Orphaned resources:** unattached volumes and old snapshots, unassociated static IPs, idle load balancers, stopped-instance storage, aged AMIs/images, load-test artifacts. Detection is mechanical (zero attachment/zero traffic over 30d); deletion still gets a human confirm and a snapshot-before-delete for storage — "idle-looking" and "safe to delete" differ exactly when it's the DR standby or the compliance archive. I traced one "mysterious" $20k/month plateau to a forgotten performance-test environment — tagged, even! — that had run for 14 months because teardown wasn't in the test's definition of done. Prevention beats detection: **ephemeral environments get a TTL at creation** (auto-teardown, owner can renew), because the only environment that never becomes waste is the one that deletes itself.
- **Non-prod schedules:** dev/staging that runs nights and weekends is paying 168 hours for 50 hours of use. Auto-stop schedules with a self-serve override; never schedule anything tagged `env: prod` — and verify the tag before trusting it (`finops-engineer/principles/cost-visibility-and-allocation.md`, failure mode 4).
- **Storage tiering and lifecycle:** logs and backups that never leave hot storage; enable intelligent-tiering/lifecycle rules where access patterns fit. Check retrieval pricing before archiving anything with a plausible bulk-restore need — archive tiers charge for retrieval, and a DR restore from deep archive is both slow and expensive at the worst possible moment (RTO implications: `reliability-engineer/topics/disaster-recovery.md`).
- **Data transfer:** cross-AZ chatter between services that could be zone-aware, NAT-gateway processing for traffic that should use VPC endpoints, cross-region replication nobody reads. Often invisible because transfer line items are the least-tagged spend in the bill.

## Rightsizing: the decision tree

For each candidate (flagged by utilization <~20% sustained, or recommender tooling):

1. **Is the load evidence peak-inclusive?** Minimum: max and p99 (not average) utilization over a window covering the service's **full seasonality** — weekly cycle at least, plus known event peaks (launch days, month-end batch, marketing calendar). If the window misses a known peak class → **stop, extend the window**. Averages are how the formative incident above happens; a fleet at 12% average and 70% peak is not 80% oversized.
2. **Is the headroom deliberate?** Ask the owner before concluding it's waste. Deliberate margins (failover capacity, error-budget headroom, pre-scaled launch capacity) are `reliability-engineer/` territory — if the answer is "that's our N+1," the finding is closed, not escalated.
3. **Peak-inclusive requirement still below provisioned?** Size to **peak + the owner's stated margin**, not to peak. Then check the change doesn't cross a cliff: fewer/smaller instances can mean less burst capacity (burstable-class credits), fewer IOPS (volume size-linked), less network, less per-AZ redundancy.
4. **Ship it like a deploy, not an edit:** one service at a time, canary-style, watching the service's SLO signals (not just CPU) through at least one peak cycle, with rollback ready. The deploy mechanics are `devops-engineer/principles/deployment-strategies.md`; the "watch the SLO" contract is `reliability-engineer/principles/slos-and-error-budgets.md`.
5. **Check the commitment interaction:** shrinking or re-familying instances can strand instance-family-scoped reservations — you stop paying on-demand and start paying for an unused RI instead, saving nothing. Coordinate with the commitment portfolio (`finops-engineer/principles/commitments-and-discounts.md`) *before* the change, not after the utilization report drops.

## Spot/preemptible: the decision tree

Discounts of 60–90% for capacity that can vanish with ≤2 minutes' notice. The discount is compensation for an engineering obligation, not free money.

- **Use spot when** the workload is interruption-tolerant *by construction*: stateless and behind a load balancer with surplus capacity, or batch with checkpointing and retry, or CI runners, or data-processing frameworks with task-level retry. "Tolerant by construction" means someone has **tested** an interruption (kill instances mid-work and watch — chaos-engineering method: `reliability-engineer/topics/chaos-engineering.md`), handles the termination notice (drain, checkpoint, deregister), and diversifies across instance types/pools so one pool's reclaim wave isn't a full outage.
- **Do not use spot for** stateful primaries and single points of failure, latency-critical serving with no surplus capacity, workloads where an interruption costs more (re-run time, missed SLA) than the discount saves, or anything whose owner hasn't signed the reliability-impact line. **Never as a silent default** in a shared compute platform — the platform team's discount becomes tenant teams' mystery failures, and they'll burn engineer-weeks debugging "flaky infrastructure" that is working exactly as purchased.
- **Baseline/burst split:** cover the always-on floor with committed-use discounts, serve the elastic layer with spot, leave on-demand as the fallback the autoscaler actually uses when spot is unavailable.

## Autoscaling for cost: floors, ceilings, and the silent cap

Autoscaling is a cost tool (pay for the curve, not the peak) and a reliability tool; the settings encode both. Scaling mechanics belong to `devops-engineer/`; the economics and the failure mode below are ours.

- **The floor (min replicas)** is a reliability number — it buys cold-start protection and failure headroom. FinOps may *ask* why the floor is 20 when the overnight trough needs 3; the answer and the change belong to the service owner.
- **The ceiling (max replicas)** set for cost containment is the dangerous one. **Failure mode:** a max set during a cost push quietly becomes the bottleneck a year later when legitimate traffic grows into it — the service doesn't fail loudly, it just degrades at peak while the autoscaler reports "working as configured." **Detection:** alert when actual scale reaches ≥~80% of max sustained; review all ceilings quarterly against traffic growth. **Fix:** raise the ceiling *before* raising it becomes an incident retro item. **Prevention:** every cost-motivated ceiling carries an annotation (who, why, review-by date) in the IaC, so it can't outlive its rationale silently.

## Failure modes → detection → fix → prevention (summary table)

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Rightsizing from averages breaks peak traffic | Post-change SLO regression at next peak; pre-change: analysis window vs. seasonality calendar | Roll back capacity first, re-analyze with peak-inclusive data | Peak-inclusive evidence + owner sign-off mandatory on every rightsizing proposal (the reliability-impact line) |
| Orphaned/forgotten resources accumulate | Zero-utilization/zero-attachment sweeps; spend plateaus nobody claims (`finops-engineer/agents/unallocated-spend-scanner.md` finds the unowned ones) | Confirm with owner → snapshot → delete | TTLs on ephemeral environments; teardown in the definition of done |
| Spot without interruption handling | Elevated error rates correlated with reclaim events; unexplained "flakiness" on spot-backed pools | Move workload back to on-demand until handling is built *and tested* | Spot adoption checklist gated on a tested interruption drill; never spot-by-default in shared platforms |
| Cost-motivated autoscaling ceiling caps real growth | Scale at ≥80% of max sustained; peak-hour latency degradation with flat replica count | Raise ceiling; verify with owner | Annotated, review-dated ceilings; quarterly ceiling review vs. growth |
| Optimization strands commitment coverage | Commitment utilization drops after a rightsizing/migration wave (`finops-engineer/agents/commitment-utilization-analyzer.md`) | Exchange/rebalance the commitment (convertible RIs, flexible SPs) where possible | Commitment-impact check in the optimization proposal template |

## Sequencing an optimization program

1. **Waste** (no consumer, no tradeoff) → builds trust and funds attention.
2. **Pricing-model moves** (storage tiers, gp2→gp3-class migrations, commitments for the stable floor) → big savings, minimal architecture risk; commitments get their own discipline (`finops-engineer/principles/commitments-and-discounts.md`).
3. **Rightsizing and scheduling** (touches live capacity) → per the decision tree, with owner sign-off.
4. **Architecture** (spot adoption, tiering redesigns, service consolidation, cross-AZ topology) → largest savings, real engineering investment; these are roadmap items priced in engineer-weeks, not tickets.

Jumping to stage 3–4 before stage 1–2 is the classic mistake — hardest conversations first, easiest wins unharvested, and no track record to spend. And measure results as **trend vs. forecast baseline, not vs. last month** — growth can mask real savings and make a failed initiative look successful, or vice versa; the feedback loop into forecasting is `finops-engineer/topics/budgeting-and-forecasting.md`.

## Related

- Reserved/committed capacity strategy: `finops-engineer/principles/commitments-and-discounts.md`
- Review one commitment purchase before signing: `finops-engineer/skills/commitment-proposal-reviewer/SKILL.md`
- Whole-account opportunity scan with reliability flags: `finops-engineer/skills/spend-posture-assessor/SKILL.md` and `finops-engineer/playbooks/assess-an-existing-cloud-spend-setup.md`
- Why optimization agents must never hold delete/purchase permissions: `finops-engineer/orchestration/README.md`
- Safety margins and capacity judgment this doc defers to: `reliability-engineer/principles/capacity-planning.md`, `reliability-engineer/principles/slos-and-error-budgets.md`
