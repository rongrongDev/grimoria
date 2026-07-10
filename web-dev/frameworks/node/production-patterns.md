# Node.js Backends — Production Patterns

**Applies to:** Node 22 LTS / 24; Express 5, Fastify 5, Hono 4. **Date:** 2026-07-06.
**Mental model prerequisite:** `node/from-scratch.md` (the middleware machine). Meta-framework server layers (Nitro, SvelteKit adapters, Next custom servers) inherit everything here.

## Framework choice — the decision, made

- **Fastify 5** — the default for a dedicated Node API service: schema-per-route (validation *and* fast serialization from one declaration — the validation-at-boundary rule from `principles/security.md` made structural), plugin encapsulation, first-class TS, pino built in.
- **Hono 4** — when the same code must run on edge/workers/Bun, or for lightweight BFFs; Web-standard types age best.
- **Express 5** — the ecosystem/hiring default; fine, with discipline this doc supplies (schema validation and async-error handling that Fastify would have given you for free).
- Above all three: **NestJS** if the org needs a full DI framework and convention (large teams, many services) — accepting its abstraction tax. Below: bare `node:http` for nothing but learning (`from-scratch.md`).

## The non-negotiable architecture: handlers thin, domain pure, edges explicit

```
routes/ (HTTP: parse, validate, authz, call domain, map result → status)
  └─ domain/ (pure business logic — no req/res, no framework imports)
       └─ data/ (repositories: queries, ownership-scoped — principles/security.md §access control)
infra/ (db pool, queues, clients — created ONCE at boot, injected)
```

- The **domain layer imports nothing from the framework** — that's what makes it unit-testable (the Stryker layer, `principles/testing.md`) and framework-portable (the Express→Fastify migration that takes days instead of quarters).
- **Boot-time construction, request-time use:** pools, clients, and config are built once at startup and passed down (DI by constructor args is enough; a framework is optional). Request-time `new Client()` per call is the connection-exhaustion pattern; boot-time validation of env/config (Zod on `process.env`) turns misdeploys into instant failures instead of 3am ones.
- **Every route declares its schema** (Fastify natively; `zod` + middleware on Express/Hono). Unvalidated `req.body` reaching the domain layer is a lint-able offense.

## Errors, the contract

- One error taxonomy in the domain (`NotFound`, `Forbidden`, `Conflict`, `Validation`), mapped to HTTP in exactly one place (the error handler you built in from-scratch §3, now with arity-4 discipline or Fastify's `setErrorHandler`).
- **Outward:** RFC 9457 problem+json, generic messages, no stack traces, no ORM error text (schema names leak — principles doc). **Inward:** structured log with request id.
- `unhandledRejection`/`uncaughtException`: log, flush, **exit** — a process that caught an unknown exception is in an unknown state; the orchestrator's restart is the recovery mechanism, a "keep running" handler is how you get the corrupted-singleton weeks. Pair with graceful shutdown: on SIGTERM stop accepting, drain in-flight (with a deadline), close pools, exit.

## Observability — the minimum viable dashboard

1. **pino** structured JSON logs with a per-request id (`AsyncLocalStorage`-propagated — same machinery as `node/concurrency.md` §1) so one request's logs correlate across layers.
2. **OpenTelemetry** traces (auto-instrumentation covers http/db clients) — the server-waterfall class (`principles/performance.md`) is invisible without spans.
3. **Metrics that actually predict pages:** event-loop delay (`monitorEventLoopDelay`, alert p99 > 100ms — `principles/concurrency.md` §6), heap used vs limit, pool saturation (db connections in use), and per-route p95/p99 + error rate. CPU% alone lies about Node health; event-loop delay doesn't.
4. Health endpoints: liveness (`am I responsive`) *separate from* readiness (`are my dependencies up`) — conflating them turns one dependency blip into a rolling-restart storm.

## Operational patterns

- **Timeouts everywhere, budgeted:** server (`headersTimeout`/`requestTimeout`), and *every* outbound call (`AbortSignal.timeout` — `principles/async-patterns.md`). An outbound call without a timeout donates your event loop to someone else's outage. Retries per the async doc: jittered, idempotent-only, circuit-broken.
- **Backpressure and limits:** body-size caps (you built why, from-scratch §4), rate limits on auth/expensive routes, `pipeline()` for any streaming (never `.pipe()` — the fd-leak war story in the async doc), pagination as the default query shape (the "someone calls `/orders` with 2M rows" incident is universal).
- **One process = one core:** scale with the platform's replicas (or `cluster`/PM2 if bare-metal); don't put CPU work on the request path — `worker_threads`/piscina or a job queue (BullMQ) behind an endpoint that returns 202 + status URL.
- **ESM, `node:` prefixed imports, built-in `node --test` acceptable but Vitest preferred** (`node/testing.md`); TS via `tsx`/`--experimental-strip-types` in dev, compiled for prod.

## War story — the pool that sized itself to fail

A checkout API ran Postgres pool size 10 (the library default) per instance, 40 instances after an autoscale event = 400 connections against a database configured for 200. Half the fleet's requests queued on `pool.connect()`, which *looks* like slow queries in the logs (it isn't — the query never started), which triggered more autoscaling, which made it worse. The fix was arithmetic, not code: `pool_size × max_instances ≤ db_max_connections − headroom`, wired into config review, plus pool-wait-time as a first-class metric. **The general lesson:** in Node systems the bottleneck is usually a *queue you didn't know you had* (pool wait, event loop, upstream socket limits) — instrument the queues, not just the work.
