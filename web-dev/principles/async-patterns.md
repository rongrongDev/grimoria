# Async Patterns — Composition, Cancellation, Retry, Streaming

**Scope:** framework-agnostic JS/TS. The *failure catalog* for concurrency is `principles/concurrency.md`; this is the **toolbox**. **Date:** 2026-07-06.

## Promise composition — the four combinators and when each is wrong

| Combinator | Semantics | Use when | The trap |
|---|---|---|---|
| `Promise.all` | All succeed or reject on first failure | Results are all-required and independent | One failure rejects the aggregate, but the *other promises keep running* — their errors become unhandled rejections unless each has a handler; their side effects still happen |
| `Promise.allSettled` | Wait for all, never rejects | Partial success is meaningful (batch jobs, dashboards) | Easy to forget to actually *check* `status` per item — silent failure factory |
| `Promise.race` | First to settle wins | Timeouts, "first source wins" | Losers keep running (see cancellation); a fast *rejection* wins the race too |
| `Promise.any` | First to *fulfill* | Redundant sources (mirror endpoints) | All-reject gives `AggregateError`, which your error handling probably doesn't expect |

**Sequential-vs-parallel is the #1 review catch:** `await a(); await b();` for independent operations serializes a waterfall. Fix: `const [x, y] = await Promise.all([a(), b()])`. Detection: network waterfall panel; requests that stair-step but share no data dependency. (Server-side flavor and framework specifics: `principles/performance.md`, `frameworks/nextjs/production-patterns.md`.)

**Unbounded concurrency is the #2:** `Promise.all(items.map(fetch))` on 10,000 items is a self-inflicted DoS (yours or your upstream's). Use a concurrency limiter: `p-limit`/`p-map` with a bound chosen against the target's capacity, and expose the bound as config. Failure smell in prod: bursts of ECONNRESET / 429s aligned with batch jobs.

## Cancellation — AbortController is the only game in town

Promises cannot be cancelled; only *work* can, and only if the work cooperates. `AbortController` is the standard cooperation protocol — `fetch`, most modern libs, and Node core APIs accept `signal`.

```ts
// The canonical shape: caller owns the controller, work accepts the signal
async function search(term: string, signal: AbortSignal) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal });
  signal.throwIfAborted();           // re-check after any non-signal-aware await
  return res.json();
}
```

Rules that keep cancellation from becoming its own bug source:

1. **Every async function that does I/O takes an optional `signal`** and passes it down. Cancellation that stops at one layer is decorative — the network request underneath keeps running.
2. **Abort errors are not failures.** `err.name === 'AbortError'` (or `signal.aborted`) → return/rethrow silently. The classic self-own is a retry wrapper that retries aborted requests, or an error toast that fires every time the user types fast.
3. **Compose signals** with `AbortSignal.any([userSignal, AbortSignal.timeout(5000)])` — timeout + caller-cancel in one line. `AbortSignal.timeout()` beats hand-rolled `setTimeout`+reject because it actually cancels the underlying work, not just the promise.
4. After awaiting anything that *doesn't* take the signal, check `signal.throwIfAborted()` before committing side effects.

## Retry & backoff — the pattern that takes down your own backend

Naive retry (immediate, unlimited, on everything) turns a 30-second upstream blip into a self-sustained retry storm. I have watched a fleet DDoS its own auth service this way; the outage lasted 40 minutes *after* the original blip resolved, purely from synchronized retries.

The correct shape — every element is load-bearing:

```ts
async function withRetry<T>(fn: (signal: AbortSignal) => Promise<T>, opts: {
  retries?: number; baseMs?: number; capMs?: number; signal?: AbortSignal;
} = {}): Promise<T> {
  const { retries = 3, baseMs = 200, capMs = 5_000, signal } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(signal ?? new AbortController().signal);
    } catch (err) {
      if (signal?.aborted) throw err;                     // never retry cancelled work
      if (attempt >= retries || !isRetryable(err)) throw err;
      // full jitter: uniform in [0, min(cap, base * 2^attempt)]
      const delay = Math.random() * Math.min(capMs, baseMs * 2 ** attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
```

- **Retry only retryable errors:** network errors, 429, 502/503/504, timeouts. Never 400/401/403/422 (retrying a validation error is noise), never 500 blindly (it may have *succeeded* server-side — see next point).
- **Retry only idempotent work**, or attach an idempotency key (see `principles/concurrency.md` §double-submit). A retried POST without one is a duplicate-order machine.
- **Full jitter, not fixed backoff:** synchronized clients retrying at t+1s, t+2s, t+4s in lockstep produce thundering-herd spikes. Randomize the whole interval (AWS's "full jitter" result).
- **Honor `Retry-After`** on 429/503 when present.
- **Cap total time**, not just attempts — compose with `AbortSignal.timeout`.
- At scale, add a **circuit breaker** (e.g., opossum on Node): after N consecutive failures, fail fast for a cooldown instead of queueing doomed work.

Use a maintained implementation (`p-retry` on the client/Node) unless you have a reason; the subtle bugs above are exactly what libraries have already fixed.

## Streaming — responses as sequences, not blobs

When to stream: large payloads (memory ceiling), slow-to-produce data where first-byte matters (LLM tokens, reports), progressive rendering (SSR streaming — see framework docs).

**Consuming (browser & Node share this now):**

```ts
const res = await fetch(url, { signal });
for await (const chunk of res.body!) {         // ReadableStream is async-iterable
  process(chunk);                               // arrives as Uint8Array
}
```

- Pipe through `TextDecoderStream` for text; **never `TextDecoder.decode` per chunk without `{stream: true}`** — multi-byte characters split across chunk boundaries corrupt (the classic "emoji becomes �" bug).
- Chunk boundaries are transport artifacts, not message boundaries. Layer framing on top: SSE (`text/event-stream` — has auto-reconnect and wide proxy support; default for server→client push including LLM streaming), or NDJSON with a line-splitter transform.
- **Backpressure:** `for await` naturally applies it (you don't pull the next chunk until you're done). Manual `reader.read()` loops that buffer without pausing re-create the memory blowup streaming was meant to solve. Node: use `pipeline()` (handles backpressure *and* error propagation *and* cleanup), never `.pipe()` chains — `.pipe()` swallows errors and leaks the destination stream on source failure. That leak was a real incident: a file-download proxy leaked one fd per client disconnect until the process hit `EMFILE` at 4am.
- **Cancellation propagates through streams**: pass `signal` to `pipeline`; in the browser, aborting the fetch cancels the stream, and your `for await` throws `AbortError` — handle per rule 2 above.
- WebSocket vs SSE: bidirectional & binary → WebSocket; server→client only → SSE (simpler infra, auto-reconnect, works through more middleboxes).

## Deduplication & the cache layer

If several parts of the app want the same async data, do not let each fire its own request. In-flight deduplication — one promise per key, shared:

```ts
const inflight = new Map<string, Promise<unknown>>();
function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key); if (hit) return hit as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p); return p;
}
```

This is 10% of what TanStack Query does — which is the argument for using it (or SWR, or the framework's loader/cache layer) rather than growing this snippet into a bad reimplementation. Hand-roll only in environments where a dependency is unjustifiable.

## Decision tree

- One-shot request, user may supersede it (typing, navigation)? → `fetch` + AbortController, or query cache keyed by input.
- Several independent required results? → `Promise.all`, with per-item error context.
- Batch where partial success is fine? → `allSettled` + explicit per-item status handling + `p-limit` bound.
- Unreliable upstream, idempotent call? → `withRetry` (jitter, retryable-only) + timeout signal + circuit breaker at scale.
- Big/slow/incremental payload? → stream: SSE or NDJSON framing, `pipeline` on Node, backpressure via `for await`.
- Same data wanted in N places? → query cache; don't hand-fan-out.
