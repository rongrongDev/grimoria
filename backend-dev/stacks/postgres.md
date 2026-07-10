# PostgreSQL — Operating the Database That Holds Everything

**Tier:** Core (full depth). **Verified against:** PostgreSQL 15–18. **Last reviewed:** 2026-07-06.
**Read with:** [data-layer.md](../principles/data-layer.md) (migrations, pools, indexing — the judgment layer) and [concurrency.md](../principles/concurrency.md) (locking). This file is the Postgres-specific mechanics those docs point at.

Postgres is the default database of this KB ([data-layer.md](../principles/data-layer.md) §6) because it rewards operational knowledge more than any alternative. This doc is that knowledge, incident-first.

---

## 1. MVCC, VACUUM, and bloat — the physics you can't opt out of

- **UPDATE = insert new row version + mark old dead; DELETE = mark dead.** Dead tuples are reclaimed by (auto)vacuum. Everything weird about Postgres operations follows from this: update-heavy tables bloat, long transactions block cleanup, and "we deleted half the table but it's the same size on disk."
- **Long-running transactions are toxic waste** — vacuum cannot reclaim anything newer than the oldest open snapshot, *cluster-wide*. One analyst session `idle in transaction` overnight = bloat everywhere + table/index growth + plans degrading. *Prevention:* `idle_in_transaction_session_timeout = 60s` (or minutes at most) as a cluster default; alert on `max(now() - xact_start)` > 30–60s from `pg_stat_activity` ([data-layer.md](../principles/data-layer.md) §2).
- **Autovacuum defaults are sized for small tables.** A 500M-row table with default `autovacuum_vacuum_scale_factor = 0.2` waits for 100M dead tuples before vacuuming. Hot big tables need per-table settings (scale factor 0.01–0.02, or threshold-based). *Detection:* `pg_stat_user_tables` — `n_dead_tup` vs `n_live_tup`, `last_autovacuum`; bloat estimation queries (pgstattuple) on the top-10 tables monthly.
- **Transaction-ID wraparound** is the extinction-level event: if vacuum can't keep up for weeks, the cluster eventually forces shutdown to protect data. You get warnings ("database must be vacuumed within N transactions") — **alert on `datfrozenxid` age** (e.g. > 500M) so this is a ticket, not the multi-hour single-threaded emergency vacuum at the worst time. Almost always caused by: a stuck replication slot, a forgotten prepared transaction (`pg_prepared_xacts`), or autovacuum starved on one huge table.
- `HOT` updates (updates not touching indexed columns, with page space available) skip index writes — a reason to avoid indexing frequently-updated columns and to keep some `fillfactor` headroom (e.g. 90) on update-heavy tables.

## 2. Locking — the mechanics behind the 3am page

- Row locks don't block reads (MVCC readers see snapshots); writers block writers on the same row. The pileups that page you are (a) DDL vs everything ([data-layer.md](../principles/data-layer.md) §1 — `lock_timeout` on all DDL, always), and (b) hot-row write contention ([concurrency.md](../principles/concurrency.md) §1).
- **The lock *queue* is the amplifier:** a waiting `ACCESS EXCLUSIVE` blocks all *later* acquirers even while it waits. Diagnosing: `pg_locks` joined to `pg_stat_activity` (keep the canonical blocking-tree query in your runbook); mitigation is usually killing the *blocker at the head*, not the hundred victims. `pg_blocking_pids(pid)` finds it directly.
- Foreign keys take share locks on referenced rows: heavy inserts into a child table contend on the hot parent row (the "every order locks the same merchant row" pattern). Know it exists; design hot parents accordingly.
- Deadlock (`40P01`): Postgres detects and kills one after `deadlock_timeout` (1s). Application must retry; prevention is consistent lock ordering ([concurrency.md](../principles/concurrency.md) §1). The log line names both queries — read it; the fix is usually obvious once you see the pair.
- `SELECT ... FOR UPDATE SKIP LOCKED` is the work-queue primitive ([async-work.md](../principles/async-work.md) §1); `FOR NO KEY UPDATE` is the right (weaker) lock when you're not changing keys — it doesn't block FK inserts in child tables.

## 3. Query performance — the toolkit

- **`pg_stat_statements` is the single highest-value extension. Install it everywhere, always.** Top-10 by `total_exec_time` = your optimization roadmap; `calls` column exposes N+1 ([data-layer.md](../principles/data-layer.md) §3); `shared_blks_read` vs `hit` exposes cache-miss queries.
- **`EXPLAIN (ANALYZE, BUFFERS)`** per suspect query. Read for: seq scans on big tables where you expected an index (see [data-layer.md](../principles/data-layer.md) §5 for the why-is-my-index-ignored list); **estimated vs actual row counts off by 100×+** (stale stats → `ANALYZE`; correlated columns → `CREATE STATISTICS`); nested-loop joins fed by a misestimate (the classic "fast for a year, then the table grew past a threshold and the plan flipped" incident — plan flips are why you alert on p99 per query, not just globally); sorts spilling to disk (`work_mem`).
- `auto_explain` (log plans of slow queries in prod, with `log_min_duration`) turns "it was slow last night" from a mystery into a logged plan.
- Memory: `work_mem` is **per sort/hash node, per query** — raising it globally on a busy cluster is how you OOM the box; raise per-session for known heavy queries (`SET LOCAL work_mem = '256MB'` inside the reporting transaction).
- `statement_timeout`: set a global default (e.g. 30s) and override *upward* per known-long session — an unbounded query from a bug or an agent ([multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) §4) should die, not run for six hours holding a snapshot (§1).

## 4. Replication & HA

- Streaming replication: async by default — failover loses the last moments of commits; `synchronous_commit`/sync replicas trade write latency for zero-loss. Decide per business reality, not per default: for money, sync (or at least `remote_write`); for a social feed, async.
- **Replication lag is an application-correctness problem, not just an ops metric:** read-after-write against a lagging replica = "my save disappeared" ([performance.md](../principles/performance.md) §6). Route read-your-writes traffic to primary (session stickiness for N seconds after a write is the standard cheap trick); alert on lag (`pg_stat_replication.replay_lsn` delta) at thresholds your routing assumes.
- **Replication slots retain WAL forever if the consumer stalls** — a dead CDC connector (Debezium — [concurrency.md](../principles/concurrency.md) §5 outbox relays) or ghost slot fills the disk of the *primary*. This is the most common self-inflicted full-disk incident of the CDC era. *Prevention:* alert on `pg_replication_slots` retained-WAL size; `max_slot_wal_keep_size` (PG13+) as the backstop.
- Failover: use an orchestrator (Patroni; or managed — RDS/Cloud SQL/Aurora). Applications must reconnect gracefully (pool `pre_ping`/validation — stack docs) and tolerate the few seconds of read-only/downtime; test failover quarterly, because untested failover is a rumor ([observability.md](../principles/observability.md) §4).
- **Backups: a backup you haven't restored is a hope, not a backup.** PITR (base backup + WAL archiving, e.g. pgBackRest/WAL-G) — because the incident that kills you is `DELETE FROM users` where someone forgot the WHERE at 14:32, and PITR to 14:31 is the only tool that fixes it. Restore drills on a schedule, with a measured RTO you've told your stakeholders.

## 5. Schema/DDL mechanics (companion to data-layer §1 — the exact rules)

The `migration-safety-reviewer` Skill encodes these; summary table for humans:

| Operation | Safe on live table? | Safe recipe |
|---|---|---|
| `ADD COLUMN` nullable / with constant default | ✅ (PG11+ metadata-only) | direct |
| `ADD COLUMN NOT NULL` no default | ❌ | add nullable → backfill batched → `CHECK NOT VALID` → `VALIDATE` → `SET NOT NULL` |
| `CREATE INDEX` | ❌ blocks writes | `CONCURRENTLY` (outside txn; check for `INVALID` on failure) |
| `DROP COLUMN` | ✅ metadata-only, but | expand/contract: only after zero readers ([data-layer.md](../principles/data-layer.md) §1) |
| `ALTER COLUMN TYPE` | ❌ usually rewrites + locks | new column + dual-write + backfill + swap (exceptions: varchar widening, and binary-compatible changes) |
| `ADD FOREIGN KEY` / `CHECK` | ❌ validates under lock | `NOT VALID` then `VALIDATE CONSTRAINT` |
| `RENAME` column/table | metadata-fast but breaks running code | expand/contract, never in-place on live schema |
| Any DDL | — | preceded by `SET lock_timeout = '5s'` (and retry logic), in its own deploy |

- Big deletes: `DELETE` in batches (dead-tuple physics, §1) or, for whole time ranges, **partitioning** — `DROP PARTITION` is instant and bloat-free. Partition (declarative, by range) when a table's lifecycle is time-based and large (events, logs); don't partition for "performance" without a pruning access pattern that matches the key.

## 6. Postgres-as-more-than-relational (when and when not)

- **Queues:** `FOR UPDATE SKIP LOCKED` queue is excellent to ~1–5k jobs/min and transactional with your data ([async-work.md](../principles/async-work.md) §1); beyond that, dead-tuple churn from delete/update-heavy queue tables demands aggressive per-table autovacuum — or a real broker.
- **JSONB:** superb for genuinely-variable payloads; index with GIN deliberately (write amplification is real). The failure mode is *schema abdication* — a `data jsonb` column accreting your actual domain model, unqueryable and unconstrainted. Rule: keys you filter on or that have invariants become real columns.
- **LISTEN/NOTIFY:** fine for cache-invalidation nudges; not a queue (no persistence, drops on disconnect, and doesn't work through PgBouncer transaction pooling).
- `pgcrypto`/`uuidv7()` (PG18; use v7 or ULIDs for PK-friendly ordering — random v4 PKs fragment B-tree insertion at scale), `pg_trgm` for fuzzy search before reaching for Elasticsearch.

## Failure-mode quick table

| Failure | Detection | Fix / Prevention |
|---|---|---|
| Bloat / vacuum starvation | `n_dead_tup` ratios; table size ≫ live data | Per-table autovacuum tuning; kill long transactions; `idle_in_transaction` timeout |
| Wraparound approach | `datfrozenxid` age alert | Find stuck slot/prepared xact; emergency vacuum before it's forced |
| DDL lock pileup | Blocking tree in `pg_locks`; deploy-time latency | `lock_timeout` on DDL; `migration-safety-reviewer` |
| Plan flip | One query's p99 cliff; row-estimate ≫ actual | `ANALYZE`; extended statistics; per-query latency alerting |
| Replica lag breaks read-your-writes | "My save disappeared" reports | Primary-routing after writes; lag alerts tied to routing threshold |
| Replication slot fills disk | Retained-WAL per slot alert | Drop dead slots; `max_slot_wal_keep_size` |
| Full disk from one bad query's temp files | `temp_bytes` in `pg_stat_database`; disk alerts | `temp_file_limit`; `statement_timeout` |
| Fat-finger DELETE/UPDATE | — (you find out from users) | PITR with drilled restores; `statement_timeout` won't save you — backups do |
