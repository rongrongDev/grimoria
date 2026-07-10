# Data Refresh & Versioning

> Last reviewed: 2026-07-09. Applies to: Flyway 10.x, Liquibase 4.29, dbt-core 1.8 seed mechanics, PostgreSQL 16/17 template/restore mechanics; concepts are tool-agnostic.
> Standalone doc. Related: `seeding-and-synthetic-data.md` (what the data is), `masking-and-anonymization.md` (prod-derived refresh sources), `environment-lifecycle-and-contention.md` (the lease mechanism shared with lifecycle actions).

## The stance

Test data has a **freshness contract and a version identity**, and most teams have neither. The freshness contract says how far test data may lag reality before green tests stop meaning anything. The version identity says that any environment can state, machine-readably, *exactly which data world it contains* — which seed version, which masked snapshot, which masking config produced it. Without the first, staleness rots your signal silently; without the second, "it fails in env A but not env B" is unanswerable, and every data problem becomes archaeology.

The operating rule: **a refresh is a deployment.** It has a version, a changelog, a rollout procedure that respects in-flight consumers, and a rollback. Teams that run refresh as a cron'd script with none of those get deployment-class incidents from it — just unattributed.

## Failure modes

### 1. Stale test data → false confidence

**Failure mode.** The data was realistic when loaded — in 2023. Since then production grew new enum values, new usage patterns (10× larger carts, unicode everywhere, a new country), new record shapes from features that didn't exist. Tests keep passing because they're validating the 2023 world. This is the most dangerous failure in this KB precisely because its symptom is *green*: nothing pages, nothing fails, your confidence is simply counterfeit. The bill arrives as production incidents in well-tested code — the test was fine; the world it ran against was fiction.

**Detection.** You cannot detect staleness by looking at tests; you detect it by *diffing worlds*. Scheduled shape-diff between test data and (masked) production samples: enum/category values present in prod but absent from test data (highest signal, trivially automatable), null-rate and value-length drift per column, volume ratios per table, new tables/columns with zero test-data presence. Every mismatch is a question: "what behavior does prod have that our tests can't see?"

**Fix.** Refresh — but by *class* of data, not wholesale: reference data mirrors prod on a tight cadence; scenario fixtures are updated deliberately (they encode intent, not samples — see the four layers in `seeding-and-synthetic-data.md`); masked subsets get re-cut on schedule; generated filler gets its generators updated when shape-diff flags drift.

**Prevention.** A written freshness contract per dataset class ("reference: within 1 day of prod; masked subset: re-cut monthly; scenarios: reviewed each release") with the shape-diff job as its enforcement. Cadence chosen by how fast your domain drifts — a tax engine and a social feed do not share a number.

### 2. Seed/reference data drifting apart from schema migrations

**Failure mode.** Migrations and seed data live in different repos, or the same repo with no coupling — so a migration merges (new NOT NULL column, tightened constraint, new enum member) and seeds break or, worse, keep loading while no longer exercising the new reality. The failure surfaces days later in whoever next builds a fresh environment, who has no idea a migration caused it. The two artifacts *always* drift when they can merge independently; this is a structural problem, not a diligence problem.

**Detection.** Fresh-environment build failing at seed-load is the loud version. The quiet version — seeds load but no longer cover the new column/enum — only shows up in the shape-diff (failure mode #1) or in production.

**Fix.** Move seeds into the migration repo, keyed to schema versions. When a migration PR breaks seed-load, the fix belongs *in that PR*.

**Prevention.** One CI gate, non-negotiable: **every migration PR builds a scratch database, runs all migrations, loads all seeds, and runs the seed-validation pass** (`seeding-and-synthetic-data.md` failure mode #4). Now migration-vs-seed drift is a red PR check instead of a delayed mystery. Add the soft gate from that same doc: migration PRs must either update seeds or explicitly declare `seeds-unaffected` — forcing the author to think beats hoping they did.

### 3. Refresh breaking in-flight test runs

**Failure mode.** Refresh truncates-and-reloads while suites are running against the environment. Tests see rows vanish mid-transaction, FKs dangle for the duration of the load, aggregates shift under assertions. The flakes cluster around the refresh schedule — which nobody thinks to check, because the refresh is invisible plumbing.

*The incident:* a nightly refresh at 02:00 overlapped the tail of a nightly E2E suite that started at 01:00 and had slowly grown past sixty minutes. For *months*, the last dozen tests flaked with "row not found" and everyone blamed the tests — they were E2E, flakiness was expected, retries were added (the standard anti-fix). The correlation was found by accident: someone plotted flake timestamps and saw the wall at 02:00. The suite had been fine; the refresh had been walking through it. Cost: months of eroded trust in a suite that was telling the truth, plus retry-noise merged into it permanently. Lesson: **anything that mutates a shared environment on a schedule must be visible to, and exclusive with, everything that reads it.**

**Detection.** Correlate flake timestamps with refresh schedules — one query, do it early in any "nightly suite is flaky" triage (it's step 3 of `../agents/state-leak-tracer.md`). Signature: failures cluster at a fixed wall-clock time and hit whatever tests happen to be running, regardless of which tests those are.

**Fix & prevention, in order of preference.** (1) **Blue/green data:** load the new dataset *beside* the old (new database/schema), validate it, switch consumers atomically (connection-string flip, `ALTER DATABASE RENAME`, or view-swap). In-flight runs finish on the old world; new runs start on the new; the old is dropped once lease-free. This also gives you instant rollback (re-flip) — refresh-as-deployment made literal. (2) If blue/green is genuinely impossible: **exclusive-with-lease** — refresh takes the same lease the reaper respects (`environment-lifecycle-and-contention.md` failure mode #4); it waits for in-flight runs and blocks new ones. Slower, serializes, but honest. (3) Never: refresh-in-place on a live environment on a timer. That is the incident above, on a subscription plan.

### 4. Unversioned data worlds → unanswerable divergence

**Failure mode.** Env A passes, env B fails, and nobody can say what data either contains: when it was refreshed, from which snapshot, with which masking config, at which seed version. Every cross-environment discrepancy becomes an excavation, and "let's just re-refresh everything" becomes the universal (evidence-destroying) remedy.

**Detection.** Ask any environment "what data version are you?" — if the answer requires a human, this failure mode is active.

**Fix & prevention.** A **data manifest** written into every environment at load time (a `_data_manifest` table or equivalent): seed dataset version (git SHA), source snapshot ID for prod-derived data, masking config version, refresh timestamp, loader identity. Costs one table and a write; converts an excavation into a `SELECT`. This is also the lineage record `compliance-and-governance.md` requires for DSAR response ("which copies contain this person?") — one mechanism, two obligations.

## Decision tree: what refresh cadence and mechanism?

```
Dataset class?
├─ Reference data (currencies, plans, flags)
│   → Mirror prod tightly (daily or on-change via the migration pipeline).
│     Mechanism: in-place is acceptable ONLY here (small, additive, fast);
│     anything destructive still goes blue/green.
├─ Scenario fixtures (named, hand-authored)
│   → Refresh = deliberate edit, per release, reviewed like code.
│     Never auto-refreshed from prod — they encode intent, not samples.
├─ Generated filler
│   → Regenerate on generator/seed-version change; shape-diff findings
│     drive generator updates. Mechanism: rebuild environment or blue/green.
└─ Masked production subset
    → Re-cut on schedule (monthly default; tighter if shape-diff drifts sooner).
      Mechanism: ALWAYS blue/green — these are the biggest loads with the
      most in-flight exposure. Gate: full masking validation
      (masking-and-anonymization.md decision tree) before the flip. A refresh
      that skips masking validation "because it's the same config" is how a
      new unmasked column ships to every test environment simultaneously.
```

## Cross-references

- What each data class *is* and how it's built: `seeding-and-synthetic-data.md`
- Masking validation that gates prod-derived refreshes: `masking-and-anonymization.md`
- The lease mechanism (shared with reapers and rebuilds): `environment-lifecycle-and-contention.md`
- Manifest as compliance lineage: `compliance-and-governance.md`
- Periodic shape-diff and drift-watch as scheduled agent work: `../orchestration/README.md`
