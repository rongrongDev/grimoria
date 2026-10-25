# GLOSSARY — finops-engineer

One glossary, at the root, for every term of art in this KB. Terms link to the doc that carries the judgment. Provider-specific constructs are stamped; they change faster than concepts. **Last verified:** 2026-07-25.

**Allocation** — Attributing every dollar of cloud spend to an owner (team, service, product, environment) via tags, account boundaries, and shared-cost rules. The foundation everything else stands on. → `principles/cost-visibility-and-allocation.md`

**Allocation coverage** — % of spend attributable to an owner. Report it spend-weighted and segmented; track the trend. The Crawl-phase health metric.

**Amortized cost** — Cost basis that spreads commitment prepayments over their term instead of showing purchase-month spikes. With discounts applied = **amortized net cost**, this KB's standard basis for all internal reporting. Contrast **unblended** (cash-timing view, purchases spike) and **blended** (provider-averaged rates across consolidated accounts). Mixing bases in one report chain is how the same month shows three totals. → `principles/commitments-and-discounts.md`

**Anomaly (cost)** — Spend deviating from expected pattern. Not necessarily bad — the triage classes are **legitimate growth / misconfiguration (runaway) / waste / one-off**. → `principles/cost-anomaly-detection.md`, `skills/cost-anomaly-triager/`

**Billing lag** — Delay (8–48h by service, as of 2026) between resource usage and its appearance in billing data. Why runaway detection needs usage-level signals and quotas, not just cost data.

**Chargeback** — Allocated costs actually transferred to the owning team's budget/P&L. Requires ~90%+ coverage, agreed shared-cost rules, and team control over cost drivers; otherwise it produces politics, not efficiency. Contrast **showback**. → `principles/cost-visibility-and-allocation.md`

**Commitment / committed-use discount** — Umbrella for instruments trading a 1–3 year usage or spend promise for a 20–65% discount: AWS **Reserved Instances (RIs)** (standard = pinned, convertible = exchangeable) and **Savings Plans** ($/hr spend commitment; Compute = flexible, EC2-Instance = family-scoped), GCP **CUDs** (resource-based = pinned; flexible = spend-based), Azure **Reservations** and **Savings Plan for Compute**. Constructs as of mid-2026. → `principles/commitments-and-discounts.md`

**Coverage (commitment)** — Of eligible usage, the share receiving commitment discounts. Low coverage = missed savings (paying on-demand for the stable floor). **Not the same number as utilization** — conflating them has misled real executive teams for quarters.

**Crawl / Walk / Run** — FinOps maturity phases (FinOps Foundation framing): see it → own it → decide with it. Skipping phases — optimizing on data nobody trusts — is the most common failure in the discipline. → `principles/operating-model-and-maturity.md`

**Discount stacking** — Multiple discount layers (EA % × commitments × credits × private pricing) compounding until real unit cost is opaque and reconciliation errors hide. Fix: one labeled cost basis + monthly invoice reconciliation. → `principles/commitments-and-discounts.md`

**Egress** — Data-transfer-out charges; the recurring tax on cross-cloud and cross-region patterns, and the least-tagged spend in most bills. → `topics/multi-cloud-cost.md`

**Enterprise agreement** — Org-level spend-commitment contract wrapping everything: AWS **EDP/PPA**, Azure **MACC**, GCP committed-spend contracts. Stacks with resource commitments. Commit to the conservative floor, never the growth plan. → `topics/vendor-negotiation.md`

**FinOps** — The operating practice connecting engineering decisions to financial accountability. A continuous function like security or reliability — not a tool, not a quarterly cost-cutting project. → `principles/operating-model-and-maturity.md`

**FOCUS** — FinOps Open Cost and Usage Specification (1.x as of 2026); the normalization schema for multi-cloud billing data. → `topics/multi-cloud-cost.md`

**Forecast-to-exceed alert** — Budget alert firing when the *projected* month-end total will breach, rather than when spend already has. Fires mid-month with time to act; the actual-100% alert is an obituary. → `topics/budgeting-and-forecasting.md`

**On-demand** — Undiscounted pay-as-you-go rates; the correct home for the elastic/uncertain layer, and the expensive default for everything else.

**Orphaned resource** — A resource with no consumer: unattached volumes, unassociated IPs, forgotten environments. The safest savings (no reliability tradeoff) — but *idle-looking* ≠ *safe-to-delete* (the DR standby problem); confirmation before deletion, always. → `principles/cost-optimization.md`

**Reliability-impact line** — This KB's mandatory field on every optimization proposal: what safety margin changes, the peak-inclusive evidence, the owner sign-off, the rollback plan. The mechanism enforcing that cost never unilaterally overrides `reliability-engineer/` judgment. → `principles/cost-optimization.md`

**Rightsizing** — Matching provisioned capacity to actual requirement — sized to **peak-inclusive** evidence (max/p99 over full seasonality) plus deliberate margin, never to averages. Averages caused the outage this KB keeps citing. → `principles/cost-optimization.md`

**Showback** — Reporting each team's allocated costs to them, no money moving. Always the first step; sometimes correctly the last. → `principles/cost-visibility-and-allocation.md`

**Spot / preemptible capacity** — 60–90%-discounted compute reclaimable by the provider on minutes-or-less notice. The discount pays for an engineering obligation (tested interruption handling, pool diversification); without it, spot is a reliability regression at a discount. → `principles/cost-optimization.md`

**Tag / label** — Key-value metadata on resources; the fine-grained allocation mechanism. Only as real as its creation-time enforcement, and a tag can be present, valid, and *wrong* (three separate checks). AWS cost-allocation tags require activation (not retroactive). → `principles/cost-visibility-and-allocation.md`, `skills/tag-coverage-auditor/`

**TTL (environment)** — Auto-teardown deadline attached to ephemeral environments at creation. The only environment that never becomes waste is the one that deletes itself. → `principles/cost-optimization.md`

**Unallocated spend** — The bucket no owner claims. Above ~10–15% it corrodes report credibility and hides anomalies. Distinguish governance failures (fixable by tags/rules) from the structurally untaggable slice (some transfer, support, credits). → `agents/unallocated-spend-scanner.md`

**Unit economics** — Cloud cost per unit of business output (per order, per customer, per active user). The translation layer between engineering and finance, and the honest scoreboard for optimization. Denominators come *from the business plan*, and unit cost is a conversation-starter, never a performance target (Goodhart). → `principles/unit-economics.md`

**Utilization (commitment)** — Of what was committed, the share actually used. Below ~95% sustained = paying for capacity nobody runs. **Not coverage** — see that entry, and keep the two labeled in every report.

**Waste** — Spend producing no business value at any reliability level. Stage one of every optimization program: highest savings-to-risk ratio, and the win that buys goodwill for the harder conversations. → `principles/cost-optimization.md`
