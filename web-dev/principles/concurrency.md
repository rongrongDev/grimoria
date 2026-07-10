# Concurrency & Race Conditions — The 3am Catalog

**Scope:** framework-agnostic; the JS-specific mechanics every web engineer must internalize. Framework deltas: `frameworks/<x>/concurrency.md`. **Date:** 2026-07-06.
**Related:** `principles/async-patterns.md` (the toolbox); this doc is the failure catalog.

## The mental model

JavaScript is single-threaded per realm, so people conclude "no race conditions." Wrong conclusion. You don't get *data races* (two threads writing one memory word); you get **interleaving races**: every `await` and every callback is a point where the world can change under you. State read before an `await` may be stale after it. Two logical operations in flight can complete in either order. The user can click again while you're suspended.

Rule of thumb that finds most bugs in review: **look at every `await`, and ask "what if the thing I checked before this line changed during it, and what if a second copy of this function is running right now?"**

## The catalog: failure → detection → fix → prevention

### 1. Out-of-order responses (last-write-wins)
- **Failure:** Type "par" → request A; type "paris" → request B. B returns first, A returns second, UI shows results for "par" under a search box saying "paris". Same bug shape: tab switching, filter changes, route params.
- **Detection:** Hard in tests with fast mocks (both resolve instantly, in order). Force it: mock request A with a 50ms delay and B with 0ms, assert final state matches B. In production: users report "results flash then change" — take that report seriously, it's this.
- **Fix (pick one, in order of preference):** (a) Use a request cache that keys by input — TanStack Query keyed on `['search', term]` makes stale responses structurally unable to land in the wrong slot. (b) Cancel the previous request: `AbortController`, abort on new input. (c) Ignore stale: capture a token/flag per request, check it before committing state.
- **Prevention:** Team rule: *no hand-rolled fetch-into-state for server data* — server state goes through the query cache layer. This one rule deletes the whole bug class.

### 2. Stale closure / stale read across `await`
- **Failure:** A callback or post-`await` continuation reads a variable captured earlier. Classic: interval reading the initial value forever; or `if (balance >= amount) { await debit() }` where balance changed during the await (see #5 — same bug, server flavor, real money).
- **Detection:** Code smell: long-lived callbacks (timers, subscriptions, event handlers) referencing values that update over time; any check-then-act split by an `await`.
- **Fix:** Re-read current state at use time (functional state updates, refs/stores that are read at call time), or re-validate the precondition after the `await`.
- **Prevention:** Lint (React's `exhaustive-deps` catches many; see framework docs). Review habit: "check-then-act with an await between? re-check."

### 3. Double-submit
- **Failure:** User double-clicks "Place order"; two orders. Or clicks once, sees nothing for 800ms (no feedback), clicks again. Retry layers (see async-patterns) can also duplicate the submit *without* any user misbehavior.
- **Detection:** Duplicate rows with near-identical timestamps in production data. Test: fire the submit handler twice synchronously, assert one request.
- **Fix — belt *and* suspenders, because the client fix alone is insufficient:**
  - Client: disable-while-pending is table stakes but is UI-local — it does nothing about retries or two open tabs.
  - Server (the real fix): **idempotency keys.** Client generates a UUID per logical submission (per form-fill, not per click); server stores key → result, and replays the stored result on duplicates. Stripe's API is the reference design.
- **Prevention:** Idempotency-key support in your API scaffold so new mutation endpoints get it by default; e2e test that double-click produces one order.

### 4. Optimistic UI rollback races
- **Failure:** Optimistic update applied; server rejects; naive rollback restores a snapshot that's meanwhile been changed by *another* optimistic update or a background refetch — user's other edit vanishes. Worst version I shipped: a like-button counter that could go negative under rapid toggling, because each rollback restored a pre-both-clicks snapshot.
- **Detection:** Rapid-toggle test: fire N conflicting mutations with the server rejecting some; assert final state equals server truth.
- **Fix:** Don't snapshot-restore blindly. Either (a) treat server as truth: on settle, refetch/invalidate and let server state overwrite (TanStack Query's `onSettled: invalidate` pattern), or (b) keep a queue of pending mutations and recompute display state = serverState + pending queue (how Linear-class apps do it).
- **Prevention:** Use the framework/query-layer's built-in optimistic mutation support instead of hand-rolling; it has already survived these edge cases.

### 5. Server-side check-then-act (TOCTOU) — the money one
- **Failure:** `const seat = await getSeat(); if (seat.free) { await book(seat) }` — two requests interleave at the await; both see free; double booking. Node's single thread does not save you: every await yields to the other request. Multiply by N server instances.
- **Detection:** Any read-validate-write on shared data where the write isn't conditional. Load test with concurrent identical requests (`autocannon`, or just `Promise.all` of 50 fetches in a test) and count outcomes.
- **Fix:** Push the atomicity into the datastore — the only place that actually serializes: conditional update (`UPDATE seats SET user=? WHERE id=? AND user IS NULL`, check affected-rows), unique constraints (the cheapest fix: let the second insert fail), `SELECT … FOR UPDATE` in a transaction, or an advisory/distributed lock when it spans systems.
- **Prevention:** Review rule: any handler doing read-then-write on contended data must name its concurrency control. Unique constraints on anything that must be unique — constraints are the tests that run in production.

### 6. Event loop starvation
- **Failure:** One request parses a 50MB JSON / renders a huge SSR page / runs a catastrophic regex (ReDoS), and *every* concurrent request on that Node process stalls — including health checks, so the orchestrator kills the pod mid-flight and the retry storm begins. Client-side flavor: long main-thread task, frozen UI, INP through the roof.
- **Detection:** Node: event-loop-delay metric (`perf_hooks.monitorEventLoopDelay`), alert when p99 > ~100ms. Client: Long Tasks in the Performance panel / INP field data.
- **Fix:** Move CPU work off the loop: `worker_threads`/piscina for real compute; stream instead of buffering; chunk big loops with `setImmediate`/`scheduler.yield()`. Replace vulnerable regexes (linear-time engines like RE2 for user-supplied patterns).
- **Prevention:** Event-loop-delay in your default dashboard; payload size limits at the edge; regex on user input goes through review.

### 7. Init/teardown races (the subscription leak)
- **Failure:** Async setup completes *after* the component/request that started it was torn down: setState-after-unmount, subscription created after unsubscribe ran, connection opened after "close" — leaking or throwing. Common wherever setup itself awaits something.
- **Detection:** Warnings/errors in logs referencing dead contexts; growing listener counts (`getEventListeners`, heap snapshots).
- **Fix:** Make teardown able to cancel in-flight setup: AbortController wired through setup; or a `disposed` flag checked after each await in setup.
- **Prevention:** Standardize a lifecycle helper so setup/teardown pairs are written once (framework docs show the local idiom).

## Decision tree — "I have concurrent operations touching shared state"

- Same client, same widget, latest-input-wins semantics (search, filters)? → **key by input via query cache**, or abort previous.
- Same client, mutation, must happen exactly once? → **disable-while-pending + idempotency key.**
- Multiple clients/processes, shared resource, must not conflict? → **atomicity in the datastore** (conditional write / unique constraint / transaction with locking).
- Long CPU work stalling everything? → **move it off the loop** (worker) or **chunk it**.
- "It's fine, JS is single-threaded"? → It is not fine. Re-read this doc.

## War story

The 3am page that named this doc: a ticketing client's "reserve seat" flow used read-check-write in a Node handler. Fine for two years at low traffic — the interleaving window was ~15ms. Then a marketing campaign hit, p95 db latency rose to 300ms, the window widened 20x, and 143 double-booked seats sold in one evening. Nothing had "changed" — no deploy, no code diff. **Interleaving races are load-activated: absence of symptoms at low traffic is not absence of the bug.** The fix was one unique constraint that should have been in the schema from day one; the cleanup was three engineers and a weekend of refunds.
