# Node.js Backend — Production Judgment

**Tier:** Core (full depth). **Verified against:** Node.js 22 LTS / 24 LTS, Express 4.x/5.x, Fastify 5.x, NestJS 10/11, Prisma 6.x, node-postgres (pg) 8.x. **Last reviewed:** 2026-07-06.
**Read with:** the [principles docs](../principles/) — this file covers only what is *specific to Node*; the general rules live there and are assumed.

Node's superpower and its whole failure model are the same fact: **one event loop per process runs every request.** Everything below is a consequence.

---

## 1. The event loop — the failure model

- **Anything synchronous and slow stalls *every* in-flight request.** The classic offenders: `JSON.parse`/`stringify` on multi-MB bodies, synchronous crypto (`pbkdf2Sync`, `bcrypt.hashSync`), `fs.*Sync`, big array sorts/joins, catastrophic regex backtracking (ReDoS — a crafted 40-char string can pin the CPU for minutes; use RE2 or timeout-checked patterns on any user-supplied-input regex).
- *Detection:* monitor event-loop delay (`perf_hooks.monitorEventLoopDelay`, or Fastify's `under-pressure`); the incident signature is p99 spiking on **all** endpoints simultaneously — that's the loop, not the endpoint. CPU profile (`node --cpu-prof`, clinic.js flame) to find the stall.
- *Fix/prevention:* offload CPU work to `worker_threads` (piscina) or a separate service; hash passwords with the async APIs; stream large payloads instead of buffering; body-size limits at the edge ([security.md](../principles/security.md) §7). Lint rule: no `*Sync` API in request paths.
- **`await` is a yield point** — every check-then-act spanning an `await` is a race exactly as if you had threads: `if (!(await exists(k))) await create(k)` double-creates under concurrency. Uniqueness lives in the database (constraint/upsert), not in a JS check. In-process single-flight: keep a `Map<key, Promise>` and share the promise. See [concurrency.md](../principles/concurrency.md) §7.
- **Unhandled promise rejections crash the process** (default since Node 15). The killer shape: `promises.push(doThing())` then a conditional `await` — a rejection with no attached handler yet. Always attach `.catch`/await; fire-and-forget tasks get an explicit error handler and are, per [async-work.md](../principles/async-work.md) §1, not a job system: **deploys discard them.**

## 2. Process model & deployment

- One process = one core. Production = N processes (container orchestrator replicas preferred over in-process `cluster`) behind a load balancer.
- **Crash-only design:** on truly unexpected errors (`uncaughtException`), log, flush, exit — the orchestrator restarts you. Limping on after an unknown-state exception corrupts quietly.
- **Graceful shutdown is on you:** on SIGTERM — stop accepting (`server.close`), drain in-flight (with a deadline), close pools, exit. Without it every deploy drops requests and leaks DB connections until timeout. Fastify's `close` hooks / `terminus` make this systematic. Verify with a deploy-under-load test.
- Set `--max-old-space-size` to match the container memory limit (~75–80%); the default heap cap can be *smaller* than your container (wasting memory) or the container OOM-kills you before V8 would have GC'd.

## 3. Framework notes (Express / Fastify / NestJS)

- **Express 4:** async handler errors are **not** caught — a thrown error in an `async` route hangs the request (and pre-15 crashed processes). Wrap or use `express-async-errors`, or move to Express 5/Fastify where async is native. This single footgun is the most common Node production bug I've reviewed.
- **Fastify** is the correct default for new services: schema-first validation *and serialization* (its response serialization via JSON Schema is both a perf win and an accidental-data-exposure guard — [security.md](../principles/security.md) §6), structured pino logging built in, plugin encapsulation. 2–3× Express throughput matters less than the schemas do.
- **NestJS** buys structure (DI, modules, consistent patterns) for large teams at the cost of ceremony and magic; fine choice at 20+ engineers, overkill at 3. Run it on the Fastify adapter. Watch: request-scoped providers re-instantiate the injection subtree per request — a notorious latency cliff; keep providers singleton-scoped and pass request context explicitly (or `AsyncLocalStorage`).
- Middleware ordering is load-bearing everywhere: auth before body parsing for reject-early, request-id + logger context first, error handler last. Codify in a template, don't re-derive per service.

## 4. Data layer specifics

- **node-postgres (pg):** always use `Pool`, never raw `Client` per request. Pool `max` ≈ 5–10 per process ([data-layer.md](../principles/data-layer.md) §4 math: processes × pool ≤ 70% of `max_connections`). Set `statement_timeout` and `connectionTimeoutMillis`; the defaults are infinite. A checked-out client **must** be released in `finally` — a missed `release()` on an error path is the slow pool leak that pages you at week three.
- **Transactions need one client:** `pool.query` per statement gives you different connections — your `BEGIN` and `COMMIT` run on different sessions and protect nothing. `const c = await pool.connect(); try { await c.query('BEGIN') ... }` or use a helper/ORM API that scopes a callback to one connection.
- **Prisma:** great DX; know its edges — interactive transactions (`$transaction(async tx => ...)`) have timeouts (default 5s) that fire mid-flight under load; its connection pool is per-instance (same fleet math); N+1 via lazy relation access in loops is easy to write — use `include` deliberately and monitor query counts per request ([data-layer.md](../principles/data-layer.md) §3). For hot paths, `$queryRaw` with parameters is honest and fine.
- **Drizzle/Kysely** (SQL-first, typed) are the sweet spot for teams that know SQL — less magic between you and the locking/isolation semantics that [concurrency.md](../principles/concurrency.md) requires you to control.
- BigInt/decimal trap: JS numbers lose integer precision past 2^53 and are binary floats — money as integer minor units (cents) or a decimal library, and JSON-serialize 64-bit ids as strings ([api-design.md](../principles/api-design.md) §7).

## 5. Observability specifics

- **pino** for logging (structured, fast); request context via **`AsyncLocalStorage`** so `trace_id`/`user_id` bind once and appear on every log line without hand-threading ([observability.md](../principles/observability.md) §1). ALS is stable and production-ready on 20+; use it instead of passing a ctx object through 40 signatures.
- OTel auto-instrumentation (`@opentelemetry/auto-instrumentations-node`) covers http/pg/redis/queue clients out of the box; add event-loop-delay and heap metrics to the default dashboard.
- Memory leak triage: heap snapshots via `node --inspect` / `v8.writeHeapSnapshot()`; usual suspects — module-level caches without bounds (use `lru-cache` with `max`), listeners added per request and never removed (`MaxListenersExceededWarning` is a leak detector, not noise to silence), closures captured by long-lived promises.

## 6. Testing specifics

- **Vitest** (or Jest) + **Testcontainers** for the integration tier ([testing.md](../principles/testing.md) §2); `fastify.inject()` / supertest for HTTP tests without a port.
- Mutation testing: **Stryker** — run incremental on diffs of critical modules ([testing.md](../principles/testing.md) §4).
- Concurrency hammer tests are trivial in Node — `await Promise.all(Array.from({length: 50}, () => request(...)))` — there is no excuse for invariant endpoints not having them.
- Fake timers for anything time-based; never `setTimeout`-and-hope in tests (that's the flake factory).

## 7. Security specifics

- Prototype pollution is a Node-specific injection class: deep-merge of user JSON into objects (`__proto__` keys) — use `Object.create(null)` maps or hardened merge libs; keep dependencies scanned (the ecosystem's supply-chain surface is the largest anywhere — lockfiles + provenance checks + minimal deps are policy, not preference; [security.md](../principles/security.md) §8).
- `helmet` (or Fastify equivalents) for headers; schema-validate every input with zod/TypeBox at the boundary — **parse, don't validate** ([security.md](../principles/security.md) §2), then trust types internally.

## Failure-mode quick table

| Failure | Detection | Fix / Prevention |
|---|---|---|
| Event-loop stall | Loop-delay metric; p99 up on all routes at once | CPU profile → offload/stream; ban `*Sync` in request paths |
| Express async error swallowed | Hung requests, no error logged | Express 5/Fastify, or async wrapper — enforce by lint |
| Pool leak on error path | Pool in-use count climbs, never falls | `finally { client.release() }`; checkout-wait alert |
| BEGIN/COMMIT on different connections | "Transaction" doesn't roll back in tests | Single-client transaction helper; integration test rollback behavior |
| Unhandled rejection crash | Process exits with rejection log | Attach handlers; CI flag `--unhandled-rejections=strict` to catch early |
| ReDoS | CPU pinned by one request; loop delay | RE2/timeout regexes on user input; regex lint (e.g. `eslint-plugin-regexp`) |
| Fire-and-forget work lost on deploy | Missing side effects, no errors | Real queue ([async-work.md](../principles/async-work.md) §1) |
| OOM vs container limit mismatch | OOMKilled with low reported heap usage | `--max-old-space-size` ≈ 75–80% of container limit |
