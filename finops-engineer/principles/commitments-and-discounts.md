# Commitments & Discounts — reserved capacity, savings plans, and not marrying a usage snapshot

**Applies to:** AWS Standard/Convertible RIs and Compute/EC2-Instance Savings Plans, GCP resource-based and flexible (spend-based) CUDs, Azure Reservations and Savings Plans for Compute — construct behavior as of mid-2026. Discount percentages and exchange rules change; verify current terms before any purchase. Enterprise-agreement negotiation (EDP/MACC/GCP commit contracts) is `finops-engineer/topics/vendor-negotiation.md`.
**Last verified:** 2026-07-25

**Definitions this doc depends on — and the two most confused numbers in FinOps:**
- **Utilization** = of what you committed to, how much you used. Low utilization = paying for commitment you don't use = **waste**.
- **Coverage** = of your eligible usage, how much is discounted by commitments. Low coverage = paying on-demand rates unnecessarily = **missed savings**.
- A portfolio can be 100% utilized and 40% covered (under-committed), or 100% covered and 70% utilized (over-committed). You need both numbers, always, and reporting one as the other has misled real executive teams — I watched "94% utilization" get reported for two quarters while the portfolio sat 30% oversized; the words blurred, the waste compounded. Full glossary: `finops-engineer/GLOSSARY.md`.

## The one thing to internalize

A commitment is **a bet that a usage snapshot will still be true in one to three years**. The discount (roughly 20–45% for 1-year, 40–65% for 3-year terms, varying by construct) is the price the provider pays you for transferring demand risk from them to you. Every commitment failure mode is a version of the same mistake: sizing the bet from a snapshot without asking *what could make this snapshot false* — a migration to a new instance family, a re-architecture to serverless or managed services, a product sunset, a Kubernetes bin-packing improvement, an acquisition or divestiture, or last quarter's rightsizing program finally landing (`finops-engineer/principles/cost-optimization.md` — optimization *shrinks* the base your commitments cover; sequence them consciously).

The formative incident: a company bought 3-year standard RIs covering 90% of a snapshot of its largest service's fleet — peak discount, maximum term, CFO delighted. Eight months later the platform team migrated that service to a newer instance family for performance. The RIs were family-scoped and non-convertible. Result: ~$1.4M of committed spend over the remaining term paying for capacity nobody ran, *plus* on-demand rates on the new family. The postmortem finding was not "shouldn't have committed" — it was "committed the wrong shape": flexible spend-based commitments at a moderate coverage target would have survived the migration untouched.

## The instrument spectrum: flexibility vs. discount

Every provider sells the same tradeoff under different names — **the more you pin down (instance family, region, term), the deeper the discount; the more you leave flexible, the more org change your commitment survives.**

| Most flexible → least | AWS | GCP | Azure |
|---|---|---|---|
| Spend-based, broadest scope | Compute Savings Plan ($/hr of compute spend, any family/region) | Flexible CUD (spend-based) | Savings Plan for Compute |
| Resource-shaped, some flexibility | Convertible RI (exchangeable) | — | Reservation (exchange/refund rules apply — verify current policy; Azure has repeatedly tightened them) |
| Resource-pinned, deepest discount | Standard RI / EC2-Instance SP (family-scoped) | Resource-based CUD (region+family) | Reservation, scoped |

**Layering rule (the ladder):** cover the *bedrock* (usage you'd bet the company keeps for 3 years — the floor beneath every migration scenario) with the deepest-discount pinned instruments; cover the *stable-but-evolving* layer with flexible spend-based instruments at 1-year terms; leave the *elastic and uncertain* layer to on-demand and spot (`finops-engineer/principles/cost-optimization.md`). Buying the deepest instrument for the middle layer is how the $1.4M story happens; buying only flexible instruments for true bedrock leaves ~10–20 discount points on the table.

## Sizing: the decision tree

1. **Establish the base from ≥6 months of hourly (not monthly-average) usage.** Commitments apply hourly: a workload averaging 100 instances that oscillates 40–160 daily is a 40-instance commitment candidate, not 100. Monthly averages overstate the floor — this alone explains most accidental over-commitment.
2. **Subtract known futures:** planned migrations, sunsets, pending rightsizing, workloads moving to spot. The pipeline of *planned optimization* comes first — commit to the post-optimization floor, or the commitment locks in the waste you were about to remove.
3. **Target coverage of the floor, not of current usage.** Healthy pattern: commit to ~70–85% of the *conservative floor* so utilization stays near 100% even if usage dips; chasing 95%+ coverage of *current usage* guarantees waste on the first dip. Under-commitment costs you the discount delta on the uncovered slice; over-commitment costs you 100% of the unused commitment. **The asymmetry means when uncertain, commit less** — you can always buy more next quarter; you can rarely un-buy.
4. **Buy incrementally, on a cadence.** Quarterly (or monthly, at scale) purchase reviews sized against updated usage, not one annual big-bang purchase. Laddered expirations also mean no single renewal cliff — a portfolio that all expires the same month is a negotiation-leverage gift to the provider and a fire drill for you.
5. **Gate every purchase through review.** A commitment is a multi-year financial instrument; it gets the scrutiny of one. The checklist is executable: `finops-engineer/skills/commitment-proposal-reviewer/SKILL.md`. Purchases are made by humans with finance sign-off — never by automation (`finops-engineer/orchestration/README.md`).

## Failure modes → detection → fix → prevention

### 1. Over-commitment (locked-in waste)
- **Failure mode:** committed capacity exceeds actual usage — from big-bang purchases off monthly averages, from ignoring the optimization pipeline, or from org change (the $1.4M migration story).
- **Detection:** utilization below ~95% sustained for a month is a flag; below 90% is a fire. Monitor per-instrument, not just portfolio-wide — a healthy aggregate can hide one dead RI inside an otherwise-used pool. Dispatch `finops-engineer/agents/commitment-utilization-analyzer.md` for the full reconciliation.
- **Fix (in order):** re-point usage onto the commitment (move eligible workloads to the committed family/region — sometimes the cheapest fix is using what you already bought); exchange (convertible RIs, flexible constructs) toward what you actually run; sell on the marketplace where one exists (AWS standard RIs; verify current rules); as a floor, treat the remaining term as sunk and *stop renewing* — do not let auto-renew re-buy the mistake.
- **Prevention:** hourly-floor sizing; incremental cadence; the pre-purchase review's "what could make this snapshot false" question; auto-renew **off** everywhere, with expirations on the purchase-review calendar instead.

### 2. Under-commitment (paying retail for the floor)
- **Failure mode:** stable usage runs months at on-demand rates — usually from fear after a past over-commitment burn, or because nobody owns the purchase cadence. Costs 20–60% extra on the uncovered floor, silently; unlike over-commitment it never shows up as a scary "waste" number, which is why it persists.
- **Detection:** coverage report — eligible usage running steadily on-demand ≥3 months with no planned change is the signal.
- **Fix:** buy, per the sizing tree; start with flexible instruments if the org is commitment-shy — a 1-year spend-based commitment at 70% of the obvious floor is a nearly unloseable bet, and it rebuilds the institutional courage.
- **Prevention:** a standing quarterly purchase review with a named owner; report *missed savings* (uncovered floor × discount delta) as a first-class number next to waste, so under-commitment hurts visibly too.

### 3. Discount-stacking opacity (nobody can compute the real unit cost)
- **Failure mode:** RIs + Savings Plans + enterprise-agreement discount + credits + private pricing stack until no one can say what an hour of compute actually costs; invoice reconciliation errors hide inside the stack; showback/unit-economics numbers silently use the wrong cost basis. Amplified in consolidated billing, where the provider applies commitment benefit across accounts in ways that scramble naive per-account reports ("who gets the RI discount" is an allocation policy decision — decide it, write it down: `finops-engineer/principles/cost-visibility-and-allocation.md`).
- **Detection:** monthly reconciliation of invoice vs. cost-data-export vs. your reporting layer, to the dollar per major dimension. If finance's number and the FinOps dashboard's number differ and nobody can explain the delta, you are already here.
- **Fix:** standardize every internal report on **one cost basis — amortized net cost** (commitment prepayments spread over their term, all discounts applied) — and label it on every report. Blended/unblended/list-price numbers answer different questions; mixing them in one report chain is how the same month shows three different totals.
- **Prevention:** the reconciliation is a monthly *calendar event with an owner*, not a when-something-looks-weird activity; every new discount instrument gets added to the reconciliation checklist at signing time.

## What good looks like

Utilization ≥95% and coverage ~70–85% of the eligible floor, both reported monthly and *labeled correctly*; purchases on a quarterly cadence, each through the review gate, expirations laddered; one amortized-cost basis across all reporting; and — the real test — **the last org change that shifted usage (a migration, a sunset, an optimization wave) did not strand a commitment, because the portfolio's shape assumed change.**

## Related

- Pre-purchase gate for one proposal: `finops-engineer/skills/commitment-proposal-reviewer/SKILL.md`
- Portfolio-wide reconciliation: `finops-engineer/agents/commitment-utilization-analyzer.md`
- The on-demand/spot layers commitments sit beneath: `finops-engineer/principles/cost-optimization.md`
- Enterprise-agreement leverage and negotiation: `finops-engineer/topics/vendor-negotiation.md`
- Commitment posture inside a full assessment: `finops-engineer/playbooks/assess-an-existing-cloud-spend-setup.md`
