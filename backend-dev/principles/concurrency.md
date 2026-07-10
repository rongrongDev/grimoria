# Concurrency & Race Conditions — Correct Under Load, Not Just Under Test

**Last reviewed:** 2026-07-06. Engine-agnostic; Postgres locking specifics per PG 16–18, Redis patterns per Redis 7–8.
**Operationalized by:** the `race-condition-scanner` Subagent (`.claude/agents/race-condition-scanner.md`).
**Related:** [data-layer.md](data-layer.md) (isolation levels), [async-work.md](async-work.md) (queue semantics), per-runtime concurrency notes in each stack doc.

Race conditions are the bug class with the worst detection profile: **they pass every test, work in staging, and fire in production at peak — which is precisely when you can least afford them and can least reproduce them.** The discipline is to find them by *reading for the pattern*, not by waiting for the incident. The pattern is always the same: **read → decide → write, where the world can change between read and write.**

---

## 1. Optimistic vs pessimistic locking — decision tree

- **Contention is rare** (two users editing the same record is unusual — CRUD apps, CMS, settings): **optimistic locking.** Add a `version int` column; `UPDATE ... SET version = version + 1 WHERE id = $1 AND version = $2`; zero rows affected = someone got there first → reload and retry or surface a conflict to the user. Cheap, no locks held, but you must actually *handle* the conflict path — the teams that get burned are the ones whose ORM has `@Version` enabled and whose code swallows `OptimisticLockException`.
- **Contention is expected** (inventory decrement, seat booking, balance updates — many writers, same rows): **pessimistic.** `SELECT ... FOR UPDATE` inside a short transaction, or better, collapse read-decide-write into one atomic statement: `UPDATE stock SET qty = qty - 1 WHERE sku = $1 AND qty > 0` and check rows-affected. The atomic statement wins whenever the decision is expressible in SQL — no lock window at all.
- **Hot single row** (a global counter, one flash-sale SKU): neither scales past a point — every writer serializes on that row. Restructure: shard the counter, use Redis with periodic flush, or queue the writes and apply them serially ([async-work.md](async-work.md)).
- `FOR UPDATE` hygiene: lock rows in a **consistent order** (e.g. always ascending id) or two multi-row lockers deadlock; Postgres detects and kills one (`40P01`) — your code must retry it. Use `FOR UPDATE SKIP LOCKED` for work-queue patterns ("grab an unclaimed job") — it's the single most useful locking clause in Postgres. `NOWAIT` when failing fast beats queueing.

**War story:** Ticket sales, "sold out" oversold by 63 seats. Code: `SELECT count(*) FROM tickets WHERE event_id=?` → if under capacity → `INSERT`. Perfectly correct serially; under 400 concurrent buyers, hundreds of transactions counted the same snapshot. Read-decide-write with the decision in the application. Fix was one atomic statement: `INSERT ... SELECT ... WHERE (SELECT count(*) ...) < capacity` under a `FOR UPDATE` on the event row. The reviewably-dangerous shape — *count/read then insert/update in app code* — is what the `race-condition-scanner` subagent hunts.

## 2. Distributed locks — usually the wrong first answer

Before reaching for a distributed lock, ask: **can the database's own atomicity do this?** Unique constraint, atomic UPDATE, `FOR UPDATE`, `SKIP LOCKED` — each is strictly more reliable than any lock service, because the lock and the data live in the same consistency domain.

When you genuinely need one (mutual exclusion around a *non-database* resource — an external API that tolerates one caller, a cron that must run once fleet-wide):

- **Redis `SET key token NX PX ttl`** is fine for efficiency locks (avoiding duplicate work). Release must be check-and-delete of *your* token (Lua), never a bare `DEL` — or you'll delete the next holder's lock after your own TTL expired.
- **The TTL dilemma is fundamental:** too short → lock expires while you still run → two holders; too long → crashed holder blocks everyone. There is no TTL that solves both. If two holders would cause *corruption* (not just waste), a Redis lock is not sufficient — you need **fencing tokens**: the lock service issues a monotonically increasing number, and the *protected resource* rejects writes bearing a stale token. If the resource can't check tokens, redesign so it can, or route all writes through a single serial consumer.
- Postgres advisory locks (`pg_advisory_xact_lock`) are underrated for "one cron runner fleet-wide" — they vanish with the session (no TTL problem) and you already operate the database. Caveat: they pin a connection, and PgBouncer transaction mode breaks session-scoped ones (use `_xact_` variants).
- Redlock (multi-node Redis quorum): skip it. If you need safety beyond one Redis, you need fencing anyway, and fencing makes Redlock's complexity pointless.

## 3. Delivery semantics: at-least-once is the truth, exactly-once is a contract you build

Every real messaging system gives you **at-least-once** (or at-most-once, which means "lossy" — acceptable only for metrics/telemetry). "Exactly-once delivery" does not exist across a network; what exists is **exactly-once *processing***, which you construct: at-least-once delivery + idempotent consumers. (Kafka's "exactly-once" is transactions within the Kafka→Kafka boundary; the moment you touch your database or an external API, you're back to building idempotency yourself — see [stacks/messaging.md](../stacks/messaging.md).)

**Design every consumer and every retried handler as if it will receive each message 2–3 times, because it will:** redeliveries on consumer crash, visibility-timeout expiry, rebalances, and producer retries after timeout (the send *succeeded*, the ack was lost — the sender can't distinguish).

## 4. Idempotent retries — mechanics

Idempotency = processing the same logical operation N times has the effect of once. Three implementation tiers, cheapest first:

1. **Naturally idempotent writes:** `UPDATE ... SET status='shipped'`, upserts (`INSERT ... ON CONFLICT (natural_key) DO UPDATE`), absolute-value writes. Prefer these shapes; `counter = counter + 1` is *not* idempotent, `SET balance = $computed` with optimistic version *is*.
2. **Dedup table:** unique constraint on the operation's natural key (`(order_id, event_type)`), insert-first in the **same transaction** as the effect; conflict = already processed → ack and skip. This is the workhorse. The same-transaction rule is load-bearing: effect-then-record crashes between the two = double effect; record-then-effect crashes = dropped effect.
3. **Idempotency keys for external effects** (charging cards, sending emails): pass your operation key through to the provider (Stripe et al. accept idempotency keys — use them; the API-facing pattern is specified in [api-design.md](api-design.md) §4). If the provider doesn't support keys, wrap the call: record `attempting(key)` → call → record outcome; on retry after crash, *query the provider* for the outcome before re-calling.

**Retry policy:** exponential backoff with **full jitter** (`sleep = rand(0, min(cap, base·2^attempt))`), retry only retryable errors (timeouts, 5xx, 429 — never 4xx validation), cap attempts, then dead-letter ([async-work.md](async-work.md)). Retries without jitter are synchronized clubs: every client that failed at T retries at T+1s, T+3s, T+7s *in unison* — you've built a periodic DDoS against your own recovering service.

**Retry amplification:** if the edge retries 3×, the service retries its downstream 3×, and that retries the DB 3×, one user click = 27 DB attempts during an incident. Retry at **one layer** (usually the outermost that has idempotency), and pass deadlines down so inner layers fail fast instead of retrying ([observability.md](observability.md) on deadline propagation).

## 5. The dual-write problem and the outbox pattern

Any code that does `db.commit()` **and then** `kafka.publish()` (or webhook, or cache write) will eventually do one without the other — crash between them, broker timeout, deploy mid-flight. Result: order exists but no event, or event without order. This is not a rare edge case; at volume it's a *daily* occurrence, and it's the root cause behind most "the two systems disagree" tickets.

**Fix — transactional outbox:** write the event to an `outbox` table in the same transaction as the business row. A relay (poller using `FOR UPDATE SKIP LOCKED`, or CDC/Debezium) publishes from the outbox and marks rows sent. Consumers still need idempotency (the relay is at-least-once). Delete/archive published rows aggressively or the outbox becomes your biggest table — ask me how I know.

*Detection of dual-write drift:* periodic reconciliation job comparing source rows to derived system (counts + spot checksums), alerting on divergence. If you can't reconcile it, you can't run it.

## 6. Thundering herd & cache stampede

**Cache stampede:** a hot key expires; 5,000 concurrent requests all miss, all recompute the same expensive query, and the database — sized for the 99% cache-hit world — collapses. The outage signature is uncanny: everything fine, then the top-of-the-hour TTL expiry, then 30 seconds of full-site brownout, then fine again.

Defenses, in order of practicality:

1. **Single-flight / request coalescing:** only one caller per key recomputes; the rest wait or get slightly-stale data. In-process: Go `singleflight`, a promise map in Node, a per-key mutex in JVM/Python. Cross-fleet: a short Redis `SET NX` "I'm recomputing" lock — losers serve stale or wait.
2. **Stale-while-revalidate:** serve the expired value while one worker refreshes in background. Requires storing a soft TTL alongside the value.
3. **TTL jitter:** ±10–20% randomization so co-created keys don't expire in lockstep. Also: never let a mass cache-warm job set identical TTLs.
4. **Probabilistic early refresh (XFetch)** for the truly hot few keys.

**Thundering herd on reconnect** is the same physics elsewhere: service restarts and every client reconnects at once; a queue drains and 10k workers hit one endpoint; DNS TTL expiry synchronizes a fleet. Same medicine: jitter everything that is scheduled, coalesce everything that is duplicated, and rate-limit at the choke point. **Cold-start herd** is the worst variant: after a full cache flush (deploy that changed key prefixes, Redis restart), your DB takes 100% of traffic it hasn't seen in months. Never flush a production cache wholesale; version keys and let them rotate.

## 7. Shared-state races inside one process

Each runtime has its own trap — details in stack docs, pattern here:

- **Node:** single-threaded but **`await` is a yield point**. `if (!cache.has(k)) { cache.set(k, await load(k)) }` interleaves. Any check-then-act spanning an `await` is a race.
- **Go:** goroutines + shared maps/structs without mutex = corruption, not just staleness. `-race` in CI is non-negotiable.
- **Python:** the GIL protects bytecode, not logic — `check-then-act` across an `await` (asyncio) or between threads still races; and with free-threaded 3.13+ builds the old "GIL saves me" instincts are actively wrong.
- **JVM:** visibility (stale reads without `volatile`/synchronization) plus the classic unguarded lazy-init.
- **Everywhere:** mutable module/class-level state (request cache, "current user" statics) shared across concurrent requests is a data-leak generator — one tenant sees another's data. Grep for it; the `race-condition-scanner` subagent does.

## Failure-mode index

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Lost update / oversell | Impossible data (negative stock, >capacity); reconciliation deltas | Atomic UPDATE / `FOR UPDATE` / `SERIALIZABLE`+retry | Hammer tests (50+ concurrent) on every invariant endpoint; scanner subagent on new services |
| Deadlock | `40P01` errors, lock-wait graphs | Retry the victim; order lock acquisition consistently | Lock-ordering convention documented per hot table pair |
| Expired lock, two holders | Duplicate side effects; overlapping "I hold it" logs | Fencing tokens or serial consumer | Never protect *corruptible* state with TTL locks alone |
| Duplicate message processing | Duplicate effects with same message id | Dedup table in-transaction | Consumer template includes idempotency by default; test kills consumer mid-handler |
| Dual-write drift | Reconciliation job divergence | Outbox pattern | Ban publish-after-commit in review; outbox as the paved road |
| Cache stampede | Periodic brownouts aligned to TTLs; DB QPS spikes on expiry | Single-flight + stale-while-revalidate | TTL jitter policy; no wholesale cache flushes |
| Retry storm | Synchronized load spikes at backoff intervals | Add full jitter; retry at one layer | Retry policy is a reviewed, shared library — not per-callsite copy-paste |
