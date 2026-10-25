# Sustainability & Carbon-Aware Computing — where carbon and cost align, and where they don't

**Tier:** extended — production patterns and common pitfalls only, at the intersection with cost. Full sustainability engineering (SCI methodology, org-level GHG accounting) is beyond this KB's scope.
**Applies to:** AWS Customer Carbon Footprint Tool, GCP Carbon Footprint, Azure Emissions Impact Dashboard as of mid-2026; GHG Protocol scope-2/3 framing; FinOps Foundation's FinOps-for-sustainability guidance.
**Last verified:** 2026-07-25

## The stance

For most workloads, **the cheapest infrastructure is also the lowest-carbon infrastructure**, because both bills are dominated by the same term: machines running that don't need to run. This makes the FinOps function the natural first home for sustainability work — the waste harvest in `finops-engineer/principles/cost-optimization.md` (orphaned resources, idle non-prod, oversized fleets, hot storage nobody reads) is a carbon-reduction program that pays *you*. Start there; it's the only sustainability initiative that never needs a budget defense. But the alignment is not total, and pretending it is produces greenwash — the honest work is knowing which regime you're in.

## Production patterns

- **Harvest the double wins first and report them as such.** Every deleted orphan, scheduled-off dev environment, rightsized fleet (peak-inclusive evidence and owner sign-off still mandatory — carbon does not override the reliability-impact line), and lifecycle-tiered archive reduces both lines. Adding the carbon number to existing optimization reporting costs nearly nothing and often unlocks executive sponsorship that "cost hygiene" alone couldn't.
- **Use the provider tools for direction, not precision.** Provider carbon dashboards lag months, use differing methodologies (market-based vs. location-based scope-2 accounting differ materially — know which one you're quoting before it lands in a public claim), and allocate shared-infrastructure emissions with the same shared-cost ambiguity this KB fights on the dollar side (`finops-engineer/principles/cost-visibility-and-allocation.md`). Good for trends and big rocks; not audit-grade without the sustainability team's methodology work.
- **Region and time flexibility are the carbon-specific levers.** Grid carbon intensity varies several-fold by region and by hour. Batch and other time/place-flexible workloads can be scheduled carbon-aware — and this composes naturally with spot capacity (`finops-engineer/principles/cost-optimization.md`), since both reward flexibility. Check the cost coupling *per case*: low-carbon regions are sometimes cheaper, sometimes not, and data-gravity egress can eat the benefit both ways (`finops-engineer/topics/multi-cloud-cost.md`, egress amnesia).
- **Efficiency metrics travel.** Carbon-per-unit-of-business-value is unit economics with a different numerator — reuse the denominators, the allocation layer, and the review cadence from `finops-engineer/principles/unit-economics.md` rather than building a parallel stack.

## Common pitfalls

- **Carbon as a tiebreaker that never ties.** A "we consider sustainability" policy with no metric, no owner, and no decision it ever changed. If carbon matters, it appears in the design-review template next to cost (`finops-engineer/principles/operating-model-and-maturity.md`, cost-at-decision-time) with at least directional numbers; otherwise it's a values statement, not a practice.
- **Chasing carbon into cost cliffs.** Migrating a data-heavy workload to a lower-carbon region without pricing egress and duplication, or forcing latency-sensitive serving into a far green region and eating an SLO regression. Reliability and cost constraints don't yield to carbon enthusiasm: same proposal discipline, all three lines filled in (cost delta, reliability impact per `reliability-engineer/`, carbon delta).
- **Double-counting the same electron.** The provider's renewable-matching claims, your market-based instruments, and workload-level "green region" claims can overlap; summing them overstates impact. When numbers leave the building (ESG reporting), route them through whoever owns GHG accounting — FinOps supplies usage data, not accounting methodology.
- **Optimizing the dashboard, not the emissions.** Moving workloads to a provider/region whose *accounting* is greener (market-based offsets) without changing physical consumption. Location-based numbers keep you honest internally even if market-based numbers are what gets reported externally.

## Related

`finops-engineer/principles/cost-optimization.md` (the shared waste harvest) · `finops-engineer/principles/unit-economics.md` (metric machinery) · `finops-engineer/principles/cost-visibility-and-allocation.md` (shared-emission allocation inherits shared-cost rules) · `finops-engineer/topics/multi-cloud-cost.md`
