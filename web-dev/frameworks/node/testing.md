# Node.js — Testing Delta

**Read first:** `principles/testing.md` (layers, contracts, mutation testing — the backend is where Stryker earns its keep). **Applies to:** Node 22/24; Vitest, Testcontainers, MSW 2 / undici mocks, Playwright (API mode) or plain fetch. **Date:** 2026-07-06.

## The layer map (backend edition)

| Target | How | Notes |
|---|---|---|
| Domain logic (the pure layer from `node/production-patterns.md`) | Vitest unit, no mocks needed *because the architecture made it pure* | Stryker scope; if this layer needs heavy mocking, the architecture failed first |
| Repositories / queries | Integration vs **real database — Testcontainers** | Mock-db repo tests are the mock-rot factory (principles §3): green suites over broken SQL |
| HTTP handlers (routing, validation, authz, status mapping) | In-process HTTP: `fastify.inject()` / `request(app)` (supertest) / Hono `app.request()` | Real request→response, no network flake, milliseconds each |
| Outbound calls (retries, timeouts, error mapping) | MSW (node) or `undici` MockAgent | At the *network* boundary, not module mocks — principles §mock-at-network |
| Cross-service contracts | Schema-based (OpenAPI diff in CI) or Pact | principles §contract testing decides which |
| Full stack (queues, migrations, shutdown) | docker-compose e2e, small count | Include the kill-TERM-under-load test (`node/concurrency.md` §4) |

## The patterns that matter

**Testcontainers with per-test isolation:**

```ts
// One container per suite (startup ~1s amortized), one SCHEMA or transaction per test:
beforeAll(async () => { pg = await new PostgreSqlContainer('postgres:17').start(); await migrate(pg.url); });
beforeEach(async () => { await db.query('BEGIN'); });
afterEach(async () => { await db.query('ROLLBACK'); });     // shared-state flake killer (principles §flaky)
```

Rollback-per-test is fast and airtight until code under test manages its own transactions — then use per-test schemas or `TRUNCATE` lists. Decide once, in the harness, not per test file.

**Handler tests assert the contract, including the failure half.** Per endpoint, the minimum four: happy path; invalid body → 400 with problem+json shape; **wrong-user → 403/404 (the access-control regression harness — `node/security.md` §multi-tenancy)**; downstream failure (MSW-simulated) → mapped status, not a leaked stack trace.

**Concurrency bugs get load-shaped tests.** The TOCTOU class (`node/concurrency.md` §2) does not reproduce in sequential tests by construction:

```ts
test('no double-booking under concurrency', async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => app.inject({ method: 'POST', url: `/seats/7/book`, ... })));
  expect(results.filter(r => r.value?.statusCode === 200)).toHaveLength(1);  // exactly one winner
});
```

Twenty parallel requests in-process is a two-line test that has caught real double-booking bugs; write it for every "exactly once" invariant. (It's probabilistic — it proves presence of protection, not absence of all races; constraints remain the real defense.)

## Node-specific traps

1. **Fake timers vs real I/O deadlock:** `vi.useFakeTimers()` freezes `setTimeout`-based retry/backoff while real network promises need real time — advance timers explicitly (`vi.advanceTimersByTimeAsync`) or scope fake timers to pure-logic tests only. Retry-logic tests hanging at 30s CI timeouts are this.
2. **Port collisions & leaked handles:** listen on port 0 always (`from-scratch.md` §5 does); Vitest's `--reporter=hanging-process` finds the unclosed pool/server keeping CI alive — fix the leak, don't `--forceExit` (that flag is a bug muzzle).
3. **Env leakage between tests:** config read at import time (top-level `process.env.X`) snapshots before your test's stub — another argument for boot-time config injection (`node/production-patterns.md`); test the config module with `vi.resetModules`.
4. **Time and randomness:** anything asserting on `Date.now()`/UUIDs needs injected clocks/id-generators (domain layer takes `now: () => Date` style deps) — sleeping until timestamps differ is the flake pattern from principles §2.
5. **Testing the framework instead of your code:** asserting that Fastify validates schemas (it does; it has tests) — your test is that *your route declares the right schema*, which the invalid-body contract test covers from the outside.
