# Cleanup & Isolation

> Last reviewed: 2026-07-09. Applies to: PostgreSQL 16/17 (transaction/TRUNCATE semantics), MySQL 8.4, Kubernetes 1.31+ namespace lifecycle; concepts are platform-agnostic.
> Standalone doc. Related: `environment-lifecycle-and-contention.md` (environment-scale version of the same discipline), `seeding-and-synthetic-data.md` (what a clean world is), `../agents/state-leak-tracer.md` (the callable investigation when this doc's failures are suspected).

## The stance

**Cleanup is a design property, not a chore.** The question is never "did we remember to delete the rows?" — humans and pipelines forget, crash, and race, reliably. The question is "does correctness *depend* on deletion having happened?" The strongest isolation architectures make cleanup unnecessary (fresh world per run, transaction rollback, unique namespaces); the weakest make it load-bearing (shared world + everyone promises to tidy up). Move down the isolation ladder only when forced, and know the price at each rung.

Corollary from twenty years of flake triage, stated as strongly as I can: **when a test fails intermittently in a shared environment, suspect shared mutable data before test logic, at roughly 10:1 prior odds.** The test code is what everyone stares at; the data underneath is what's usually moving. (`../../quality-dev/principles/flakiness.md` owns the full taxonomy; its cause #2 — shared state — is this doc.)

## The isolation ladder

Strongest first. Each rung down is cheaper per-run and costlier in triage.

1. **Fresh environment per run** — ephemeral env from template (`environment-provisioning.md`). Nothing to clean; cleanup is `destroy`. The gold standard; buy it whenever spin-up cost allows.
2. **Transaction-per-test** — each test in a transaction, rolled back after. Free, perfect cleanup — with real limits: breaks when the code-under-test commits, spawns its own connections/transactions, or the assertion needs to observe committed state (async workers, other services). Fine for repository-layer tests; a lie for integration tests, so know which you're writing.
3. **Unique-data-per-run (namespacing)** — every run tags what it creates (unique tenant, key-prefix, `run_id` column) and *reads only its own tags*. Collisions become impossible rather than cleaned-up; deletion becomes garbage collection (async, keyed on tags, non-load-bearing). The workhorse for shared environments — but only if the read-side discipline holds: a namespaced writer with un-namespaced assertions (`SELECT count(*)` across everyone's data) is rung 4 wearing rung 3's badge.
4. **Shared data + teardown** — everyone writes to the common world and promises to restore it. Every failure mode below lives here. Sometimes unavoidable (singleton external sandboxes, legacy suites); treat it as debt with interest, not as a pattern.

## Failure modes

### 1. Incomplete teardown → state leakage between runs

**Failure mode.** Teardown that doesn't run (test crashed mid-way, runner killed, suite aborted) or doesn't cover everything the test created (the test grew a new side-effect — a queue message, an S3 object, a cache entry — and teardown didn't). Residue changes the world for the next run: counts are off, unique constraints collide on "fresh" fixtures, a leftover queue message triggers processing in someone else's run. The defining symptom: **failures that depend on history** — first run of the day green, later runs degrade; or a suite that only fails after some *other* suite ran.

**Detection.** State-diff: snapshot the countable world (row counts per table, queue depths, object counts by prefix) before and after a full suite run on a quiet environment. Any delta is leakage, itemized. Run it as a scheduled canary, not just during incidents — leakage grows monotonically and is cheapest to catch young. For a specific flake already in hand, dispatch `../agents/state-leak-tracer.md`.

**Fix.** Identify the leaking creators from the delta (namespaced data makes this trivial — untagged residue indicts the untagged writers), then move them *up the ladder* rather than patching their teardown: teardown-patching is whack-a-mole because the next side-effect won't be covered either.

**Prevention.** Structural, in order of strength: climb the ladder (rungs 1–3 make this failure impossible or harmless); where rung 4 persists, teardown runs in `finally`-equivalent phases *and* a scheduled reaper deletes anything test-tagged older than a TTL — the same two-layer logic as environment orphans (`environment-lifecycle-and-contention.md` failure mode #3): pipeline cleanup for the happy path, reaper for every crash path.

### 2. Cleanup ordering under foreign-key constraints

**Failure mode.** Teardown deletes parents before children; the FK constraint rejects it. Two grades: the *honest* failure (teardown errors, noise but visible) and the *catastrophic* one — the error is swallowed (`try/except: pass` around cleanup "so it never breaks the build") and rows silently accumulate forever.

*The incident:* a shared integration database grew from 2 GB to 400 GB over fourteen months. Environment restore went from 4 minutes to 50; queries slowed enough to cause timeout flakes; storage costs tripled. Cause: a teardown helper deleting in the wrong FK order, wrapped in a swallow-all exception handler someone added the day the wrong-order bug first appeared — the suppression *was* the incident. Every run leaked its full dataset, at a few hundred KB per run, thousands of runs a month, invisible until the disk-space alert. Lesson: **a cleanup step that cannot fail loudly is a cleanup step that has already failed silently.**

**Detection.** Grep teardown code for swallowed exceptions around deletes — this specific pattern, this specific grep, it pays for itself. Plus the monotonic canaries: table row-counts and DB size over time on any long-lived test database.

**Fix.** Delete in reverse-topological FK order — and *generate* that order from the schema catalog (`information_schema.referential_constraints` walk) rather than hand-maintaining a list that rots on the next migration. Postgres: `TRUNCATE a, b, c CASCADE` handles ordering and is fast, but is a rung-4 sledgehammer — it deletes *everyone's* data, so it's only legal on single-tenant environments. `ON DELETE CASCADE` on the constraints themselves makes cleanup trivial — decide deliberately whether prod schema should carry that semantics for test convenience (usually no; test-only schema divergence is parity drift — `environment-provisioning.md`).

**Prevention.** Cleanup failures fail the build, visibly — remove every swallow. If cleanup is too flaky to be allowed to fail the build, that flakiness is itself the finding: fix the ordering generator, don't mute the alarm.

### 3. Test isolation failure misdiagnosed as test logic

**Failure mode.** A test flakes in full-suite runs, passes alone. Weeks go into its assertions, waits, timing — because the test is what's visible — while the actual cause is a *neighbor*: another test (or team, or refresh job) mutating shared data. The anti-fixes applied during the misdiagnosis (retries, loosened assertions, `.skip`) are permanent damage; the flake was load-bearing information about shared state.

**Detection — the discrimination protocol, in cost order:**
1. **Alone vs. full-suite** (cheap, definitive direction): passes alone reliably + fails in suite ⇒ interaction, stop reading the test's assertions.
2. **Bisect the neighborhood:** run the failing test after each half of the suite (or use the runner's order-shuffle with seed capture — see `../../test-automation-engineer/` for runner mechanics) to find the interfering test pair.
3. **Identify the shared noun:** what do the pair both touch? A table, a fixture row, a queue, a user account, the clock. The shared noun, not either test, is the defect.
4. If the interferer isn't in the suite at all (cross-team, refresh job, reaper): timestamp-correlation against other consumers' schedules — the consumer registry from `environment-lifecycle-and-contention.md` makes this a lookup; its absence makes it the two-week hunt from that doc's war story.

**Fix.** Fix the shared noun (unique data per test, rung 3), never the symptom in the test.

**Prevention.** Suite-level habits that surface interaction bugs while they're cheap: random test order by default (order-dependence is isolation failure on a delay), the state-diff canary from failure mode #1, and per-test unique data as the *house style* (`../../test-automation-engineer/principles/test-data-management.md` covers factory patterns that make uniqueness the path of least resistance).

## Decision tree: choosing the isolation rung

```
New suite / new environment — how do tests get a clean world?
├─ Can each run afford a fresh environment (spin-up fits the feedback budget)?
│   └─ YES → Rung 1. Stop here. Everything below is compensation for
│            not being here. (Making it affordable: environment-provisioning.md
│            failure mode #3 — template DBs, prebaked images.)
├─ Is the suite single-service, DB-only side effects, sync assertions?
│   └─ YES → Rung 2 (transaction-per-test) for those tests; be honest about
│            which tests it can't serve (commits, async, cross-service).
├─ Shared environment, multiple consumers?
│   └─ Rung 3: run-ID namespacing, enforced on writes AND reads
│      (review assertion queries for un-namespaced aggregates — the classic hole).
│      Reaper GC on old tags. Consumer registry per
│      environment-lifecycle-and-contention.md.
└─ Legacy rung-4 suite you can't restructure yet?
    → Contain: generated FK-ordered teardown, no swallowed errors, state-diff
      canary, and a written plan with a date to climb the ladder. Rung 4
      without a exit plan is where 400 GB databases come from.
```

## Cross-references

- Environment-scale cleanup (reapers, TTLs, orphaned infra): `environment-lifecycle-and-contention.md`
- Refresh jobs as a source of "cleanup" that destroys in-flight work: `data-refresh-and-versioning.md` failure mode #3
- Flake taxonomy this doc plugs into (cause #2, shared state): `../../quality-dev/principles/flakiness.md`
- Test-code-side patterns (factories, per-test uniqueness): `../../test-automation-engineer/principles/test-data-management.md`
- The callable investigation: `../agents/state-leak-tracer.md`; parallel agents colliding on shared data: `../orchestration/README.md` failure mode #2
