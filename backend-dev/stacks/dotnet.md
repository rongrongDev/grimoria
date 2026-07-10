# .NET (ASP.NET Core) — Production Patterns & Common Pitfalls

**Tier:** Extended (production patterns + pitfalls; not full-depth). **Verified against:** .NET 8 LTS / .NET 9–10, ASP.NET Core, EF Core 8–10. **Last reviewed:** 2026-07-06.
**Read with:** the [principles docs](../principles/); the JVM doc ([stacks/jvm.md](jvm.md)) is the nearest cousin — thread-pool reasoning and ORM traps rhyme closely.

Modern .NET is fast, well-tooled, and async-first. Its production incidents cluster in three places: **sync-over-async**, **EF Core doing what you told it rather than what you meant**, and **DI lifetime mistakes**.

## Production patterns

- **Async all the way down.** ASP.NET Core is async-native; the request thread pool is the shared resource. The #1 outage pattern is **sync-over-async**: `.Result` / `.Wait()` / `.GetAwaiter().GetResult()` on a hot path — it burns two threads per operation and under load produces **thread-pool starvation**: CPU idle, requests queued, everything timing out ([stacks/jvm.md](jvm.md) §1 physics). *Detection:* ThreadPool queue-length / thread-count counters (`dotnet-counters`), stacks full of `Monitor.Wait` in dumps (`dotnet-dump`). *Prevention:* analyzer rules banning `.Result`/`.Wait()` (e.g. the `xxxAsync`-enforcement analyzers) in request paths; `CancellationToken` accepted and propagated through every layer ([observability.md](../principles/observability.md) §2 deadline propagation — ASP.NET gives you `RequestAborted`).
- **EF Core:** LINQ is a query *compiler* — review what it compiles. `AsNoTracking()` for read paths (tracking overhead is real); explicit `Include` (lazy-loading proxies off — N+1 with extra steps, [data-layer.md](../principles/data-layer.md) §3); beware **client-side evaluation** (a method EF can't translate pulls the table into memory and filters in C# — older versions did this silently; current versions throw, which is the correct behavior: keep it throwing). Migrations: EF generates the script — review it against [data-layer.md](../principles/data-layer.md) §1 like any migration (`migration-safety-reviewer` applies); use `dotnet ef migrations script --idempotent` for deploy artifacts, never auto-migrate-on-startup in production fleets (N instances racing the same DDL — [multi-agent-orchestration.md](../principles/multi-agent-orchestration.md)'s conflicting-migrations row, no agents required).
- **DI lifetimes are load-bearing:** Singleton consuming Scoped (captive dependency) = a DbContext shared across all requests — concurrency exceptions at best, cross-request data bleed at worst ([concurrency.md](../principles/concurrency.md) §7). Scope-validation on (`ValidateScopes`, on by default in dev — run it in CI too); `DbContext` is scoped and **not thread-safe** — never share across parallel tasks in one request.
- **HttpClientFactory, not `new HttpClient()`:** hand-rolled clients exhaust sockets (TIME_WAIT storms) or cache DNS forever (traffic pinned to a dead IP after failover). Factory + typed clients + `Polly` resilience pipelines (timeout, retry-with-jitter, circuit breaker — [observability.md](../principles/observability.md) §4, tuned as one system per [concurrency.md](../principles/concurrency.md) §4).
- **Background work:** `IHostedService`/`BackgroundService` for in-process loops (remember: deploys kill them — persistent queues for anything that matters, [async-work.md](../principles/async-work.md) §1); an unhandled exception in a `BackgroundService` historically stopped it *silently* (fixed default in .NET 6+ to crash the host — verify `BackgroundServiceExceptionBehavior` and alert on service-stopped either way; the dead-man's-switch rule from [async-work.md](../principles/async-work.md) §6 applies).

## Common pitfalls

| Pitfall | What happens | Fix / Prevention |
|---|---|---|
| Sync-over-async | Thread-pool starvation fleet-wide under load | Ban `.Result`/`.Wait()` by analyzer; async end-to-end |
| Captive dependency (Singleton↔Scoped) | Shared DbContext; data bleed / `InvalidOperationException` storms | Scope validation in CI; DI review rule |
| `new HttpClient()` per call | Socket exhaustion; stale DNS after failover | HttpClientFactory everywhere; lint direct construction |
| EF client-side evaluation / missing `Include` | Table pulled to memory; N+1 | Query logging in dev; query-count tests ([testing.md](../principles/testing.md)); keep translation-failure throwing |
| Auto-migration on startup | N instances race DDL at deploy | Migrations as reviewed deploy step, single runner |
| `async void` | Exceptions escape to crash the process; untrackable | `async Task` always (events excepted); analyzer rule |
| Unbounded `Parallel.ForEach`/`Task.WhenAll` over huge sets | Self-inflicted herd on DB/downstream ([concurrency.md](../principles/concurrency.md) §6) | `Parallel.ForEachAsync` with `MaxDegreeOfParallelism`; bounded channels |
| Config/secrets in appsettings.json in repo | Leaked secrets ([security.md](../principles/security.md) §5) | User-secrets in dev; vault/managed identity in prod |
| Missing `CancellationToken` propagation | Work continues for disconnected clients; zombie load during incidents | Accept+pass the token in every async signature; analyzer |
| GC/large-object-heap churn from big payloads | Latency spikes, LOH fragmentation | Stream, don't buffer; `System.Text.Json` source-gen; pooled buffers on hot paths |

**Ops notes:** `dotnet-counters` (live metrics), `dotnet-dump`/`dotnet-gcdump` (incident capture), `dotnet-trace` (flames) — learn the trio before the incident ([performance.md](../principles/performance.md) §2). OpenTelemetry is first-class; wire it in the service template. Server GC is the default for ASP.NET Core and right for throughput; suspect GC only with evidence ([performance.md](../principles/performance.md) §3).
