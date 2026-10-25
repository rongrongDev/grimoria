# Unit Economics — cost per unit of business value, and the incentives the metric creates

**Applies to:** provider-agnostic; examples assume an allocation layer per `finops-engineer/principles/cost-visibility-and-allocation.md` and an amortized-net cost basis per `finops-engineer/principles/commitments-and-discounts.md`.
**Last verified:** 2026-07-25

**Definitions this doc depends on:** *Unit economics* = cloud cost expressed per unit of business output — cost per customer, per order, per active user, per thousand transactions — rather than as a total. *Cost basis* = which version of "cost" the numerator uses (use amortized net cost, and say so on the report). Full glossary: `finops-engineer/GLOSSARY.md`.

## The one thing to internalize

**Total spend going up is not information. Unit cost going up is.** A bill that doubles while orders triple is a business improving; a flat bill on flat traffic with rising cost-per-order is a business quietly degrading. Unit economics is the translation layer that lets engineering and finance have one conversation instead of two — finance stops asking "why did the bill go up" (usually answerable only with "we grew," which satisfies no one) and starts asking "why did cost per order go up 8% while orders grew 2%," which is a real question with a findable answer. It is also the honest scoreboard for optimization: total-spend savings claims are polluted by growth in both directions; unit-cost trend is not (`finops-engineer/principles/cost-optimization.md`, "measure vs. forecast baseline").

## Choosing the denominator — where this succeeds or fails

The metric is only as good as the unit, and the unit must satisfy three tests:

1. **It maps to business value, not system activity.** Cost-per-request is a fine *engineering* diagnostic and a terrible *business* metric: a chatty client refactor halves your requests and "doubles your efficiency" while nothing about the business changed. Cost-per-request is not cost-per-customer-value. Prefer units someone sells, plans, or promises: order, ride, claim processed, monthly active customer, GB-under-management for a storage product.
2. **The business side already uses it.** If finance forecasts in orders and you report in API calls, you have built a dashboard, not a shared language. Take the denominator *from* the business plan.
3. **It's measurable at the same granularity as your allocation.** A per-feature unit cost needs per-feature cost allocation; if tagging only resolves to team level (`finops-engineer/principles/cost-visibility-and-allocation.md`), a per-feature metric will be built on modeled guesses — fine for exploration, dishonest on an executive dashboard unless labeled as modeled.

**Layer, don't average.** One blended org-wide unit cost across heterogeneous products is a number that moves whenever the *mix* shifts, telling you nothing about efficiency. Healthy pattern: business-level metrics (cost per order) per product line for the exec conversation, supported by engineering-level drivers (cost per 1k requests, per GB processed, per build) per service for diagnosis. When cost-per-order rises, the driver layer tells you *which* system got less efficient — without it you have an alarm and no diagnosis. And expect marginal ≠ average: platforms have a fixed floor (the shared cluster, the observability stack), so average unit cost falls with growth even at zero efficiency change. Separate the fixed floor from the variable slope when the audience needs to know whether growth is *profitable at the margin* — pricing decisions have been made wrong off average unit cost that hid a marginal cost above the price point.

## Failure modes → detection → fix → prevention

### 1. Unit metric doesn't map to business value
- **Failure mode:** the metric optimizes system activity (requests, CPU-hours) and "improves" under changes with zero business impact — or worse, degrades under changes that *help* the business (a feature that adds one API call per order raises cost-per-request while raising revenue).
- **Detection:** the falsification test — list three recent engineering changes and ask whether the metric moved in the direction the *business* would say it should. If a client-batching refactor was your biggest "efficiency win," the denominator is wrong.
- **Fix:** re-derive from the business plan's own units; demote activity metrics to the driver layer.
- **Prevention:** finance/business co-signs the denominator at design time; the metric definition (numerator basis, denominator source, allocation coverage caveat) is written down like an SLO definition, with an owner.

### 2. Perverse incentives — the metric gets gamed
- **Failure mode:** once unit cost carries performance weight, spend migrates to wherever the metric doesn't look. Classic: a team "improves" its cost-per-transaction 20% by moving expensive processing onto the shared platform cluster — team metric down, *total* org cost up, platform team blamed for its growth. Or costs pushed into an unallocated bucket, or a team lobbying for a denominator that flatters ("per API call" for the team with a chatty client).
- **Detection:** watch team unit cost *and* the shared/unallocated buckets together — a team metric improving while shared costs rise disproportionately is the signature. Any denominator-change request gets reviewed for flattery.
- **Fix:** allocate shared-service consumption by metering (`finops-engineer/principles/cost-visibility-and-allocation.md`, shared-cost rules), so cost follows the workload wherever it runs.
- **Prevention:** the deeper rule — **unit cost is a conversation-starter, not a performance target.** The moment a unit-cost number alone determines a rating or a bonus, Goodhart's law is fully armed. Pair any efficiency target with total-cost and reliability context, and make the review question "walk me through why it moved," not "is it green." This is the metric-layer version of the cost-police failure (`finops-engineer/principles/operating-model-and-maturity.md`): metrics that punish create hiding; metrics that inform create fixing.

### 3. Calculated once, never revisited
- **Failure mode:** the metric ships, the deck gets made, and eighteen months later the cost structure has shifted — new product line sharing the infrastructure, a re-architecture moving cost between services, commitment mix changing the cost basis — while the pipeline still allocates by 2024's assumptions. The number is now precise, stable, and wrong; decisions quietly rest on it.
- **Detection:** reconciliation — do the per-unit costs × volumes re-sum to ~the actual amortized bill? A growing residual is drift made visible. Also: any allocation-rule or cost-basis change should visibly step the metric; if it never steps, nobody is maintaining it.
- **Fix:** re-derive allocation rules and denominators against the current architecture and product set; annotate the series at the change point (an unexplained step in a trusted trend line destroys trust faster than a gap does).
- **Prevention:** quarterly metric review (same standing meeting as the commitment purchase review — `finops-engineer/principles/commitments-and-discounts.md` — the attendees overlap); metric definitions live in version control next to the allocation rules, changing by PR with a visible history.

## What good looks like

Two or three business-level unit metrics that finance and engineering both quote unprompted; a driver layer underneath that turns "it went up" into "ingest got less efficient"; definitions in version control with owners; quarterly re-validation; and — the real test — **the last pricing, packaging, or build-vs-buy decision in the org actually cited the unit-cost number, and the number held up when challenged.** A unit metric nobody makes decisions with is a vanity dashboard, whatever its mathematical virtue.

## Related

- The allocation layer these metrics stand on: `finops-engineer/principles/cost-visibility-and-allocation.md`
- The one cost basis to use everywhere: `finops-engineer/principles/commitments-and-discounts.md` (discount-stacking section)
- Unit-cost trend as anomaly/forecast input: `finops-engineer/principles/cost-anomaly-detection.md`, `finops-engineer/topics/budgeting-and-forecasting.md`
- Where unit economics enters the maturity arc (Walk, not Crawl): `finops-engineer/principles/operating-model-and-maturity.md`
- Standing them up from scratch: `finops-engineer/playbooks/build-a-finops-practice-from-scratch.md` (Step 7)
