# Environment Lifecycle & Contention

> Last reviewed: 2026-07-09. Platform-agnostic; cost figures assume cloud IaaS pricing as of 2026.
> Standalone doc. Related: `environment-provisioning.md` (building them), `cleanup-and-isolation.md` (tearing them down), `../patterns/environment-scheduling.md` (reservation-system production patterns).

## The stance

Every environment is in one of two honest states: **actively serving a declared purpose, or being destroyed.** The third state — "kept around because someone might need it" — is where cost accumulates, drift compounds, and shared-state flakiness breeds. Lifecycle management is the discipline of refusing the third state: every environment has an owner, a purpose, and an expiry, all recorded at creation, all machine-readable.

Contention is the same discipline viewed from the other side: when an environment *must* be shared (and some must — see the decision tree in `environment-provisioning.md`), the sharing is made **explicit and enforced**, never informal. Informal sharing doesn't fail loudly; it fails as unattributable flakiness, and that is the most expensive failure shape in testing because it gets misdiagnosed as test-logic problems for months.

## The war story that governs everything here

Two teams, one company, one staging database — except neither team knew the other used it. Team A's nightly suite seeded customers with emails like `test+<timestamp>@example.com` and truncated "its" tables when done. Team B's suite, running on a different schedule, created orders against whatever customers existed and asserted on aggregate counts. For a week that management remembers to this day, both suites flaked at 10–20%: Team A's truncation deleted customers under Team B's in-flight orders; Team B's leftover orders shifted Team A's aggregate assertions. Each team debugged *its own test logic* — because why would you suspect a database you believed was yours? Team A added retries; Team B loosened assertions (both anti-fixes — see `../../quality-dev/principles/flakiness.md`). The truth surfaced only when someone finally ran `pg_stat_activity` during a flake and saw an unfamiliar application name.

Total cost: two engineer-weeks of triage, plus the permanent damage of retries and loosened assertions merged into two suites. Root cause: **the environment had no owner registry, so nobody knew sharing was even occurring.** Every rule in this doc traces back to some version of that week.

## Failure modes

### 1. Shared-environment collisions across teams

**Failure mode.** Multiple consumers with independent schedules mutate the same substrate: one team's data interferes with another's assertions; parallel runs consume each other's fixtures; someone's load test saturates the environment under someone's functional suite. The signature is flakiness that correlates with *wall-clock time and other teams' calendars*, not with code changes.

**Detection.** First, discover the sharing (it's usually undeclared): connection-source audit on the shared resource (`pg_stat_activity` application names, API gateway client IDs, k8s namespace access logs) over a full week — a day misses nightly jobs. Second, correlate flake timestamps across *teams'* CI systems: mutual flakiness clustering in time is the fingerprint. The `state-leak-tracer` subagent (`../agents/state-leak-tracer.md`) automates the per-incident version.

**Fix, in order of preference.** (1) **Un-share it** — per-consumer ephemeral environments (`environment-provisioning.md` failure mode #3 covers making that affordable). (2) **Partition it** — per-team schemas/namespaces/tenant-IDs with enforced boundaries (separate credentials that *cannot* touch the other partition — a convention without enforcement is failure mode #1 with extra steps). (3) **Schedule it** — time-slice via a reservation system (`../patterns/environment-scheduling.md`), the weakest fix because it serializes teams and still relies on cleanup between slots.

**Prevention.** No shared environment without a **consumer registry**: who, what workload, what schedule, what data they own — enforced by per-consumer credentials so the registry can't silently rot. New consumer ⇒ registry PR. The registry is what turns "mystery flake" into "check what else ran at 02:00," a five-minute lookup instead of a two-week hunt.

### 2. Long-lived environment cost vs. ephemeral spin-up

**Failure mode.** Environments accumulate: the perf environment from the 2024 migration project, three "temporary" UAT stacks, a demo environment per big customer. Each costs real money monthly, and — worse than the money — each is a drifting snowflake generating false test signal (`environment-provisioning.md` failure mode #2). Organizations discover this the first time someone sums the cloud bill's environment tags: it's routinely 30–40% of non-prod spend serving no active purpose.

**Detection.** Cost-by-environment tagging (mandatory at creation, see prevention), plus an activity probe: no deployments and no test traffic in 30 days ⇒ the environment is a candidate corpse. If tagging wasn't done, work backward from the bill's untagged residue — that residue *is* the orphan population.

**Fix.** For each candidate: identify the owner from the registry (or announce a kill date broadly if there is none — the owner reveals themselves within a week, or doesn't exist), then destroy or convert to on-demand. "Convert to on-demand" means proving the IaC can rebuild it, *then* destroying it — which is also the test of whether destruction is safe.

**Prevention.** TTL and owner tags required at creation (enforced by the provisioning pipeline — untagged requests fail), a reaper that acts on expired TTLs (soft-stop, then destroy after a grace window; see `cleanup-and-isolation.md` for reaper design), and TTL *renewal requiring an action* — the default is death, and keeping an environment alive is the thing that takes effort. That polarity is the whole game: any system where cleanup takes effort and retention is free will drown in environments.

### 3. Orphaned resource accumulation from incomplete teardown

**Failure mode.** Teardown that depends on the creating pipeline finishing cleanly: the job is cancelled, the runner dies, the teardown step has a bug — and the environment (or its expensive fragments: volumes, load balancers, elastic IPs, DNS records, DB snapshots) persists invisibly. Fragments are worse than whole orphans because they don't look like environments in anyone's mental inventory; they're just line items.

**Detection.** Reconciliation, not logs: periodically list *actual* resources (cloud APIs, `kubectl get ns`, DB catalog) and diff against *expected* (active CI runs + registry). Anything real-but-unexpected is an orphan. Run it daily; the population only grows between runs.

**Fix.** Destroy, keyed on the creation-time tags. The recurring trap: an untagged mystery resource nobody dares delete. Quarantine pattern — cut its network access / scale to zero, wait one week for screams, then delete. Screams within a week mean it was load-bearing and now you know for whom; silence means it was an orphan.

**Prevention.** Two independent layers, because each fails differently: (1) teardown in the pipeline's *always-run* phase (`finally`-equivalent) for the happy path and fast feedback; (2) the tag-driven reaper for every path where (1) didn't run. Teams that rely only on (1) leak on every crash; teams that rely only on (2) carry a full TTL-window of debris at all times. You want both.

### 4. Lifecycle events destroying in-flight work

**Failure mode.** The reaper (or a scheduled rebuild, or a TTL expiry) destroys an environment *while a suite is running in it* — the mirror image of failure mode #3, created by its fix. Failures look like infrastructure flakiness: connection resets mid-suite, half the tests green then a wall of timeouts.

**Detection.** Correlate suite-failure timestamps with lifecycle-system logs (reaper actions, TTL expiries, rebuild schedules). This correlation should be automated in the flake-triage path — it's one query and it exonerates or convicts the lifecycle system instantly.

**Fix & prevention.** Lifecycle actions take a **lease**, not a look: consumers hold a heartbeat lease on the environment while running; the reaper destroys only lease-free environments, and TTL expiry with an active lease escalates to a human instead of firing. Same mechanism as safe refresh (`data-refresh-and-versioning.md` failure mode #3) — build it once, use it for both.

## Decision tree: this environment is contended — what do I do?

```
Symptom: teams/suites interfering on a shared environment
├─ Can consumers afford per-run ephemeral environments?
│   (spin-up < ~10 min after applying provisioning failure-mode-#3 fixes)
│   └─ YES → un-share. This ends the problem rather than managing it. DONE.
├─ NO (genuinely constrained: perf hardware, fixed-identity partner sandbox,
│      licensed appliance)
│   ├─ Is the contention on DATA (interfering rows/fixtures)?
│   │   └─ Partition: per-consumer schemas / tenants / key-prefixes,
│   │     enforced by credentials. + cleanup-and-isolation.md discipline.
│   ├─ Is the contention on CAPACITY (load tests vs functional runs)?
│   │   └─ Time-slice via reservations: ../patterns/environment-scheduling.md.
│   │     Loud calendars beat silent collisions.
│   └─ Both → partition data AND reserve capacity windows; they solve
│             different collisions and neither substitutes for the other.
└─ Whatever survives: consumer registry + per-consumer credentials + lease
   protocol, no exceptions. An unregistered consumer on a constrained
   environment is next quarter's mystery flake.
```

## Cross-references

- Making ephemeral affordable (the "YES" branch above): `environment-provisioning.md`
- Reaper design, TTL mechanics, teardown ordering: `cleanup-and-isolation.md`
- Reservation-system production patterns and their pitfalls: `../patterns/environment-scheduling.md`
- Flake triage that lands here ("fails only in full-suite / only at certain hours"): `../../quality-dev/principles/flakiness.md` cause #2/#5, then `../agents/state-leak-tracer.md`
- Agents provisioning redundant environments and inflating cost: `../orchestration/README.md` failure mode #1
