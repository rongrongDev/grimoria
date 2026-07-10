# Core Principles — The Judgment Layer

> Last reviewed: 2026-07-09. Tool-agnostic; incidents reference PostgreSQL 14–17 era systems but the rules predate and will outlive them.
> This is the compressed version of twenty years of this job. Every rule below was paid for by an incident; the deep-dive docs in this directory carry the full failure-mode treatments.

## The stance

Test data and test environments are a **product with two customers who want opposite things**. Engineering wants data that is maximally realistic and environments identical to production. Legal/security wants sensitive data to never leave production and blast radius to be zero. Your job is not to pick a side; it is to build the pipeline that gives engineering *provably safe* realism. When you find yourself arguing "it's only test data," you have already lost — every serious breach story involving test systems starts with that sentence.

The second stance: **test data and environments are infrastructure, and infrastructure that can't be rebuilt from scratch is a liability, not an asset.** The staging environment nobody can recreate, the seed dump nobody knows the provenance of, the masking script that lives on one engineer's laptop — each is a snowflake, and snowflakes melt at the worst possible time.

## The ten rules

**1. Masked fields ≠ safe dataset.** Field-level masking coverage is necessary and radically insufficient. Re-identification happens through *combinations* — quasi-identifiers, joins to other tables, unique distributions. Any masking review that only checks a column list is theater. → `masking-and-anonymization.md`

**2. If it isn't deterministic, it isn't test data — it's a slot machine.** Seed data must be reproducible from a version-controlled definition (fixed RNG seeds, pinned generator versions, ordered inserts). Every "random" element you allow into seed data is a future flaky-test investigation, and the person debugging it won't know your generator exists. → `seeding-and-synthetic-data.md`

**3. Environments are code or they are debt.** If you can't destroy and rebuild an environment from the repo in bounded time, you don't own it — it owns you. Hand-applied fixes to a running environment are how drift starts; drift is how "passed staging, failed prod" ships. → `environment-provisioning.md`

**4. Shared mutable state is the root of almost all "flaky" integration tests.** Before anyone burns a week on test logic, ask: what does this test share with anything else — database, accounts, queues, clock, environment? Two teams silently sharing one staging database will generate months of mutual, untraceable flakiness. Isolation is bought with unique data, namespaces, or ephemeral environments; it is never achieved by politeness. → `cleanup-and-isolation.md`, `environment-lifecycle-and-contention.md`

**5. Every resource gets a TTL and an owner at creation, or it becomes an orphan.** Cleanup that depends on the creating process surviving to run teardown will fail exactly when pipelines crash — which is when you least want debris. Reapers keyed on creation-time labels are the only cleanup that survives reality. → `cleanup-and-isolation.md`

**6. Stale test data lies in the most expensive direction: it says "pass."** Data that drifted from production shape (schema, distributions, volumes, edge cases that now exist) makes tests confirm a world that's gone. Refresh cadence is a correctness control, not housekeeping. → `data-refresh-and-versioning.md`

**7. Seed data versions travel with schema migrations, in the same repo, gated by the same CI.** The moment fixtures and migrations can merge independently, they will drift, and the failure will surface two weeks later in someone else's pipeline. → `data-refresh-and-versioning.md`

**8. Production data in test systems is a legal event, not a technical convenience.** Using prod-derived data requires a defensible basis, a masking pipeline someone signed off, retention limits, access scoping, and the ability to find and erase a specific person across every copy. If you can't do the last one, you can't answer a DSAR, and that is not a hypothetical. → `compliance-and-governance.md`

**9. Parity is a per-purpose measurement, not a slogan.** No test environment is production. The question is which axes must match *for these tests to mean anything* — engine version and config for query behavior, data volume for performance tests, service topology for integration tests — and which are allowed to differ. Unmeasured parity is assumed parity, and assumed parity is drift. → `environment-provisioning.md`

**10. Every stub is a bet that the real service won't change.** Service virtualization buys speed and availability at the price of contract drift. A stub without a verification mechanism against the real service is a test that can only tell you about the past. → `../patterns/service-virtualization.md`

## The master decision tree: where does test data come from?

The most common strategic question. Full versions with nuance live in the linked docs; this is the shape:

```
Need test data for X?
├─ Does X test data *shape/volume/realism* (perf, search relevance,
│  reporting, migration rehearsal)?
│   ├─ YES → production-derived: subset + mask.
│   │        You cannot invent realistic skew; don't try.
│   │        → patterns/production-scale-subsetting.md, principles/masking-and-anonymization.md
│   │        └─ BUT: is there a lawful basis + signed-off masking pipeline?
│   │            └─ NO → stop. Fix that first. → principles/compliance-and-governance.md
│   └─ NO → continue
├─ Does X need *specific scenarios* (the account in arrears, the order
│  stuck mid-refund, the unicode name)?
│   └─ YES → curated synthetic fixtures, version-controlled, deterministic.
│            Scenario data is authored, not sampled.
│            → principles/seeding-and-synthetic-data.md
├─ Does X need *bulk plausible filler* (10k users so pagination exists)?
│   └─ YES → generated synthetic (Faker-class), seeded RNG, volume matched
│            to purpose. → principles/seeding-and-synthetic-data.md
└─ Mixed needs → layer them: reference seed + scenario fixtures + generated
   filler + (only where justified) masked subset. Most real systems need
   all four; the mistake is using one layer for everything.
```

## War-story index

Each deep-dive doc carries at least one incident in full. The ones I retell most, and where they live:

| Incident | Lesson | Doc |
|---|---|---|
| "Anonymized" claims dataset re-identified live in a demo via ZIP+DOB+gender join | Rule 1 | `masking-and-anonymization.md` |
| A week of cross-team flakiness traced to two teams sharing one staging DB | Rule 4 | `environment-lifecycle-and-contention.md` |
| Unseeded Faker producing `O'Brien` broke 3% of runs; nobody could reproduce | Rule 2 | `seeding-and-synthetic-data.md` |
| Staging missing prod's `statement_timeout`; slow query shipped, took prod down | Rules 3, 9 | `environment-provisioning.md` |
| 2 a.m. refresh truncating tables under the nightly suite for months | Rule 6 | `data-refresh-and-versioning.md` |
| Swallowed FK errors in teardown; test DB grew 2 GB→400 GB, spin-up 4 min→50 min | Rule 5 | `cleanup-and-isolation.md` |
| DSAR erasure request vs. 14 staging snapshots nobody had inventoried | Rule 8 | `compliance-and-governance.md` |
| Payment stub returned `status:"success"`; real API had moved to `state:"SUCCEEDED"` | Rule 10 | `../patterns/service-virtualization.md` |

## Boundaries with adjacent KBs

- **Test strategy** — what to test, at which level, with what oracle: `../../quality-dev/` (start at `../../quality-dev/principles/test-strategy.md`). This KB assumes the strategy exists and supplies the substrate.
- **Automation frameworks & execution** — runners, locators, CI wiring, parallelization: `../../test-automation-engineer/` (its `../../test-automation-engineer/principles/test-data-management.md` covers the *test-code side* of consuming data; this KB covers producing and governing it).
- **Flaky-test diagnosis** — `../../quality-dev/principles/flakiness.md` owns the taxonomy; when the cause lands in "shared state" or "environment," it hands off to this KB's `cleanup-and-isolation.md` and the `state-leak-tracer` subagent.
