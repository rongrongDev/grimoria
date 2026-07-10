# Performance — Measure, Don't Guess

**Last reviewed:** 2026-07-06. Runtime-specific profiler/GC details in stack docs; load-test tooling verified against k6 0.5x, Gatling 3.13+, Locust 2.x.
**Related:** [data-layer.md](data-layer.md) (indexes, N+1, pools), [observability.md](observability.md) (percentiles, saturation), [concurrency.md](concurrency.md) (stampedes).

Two decades of performance work compresses to one sentence: **every engineer's intuition about where the time goes is wrong, including mine, including after twenty years.** The discipline is to profile first, fix the top item, measure again. Teams that skip the first step spend a sprint optimizing a serializer that was 2% of latency while 70% sat in an unindexed query nobody looked at.

---

## 1. The method (in this order, always)

1. **Define the target numerically** before touching anything: "p99 of `POST /orders` < 300ms at 500 RPS." Without a target you can't say when you're done, and optimization without a stopping rule consumes quarters.
2. **Measure the current shape** in production or a production-like load: which endpoints, which percentiles, where does the time go (trace waterfall — [observability.md](observability.md) §2).
3. **Profile the dominant term.** Fix only that. Re-measure. Repeat.
4. **Stop at the target.** Every optimization past it is negative-value: it costs complexity (caching layers, denormalization, cleverness) that you'll pay for during every future incident and feature.

**Where the time actually goes in backend systems**, in the order I've found it across hundreds of investigations: (1) the database — missing indexes, N+1, over-fetching (`SELECT *` on wide tables, loading 10k rows to show 20); (2) serial round-trips that could be parallel or batched — to the DB, to caches, to other services; (3) serialization/deserialization of large JSON payloads; (4) runtime-specific overhead — GC pauses, event-loop blocking, thread-pool starvation; (5) actual computation — rare, and usually O(n²) in something that grew, not "slow code." Check them in that order; the prior is that strong.

## 2. Profiling per runtime (details in stack docs; the map here)

- **Where to look first, regardless of runtime:** the trace waterfall for one slow request. It tells you *which* hop; then profile *that* process.
- **Node:** event-loop lag is the metric that matters (`perf_hooks.monitorEventLoopDelay`) — one 200ms JSON.parse of a huge body stalls *every* concurrent request. CPU profiles via `--cpu-prof`/Chrome DevTools; `clinic.js` flame graphs. See [stacks/nodejs.md](../stacks/nodejs.md).
- **Python:** py-spy (attachable to prod, no code change) is the first tool; sync-in-async (blocking call inside asyncio) is the classic hidden killer. [stacks/python.md](../stacks/python.md).
- **Go:** pprof built in — expose it, learn it; goroutine profiles find leaks, CPU/heap profiles find the rest. [stacks/go.md](../stacks/go.md).
- **JVM:** async-profiler / Java Flight Recorder (low enough overhead for prod); GC logs on always. [stacks/jvm.md](../stacks/jvm.md).
- **Continuous profiling** (Parca/Pyroscope/cloud profilers) turns "can you reproduce it?" into "here's the flame graph from the incident." At any real scale, this pays for itself with the first incident where the slowdown didn't reproduce in staging — because they never do.
- **The database is profiled separately:** `pg_stat_statements` ordered by `total_exec_time` is the single highest-value performance query in this KB — top-10 by total time is your roadmap. `EXPLAIN (ANALYZE, BUFFERS)` per suspect. [stacks/postgres.md](../stacks/postgres.md).

## 3. GC pauses and runtime overhead — when they matter

GC is a *tail-latency* problem, not a throughput problem: p50 looks fine while p99.9 spikes on every major collection.

- **JVM:** G1 defaults fine to mid-size heaps; latency-critical + big heap → ZGC/generational-ZGC (sub-ms pauses, JDK 21+). The actionable lever is usually **allocation rate**, not collector choice: profile allocations before tuning flags. And the classic incident isn't GC tuning at all — it's a heap-sizing/leak issue presenting as "GC storm then OOM."
- **Go:** GC is simple and rarely the issue; when it is, it's allocation churn (per-request maps/slices/closures) — reduce allocations (`pprof -alloc_space`, `sync.Pool` for hot buffers) rather than reaching for `GOGC`.
- **Node/Python:** GC is rarely your problem; the event loop (Node) and the GIL/sync-in-async (Python) are the equivalents that actually page you.
- Rule: **suspect GC only with evidence** (GC logs / runtime metrics correlated with latency spikes). "It must be GC" is the backend equivalent of "it must be the network" — occasionally true, usually a way to stop investigating.

## 4. Caching — the fix of last resort that everyone reaches for first

A cache is a second data store with an invalidation problem attached. Before adding one: is there an index, a batch, or a query fix that removes the need? (Usually yes — see the priority list in §1.) When a cache *is* right (read-heavy, tolerant of bounded staleness, expensive to compute):

- Decide **staleness tolerance explicitly** ("prices may be 60s stale, cart contents may not") — write it down; it's the spec for TTLs and invalidation.
- Prefer **TTL-based expiry with short TTLs** over event-based invalidation where staleness allows: invalidation code paths are the bug farm ("there are two hard things…"), TTLs are self-healing.
- Cache keys must include **everything that varies the result** (tenant, locale, role, API version) — the "user A saw user B's data" incident is almost always a cache key missing a dimension. That's a security incident, not a performance bug.
- Plan for the stampede on expiry and the cold start on flush **at design time** — single-flight, TTL jitter, stale-while-revalidate; full treatment in [concurrency.md](concurrency.md) §6.
- Measure hit rate per cache from day one; a cache below ~80% hits on a read path is often net-negative once you count the added round trip on misses and the operational surface.

## 5. Load testing methodology

Load tests answer three distinct questions; know which you're asking:

1. **Capacity:** at what RPS does the SLO break, and what breaks first? (Ramp until failure, watching saturation metrics.)
2. **Soak:** does it survive hours at expected peak? (Finds leaks — memory, connections, disk — invisible in 5-minute runs. The 2-hour soak that finds the connection leak is worth ten ramp tests.)
3. **Spike/stampede:** what happens at 5× in 10 seconds — including cold caches ([concurrency.md](concurrency.md) §6)? Does it degrade by design ([observability.md](observability.md) §4) or collapse?

Methodology rules, each learned from a load test that lied:

- **Model real traffic, not uniform hammering:** the production mix of endpoints, realistic data cardinality (a fresh test DB where every query is hot in cache tells you nothing — test against production-scale data with production-shaped skew: a few huge tenants, deep pagination, cold items), and think-time distributions, not max-speed loops.
- **Beware coordinated omission:** most naive load loops wait for each response before sending the next, so when the server stalls, the *test slows down its own sending* and the stall barely registers in the percentiles. Use constant-arrival-rate mode (k6 `constant-arrival-rate`, Gatling open workload injection) — open-model load, arrivals independent of responses, like real users.
- Test the **whole path** (LB, TLS, real deployment topology), from outside; localhost load tests measure a system that doesn't exist.
- Never against production without a plan reviewed with whoever owns the pager (synthetic-data tagging, ramp plan, abort criteria); ideally a prod-parity environment. And never load-test a third-party sandbox into rate-limit jail (their success team will call; ask me how I know).
- **Load test on a schedule, not just before launches:** capacity regresses silently, one innocent PR at a time (an added query here, a fatter payload there). A weekly automated capacity run with a trend chart catches the regression the week it lands, when `git log` is short, instead of during your traffic peak, when it isn't.

## 6. Scaling — the order of operations

When the target genuinely exceeds capacity, spend money and complexity in this order: (1) **fix the top profile item** — usually worth 2–10× and free; (2) **vertical scale** — hardware is cheaper than engineering until surprisingly large sizes; boring is good; (3) **horizontal scale the stateless tier** — easy if you kept it stateless (session/state in Redis/DB, not process memory — the constraint that pays off here); (4) **read replicas + caching** for read-heavy load — now you own replication-lag consistency ("user writes, reads stale replica, files bug: my save disappeared" — read-your-writes routing required); (5) **sharding/partitioning** — last, because it's forever: cross-shard queries, transactions, and rebalancing become your team's permanent hobby. Many teams jump to (5)'s complexity at (1)'s scale because it's more interesting. Resist.

## Failure-mode index

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Optimizing the wrong thing | No numeric target; no before/after profile in the PR | Profile; fix dominant term | Perf PRs require target + flame graph/EXPLAIN evidence |
| Slow endpoint = DB round-trips | Trace waterfall: many short sequential DB spans | Batch/parallelize/eager-load | Query-count budget per endpoint in CI ([data-layer.md](data-layer.md) §3) |
| Event-loop / GIL stall | p99 spikes across *all* endpoints simultaneously | Find the blocking call (loop-lag metric, py-spy) | Loop-lag/blocked-time alert; lint sync-calls-in-async |
| Cache key missing a dimension | Cross-tenant data leak report | Add dimension; flush safely (versioned keys) | Cache-key review = security review item |
| Load test lies (closed loop) | Prod percentiles ≫ test percentiles at same RPS | Constant-arrival-rate + production-shaped data | Load-test methodology checklist in the perf runbook |
| Slow capacity regression | Weekly capacity trend declines | Bisect recent changes with profiles | Scheduled capacity runs + trend alerting |
| Leak found at peak | Soak test memory/connection slope | Fix leak; add saturation alert | Soak test in release pipeline for long-lived services |
