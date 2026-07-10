# Node.js — Concurrency Delta

**Read first:** `principles/concurrency.md` — §5 (TOCTOU) and §6 (event-loop starvation) are *primarily* Node sections; this doc extends them with process-model specifics. **Applies to:** Node 22/24, any server framework. **Date:** 2026-07-06.

## 1. The process model: one loop, all users — module scope is shared memory

Every concurrent request interleaves on one thread at every `await`. Module scope is therefore **shared mutable memory across users** — the root cause behind the cross-request leaks documented in `nextjs/concurrency.md` §1 and the SvelteKit cart war story:

```js
// The three spellings of the same sev-1:
export let currentUser = null;                    // set per request, read by any request
const cache = {};  /* keyed by nothing */          // request A's data served to request B
let requestCount = 0; app.use((req) => { req.id = ++requestCount; });  // benign-looking; same class
```

- **Request-scoped context, the right way — `AsyncLocalStorage`:**

```js
import { AsyncLocalStorage } from 'node:async_hooks';
export const ctx = new AsyncLocalStorage();
app.use((req, res, next) => ctx.run({ user: null, requestId: crypto.randomUUID() }, next));
// anywhere downstream, any async depth: ctx.getStore().requestId
```

This is what pino request-ids, OTel context, and the meta-frameworks' `cookies()`-style APIs ride on. Use it for cross-cutting context (identity, request id, locale); use plain arguments for domain data — ALS as a general parameter bus makes data flow invisible.
- **Prevention:** lint `export let`; review rule from the principles doc: module scope holds constants and per-process infra (pools, clients) only.

## 2. TOCTOU under a magnifying glass

`principles/concurrency.md` §5 is the doctrine (atomicity lives in the datastore; unique constraints; conditional writes; `FOR UPDATE`). Node-specific addenda:

- **The window is every `await`**, and it widens with load (the ticketing war story's mechanism). A handler with 4 awaits has 4 interleaving points *per request*; reasoning "nothing else runs between these lines" is only true for synchronous segments.
- **In-process mutexes (`async-mutex`) only serialize one instance.** The moment you scale to 2 replicas they're decorative — datastore-level control or a distributed lock (Redis `SET NX PX` + careful release, or Postgres advisory locks) for cross-instance sections. Prefer constraints over locks: they can't be forgotten on the new code path.
- **Batch jobs racing the request path** (cron re-processing what a user just edited): same rules — version columns (optimistic concurrency: `UPDATE … WHERE version = ?`) are the cheapest general answer.

## 3. Event-loop starvation, operationally

Doctrine in `principles/concurrency.md` §6. The Node production checklist:

- **Measure:** `monitorEventLoopDelay` histogram exported as a metric; alert p99 > 100ms. This single metric explains more mystery latency than the next five combined.
- **Usual suspects, in audit order:** `JSON.parse/stringify` of MB-scale payloads (stream or cap them); synchronous crypto (`pbkdf2Sync`, `bcrypt` sync paths) on request threads — use async variants which run on the libuv threadpool; catastrophic regex on user input (ReDoS — linear-time engine or bounded input); `fs.*Sync` anywhere post-boot; huge array sorts/joins in handlers.
- **The threadpool is also finite** (default 4): a burst of async crypto/zlib/fs saturates it and *those* operations queue invisibly — `UV_THREADPOOL_SIZE` sizing and, for sustained CPU work, `worker_threads`/piscina with a bounded queue (unbounded worker queues just move the OOM).
- **Streams without backpressure** re-create starvation via memory pressure: `pipeline()` always (`principles/async-patterns.md` §streaming).

## 4. Graceful shutdown races

SIGTERM arrives mid-request: the naive `server.close()` waits forever on keep-alive sockets; `process.exit()` drops in-flight work (half-committed side effects — see idempotency, principles §3). The correct sequence: readiness → failing (stop new traffic), `server.close()` + `closeIdleConnections()`, deadline timer (e.g. 10s) then `closeAllConnections()`, drain job handlers, close pools, exit 0. Test it: kill -TERM under load in a staging soak; "we handle shutdown" without that test is a hypothesis.

## 5. Multi-instance truths

Anything "shared" in-process is per-instance after scale-out: caches (use Redis or accept per-instance staleness *explicitly*), rate limiters (in-memory limiter × N instances = limit × N — move to Redis), WebSocket rooms (need a pub/sub backplane), cron (`node-cron` in the app runs N times — leader-elect or move to platform schedulers). The audit question for every stateful in-process construct: **"what happens at replicas = 2?"** Ask it in review; production will ask it otherwise.

## Review checklist

1. Module-scope mutable state touched per-request → §1, sev-high.
2. read-check-write on contended data without constraint/conditional-write/lock → §2.
3. Sync CPU (crypto/fs/regex/JSON-of-MBs) in handlers → §3.
4. In-memory cache/limiter/cron in a service that scales horizontally → §5.
5. No tested shutdown path → §4.
