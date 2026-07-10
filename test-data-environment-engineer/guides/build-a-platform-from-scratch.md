# Guide: Build a Test Data & Environment Platform From Scratch

> Last reviewed: 2026-07-09. Tool references as per `../CHANGELOG.md`. This guide sequences the KB's principles into an executable build for a *new* system (greenfield service or a system that has never had managed test data/environments). For an existing, messy setup, run `assess-an-existing-setup.md` first — its findings re-enter this guide at the phase they belong to.
>
> Each phase names its **exit criteria**. Do not start the next phase on vibes; the sequencing is load-bearing (masking before any prod data moves; determinism before anyone depends on seeds; lifecycle before the fleet grows).

## Phase 0 — Charter: decide what you're building for (half a day, do not skip)

Answer in writing, one page:

1. **Test portfolio served.** Which suites exist or are planned — unit/integration/E2E/perf — and what does each need from the substrate? (Test strategy itself belongs to `../../quality-dev/principles/test-strategy.md`; you are reading its output, not writing it.)
2. **Data sensitivity landscape.** What regimes apply — GDPR? health data? card data? This determines phase 2's floor and cannot be retrofitted. → `../principles/compliance-and-governance.md` regime map.
3. **Scale reality.** Production data volume, schema size and change velocity, team count. A 3-team startup and a 40-team org exit this guide at different phases (see "How far to go," bottom).
4. **The feedback budget.** Maximum acceptable environment spin-up time for per-PR testing. This single number drives the ephemeral-vs-shared architecture in phase 3.

**Exit criteria:** the page exists, the accountable engineering lead and (if any prod-derived data is contemplated) the DPO/counsel have seen it.

## Phase 1 — Deterministic seed data (the foundation everything sits on)

Build the four-layer dataset per `../principles/seeding-and-synthetic-data.md` (read its design procedure; the skill `../skills/seed-dataset-designer/SKILL.md` executes it per-scenario):

1. **Reference layer** mirroring production exactly, shipped with schema migrations.
2. **Scenario fixtures** — start with the ~20 named scenarios your existing tests implicitly depend on (read the tests; they'll tell you). Stable IDs, documented intent.
3. **Generated filler** — seeded RNG, pinned generator versions, sized to the functional budget (10³-ish rows), FK-ordered generation.
4. **No production data yet.** Phase 1 is deliberately synthetic-only: it gives every later phase a compliance-clean default, and it forces the scenario contract to be authored rather than sampled.

Wire the three gates from that doc *now*, while the dataset is small: double-build determinism diff, FK/invariant validation epilogue, migration-PR seed gate (`../principles/data-refresh-and-versioning.md` failure mode #2).

**Exit criteria:** two builds from the same commit produce byte-identical data; a migration PR that breaks seeds goes red in CI; every named scenario has a documented intent.

## Phase 2 — Compliance envelope & masking pipeline (before any prod byte moves)

Only if phase 0 identified genuine prod-derived needs (perf shape, search relevance, migration rehearsal). Many systems can skip to phase 3 and stay synthetic — that is a *good* outcome, not a shortcut.

1. Run the decision tree in `../principles/compliance-and-governance.md` ("may this data enter a test system?") with your DPO — the signature at the bottom is the phase's deliverable.
2. Build the masking pipeline per `../principles/masking-and-anonymization.md`: classification of every column (the schema-change tripwire makes it exhaustive-by-construction), technique per field with declared `preserves:`, keyed deterministic substitution for join fields with keys in the secret manager.
3. Stand up the verification stack: `../agents/pii-field-scanner.md` sweep diffed against the config; k-measurement on quasi-identifiers; post-mask utility validation. `../skills/masking-coverage-reviewer/SKILL.md` is the recurring review gate.
4. If volume demands it (it usually does), build subsetting *upstream* of masking per `../patterns/production-scale-subsetting.md`: root-entity spec with strata, classified edges, closure + shape validation.
5. Wire lineage from day one: every masked artifact gets a manifest (source snapshot, config version, k report, TTL) — `../principles/data-refresh-and-versioning.md` failure mode #4.

**Exit criteria:** scanner reports zero unclassified fields; measured k ≥ threshold on the shipped artifact; utility validation green; DPO signature on file; every artifact carries a manifest and a TTL.

## Phase 3 — Environment provisioning as code

Per `../principles/environment-provisioning.md`:

1. **One definition, all tiers:** a single version-controlled source of truth for service versions and config, consumed by local (Compose/Testcontainers), CI, and any staging-class environment. Same IaC module as production wherever possible.
2. **Ephemeral-first architecture:** per-PR/per-run environments as the default rung (`../principles/cleanup-and-isolation.md` ladder, rung 1). Spend engineering here until spin-up fits the phase-0 feedback budget: prebaked images, template-database cloning of the phase-1 seed data, warm pools if needed.
3. **Declare parity per environment class:** for each (functional, perf, ...), write down which of the five parity layers must match production and which may diverge, with reasons. This declaration is what `../skills/environment-parity-auditor/SKILL.md` audits against forever after.
4. **Long-lived exceptions get contained:** anything that must persist (partner-sandbox identity, perf hardware) is minimized in scope, scheduled for rebuild, and handed to phase 4's lifecycle machinery.

**Exit criteria:** a PR environment builds from repo + template inside the feedback budget; destroy-and-rebuild is a routine CI operation, not an event; the parity declaration exists per environment class and the first audit against it runs green (or its findings are filed).

## Phase 4 — Lifecycle: refresh, cleanup, contention

The machinery that keeps phases 1–3 true over time:

1. **Refresh as deployment** (`../principles/data-refresh-and-versioning.md`): freshness contracts per data class, blue/green delivery for anything destructive, shape-diff job watching for staleness, manifests updated per refresh.
2. **Two-layer cleanup everywhere** (`../principles/cleanup-and-isolation.md`, `../principles/environment-lifecycle-and-contention.md`): pipeline-phase teardown for the happy path + tag/TTL reaper for every crash path; owner + TTL + purpose tags mandatory at creation, enforced by the provisioning pipeline; reconciliation job diffing actual resources vs. expected.
3. **Lease protocol, built once, used thrice:** consumers heartbeat while running; reapers, refreshes, and rebuilds all respect the lease. This is the single mechanism preventing the "lifecycle destroys in-flight work" class.
4. **If any shared environment survived phase 3:** consumer registry with per-consumer credentials; reservation system only if the constraint is genuine (`../patterns/environment-scheduling.md`).

**Exit criteria:** kill a pipeline mid-run and its debris is gone within one reaper cycle; a refresh under an in-flight suite causes zero failures (test this deliberately); the reconciliation report reads empty.

## Phase 5 — Self-service (only at multi-team scale)

When the queue in front of the data/environment owner becomes the bottleneck — and only when phases 1–4 have survived real use — productize per `../patterns/test-data-platforms.md`: catalog of named/versioned datasets, vend-on-demand with TTL and registry, compliance tiers enforced in the vending path, freshness on the label, unmet-demand flow. Stubs/virtualized dependencies, if phase 3 introduced them, get owners and drift canaries per `../patterns/service-virtualization.md`.

**Exit criteria:** a new team gets usable, compliant data without talking to a human; the vend registry answers "which copies contain X?" as a query.

## How far to go, by scale

- **Small (≤3 teams, no prod-derived data):** phases 0, 1, 3, and the cleanup half of 4. Stop. You do not need a platform; you need determinism, ephemerality, and reapers.
- **Regulated or prod-derived data at any scale:** phase 2 in full, no abbreviations — it's the phase where shortcuts become incidents with lawyers.
- **Multi-team (≥5) or shared constrained hardware:** all of 4, then 5 when the queue says so.

## Standing operations (the platform is never "done")

| Cadence | Operation | Doc |
|---|---|---|
| Per PR | determinism diff, seed gate, migration tripwires (masking + subset specs) | phase 1, 2 gates |
| Per refresh | full masking/subset validation epilogue, manifest write | `../principles/data-refresh-and-versioning.md` |
| Weekly | shape-diff (staleness), reconciliation (orphans), state-diff canary (leakage) | `../principles/data-refresh-and-versioning.md`, `../principles/cleanup-and-isolation.md` |
| Monthly/quarterly | parity audit, PII scanner sweep, stub-drift canary review, utilization report | `../skills/environment-parity-auditor/SKILL.md`, `../agents/pii-field-scanner.md`, `../patterns/service-virtualization.md` |

Scheduling these as agent work, and the failure modes of doing so: `../orchestration/README.md`.
