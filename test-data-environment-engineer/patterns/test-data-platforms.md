# Self-Service Test Data Platforms & Catalogs

> Last reviewed: 2026-07-09. Feature-level references: Delphix, Tonic.ai, homegrown platforms on Postgres templates + object-store snapshots; patterns are vendor-agnostic.
> **Extended-tier doc:** production patterns + common pitfalls. The pipeline components a platform packages (masking, subsetting, seeding, refresh) are core-tier and live in `../principles/`; this doc is about *productizing* them so teams serve themselves. Building the underlying capabilities first: `../guides/build-a-platform-from-scratch.md`.

## The judgment

A test data platform exists to close one gap: **the queue in front of the data engineer.** When every team needs a dataset and one person provisions them, that person is the bottleneck, the single point of compliance knowledge, and — the part orgs discover at retirement time — the single point of failure. The platform is that person's judgment, encoded: teams get data in minutes instead of tickets-in-days, and the compliance gates run *inside* the vending path where they can't be skipped.

The corollary that determines success: **a platform is worth building only after the manual pipeline works.** Platformizing a masking process that hasn't survived a real audit, or a seeding process that isn't deterministic, just distributes the defects at self-service speed. Platform = productized judgment; no judgment, no product.

## Production patterns

**1. A catalog of named, versioned, described datasets — not a copy button.** The unit teams request is a *catalog entry*: `retail-smoke-v12` (reference + scenarios, 200 MB, synthetic, loads in 40 s), `retail-perf-2026-06` (masked subset, 300 GB, k≥5 verified, restricted tier). Each entry carries: provenance and masking-config version (the manifest from `../principles/data-refresh-and-versioning.md`), size and load-time budget, sensitivity tier, freshness date, owner, and a documented scenario contract (which named fixtures tests may rely on — `../principles/seeding-and-synthetic-data.md` layer 2). A platform whose unit is "clone prod-ish database" has automated the compliance failure, not the workflow.

**2. Vending machine, not warehouse.** The platform *materializes on demand* (template-clone, snapshot-restore into the requester's ephemeral environment, with a TTL) rather than handing out long-lived shared copies. Every copy it vends is registered (who, what version, where, expires when) — which makes the DSAR question ("which copies contain person X?") a query against the vending log, and makes the reaper's job a scan of expired vends. Self-service without the registry recreates the fourteen-snapshots incident (`../principles/compliance-and-governance.md` failure mode #2) at scale.

**3. Compliance gates inside the vending path.** Sensitivity tiers are enforced at request time: synthetic-tier datasets vend to anyone instantly; prod-derived tiers check the requester's access grant and refuse politely with the escalation path. The gate being *in the path* is the entire design: a platform with a parallel "break-glass" copy mechanism will see all traffic route around the gates within a quarter. Slow path and compliant path must be the same path, cheap path and compliant path must be the same path.

**4. Freshness and lineage on the label.** Every catalog entry displays its refresh date and source-snapshot age, and the platform nags entry *owners* when staleness contracts (`../principles/data-refresh-and-versioning.md` failure mode #1) are breached. Consumers picking a dataset can see they're picking stale data; that visibility, more than any policy, is what generates refresh pressure from the demand side.

**5. Request-what's-missing as a first-class flow.** The platform's most valuable telemetry is unmet demand: "I need a dataset with 100k orders in EUR with mixed VAT" either matches a catalog entry or becomes a structured request routed to the owning team. Without this flow, teams quietly build shadow datasets (unmasked, unregistered — the exact thing the platform exists to end) whenever the catalog misses.

## Common pitfalls

- **Platform before pipeline.** Six months building self-service UI on top of a masking process that fails its first k-measurement. Sequence check: the platform phase is *last* in `../guides/build-a-platform-from-scratch.md` for this reason. Detection: if the platform team can't point at the signed-off manual pipeline it's wrapping, it's this pitfall.
- **The catalog nobody curates.** Entries accumulate (every team adds theirs), none retire, freshness labels rot, and the catalog becomes a junk drawer teams have learned to distrust. A catalog is a product surface: entries have owners, staleness triggers escalation-then-retirement, and retirement is honored (vends of retired entries fail loudly with the successor's name).
- **Vending long-lived copies.** "Self-service" implemented as "anyone can create a permanent database" converts the provisioning bottleneck into a sprawl problem — cost and compliance surface grow with every click. TTL-by-default at vend time (pattern 2); permanent copies are an explicit, logged, owner-approved exception.
- **The platform as new single point of failure.** The platform outage that blocks every team's CI simultaneously — you consolidated the bottleneck instead of removing it. The platform's availability tier must match CI's; degraded mode (last-vended snapshots remain cloneable locally) is designed in, not improvised during the first incident.
- **Metrics that reward vending volume.** "Datasets vended per week" goes up and to the right while half the vends are workarounds for two broken catalog entries. Measure *time-to-usable-data* for a requesting team, unmet-demand queue age, and staleness-contract compliance — the queue-closing metrics the platform exists for.

## Cross-references

- The capabilities being productized: `../principles/seeding-and-synthetic-data.md`, `../principles/masking-and-anonymization.md`, `../principles/data-refresh-and-versioning.md`
- Build sequencing (platform is phase 5, not phase 1): `../guides/build-a-platform-from-scratch.md`
- Vend registry as DSAR machinery: `../principles/compliance-and-governance.md`
- TTL/reaper mechanics the vending machine reuses: `../principles/environment-lifecycle-and-contention.md`
