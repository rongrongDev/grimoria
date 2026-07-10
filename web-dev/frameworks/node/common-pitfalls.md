# Node.js — Common Pitfalls

**Applies to:** Node 22/24; Express 5, Fastify 5, Hono 4. **Date:** 2026-07-06.
The three biggest Node pitfalls have their own homes: cross-request module state (`node/concurrency.md` §1), TOCTOU (§2), event-loop starvation (§3). This file is the rest.

## 1. Unawaited promises — the silent half-execution
`sendEmail(user)` without `await` inside a handler: response returns 200, the email may or may not send, its failure is an unhandled rejection (which, per the crash policy in production-patterns, takes down the process — *after* the user saw success). **Detect:** `@typescript-eslint/no-floating-promises` as error — the single highest-value lint rule for Node code. Intentional fire-and-forget gets an explicit wrapper (`void track(evt)` after a `.catch` — and ask whether it should be a queue job instead).

## 2. Express 4 async error handling (still everywhere in legacy code)
Async handler throws → request hangs, no log (the missing `out?.catch(inner)` line you built in `from-scratch.md` §3). Express 5 fixed it; every Express 4 codebase needs `express-async-errors` or wrapper functions *verified by a test that would hang* (`node/testing.md` has the shape). Related archaeology: error middleware with the wrong arity is silently never invoked — also provable from your from-scratch build.

## 3. Middleware ordering bugs
Auth registered after the routes it guards; body parser after the route reading `req.body`; error handler not last; CORS after the 404. Ordering **is** the API (from-scratch §3 decision 4). **Prevent:** one `registerMiddleware(app)` function owning the order with a comment block stating it — scattered `app.use` calls across files is how order becomes accidental.

## 4. Config read at import time
Top-level `const KEY = process.env.API_KEY` snapshots whenever the module first loads — before dotenv in some entrypoints, before test stubs (testing.md trap 3), differently under bundlers. **Fix:** one config module, Zod-validated *at boot* (production-patterns), everything else imports the parsed object.

## 5. JSON.parse/stringify as the universal serializer
MB-scale `JSON.stringify` in a hot handler = event-loop stall (concurrency §3); `JSON.parse` on unvalidated bodies = prototype-pollution surface (security doc); `JSON.stringify` on circular ORM entities = 500s from the logger of all places. Cap body sizes, DTO before serializing, and stream large exports (`principles/async-patterns.md` §streaming).

## 6. The ORM lazy-loading N+1 (and its `Promise.all` overcorrection)
`for (const order of orders) await order.getUser()` — N+1 queries, then someone "fixes" it with `Promise.all(orders.map(o => o.getUser()))` — N concurrent queries hammering the pool (the pool war story, production-patterns). **Fix:** eager-load/join/batch (dataloader pattern) — the query count is the bug, not the concurrency. **Detect:** query-count assertions in repo tests; OTel span counts per request.

## 7. Keeping the process alive at all costs
Broad `try/catch` swallowing unknown errors, `unhandledRejection` handlers that just log, PM2 restart-loops papering over a crash cause. A Node process that hit an unknown state is cheapest to *replace* (production-patterns §errors) — the pitfall is confusing availability of the *process* with availability of the *service*; the orchestrator restarts pods in seconds, but corrupted in-process state serves wrong answers indefinitely.

## 8. Date/time/locale traps in server code
`new Date()` arithmetic across DST, server-TZ-dependent formatting baked into APIs (server moves region, dates shift), `toLocaleString` differing across Node ICU builds → hydration mismatches when SSR'd (`principles/performance.md`). **Rules:** UTC everywhere internally; ISO 8601 on the wire; Temporal API (stable in modern Node) or date-fns at the edges; the client formats for display.

## 9. Streams: `.pipe()`, missing error handlers, and buffering "streams"
`.pipe()` chains swallow errors and leak fds (the 4am `EMFILE` story — `principles/async-patterns.md` §streaming); a "streaming" endpoint that `Buffer.concat`s everything first is a memory ceiling wearing a stream costume. `pipeline()` with a signal, always; test the client-disconnect path (abort mid-download) — that's where the leaks live.

## 10. `npm install` in CI / drifting lockfiles
`npm install` mutates the lockfile against floating ranges — CI builds an artifact nobody reviewed (supply-chain surface, `principles/security.md` §dependency confusion). `npm ci`, lockfile in review diffs (a 4,000-line lockfile change on a one-dep PR is a *stop* signal), plus the cooldown/scoped-registry regimen from the security doc.

## 11. Sync APIs sneaking into the request path
`fs.readFileSync` for a template "just once" (it's per-request), `execSync` for a CLI call, sync glob at boot code copy-pasted into a handler — each one a small event-loop bite that only shows at load (concurrency §3's detection: the event-loop-delay metric). Lint: `no-sync` scoped to `src/routes`/`src/domain`.

## 12. Never testing the shutdown/startup edges
Deploys drop requests (untested SIGTERM path — concurrency §4), boot succeeds with half a config (unvalidated env — pitfall 4), migrations race replicas starting simultaneously (run migrations as a deploy *step*, not at app boot). The common thread: the edges of the process lifecycle get zero tests while carrying maximal blast radius — production-patterns' boot/shutdown prescriptions each name their test.
