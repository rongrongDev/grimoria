# MongoDB — Document Modeling Without Regret

**Tier:** Core (chosen NoSQL alongside Redis; DynamoDB noted where the judgment differs). **Verified against:** MongoDB 7.0 / 8.0, current major drivers. **Last reviewed:** 2026-07-06.
**Read with:** [data-layer.md](../principles/data-layer.md) (§6 — when a document store is the right call at all), [concurrency.md](../principles/concurrency.md).

MongoDB's failure mode is not the database — modern Mongo (majority write concern, replica sets, real transactions) is a solid piece of engineering. The failure mode is **relational data forced into documents, or documents designed for how the data looks instead of how it's accessed.** Get the modeling right and the operations are mostly pleasant; get it wrong and no amount of ops heroics saves you.

---

## 1. Modeling — the decision that determines everything

**Design for the access pattern, not the entity diagram.** The question is never "is a comment part of a post?" — it's "do I read comments *with* the post, and how many can there be?"

Embed vs reference decision tree:
- **Embed** when: read together in the dominant pattern, bounded count (tens, not thousands), owned by the parent (no independent access/update path). Order line-items: embed — they're born with the order, read with the order, capped.
- **Reference** when: unbounded growth, independently queried/updated, shared across parents. Comments on a popular post: reference — the embed version grows until it hits the **16MB document cap**, and long before that, every read/update of the post hauls megabytes. The "unbounded array in a document" is Mongo's signature modeling incident: works for a year, then the one viral post/power user/busy tenant hits the wall and that entity is *unfixable without a live data migration*.
- **Array-growth red flag in review:** any `$push` without a bound (`$slice`) on a document that lives long. Also: massive arrays make index maintenance on array fields (multikey) expensive, and updates rewrite documents — write amplification grows with document size.
- Duplicate data deliberately (denormalization is the point) — but every duplicated field needs a written owner and an update path ("author name is duplicated into comments; renames are eventual via a background job"). Undocumented duplication becomes silent inconsistency, and unlike Postgres there's no FK to catch you.
- **Schema versioning from day one:** documents outlive code; a `schemaVersion` field + read-time upgrade (or lazy migration on write) is how you evolve without big-bang migrations. Schema validation ($jsonSchema on collections) is worth turning on in `moderate` mode — Mongo's flexibility is for *evolution*, not for "every document a different shape."

## 2. Consistency & durability — the settings that decide what "written" means

- **Write concern `majority` for anything you'd miss** — `w:1` acks from the primary alone; a failover can roll those writes back (they vanish; the driver said OK). This is the classic "Mongo lost my data" story and it's a *configuration*, not a bug. Read concern `majority` for reads that must not see rollback-able data. Money/state: `w: majority` + `readConcern: majority`; metrics/logs: `w:1` is a fair trade.
- **Causal consistency / read-your-writes** needs sessions (or primary reads). Reading from secondaries (`readPreference: secondaryPreferred`) reintroduces replica-lag semantics ([performance.md](../principles/performance.md) §6) — the "my save disappeared" bug, Mongo edition.
- **Transactions exist (multi-document, replica-set)** and are more expensive than Postgres's — the design goal is to *rarely need them*: model so a unit of business change is one document (that's what embedding buys you — single-document updates are always atomic). Reaching for multi-document transactions constantly is the signal your data is relational; consider Postgres before building a transaction-heavy Mongo app.
- Atomic single-document updates (`$inc`, `$set`, `findOneAndUpdate`) are your optimistic/pessimistic toolkit: `findOneAndUpdate({_id, version}, {$set: ..., $inc: {version: 1}})` is optimistic locking ([concurrency.md](../principles/concurrency.md) §1); `findOneAndUpdate` with a status filter is the work-claim idiom (Mongo's `SKIP LOCKED` equivalent).

## 3. Indexing & query performance

- Same fundamentals as [data-layer.md](../principles/data-layer.md) §5, Mongo dialect: **ESR rule** for compound indexes — Equality fields, then Sort fields, then Range fields, in that order.
- *Detection:* the profiler (`db.setProfilingLevel(1, {slowms: 100})`) and `$indexStats` (unused indexes); `explain("executionStats")` — the smoking gun is `totalDocsExamined` ≫ `nReturned` (collection scan or bad index), and `SORT` stages in memory (missing index for the sort; in-memory sorts have a hard size limit and *fail*, not just slow down).
- **Unindexed queries on big collections don't just slow themselves — they evict the working set from cache** (WiredTiger cache is the whole game for Mongo performance) and everything gets slower. Alert on collection-scan rates and cache-eviction pressure.
- Multikey (array) indexes: powerful, larger, and can't compound two array fields. Covered queries (index-only) for hot read paths.
- Aggregation pipelines: put `$match`/`$sort` (index-eligible stages) **first**; `$lookup` (the join escape hatch) at volume is the sign you modeled relationally — occasional lookups fine, `$lookup`-per-request on the hot path means revisit §1.

## 4. Sharding — later and more deliberately than you think

- Don't shard until a replica set genuinely can't (vertical + read scaling exhausted, working set ≫ RAM ceiling). Sharding is Mongo's [performance.md](../principles/performance.md) §6 step-5: forever complexity.
- **The shard key is close to unchangeable in spirit** (resharding exists since 5.0 but is a heavyweight operation) and determines everything: monotonically-increasing keys (timestamps, ObjectIds) send **all inserts to one shard** (hot last shard — hashed key or compound with high-cardinality prefix fixes it); low-cardinality keys create jumbo chunks that can't split; **queries without the shard key are scatter-gather to every shard** — your dominant query patterns must include it. Model queries first, choose key second.
- DynamoDB note (if that's your alternative): the same discipline is *forced* — partition-key design and access-pattern-first modeling aren't optional there, and its hot-partition throttling is the same hot-shard failure with a hard 400 error. The judgment transfers 1:1; Dynamo just refuses earlier what Mongo degrades on slowly.

## 5. Operations

- **Replica sets always** (3 nodes minimum) — single-node Mongo is a dev toy. Monitor replication lag; `flowControl` (4.2+) throttles a lagging majority automatically, which presents as mysterious write slowness — check lag *first* when writes slow down.
- **WiredTiger cache** (default ~50% of RAM): the working-set-fits-or-doesn't cliff. Monitor cache fill %, dirty %, and eviction stats; the "everything got slow at once" Mongo incident is usually working set outgrowing cache (fix: memory, indexes to shrink the hot set, or archiving old data).
- Change streams (the outbox/CDC primitive — [concurrency.md](../principles/concurrency.md) §5) require replica sets and resume tokens you must persist; an unresumed stream after a long consumer outage may fall off the oplog — size the oplog for your worst realistic consumer downtime, and alert on oplog window (hours of retention remaining).
- Backups: managed (Atlas) or `mongodump` is *not* PITR — oplog-based/snapshot PITR for anything that matters, with restore drills ([stacks/postgres.md](postgres.md) §4's rule is universal).
- Connection pools: same fleet math as always ([data-layer.md](../principles/data-layer.md) §4); `maxPoolSize` default 100 per client × many instances = mongos/mongod connection pressure.

## 6. Security specifics

- **Auth on, always, everywhere** — the era of ransomed open Mongo instances on the internet was entirely default-config. Bind to private interfaces, TLS, SCRAM/x.509, least-privilege roles per service ([security.md](../principles/security.md)).
- Query-object injection: never pass client JSON into query positions (`{$ne: null}` auth bypass — [security.md](../principles/security.md) §2); type-check at the boundary, ban `$where`.

## Failure-mode quick table

| Failure | Detection | Fix / Prevention |
|---|---|---|
| Unbounded embedded array | Document size percentiles; `$push` without `$slice` in review | Reference instead; cap arrays; modeling review (§1 tree) |
| Writes vanish on failover | Post-failover reconciliation deltas | `w: majority` for stateful writes — set in the driver config, not per-call heroics |
| Stale reads from secondaries | "My save disappeared" reports | Primary reads / causal sessions for read-your-writes paths |
| Collection scan evicts cache | `totalDocsExamined`≫`nReturned`; cache eviction spike | Index per ESR; profiler on `slowms: 100`; scan-rate alert |
| Hot shard on monotonic key | One shard's CPU/insert rate ≫ others | Hashed/compound shard key — decided from query model *before* sharding |
| Scatter-gather queries | High latency, all shards touched in explain | Shard key in dominant query patterns, or don't shard |
| Oplog window too small | Resume-token failures after consumer outage | Size oplog for worst downtime; oplog-window alert |
| Working set outgrows cache | Everything slows; cache fill/dirty high | Memory/index/archive; capacity trend review ([performance.md](../principles/performance.md) §5) |
