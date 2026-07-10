# Redis — Fast, Shared, and Easy to Misuse

**Tier:** Core (full depth). **Verified against:** Redis 7.x / 8.x (and Valkey 8.x — API-compatible for everything here). **Last reviewed:** 2026-07-06.
**Read with:** [concurrency.md](../principles/concurrency.md) (locks, stampedes), [performance.md](../principles/performance.md) §4 (caching judgment).

Redis is the best tool ever made for ephemeral shared state — and a single-threaded, memory-bound system that people treat like a durable database until it teaches them otherwise. The two disciplines: **respect the single thread, and decide explicitly what happens when the data is gone.**

---

## 1. The two prime rules

**Rule 1 — single-threaded command execution:** one slow command blocks *every* client. The bans:
- **`KEYS *` in production** — full keyspace scan, blocks everything; the classic "Redis was down but the process was fine" incident. Use `SCAN` (cursor-based, incremental). Same class: `SMEMBERS`/`LRANGE 0 -1`/`HGETALL` on huge collections, `SORT`, big `MGET`s of megabyte values. *Detection:* `SLOWLOG GET` (keep it in the runbook), latency spikes on *all* keys at once. *Prevention:* disable/rename dangerous commands (`rename-command KEYS ""`), collection-size hygiene (§3), client-side lint for `KEYS` usage.
- `FLUSHALL`/`FLUSHDB`: rename them away in prod. The cold-start herd after an accidental flush ([concurrency.md](../principles/concurrency.md) §6) is a real outage pattern.

**Rule 2 — decide data-loss semantics per key class, in writing:**
- **Cache** (rebuildable): loss = a stampede risk, not data loss. Design for cold start (single-flight, warmed gradually — never "flush and let traffic rebuild it" during peak).
- **Ephemeral state** (sessions, rate-limit counters): loss = users logged out / limits reset. Usually acceptable; say so explicitly.
- **Source of truth** (the only copy of anything): **Redis is the wrong home unless you've engineered it to be one** — AOF `appendfsync everysec` still loses ~1s on crash; replication is async (failover loses acked writes); `WAIT` helps but is not sync replication. If losing it costs money, it lives in Postgres, possibly *cached* in Redis. The recurring incident: shopping carts / job states living only in Redis, node fails over, carts gone, nobody had decided that was acceptable.

## 2. Caching patterns (mechanics; judgment in [performance.md](../principles/performance.md) §4)

- Cache-aside is the default: read → miss → load from DB → `SET key val EX ttl`. Everything that matters is in the details: TTL jitter, single-flight on hot keys, stale-while-revalidate — all specified in [concurrency.md](../principles/concurrency.md) §6; implement them here with `SET NX` recompute-locks and soft-TTL fields.
- **Key discipline:** namespaced, versioned keys (`v2:tenant:123:profile`) — version bump = safe global invalidation without FLUSH; key includes every result-varying dimension ([performance.md](../principles/performance.md) §4's cross-tenant-leak warning).
- **Serialize small:** store compact JSON/msgpack, not framework-native serialized objects (language-locked, version-fragile, and the reason "we can't upgrade the app because the cache format" exists).
- Negative caching (cache the "not found" briefly) prevents miss-storms on nonexistent keys — with a short TTL and an invalidation path for when the entity *is* created.

## 3. Memory management — the OOM you schedule

- **Set `maxmemory` and an explicit eviction policy.** Defaults vary by packaging; unbounded Redis on a shared box takes the box down. For pure cache: `allkeys-lru` (or `allkeys-lfu`). For mixed workloads: **don't mix** — an evicting cache and must-not-evict state (sessions, locks, queues) in one instance means eviction eats your sessions during a traffic spike, which is exactly when it happens. **Separate instances per loss-semantics class** (§1 Rule 2); they're cheap.
- With `noeviction` (state instances): writes fail at `maxmemory` — alert at 80% (`used_memory` / `maxmemory`), and know your biggest keys (`redis-cli --bigkeys`, `MEMORY USAGE`).
- **Every key gets a TTL unless it's deliberately permanent** — keyspace without TTLs only grows; the "why is Redis at 95%" investigation always finds three years of session keys from a version that didn't expire them. Audit: sample `RANDOMKEY`+`TTL`, or track `expires` vs `keys` in `INFO keyspace`.
- Big-key hazards: a 50MB hash blocks the thread on access and on delete — `UNLINK` (async) instead of `DEL` for anything possibly large; cap collection sizes in application code.

## 4. Atomicity — Lua and the patterns that need it

Single commands are atomic; sequences are not — `GET` then `SET` from two clients interleaves ([concurrency.md](../principles/concurrency.md)'s read-decide-write, Redis edition). Compose atomically with:
- **Lua scripts (`EVAL`)** — the workhorse. Rate limiting (token bucket: read tokens, refill by elapsed time, decrement, set — one script, one round trip — [security.md](../principles/security.md) §7), safe lock release (compare-token-then-delete — [concurrency.md](../principles/concurrency.md) §2), bounded-list push. Keep scripts *short* (they block the thread too) and side-effect-deterministic.
- `INCR`/`INCRBY` + `EXPIRE NX` covers fixed-window counting without Lua; `SET key val NX PX ttl` is the lock idiom (with all the TTL caveats of [concurrency.md](../principles/concurrency.md) §2 — efficiency locks only, fencing for correctness).
- `MULTI/EXEC` is a pipeline with all-or-nothing *queuing*, not a transaction with reads (no mid-transaction reads; `WATCH` gives optimistic CAS but Lua is almost always clearer).

## 5. Beyond cache — queues, streams, pub/sub, sessions

- **Pub/Sub is fire-and-forget** — no persistence, disconnected subscriber misses everything. Cache-invalidation nudges: fine. Anything that must arrive: no.
- **Streams (`XADD`/consumer groups)** are the real queue primitive: persistent, acked, `XAUTOCLAIM` for crashed-consumer recovery, and a `XPENDING` list you must monitor (the DLQ-alerting rule from [async-work.md](../principles/async-work.md) §4 applies — unclaimed pending entries are your poison messages). Cap stream length (`XADD ... MAXLEN ~ n`) or it grows to `maxmemory`.
- Lists as queues (`LPUSH`/`BRPOP`): simple, but no ack — consumer crash after pop loses the job (`LMOVE` to a processing list + janitor restores at-least-once). If you're building that, you wanted Streams or a broker.
- **Sessions/rate-limits at fleet scale** are Redis's best non-cache jobs — with `noeviction` instances (§3) and the loss-semantics decision (§1) written down.

## 6. Operations

- **Persistence:** cache instances — RDB snapshots or nothing; state instances — AOF `everysec`. Know that RDB+AOF rewrite forks: the fork doubles memory pressure transiently (COW) — the OOM-during-BGSAVE incident; keep headroom or use `maxmemory` ≤ ~50–65% of host RAM on persisting instances.
- **HA:** managed Redis (ElastiCache/MemoryDB/Cloud provider) unless you have a reason; Sentinel/Cluster self-managed otherwise. Cluster mode shards by hash slot: multi-key ops and Lua require co-located keys — **hash tags** (`{user:123}:cart`, `{user:123}:profile`) are the design decision to make *before* you need cluster, because retrofitting key names is a migration.
- Client hygiene: connection pooling (each connection is cheap but not free; the reconnect storm after a failover is a herd — jittered backoff in client config); timeouts on every call; **circuit-break the cache**: a 2s Redis timeout on every request during a Redis brownout is *worse* than no cache — fail fast to the DB (which must survive the miss rate — capacity math from [performance.md](../principles/performance.md) §4) or serve degraded ([observability.md](../principles/observability.md) §4).
- Monitor: `INFO` — memory (§3), `evicted_keys` (nonzero on a state instance = incident), `keyspace_hits/misses` (hit rate per [performance.md](../principles/performance.md) §4), `connected_clients`, replication offset lag; plus `SLOWLOG` and `LATENCY HISTORY`.

## Failure-mode quick table

| Failure | Detection | Fix / Prevention |
|---|---|---|
| Slow command blocks everything | SLOWLOG; all-key latency spike | Ban `KEYS`/unbounded reads; `SCAN`; rename-command |
| Eviction eats sessions/locks | `evicted_keys` > 0 on state instance | Separate instances per loss class; `noeviction` + 80% alert |
| Accidental FLUSH / cold cache herd | DB load 10× after cache event | Rename FLUSH away; versioned keys for invalidation; single-flight |
| Cart/state lost on failover | User reports post-incident | Source of truth in Postgres; Redis as cache/accelerator only |
| Stampede on hot-key expiry | Periodic DB spikes aligned to TTLs | Jitter + single-flight + stale-while-revalidate ([concurrency.md](../principles/concurrency.md) §6) |
| OOM during BGSAVE fork | Memory doubles at snapshot time | RAM headroom; snapshot off-peak; replica-based backups |
| Poison entries in Stream pending list | `XPENDING` age/count alert | `XAUTOCLAIM` + max-delivery → DLQ stream ([async-work.md](../principles/async-work.md) §4) |
| Reconnect storm after failover | Connection-count spike; client errors | Jittered reconnect backoff; connection pool caps |
| Cache outage takes app down | p99 = Redis timeout × calls per request | Short timeouts + circuit breaker + degraded path |
