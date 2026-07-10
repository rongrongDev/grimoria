# Environment Provisioning

> Last reviewed: 2026-07-09. Applies to: Docker Compose v2.29+, Testcontainers (Java 1.20 / Python 4.x / Node 10.x), Kubernetes 1.31+, vcluster 0.20+, Terraform 1.9 / OpenTofu 1.8, LocalStack 3.x. Concepts are platform-agnostic.
> Standalone doc. Related: `environment-lifecycle-and-contention.md` (who uses it, for how long), `data-refresh-and-versioning.md` (what data lands in it), `../skills/environment-parity-auditor/SKILL.md` (the callable parity check).

## The stance

An environment is **a build artifact**: produced from versioned inputs by an automated process, reproducible, disposable. The moment an environment can only be *maintained* — patched in place, its history the only record of its configuration — it is a snowflake, and every snowflake is drifting away from production at an unknown rate in an unknown direction. You don't fight drift with discipline ("nobody SSH in and change things, please"); you fight it by making rebuild cheaper than repair, and by *measuring* parity instead of assuming it.

The second stance: **parity is per-purpose, not absolute.** No test environment is production — smaller, no real traffic, no real data, different secrets. The engineering question is which axes must match *for the tests this environment hosts to mean anything*. A functional-test environment can run one replica of everything; a perf environment cannot. An integration environment must match prod's service versions; a UI-component environment doesn't care. Unexamined "we want staging identical to prod" produces environments that are expensive *and* unmeasured — the worst quadrant.

## The five parity layers

Audit and declare each layer separately; drift hides in whichever one nobody listed. This taxonomy is the spine of `../skills/environment-parity-auditor/SKILL.md`.

1. **Infrastructure** — engine versions (Postgres 16 vs 17 is a different query planner), OS/base images, instance classes where they matter (perf only).
2. **Configuration** — the silent killer: DB flags, timeouts, connection-pool sizes, feature flags, locale/encoding/timezone, TLS settings. Config drift outnumbers version drift ten to one in incidents I've triaged.
3. **Topology** — which services exist, how many replicas, what's between them (LB, proxy, service mesh, queue). A single-replica staging cannot reproduce any bug that needs two replicas: sticky sessions, cache incoherence, double-processing.
4. **Dependencies** — external services: real, sandboxed, or virtualized (that judgment: `../patterns/service-virtualization.md`); third-party API *versions*.
5. **Data shape** — volume, distributions, edge-case presence. Owned by `seeding-and-synthetic-data.md` / `../patterns/production-scale-subsetting.md`, but it is a parity layer and belongs in every audit.

## Failure modes

### 1. Environment drift → "works in test, fails in prod" (and the inverse)

**Failure mode.** Accumulated unmeasured divergence. Someone hand-tunes a staging DB flag during an incident and never ports it; prod gets upgraded and staging doesn't; a feature flag is on in staging, off in prod. Tests then validate a system that doesn't exist. The inverse costs differently but real money too: failures in test that can't happen in prod burn triage time and corrode trust in the suite.

*The incident:* production Postgres had `statement_timeout = 30s`; staging — hand-built years earlier — had none. A new report query ran 4 minutes in staging and "passed" (slow, but green). In production it died at 30s, the app-level retry loop re-issued it, and the pileup took the primary down at peak. The bug wasn't the query; it was that **staging's config silently promised something prod never offered.** No one had ever diffed the two configs. The diff, once written, took twenty minutes and found eleven other divergences.

**Detection.** Automated parity diff across the five layers, run on schedule — not once. Versions from package/image manifests; config from dumps (`SHOW ALL` on Postgres, config APIs elsewhere) with a *reviewed allowlist of expected differences* (credentials, hostnames, capacity); topology from the deployment manifests; flags from the flag system's own API. Every divergence is either on the allowlist with a reason, or it's a finding.

**Fix.** Converge — usually test-side toward prod, but each finding is a judgment: sometimes the *prod* value is the accident. Then kill the mechanism that let it drift (next failure mode).

**Prevention.** Same definitions provision both prod and test wherever humanly possible (one Terraform module, two variable files — not two modules). Scheduled parity audit with findings filed as work, not as a report nobody reads. Config changes to prod flow through the same repo that builds test environments, so divergence requires *effort* instead of happening by default.

### 2. Snowflake environments — hand-configured, unrebuildable

**Failure mode.** The environment predates the team; its configuration is archaeology. Symptoms: fear of restarting it, "don't touch the staging box" folklore, recovery-from-loss measured in weeks, and unbounded drift because there is no source of truth to drift *from*.

**Detection.** One question: **"If this environment vanished right now, how long to rebuild it, and from what?"** If the answer involves a person's memory, it's a snowflake. Corroborating evidence: shell history full of config edits, no repo that claims to define it, backups of the *machine* rather than definitions of the *environment*.

**Fix.** Don't try to reverse-engineer the snowflake into code in place — you'll encode its accidents as intent and never know when you're done. Build a fresh environment-as-code definition targeting *production's* configuration (which is the thing tests should resemble anyway), run the two side by side, migrate suites over deliberately, then delete the snowflake. Deleting it is the point: a snowflake kept "just in case" is where tests quietly keep running. Expect the migration to surface tests that depended on the snowflake's accidents — each is a real finding about the test, not a migration bug.

**Prevention.** Rebuild-from-scratch as a *scheduled event* (monthly, or on every release train): any environment that is regularly destroyed and recreated cannot be a snowflake, and hand-applied changes surface within one cycle because the rebuild deletes them. This is the single highest-leverage habit in this doc.

### 3. Slow environment spin-up blocking CI feedback

**Failure mode.** Ephemeral environments are the isolation ideal (see rule 4 in `core-principles.md`), but a 45-minute spin-up makes per-PR environments unusable; teams retreat to a shared long-lived environment, and you inherit every contention failure in `environment-lifecycle-and-contention.md` instead. Spin-up cost is therefore not an ops metric — it decides your entire isolation architecture.

**Detection.** Trend spin-up time in CI (it only creeps up: images grow, migrations accumulate, seed data bloats). Attribute time to phases: image pull, infra create, service start, migrate, seed.

**Fix, by dominant phase.** Images: prebaked images per release instead of build-on-provision; registry cache near the runners. Migrations: periodically collapse into a baseline schema snapshot (200 accumulated migrations replayed per environment is pure waste — coordinate with the migration-tool owner). Seed: load from a prepared data snapshot (database template/restore) instead of re-running generators — Postgres `CREATE DATABASE ... TEMPLATE seeded_template` clones in seconds and is the workhorse trick at the suite level (Testcontainers + template DB per worker). Infra: keep a warm pool of pre-provisioned empty environments that PRs claim and customize (buys minutes, costs idle capacity — measure both).

**Prevention.** Spin-up time gets an SLO the same way build time does, with an owner. When it degrades, treat it as the architecture-threatening regression it is, not as background grumbling.

### 4. The local/CI/staging parity gap

**Failure mode.** Not one drift but three mutually-drifting tiers: developers on Docker Compose with Postgres `latest`, CI on Testcontainers with a pinned but different version, staging on the real infra. Bugs reproduce in exactly one tier; "works on my machine" is this failure mode wearing a costume.

**Detection & fix.** One source of truth for *versions and config* consumed by all three tiers (a single `.env`/manifest that Compose, Testcontainers, and the staging IaC all read). LocalStack-class emulators are acceptable for local AWS-shaped development, but declare them as a known parity gap: emulator fidelity is approximate, and anything security- or IAM-adjacent must be tested against the real thing before release.

**Prevention.** Version bumps are one PR touching the shared manifest, so no tier can upgrade alone.

## Decision tree: ephemeral vs. long-lived, container vs. cluster

```
What does this environment exist to do?
├─ Per-PR / per-run functional & integration testing
│   → EPHEMERAL, always. Containers (Testcontainers/Compose) if the system
│     fits on one host; ephemeral namespace or vcluster on K8s if it doesn't.
│     Data: template-clone seeded snapshot. If spin-up > ~10 min, fix spin-up
│     (failure mode #3) before conceding to a shared environment.
├─ Performance / load testing
│   → DEDICATED, prod-like on infra + config + data volume (layers 1,2,5).
│     Ephemeral if IaC can build it on demand (best: also proves rebuildability);
│     long-lived only if provisioning cost genuinely forbids — then scheduled
│     rebuild (failure mode #2 prevention) and a reservation system
│     (../patterns/environment-scheduling.md).
├─ Integration with external partners / sandboxes with fixed IPs, certs, allowlists
│   → LONG-LIVED by necessity. Contain the blast radius: this environment runs
│     ONLY what needs the fixed identity; everything else stays ephemeral.
│     Scheduled rebuild still applies to everything except the fixed identity.
└─ Exploratory / demo / UAT
    → EPHEMERAL with a TTL and an owner (cleanup-and-isolation.md). Demo
      environments kept "just for next time" are how snowflakes are born.
```

## Cross-references

- Scheduling, contention, and cost of whatever long-lived environments survive the tree above: `environment-lifecycle-and-contention.md`, `../patterns/environment-scheduling.md`
- What data lands in a fresh environment, and refreshing it safely: `data-refresh-and-versioning.md`
- CI wiring, runners, caching mechanics: `../../test-automation-engineer/principles/ci-cd-integration.md` (owns the pipeline; this doc owns what the pipeline provisions)
- The callable audit: `../skills/environment-parity-auditor/SKILL.md`; periodic drift-watch orchestration: `../orchestration/README.md`
