# Java/Kotlin (Spring Boot) Backend — Production Judgment

**Tier:** Core (full depth). **Verified against:** JDK 21 LTS (25 LTS noted), Spring Boot 3.3–3.5 (4.x noted where relevant), Hibernate 6.x, HikariCP 5.x/6.x, Kotlin 2.x. **Last reviewed:** 2026-07-06.
**Read with:** the [principles docs](../principles/) — this file covers only what is *specific to the JVM/Spring world*.

Spring Boot's value is the paved road; its danger is that the paving hides the machinery. The incidents below are almost all "the abstraction did something reasonable that you didn't know it was doing." The cure is knowing the five or six places the magic bites.

---

## 1. Threading model & virtual threads

- Classic servlet model: request = platform thread from a bounded pool (Tomcat default 200). A slow downstream holds a thread → **thread-pool starvation**: the fleet is "up," CPU is idle, and every request queues. This is the JVM's signature outage ([observability.md](../principles/observability.md) §4 bulkheads exist for exactly this). *Detection:* thread-pool active/queue metrics (Boot exposes them via Micrometer — dashboard them), thread dumps showing 200 threads parked in the same HTTP client call.
- **Virtual threads (JDK 21+, `spring.threads.virtual.enabled=true`)** dissolve the thread-scarcity problem for I/O-bound services — prefer them over WebFlux for new services; reactive's cognitive tax (colored functions, debugging reactor stacks) is no longer justified by capacity alone. Caveats: pre-JDK-24, `synchronized` blocks **pin** virtual threads to carriers (older libraries with synchronized I/O reintroduce starvation — JDK 24 fixed pinning; on 21, audit with `-Djdk.tracePinnedThreads`); and virtual threads remove the *pool* as your natural concurrency bound — you must now impose explicit limits (semaphores/bulkheads) or you'll discover your DB pool is the new bottleneck with 10,000 concurrent takers ([data-layer.md](../principles/data-layer.md) §4).
- Kotlin coroutines: same judgment as asyncio ([stacks/python.md](python.md) §1) — blocking calls inside coroutines on `Dispatchers.Default` starve the small pool; use `Dispatchers.IO` or virtual threads underneath.

## 2. JPA/Hibernate — the five classic incidents

1. **N+1 via lazy loading** — the JVM's most-reproduced bug. *Detection:* Hibernate statistics (`hibernate.generate_statistics` + query-count assertions in tests, e.g. Hypersistence `assertSqlCount`), p6spy/datasource-proxy logging in dev. *Fix:* `JOIN FETCH` / `@EntityGraph` per use case. *Prevention:* query-count CI gates on top endpoints ([data-layer.md](../principles/data-layer.md) §3); `@BatchSize` as a mitigating default.
2. **`LazyInitializationException`** — entity escapes its session (returned to serializer after tx closed). The wrong fix is Open-Session-In-View (holds a DB connection through view rendering/serialization — a pool-exhaustion machine under load; **set `spring.jpa.open-in-view=false`** and treat its default-on as a bug to fix in every new service). The right fix: fetch what the response needs inside the transaction, map to response DTOs ([security.md](../principles/security.md) §6 wants DTOs anyway).
3. **Dirty-checking surprise writes:** any *modified* managed entity flushes on commit — code that "just mutated a field for a calculation" silently UPDATEs the DB. Keep entities out of business-logic layers; map early to plain objects.
4. **`@Transactional` self-invocation does nothing:** it's proxy-based — `this.methodB()` bypasses the proxy; the annotation on B is decoration. Same for `@Transactional` on private/final methods, and same trap for `@Cacheable`/`@Async`/`@Retryable`. *Detection:* integration test that asserts rollback actually happens ([testing.md](../principles/testing.md) §5). Also: `@Transactional` only rolls back on unchecked exceptions by default — checked exceptions commit; set `rollbackFor` or (Kotlin) know that Kotlin has no checked exceptions so this bites Java code mostly.
5. **Transaction scope too wide:** `@Transactional` on a service method that calls an external API — connection held across network I/O, the [data-layer.md](../principles/data-layer.md) §4 cardinal sin, made invisible by the annotation's convenience. Keep transactional methods small, I/O-free, and named like what they are (`persistOrder`, not `processOrder`).

Optimistic locking is first-class: `@Version` on mutable entities with real contention handling (catch `OptimisticLockException` and *do something designed* — retry or surface conflict; [concurrency.md](../principles/concurrency.md) §1). Pessimistic: `@Lock(PESSIMISTIC_WRITE)` = `FOR UPDATE`.

## 3. HikariCP & data access hygiene

- Hikari defaults are sane except: `maximum-pool-size` 10 is per-instance — **do the fleet math** ([data-layer.md](../principles/data-layer.md) §4) and resist raising it; Hikari's own docs are right that smaller is faster. Set `connection-timeout` (default 30s → prefer 2–5s to fail fast), `max-lifetime` below any infra idle-timeout, and **`leak-detection-threshold: 10000`** in every environment — it logs the stack of code that checked out and never returned a connection, turning week-3 mystery leaks into a same-day fix.
- Read the pool metrics Boot already exposes (`hikaricp.connections.pending` is the pool-exhaustion early-warning — alert on it).
- Prefer `JdbcTemplate`/`JdbcClient` or jOOQ for the queries where you need to control the SQL (reporting, hot paths, locking clauses); JPA for straightforward aggregate CRUD. Mixed-mode is mature engineering, not inconsistency.

## 4. Spring-isms that cause incidents

- **Bean scope:** singletons by default — mutable instance fields on a `@Service` are shared across all requests (the [concurrency.md](../principles/concurrency.md) §7 cross-tenant leak, Spring edition). Stateless services; state in method scope or the DB.
- **`@Async`/`@Scheduled` defaults:** `@Async` without a configured executor historically means unbounded/queue-unbounded behavior (configure a `ThreadPoolTaskExecutor` with bounded queue + rejection policy, always); all `@Scheduled` methods share **one** thread by default — one hung job silently stops *every* scheduled task in the app (the missed-run detector from [async-work.md](../principles/async-work.md) §6 catches this; also configure the scheduler pool). `@Scheduled` across replicas runs on **every** instance — ShedLock or a DB advisory lock for single-runner jobs ([concurrency.md](../principles/concurrency.md) §2).
- **Exception → response mapping** centralized in one `@ControllerAdvice` implementing your error contract ([api-design.md](../principles/api-design.md) §6 — Boot 3 has native RFC 9457 `ProblemDetail` support; use it); scattered try/catch-per-controller drifts.
- Config sprawl: profiles + `@ConfigurationProperties` (typed, validated at startup — fail fast on missing config, not at first use at 2am).
- Actuator: gold for ops (health, metrics, heapdump) and an unauthenticated-exposure classic — lock it to an internal port and audit `management.endpoints.web.exposure` ([security.md](../principles/security.md)).

## 5. JVM operations — memory & GC

- **Container sizing:** modern JVMs read container limits (`MaxRAMPercentage`, default 25% — usually too conservative; set ~50–75% explicitly, leaving room for metaspace, threads (platform-thread stacks ~1MB each), and off-heap). The OOMKilled-with-healthy-heap mystery is almost always off-heap + stack memory unaccounted.
- GC choice per [performance.md](../principles/performance.md) §3: G1 default is right until p99.9 says otherwise; ZGC (generational, JDK 21+) for latency-critical big heaps. **Always run with GC logging on** (`-Xlog:gc*:file=...` — negligible overhead, and the incident review without it is guesswork).
- **First-response toolkit** (learn before the incident): thread dump (`jcmd <pid> Thread.print`) ×3, 10s apart — starvation and deadlock are diagnosed this way in minutes; heap dump on OOM (`-XX:+HeapDumpOnOutOfMemoryError`); **async-profiler**/JFR for CPU/alloc flames, low-overhead enough for prod.
- Deadlocks in the JVM (synchronized/Lock ordering) show up in thread dumps *with the cycle identified* — the JVM finds it for you; your job is the consistent-lock-ordering fix ([concurrency.md](../principles/concurrency.md) §1).

## 6. Testing specifics

- **Testcontainers is a JVM-native strength — use it as the backbone** of the integration tier ([testing.md](../principles/testing.md) §2); `@ServiceConnection` (Boot 3.1+) wires containers to Spring config in one line.
- **Slice tests** (`@WebMvcTest`, `@DataJpaTest`) are cheap and targeted; full `@SpringBootTest` sparingly (context startup dominates suite time; context caching gets invalidated by every `@MockBean` combination — a suite-speed classic).
- `@DataJpaTest` rolls back by default — which masks commit-time behavior (flush ordering, `@Version` bumps, constraint violations at commit); test transactional behavior with explicit commits ([testing.md](../principles/testing.md) §2's warning, JPA edition: also remember JPA writes may not hit the DB until flush — assert after `flush()`, not after `save()`).
- Mutation testing: **PIT** is the most mature mutation tool anywhere — incremental analysis on critical modules ([testing.md](../principles/testing.md) §4). ArchUnit for enforcing the architecture rules this KB keeps calling "review rules" (no controller→repository skips, DTO boundaries) — encode them as tests.

## Failure-mode quick table

| Failure | Detection | Fix / Prevention |
|---|---|---|
| Thread-pool starvation | Idle CPU + queued requests; identical parked stacks in dump | Timeouts+bulkheads per dependency; virtual threads; dashboard pool metrics |
| N+1 lazy loading | Hibernate stats; query-count test fails | `JOIN FETCH`/`@EntityGraph`; CI query budgets |
| Open-Session-In-View pool drain | Connections held through serialization; pending checkouts | `open-in-view=false` in template |
| `@Transactional` self-invocation no-op | Rollback test fails | Call through the proxy (separate bean); ArchUnit rule |
| Connection leak | Hikari leak-detection stacks in logs | Fix the path; keep leak detection on everywhere |
| Mutable singleton state | Cross-request data bleed | Stateless beans; scanner subagent greps instance fields on `@Service` |
| `@Scheduled` single-thread hang | All cron jobs stop at once; dead-man alerts | Scheduler pool size; per-job missed-run alerts; ShedLock for single-runner |
| OOMKilled, heap looks fine | Container OOM, no `OutOfMemoryError` | Account off-heap+threads; `MaxRAMPercentage` tuned; heap-dump-on-OOM |
| Virtual-thread pinning (JDK 21–23) | Latency under load with synchronized-heavy libs | `-Djdk.tracePinnedThreads`; upgrade path to JDK 24+/25 LTS |
