# Analyze an Existing Service — A Bounded-Time Playbook

**Last reviewed:** 2026-07-06. Stack-agnostic; per-stack grep targets in the [stack docs](../stacks/).
**This guide is Capability B of the KB.** Input: an unfamiliar backend codebase (plus, ideally, its schema and 24h of logs/metrics). Output, within the time budget: (1) an architecture summary, (2) a data-consistency / race-condition risk list, (3) a prioritized remediation plan.
**Time budget:** ~4 hours single-pass for a typical service (10–100k LOC). Timeboxes below assume that; scale proportionally but **keep the phase order** — it's sequenced so that if you're cut off early, what you have is still the most valuable subset. For fleet-wide analysis, fan this playbook out per [multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) §3; the sweep phases can be delegated to the `race-condition-scanner` subagent.

**Prime rule: evidence or it didn't happen.** Every finding carries `file:line` + a quoted snippet, or it doesn't go in the report. (Humans hedge without evidence; models fabricate without it. Same rule fixes both.)

---

## Phase 1 — Orient (30 min): what is this thing?

Read in this order — highest information density first:
1. **Entry points & wiring:** the main/startup file, route registration, DI/module config. This is the service's table of contents.
2. **The schema** (migrations folder in order, or a live `\d+` dump). *The schema is the most honest document in any codebase* — code comments lie, READMEs rot, but the schema is load-bearing truth. Note: tables without FKs where FKs are implied (consistency enforced in app code — a finding), missing indexes on FK columns, `*_id` columns pointing at other services, JSON blobs accreting a domain model ([stacks/postgres.md](../stacks/postgres.md) §6).
3. **Dependency manifest + config surface** (package file, env vars, docker-compose): every datastore, broker, and third-party API = an edge in the architecture diagram and a failure mode to ask about.
4. **The deploy artifact** (Dockerfile, CI config): how many processes, what runtime flags, migrations-on-startup? (auto-migrate on boot with N replicas = a finding by itself — [stacks/dotnet.md](../stacks/dotnet.md) table, applies to every stack).

Deliverable: half-page architecture summary — components, stores, external calls, request flow for the 2–3 main paths, background work inventory. **Write it now, not at the end**; correcting it later is cheaper than reconstructing it.

## Phase 2 — The consistency & race sweep (60–90 min)

This phase finds the incidents that haven't happened yet. Hunt the four shapes from [concurrency.md](../principles/concurrency.md); per-stack grep vocabulary in each stack doc's failure table:

1. **Read-decide-write:** every `SELECT`/find followed by a conditional write on the same entity. Grep entry points: `get_or_create`, `find...if...save`, `count(...)` before insert, `exists` checks, balance/quantity/capacity reads. For each: is the invariant enforced by a constraint, an atomic statement, a lock — or by hope? Hope = finding, severity scaled by what the invariant protects (money > capacity > cosmetics).
2. **Dual writes:** every place a DB commit is followed by a publish/second-store write (`commit` then `publish|send|set|index`). No outbox ([concurrency.md](../principles/concurrency.md) §5) = finding. Check the reverse too: enqueue *inside* a transaction that might roll back.
3. **Non-idempotent retried work:** list every queue consumer/job handler; for each, "what happens if this runs twice?" ([async-work.md](../principles/async-work.md)). Look for the dedup table / natural idempotency / nothing. Check ack/commit ordering (ack-before-work = loss; work-without-dedup = duplication). Also: `acks_late`, visibility timeouts vs job durations, missing DLQ + missing DLQ *alert*.
4. **Shared in-process state:** module/class-level mutables written per-request (per-stack signatures: [nodejs](../stacks/nodejs.md) §1 await-races, [go](../stacks/go.md) §2 package vars, [jvm](../stacks/jvm.md) §4 singleton fields, [python](../stacks/python.md) §1, [rails](../stacks/rails.md) Thread.current).

Also collect while you're in there: transactions spanning external calls ([data-layer.md](../principles/data-layer.md) §4), missing timeouts on outbound clients (the #1 grep-detectable outage precursor — default clients in Go/Python/Node all lack them), retry loops without jitter or idempotency.

Deliverable: the risk list — each entry: shape, evidence (`file:line` + snippet), what breaks and under what load, severity (see Phase 5 rubric).

## Phase 3 — Data-layer & migration health (45 min)

- Migrations folder read end-to-end at skim speed: unsafe DDL patterns (the [migration-safety table](../stacks/postgres.md) §5), backfills inside migrations, evidence of expand/contract or its absence. The *history* tells you the team's habits — habits predict the next migration.
- Pool math: pool size × replica count vs `max_connections` ([data-layer.md](../principles/data-layer.md) §4). Under 30 seconds to check, catches a top-3 outage cause.
- N+1 spot check: pick the 3 heaviest-looking list endpoints, trace the query pattern (lazy relations in loops?). With prod access: `pg_stat_statements` top-10 by `total_exec_time` and by `calls` ([stacks/postgres.md](../stacks/postgres.md) §3) — 15 minutes with it outweighs 2 hours of code reading; ask for it.
- Isolation/locking: any `SERIALIZABLE`/`FOR UPDATE` usage — is `40001` retried? ([data-layer.md](../principles/data-layer.md) §2). Any advisory locks/distributed locks — TTL-safety per [concurrency.md](../principles/concurrency.md) §2.

## Phase 4 — Contract, security, and ops spot checks (45 min)

Not a full audit — a calibrated sample that predicts the rest:

- **AuthZ (BOLA):** pick 5 id-bearing endpoints; find the ownership/tenancy predicate for each ([security.md](../principles/security.md) §1). 2+ missing = assume systemic, recommend the tenant-scoped-repository remediation, don't enumerate all instances.
- **Input/output discipline:** are there input DTOs (mass assignment — §6) and output DTOs (exposure), or does the ORM entity flow through? One look at the median endpoint tells you.
- **Error contract:** one error shape or many hand-rolled ones ([api-design.md](../principles/api-design.md) §6)? Do 4xx/5xx semantics hold (validation as 500 = clients retry validation failures)?
- **Idempotency at the API edge:** do unsafe POSTs accept idempotency keys ([api-design.md](../principles/api-design.md) §4)?
- **Observability floor** ([observability.md](../principles/observability.md)): structured logs? trace propagation (incl. through queues)? liveness probe checking the DB (the cascade-restart bug §4)? Any SLO/burn-rate alerting, or only cause-based noise?
- **Secrets:** 5-minute gitleaks run + eyeball env handling ([security.md](../principles/security.md) §5).
- **Tests:** where's the weight — mock-heavy unit vs real-DB integration ([testing.md](../principles/testing.md) §1)? Any concurrency/redelivery tests at all (usually: none — note it; it corroborates Phase 2 findings)?

## Phase 5 — Prioritize and write the report (30 min)

Severity rubric — rank by **(blast radius × probability), tempered by fix cost**:
- **P0 — fix this week:** money/data corruption under plausible concurrency (unguarded balance/inventory writes), missing authZ on sensitive resources, secrets in repo, no-timeout outbound calls on the critical path.
- **P1 — fix this quarter:** dual-writes without outbox, non-idempotent consumers, pool math that fails at 2× traffic, migration habits that will cause the next deploy outage, no DLQ alerting (silent loss already possible).
- **P2 — schedule:** N+1s off the hot path, error-contract drift, observability gaps, test-shape inversion.
- **Hygiene:** everything else, listed but not litigated.

Report format (one page + appendix):
1. **Architecture summary** (Phase 1, corrected).
2. **Top 5 risks** — each: evidence, failure scenario in one concrete sentence ("two concurrent webhook deliveries for order X double-credit the wallet: `wallet.py:88`"), and the *specific* fix with its KB link.
3. **Remediation plan** — P0/P1/P2 with effort guesses (S/M/L) and sequencing (constraints first: DB invariants are the cheapest insurance and unblock nothing).
4. **Appendix:** full finding list with evidence.

**Calibration rules for the report:** distinguish "verified bug" from "risk pattern" — you read code, you didn't run it; say which. Resist the consultant's temptation to pad: five load-bearing findings beat forty observations, and the reader's trust is the deliverable. If the codebase is *good*, say so specifically — "invariants are constraint-backed, consumers are idempotent, migrations follow expand/contract" is a valuable and rare report.
