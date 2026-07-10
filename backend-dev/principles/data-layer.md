# The Data Layer — Where Mistakes Become Permanent

**Last reviewed:** 2026-07-06. Principles are engine-agnostic; concrete syntax and locking behavior verified against PostgreSQL 16–18 ([stacks/postgres.md](../stacks/postgres.md)). ORM-specific notes in each stack doc.
**Operationalized by:** the `migration-safety-reviewer` Skill (`.claude/skills/migration-safety-reviewer/`).
**Related:** [concurrency.md](concurrency.md) (locking), [performance.md](performance.md) (query profiling).

Application bugs are ephemeral — deploy a fix and they're gone. **Data-layer bugs write themselves into your rows and stay there.** A bad migration, a wrong isolation level, or a double-write survives the rollback. This doc is ordered by how much sleep each topic has cost me.

---

## 1. Schema migration safety — the expand/contract pattern

The cardinal rule: **during a deploy, old code and new code run against the same schema simultaneously.** Rolling deploys guarantee it; so do rollbacks. Every migration must be compatible with the code version *before* it and *after* it. The pattern that makes this systematic:

**Expand → Migrate → Contract**, always as separate deploys:

1. **Expand:** add the new column/table/index. Additive only. Old code ignores it; new code can start writing it. New columns must be nullable *or* have a database default (see the Postgres note below).
2. **Migrate:** dual-write from application code (write old + new shape), backfill historical rows in **batches**, then switch reads to the new shape. Verify with a checksum/count comparison job before proceeding.
3. **Contract:** only after the old shape has had zero readers/writers for a full deploy cycle (check with query logging / `pg_stat_statements`), drop it. In its own deploy, so it's independently revertible.

What this replaces: `ALTER TABLE users RENAME COLUMN email TO email_address` shipped with the code change. During the roll, half your fleet writes `email` and gets `column does not exist`. I watched exactly this take checkout down for 40 minutes; rename = add new + dual-write + drop old, over three deploys. **A migration and its dependent code change never ship in the same deploy.**

**Locking hazards (Postgres specifics; other engines differ but rhyme):**

- Most `ALTER TABLE` forms take `ACCESS EXCLUSIVE` — blocking all reads and writes. Worse: the ALTER itself *queues behind* any long-running query on that table, and **everything else queues behind the ALTER**. A 2-second ALTER behind a 10-minute analytics query = 10 minutes of full-table outage. *Prevention:* `SET lock_timeout = '5s'` (or `2s`) before every DDL statement; if it can't get the lock fast, it fails fast and you retry off-peak.
- `CREATE INDEX` locks writes → **always** `CREATE INDEX CONCURRENTLY` on live tables (can't run in a transaction; can leave an `INVALID` index on failure — check and drop/retry).
- Adding `NOT NULL` to an existing column scans the whole table under lock. Safe sequence: add `CHECK (col IS NOT NULL) NOT VALID` → `VALIDATE CONSTRAINT` (takes only a light lock) → then `SET NOT NULL` (PG12+ uses the validated constraint to skip the scan).
- Adding a column **with a volatile default** or changing a column's type rewrites the table. `ADD COLUMN ... DEFAULT <constant>` is safe on PG11+ (metadata-only); `ALTER COLUMN TYPE` almost never is — use expand/contract with a new column.
- Foreign keys on big tables: `ADD CONSTRAINT ... NOT VALID` then `VALIDATE CONSTRAINT` separately.

**Backfills:** batch (1k–10k rows), sleep between batches, key each batch by PK range (never `OFFSET`), make the job resumable and idempotent, and watch replication lag while it runs. A single `UPDATE users SET x = y` on 100M rows bloats the table, saturates WAL, and stalls every replica; I've seen one take down read-replica-dependent search for an afternoon.

*Prevention stack:* `migration-safety-reviewer` Skill on every migration PR; CI runs migrations against a production-schema copy with a `lock_timeout` and a statement-timeout gate; squash-test that `up` followed by code-rollback still serves traffic.

## 2. Transaction isolation levels — when they actually matter

Most engineers run `READ COMMITTED` (the Postgres default) their whole career without knowing what it does *not* protect against. What it doesn't prevent:

- **Lost update:** two requests read balance=100, both compute `100-10`, both write 90. You lost a decrement. `READ COMMITTED` is perfectly happy with this.
- **Read-then-write races** on invariants spanning rows: "insert a booking if count < capacity" — two transactions both count 9/10, both insert, capacity is now 11/10. (Write skew.)

Decision tree:

- **Single-row read-modify-write** → don't raise isolation; use an atomic write (`UPDATE accounts SET balance = balance - 10 WHERE id = $1 AND balance >= 10`, check rows-affected) or `SELECT ... FOR UPDATE`. Cheapest, clearest.
- **Multi-row invariant** (capacity limits, uniqueness beyond a constraint, balance across rows) → `SERIALIZABLE` for those transactions only, **with retry-on-40001 loops** (serialization failures are not errors, they're the mechanism — code that doesn't retry them is broken), or explicit locking of a parent row to serialize the invariant.
- **Consistent multi-query snapshot** (reports, exports) → `REPEATABLE READ` on a replica.
- **Everything else** → `READ COMMITTED` and atomic statements.

*Detection of isolation bugs:* they look like impossible data — negative inventory, capacity exceeded, sums that don't add up. They reproduce only under concurrency, so *test* under concurrency: a 50-goroutine/promise hammer test on every invariant-bearing endpoint. Full treatment of locking strategy in [concurrency.md](concurrency.md).

**Long transactions are their own failure mode** regardless of isolation: they hold locks, block vacuum (table bloat), and block DDL. *Prevention:* set `idle_in_transaction_session_timeout` (e.g. 60s) globally and alert on transactions > 30s via `pg_stat_activity`. Never hold a transaction across a network call — the day your payment provider gets slow is the day your DB runs out of connections (see §4).

## 3. N+1 queries

The signature: load a list (1 query), then loop and load a child per item (N queries). Invisible at 10 rows in dev; 3,000 queries per page at production scale. Every ORM manufactures these by making lazy loading look like property access.

- **Detection:** count queries per request in middleware; alert/fail when > ~20. In dev, log queries with the request-id and *watch the log* (see per-stack tooling: `nplusone`/Django `assertNumQueries`, Rails `bullet`/`strict_loading`, Hibernate statistics, in the stack docs). In prod, `pg_stat_statements` shows the child query with `calls` orders of magnitude above its parent's.
- **Fix:** eager-load (`JOIN` / `IN (...)` batch / ORM `includes`/`select_related`/`JOIN FETCH`), or a dataloader pattern in GraphQL (mandatory — every resolver edge is an N+1 by default).
- **Prevention:** CI test asserting query counts on the top endpoints (`assertNumQueries` and equivalents); Rails `strict_loading`/Hibernate `@BatchSize` as guardrails; reject PRs that add a loop containing an awaited query.

## 4. Connection pool exhaustion

The 3am classic. Symptoms: latency cliff (not a slope — requests go from 50ms to timeout with nothing in between), `too many connections` or pool-checkout timeouts, and a DB that looks *idle* while the app is down.

Arithmetic nobody does until the outage: Postgres handles **hundreds** of connections well, not thousands (each is a process; context-switch and lock-contention overhead grow past ~2–4× core count of *active* connections). Meanwhile: `instances × pool_size` — 40 pods × 25 pool = 1,000 connections. Autoscaling doubles pods during an incident and the DB refuses connections *from the healthy pods too*: your autoscaler is now the attacker.

Rules:

- Size pools small: per-instance pool = plausible concurrent queries per instance, usually **5–10**, not 100. Total across fleet < ~70% of `max_connections`, leaving headroom for admin/cron/migrations.
- Use a server-side pooler (PgBouncer/RDS Proxy, transaction mode) when instance count is large or serverless. Transaction mode breaks session state — prepared statements, advisory locks, `SET` — check your driver's compatibility (stack docs cover each).
- Checkout timeout short (2–5s) + circuit breaker, so pool exhaustion degrades to fast 503s instead of a hung fleet.
- **Never hold a connection across external I/O.** The pattern that causes 80% of exhaustions I've debugged: open transaction → call third-party API → API hangs 30s → every request does this → pool empty in seconds. Structure code as: read what you need, release, call the API, open a new transaction to record the result (with idempotency, since you can now crash in between — see [concurrency.md](concurrency.md)).
- *Detection/alerting:* pool checkout wait time (alert > 100ms p95), DB connection count vs max (alert at 80%), and `idle in transaction` counts.

## 5. Indexing strategy

- Index what you filter/join/sort on, **composite in the order: equality columns first, then the sort/range column** (`(tenant_id, created_at)` serves `WHERE tenant_id = ? ORDER BY created_at DESC`; the reverse order does not).
- A composite index serves any left prefix; `(a,b)` makes a standalone `(a)` index redundant — drop it.
- **Every index taxes every write** and occupies cache. Audit with `pg_stat_user_indexes.idx_scan = 0` (unused) quarterly; I've removed 40% of indexes on mature systems with zero read regression and measurable write improvement.
- Foreign key columns are **not** auto-indexed in Postgres: every FK needs an index or parent-row deletes/updates seq-scan the child table under lock. This is a classic "deletes suddenly take minutes" page.
- Partial indexes for hot subsets (`WHERE status = 'pending'`) are the highest-leverage trick in Postgres: tiny, hot-cached, and they encode intent. Expression indexes for `lower(email)`.
- Know why the planner ignores your index: wrong column order, function on the column (`WHERE date(created_at)=...`), type mismatch (text vs int, or a driver sending varchar for a bigint), leading-wildcard `LIKE`, or stale statistics (`ANALYZE`).
- *Prevention:* every new query pattern ships with `EXPLAIN (ANALYZE, BUFFERS)` evidence in the PR when it touches a table > ~1M rows; `auto_explain` in staging; slow-query log review as a standing weekly ritual ([performance.md](performance.md)).

## 6. Choosing the store (short version)

Default to **Postgres until proven otherwise** — it does relational, JSON, full-text, queues (careful — see [async-work.md](async-work.md)), and pub/sub well enough that most "we need Mongo/Kafka/Elastic" decisions at < 1TB working set are résumé-driven. Add Redis for ephemeral shared state (cache, rate limits, locks — [stacks/redis.md](../stacks/redis.md)). Reach for a document store when the *access pattern* is genuinely document-shaped and known up front ([stacks/mongodb.md](../stacks/mongodb.md)). The moment data lives in two stores, **you** own the consistency between them — dual-writes without an outbox are a standing data-corruption generator ([concurrency.md](concurrency.md) §5).

## Failure-mode index

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Migration locks table behind long query | Lock-wait pileup in `pg_locks`/`pg_stat_activity`; latency spike during deploy | Kill the ALTER (it's queued, not running); retry with `lock_timeout` | `lock_timeout` on all DDL; `migration-safety-reviewer`; deploy DDL separately from code |
| Old code vs new schema during roll | `column does not exist` errors mid-deploy | Roll forward the compatible schema, or roll code back | Expand/contract; migration and code never co-deploy |
| Lost update / write skew | Impossible data: negative stock, exceeded capacity | Atomic UPDATE, `FOR UPDATE`, or `SERIALIZABLE`+retry | Concurrency hammer tests on invariant endpoints |
| N+1 | Query-count middleware; `pg_stat_statements` calls ratio | Eager load / batch / dataloader | `assertNumQueries`-style CI gates |
| Pool exhaustion | Checkout wait p95; conn count ≥ 80% max; idle-in-transaction | Shrink pools, add PgBouncer, evict I/O from transactions | Pool math in capacity review; no-network-inside-transaction rule; checkout-wait alert |
| Unindexed FK | Slow parent deletes; child seq scans in EXPLAIN | Add the index `CONCURRENTLY` | Migration lint: FK ⇒ index |
| Full-table backfill melts replicas | Replication lag alert; WAL volume spike | Kill it; rebatch with sleeps | Backfill runbook: batched, resumable, lag-aware |
