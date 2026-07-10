# Production-Scale Data Subsetting

> Last reviewed: 2026-07-09. Applies to: Jailer 16.x (open source), Tonic.ai / Delphix subsetting (commercial), hand-rolled FK-walk extractors on PostgreSQL 16/17; concepts are engine-agnostic.
> **Extended-tier doc:** production patterns + common pitfalls. When subsetting is the right source at all is decided by the master tree in `../principles/core-principles.md`; masking the result is `../principles/masking-and-anonymization.md` (subsetting is almost always its upstream stage).

## The judgment

Subsetting exists because of an inequality: **production shape is unfakeable, and production volume is unusable.** You subset when a test needs real distributions, real referential tangles, real dirty data — at 1/50th the size, so environments load in minutes instead of days. The craft is in what "a consistent 2%" means: a subset is not 2% of each table; it is **a closed world** — a chosen population of root entities plus *every row reachable from them* — that the application cannot tell apart from a small production.

The dual constraint that makes it hard: the subset must be **referentially closed** (no dangling FK, or the app breaks) and **statistically honest for the test's purpose** (or the app works and the test lies). Most tools handle the first; the second is judgment, and it's where subsets quietly fail.

## Production patterns

**1. Root-entity selection defines everything downstream.** Pick the root (customers, tenants, accounts), select a population, then walk the FK graph to closure. The selection is a *sampling design*, not a `LIMIT`: random sample for general shape, **plus stratified quotas for the tails** — the enterprise tenant with 4M rows, the account with 10 years of history, the user mid-way through every state machine. A random 2% of customers contains zero of your ten largest tenants with ~82% probability; and the largest tenant is where the perf bugs live. Encode the strata explicitly (`all tenants > P99 volume; N per plan tier; N per lifecycle state; random fill to budget`) and version that spec like code.

**2. Walk the graph in both directions, with a stop-list.** Children of selected roots (customer → orders → line items) are mandatory for closure. Parents/shared references (order → product, product → category) must be *included* (they're the closure too) but **not expanded** (product → all orders of that product drags in everyone). Every serious subsetter distinguishes walk-down, include-only, and do-not-cross edges; hand-rolled extractors that treat all FKs alike either dangle or engulf. The stop-list — plus how to handle cycles (users ↔ their approving manager) and polymorphic/soft FKs the schema doesn't declare (`*_type` + `*_id` columns, JSON references) — is the actual engineering content of a subsetter. Undeclared FKs are the chronic leak: inventory them the same way you inventory hidden PII (`../agents/pii-field-scanner.md` finds both — same sweep, two report sections).

**3. Global tables ship whole.** Reference/lookup tables (currencies, country codes, plan definitions, config) are copied entirely, never sampled — they're small, and a sampled reference table is a world with missing physics. The subset spec declares each table's class: `root | walked | reference-whole | excluded` (audit/log tables usually `excluded` — they're volume without test value, unless the test is *about* audit).

**4. Validate closure and shape as the pipeline epilogue.** Same discipline as generation (`../principles/seeding-and-synthetic-data.md` failure mode #4): generated orphan-FK checks over the result, plus shape assertions against the source — per-strata counts landed, cardinality ratios (orders-per-customer distribution) within tolerance, top-N category frequencies preserved. A subset that loads without FK errors has passed the *easy* half; the shape half is what your perf tests actually depend on.

**5. Subset first, mask second, always in that order.** Masking 2% costs 1/50th of masking everything (`../principles/masking-and-anonymization.md` failure mode #5), and the subset never exists unmasked outside the pipeline's trust boundary. One caution flows backward: subsetting *changes the k-anonymity math* — a person unremarkable in 80M rows can be the only record with their quasi-identifier combination in 1.6M. The k-measurement runs on the **subset**, post-mask; a k-report inherited from the full corpus is invalid for the artifact you're actually shipping.

## Common pitfalls

- **The engulfing walk.** An unmarked edge (often `audit_log.actor_id` or a shared address table) turns the closure into 60% of the database; the "subset" is production with extra steps. Detection: the pipeline reports rows-pulled-per-edge — one edge dominating is the tell. Fix: reclassify to include-only or excluded; re-run.
- **The sanitized world.** Naive sampling under-represents dirty data — the NULLs-where-impossible, the legacy rows predating constraint enforcement, the encoding damage — and dirty data is disproportionately what breaks code. Add a stratum for known-dirty populations (rows failing current validation, pre-migration vintages). A subset cleaner than production tests a product cleaner than yours.
- **Time-window truncation breaking entities mid-story.** "Last 90 days of data" cuts every long-running entity mid-lifecycle: subscriptions without their signup, refunds without their order. Time-windowing is legitimate *only* as root selection ("customers active in the last 90 days") followed by full-history walk of the selected roots — never as a row filter applied per-table.
- **Stale subset spec vs. evolved schema.** New tables/FKs since the spec was written are silently absent (or silently unclassified) in the next cut. Same structural fix as masking coverage: a migration-PR tripwire failing until new tables are classified in the subset spec. One tripwire can serve both configs.
- **Re-cut without re-validation.** The monthly re-cut "with the same spec" skips shape/k validation because it passed last time — meanwhile production's distribution moved and a new PII column arrived. Every cut runs the full epilogue (pattern 4) and the post-mask gates. The pipeline is only as trustworthy as its most recently *validated* run.

## Cross-references

- Whether to subset at all: `../principles/core-principles.md` master tree
- Masking the result + k-measurement discipline: `../principles/masking-and-anonymization.md`
- Legal basis for the source data: `../principles/compliance-and-governance.md`
- Refresh cadence and blue/green delivery of re-cuts: `../principles/data-refresh-and-versioning.md`
- Fan-out subsetting audits across many services: `../orchestration/README.md`
