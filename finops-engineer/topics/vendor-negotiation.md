# Vendor & Enterprise-Agreement Negotiation — leverage is a number you compute, not a mood

**Tier:** extended — production patterns and common pitfalls only. The commitment instruments these agreements wrap around: `finops-engineer/principles/commitments-and-discounts.md`.
**Applies to:** AWS EDP/PPA (Enterprise Discount Program / Private Pricing), Azure MACC (Microsoft Azure Consumption Commitment) within an EA or MCA, GCP committed-spend contracts, and large SaaS/marketplace agreements — construct behavior as of mid-2026. Specific discount bands are confidential and change; the mechanics below are stable.
**Last verified:** 2026-07-25

## The stance

An enterprise agreement is a *spend-based* commitment (you promise the provider $X over N years; they discount everything) layered on top of your *resource-based* commitments (RIs/SPs/CUDs — which still apply, and stack). The negotiation is won or lost **before anyone talks to the account team**, in the quality of your own usage analysis. The provider's negotiators know your consumption trajectory in detail — it's their data. Walking in without your own equivalent analysis means negotiating against someone who knows your business better than you do, and the resulting agreements are how orgs end up committed to spend growth they were never going to hit.

## Production patterns

- **Compute your leverage before the first meeting.** Leverage = credible growth (their upside), credible *alternatives* (workloads that could genuinely move — multi-cloud posture per `finops-engineer/topics/multi-cloud-cost.md`, or on-prem repatriation for stable heavy workloads), and time (never negotiate inside the renewal quarter; start 6–9 months out, because the calendar is leverage and they know your expiry date too).
- **Commit to your conservative floor, not your growth plan.** Same asymmetry as instrument sizing (`finops-engineer/principles/commitments-and-discounts.md`): overshooting a spend commitment means a true-up/shortfall payment or panic-spending to hit the number (buying things you don't need to avoid paying for nothing — I've watched a company migrate workloads *onto* a more expensive service in Q4 to burn down a MACC; the tail wagging the dog, at a loss). Undershooting your ask just means renegotiating up next year from a position of demonstrated growth — which is the *good* problem.
- **Negotiate the whole envelope, not just the discount percentage.** Often worth more than an extra point of discount: commitment-shortfall treatment (rollover vs. forfeit), migration/PoC credits, support-tier pricing (enterprise support is a % of spend — it's negotiable), payment terms, marketplace spend counting toward the commitment (it usually can — route eligible SaaS purchases through the marketplace to burn down the commitment with spend you'd incur anyway), renewal terms, and price protections on the services you're concentrated in.
- **Model at least three scenarios** (conservative / plan / stretch) with the shortfall cost of each commitment tier priced out. Present internally *before* the provider anchor arrives — the first number spoken tends to gravitationally capture the negotiation, so make sure your side has its own number first.
- **Run the agreement after signing.** Track commitment burn-down monthly against the pro-rata line, exactly like commitment utilization (`finops-engineer/agents/commitment-utilization-analyzer.md` includes EA burn-down in its scope). An agreement is a portfolio object with an owner and a review cadence, not a signed PDF in a drawer.

## Common pitfalls

- **Negotiating from aggregate spend without usage understanding.** If you can't say which services, which growth drivers, and which workloads are mobile, you can't price your own alternatives — and the account team can. The pre-negotiation usage analysis is Walk-maturity work (`finops-engineer/principles/operating-model-and-maturity.md`); an org at Crawl should fix visibility before signing multi-year paper.
- **Growth-plan commitments.** The plan says 40% YoY; the commitment assumes it; the plan misses (plans miss); now you're panic-spending or paying shortfall. Commit to the floor. Every time.
- **The discount% trophy.** A headline discount on a bloated committed number costs more than a smaller discount on an honest one. The metric that matters is *total expected cost across scenarios*, not the percentage in the announcement deck.
- **Renewal-quarter negotiation.** Starting late converts every one of your alternatives from credible to theoretical — nobody migrates a workload in six weeks — and the account team's calendar shows your expiry date in bold.
- **Discount-stack opacity after signing.** EA discount × RI/SP × credits × private pricing = nobody can compute the real unit cost, and reconciliation errors hide in the stack. The fix is the single amortized-net cost basis and monthly invoice reconciliation from `finops-engineer/principles/commitments-and-discounts.md` — add every new agreement term to that reconciliation checklist at signing time.

## Related

`finops-engineer/principles/commitments-and-discounts.md` · `finops-engineer/topics/multi-cloud-cost.md` · `finops-engineer/topics/budgeting-and-forecasting.md` (the scenario models are forecast products) · `finops-engineer/principles/operating-model-and-maturity.md`
