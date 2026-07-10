# Seeding & Synthetic Data Generation

> Last reviewed: 2026-07-09. Applies to: Faker (Python) 33.x, @faker-js/faker 9.x, PostgreSQL 16/17, MySQL 8.4; concepts are engine-agnostic.
> Standalone doc. Related: `data-refresh-and-versioning.md` (keeping seeds current), `masking-and-anonymization.md` (prod-derived alternative), `../skills/seed-dataset-designer/SKILL.md` (the callable version of this doc's design procedure).

## The stance

Seed data is **authored software, not sample content**. It has consumers (every test that runs against it), an interface (the named accounts and scenarios tests rely on), and therefore a compatibility contract. Treat a seed dataset the way you'd treat a shared library: versioned, reviewed, deterministic, and changed deliberately. The teams that treat seeds as "some rows Dave inserted in 2023" spend that saving many times over in flake triage.

## The four layers of test data

Most systems need all four; the classic mistake is stretching one layer to do another's job.

1. **Reference data** — currencies, country codes, plan tiers, feature flags. Must mirror production *exactly*; drift here breaks everything downstream. Ship it with migrations (see `data-refresh-and-versioning.md`).
2. **Scenario fixtures** — hand-authored, named, documented records: `customer-in-arrears`, `order-mid-refund`, `user-with-2fa-and-unicode-name`. Small, precious, exhaustively curated. These are the API your tests program against; give them stable identifiers and a README.
3. **Generated filler** — bulk plausible data (10k users so pagination, indexes, and N+1 bugs are visible). Faker-class generation, always seeded.
4. **Masked production subsets** — only when realism of *distribution* is the test's subject (perf, search, reporting, migration rehearsal). Requires the full compliance treatment: `masking-and-anonymization.md`, `compliance-and-governance.md`, `../patterns/production-scale-subsetting.md`.

Decision tree for choosing among them: the master tree in `core-principles.md`. The short form: **scenarios are authored, filler is generated, distributions are subsetted, reference is mirrored.**

## Failure modes

### 1. Non-deterministic seed data → intermittent test failures

**Failure mode.** Generation uses an unseeded RNG, wall-clock timestamps, unordered parallel inserts, or auto-increment IDs that vary with insertion order. Every environment build produces a *slightly different* world. Tests pass on 97% of builds; on the other 3%, a generated value trips an edge (a name with an apostrophe, a birthdate on Feb 29, two users landing in the same pagination bucket) and the failure evaporates before anyone can reproduce it.

*The incident:* a suite failed roughly once a week on one assertion. Three engineers "fixed" it three times by re-running. When it finally got real attention, the trigger was Faker occasionally emitting `O'Brien`, which broke a hand-built SQL string in a legacy report the test exercised. The flaky test was the only thing telling us about a real injection-adjacent bug — and unseeded generation had made the messenger impossible to interrogate. Two lessons in one incident: seed your generators, *and* deliberately include hostile values (apostrophes, unicode, 255-char strings) in scenario fixtures so they trigger on **every** run instead of unluckly ones.

**Detection.** Build the same environment twice from the same commit; `pg_dump --data-only` (with ordered output) both and diff. Any diff is non-determinism. Also grep generation code for `random.` / `faker.` calls with no seed set, `now()` / `Date.now()` in fixture values, and threads/async in insert paths.

**Fix.** Fixed RNG seed per dataset version, pinned generator library version (Faker changes locale data between majors — a pinned seed with an unpinned Faker is still non-deterministic), explicit stable IDs for anything a test references, frozen or offset-based timestamps (see below), single-threaded or deterministic-ordered inserts.

**Prevention.** CI gate: the double-build diff above, run on any PR touching seed code. Cheap, brutal, catches everything in this class.

### 2. Relative time in seed data → slow-burn rot

**Failure mode.** A special case of #1 worth its own entry because it passes the double-build check on the same day and still rots: fixtures with absolute dates (`subscription_expires: 2025-01-01`) all silently expire one day; fixtures built with `now() - interval '30 days'` shift meaning as the schema's business rules change.

**Detection.** Tests that all started failing on the same calendar date; fixtures containing years in the past.

**Fix & prevention.** Express fixture times as *offsets from a single injected anchor time*, and have the test framework pin that anchor (fake clock) — this KB owns the data convention; the clock-injection mechanics belong to `../../quality-dev/principles/flakiness.md` (cause: time dependence). Scenario docs must state temporal intent: "this subscription is *always* 5 days from expiry."

### 3. Seed schema drift from production → false confidence

**Failure mode.** Production evolves — a column becomes nullable-in-name-only, a new enum value appears, addresses gain a second line — but seed data still reflects last year's world. Tests pass against data shapes that no longer occur, and fail to exercise shapes that now dominate. This is the quiet killer: nothing goes red; your green just stops meaning anything.

**Detection.** Periodic *shape diff*: compare seed data against masked production samples on (a) columns exercised — % of seed rows with non-default values per column, (b) enum/category values present, (c) null rates, (d) value-length distributions. New enum values in prod absent from seeds are the highest-signal alarm and trivially automatable.

**Fix.** Update the drifted fixtures; add the missing shapes as new named scenarios (don't mutate existing scenarios others depend on — add).

**Prevention.** Two gates. (1) Seeds live in the same repo as migrations and CI refuses a migration PR that doesn't address seeds (even by explicit `seeds-unaffected` declaration — force the thought, see `data-refresh-and-versioning.md`). (2) Scheduled shape-diff job (weekly is plenty) filing a report; the `pii-field-scanner` subagent run doubles as the sampling pass.

### 4. Broken referential integrity during generation

**Failure mode.** Generators create children before parents, invent FK values, or generate tables independently so cross-table invariants fail (an `order.total` that doesn't equal its line items; an "active" subscription pointing at a deleted plan). With FK constraints on, generation crashes — annoying but honest. With constraints deferred or absent (common in NoSQL and in "we'll add constraints later" schemas), you get a *plausible-looking corrupt world*, and tests fail in ways indistinguishable from product bugs. Application-level invariants (the order-total kind) are the worst: no database will ever enforce them for you.

**Detection.** Post-generation validation pass: orphan-FK query per relationship (generate these from the schema catalog, don't hand-maintain), plus a hand-written check per *business* invariant. If tests fail against fresh seed data before any test has mutated anything, suspect generation, not product.

**Fix.** Generate in dependency order (topological sort of the FK graph — every serious tool does this; hand-rolled scripts must too). For business invariants, generate *transactionally consistent aggregates* (an Order factory that emits order + lines + payment as one unit), never independent tables.

**Prevention.** The validation pass runs as the last step of every generation job and fails the build. Non-negotiable; it costs seconds.

### 5. Data volume mismatched to test purpose

**Failure mode.** Two directions, both expensive. *Too sparse:* 5 users and 10 orders means no query plan resembles production's, pagination code has one page, race conditions have nothing to race over — scale bugs sail through. *Too large:* every CI run drags a 40 GB dataset, feedback goes from minutes to an hour, and engineers respond by running tests less. Both usually come from one dataset trying to serve every purpose (see the four layers).

**Detection.** Sparse: production incidents in code with green tests, where the incident needed volume (lock contention, plan flips, memory). Large: environment spin-up dominating CI wall time — `../../test-automation-engineer/principles/ci-cd-integration.md` covers profiling; the data-size lever is yours.

**Fix.** Size per purpose: functional suites get the minimum world (reference + scenarios + just enough filler for pagination/plurality — typically 10³ rows, not 10⁶); perf suites get production-scale volume in a dedicated environment (`../../quality-dev/principles/performance-and-load-testing.md` owns the workload design; you own supplying honest data shape). Never let the perf dataset become the default dataset.

**Prevention.** Every named dataset declares its purpose and size budget in its README; CI tracks seed-load time as a metric with an alert threshold, because dataset growth is always gradual and never announced.

## Design procedure for a new seed dataset

The `seed-dataset-designer` skill executes this; the reasoning lives here.

1. **Inventory consumers.** Which suites/tests will rely on this? What scenarios do they need *by name*?
2. **Layer it** (reference / scenarios / filler / subset) — decide each layer's source and size budget.
3. **Name the contract.** Stable IDs and semantic names for everything tests may reference. Document each scenario's *intent*, not just its values — intent is what future editors need to not break.
4. **Make it deterministic.** Seeded RNG, pinned versions, anchored time, ordered inserts.
5. **Make it valid.** FK-closure and business-invariant checks as the generation epilogue.
6. **Make it evolvable.** Version the dataset; additive changes preferred; breaking changes to a named scenario get a deprecation window like any API.
7. **Wire the gates.** Double-build determinism diff + validation pass + shape-diff schedule.

## Cross-references

- Consuming this data cleanly from test code (factories, per-test uniqueness): `../../test-automation-engineer/principles/test-data-management.md`
- Keeping seeds aligned with migrations and refresh cycles: `data-refresh-and-versioning.md`
- When generation isn't enough and you need production shape: `../patterns/production-scale-subsetting.md` + `masking-and-anonymization.md`
- Flake triage that lands on "the data was different that run": `../../quality-dev/principles/flakiness.md`, then this doc's failure mode #1
