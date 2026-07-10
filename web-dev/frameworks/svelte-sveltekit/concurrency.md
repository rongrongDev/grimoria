# Svelte / SvelteKit — Concurrency Delta

**Read first:** `principles/concurrency.md`; server inherits `frameworks/node/concurrency.md`; SSR interleavings parallel `nextjs/concurrency.md`. **Applies to:** Svelte 5, SvelteKit 2. **Date:** 2026-07-06.

## 1. Staleness profile — like Vue's, with the async gap intact

Signals read current values at access time (from-scratch §1), so React-style captured-render staleness mostly doesn't exist. What survives — same two as Vue (`vue-nuxt/concurrency.md` §1):

- Copied values in long-lived callbacks (reactivity-loss pitfall doing staleness duty).
- **`$effect` containing `await`:** by resolution time, deps changed and you commit stale results — the out-of-order race. Also note: **reads after the first `await` in an `$effect` aren't even tracked** (tracking is synchronous — you built that: `activeReaction` is restored in `finally`), so the effect silently stops depending on things. Two bugs in one construct.

Canonical fix mirrors Vue's `onCleanup`:

```ts
$effect(() => {
  const ac = new AbortController();
  const q = query;                                   // read deps synchronously, BEFORE awaiting
  fetchResults(q, ac.signal)
    .then((r) => (results = r))
    .catch((e) => { if (e.name !== 'AbortError') error = e; });
  return () => ac.abort();                           // teardown runs before re-run & on destroy
});
```

**Real fix, as everywhere:** don't hand-fetch in effects — page data belongs in `load` (which aborts/re-runs on navigation and invalidation for you); live client caches in TanStack Query.

## 2. Flush timing

Effects batch on microtasks (from-scratch §1's queue). DOM reads after writes need `await tick()`; unit tests need `flushSync` or a tick (`testing.md` trap 1). Same family as Vue §2; same rule: declare the right timing, don't sprinkle sleeps.

## 3. Cross-request leaks — the framework's sharpest edge

Module-scope `$state`/stores in SSR-executed code are per-*process*, not per-user: the production-patterns war story. SvelteKit-specific aggravator: idiomatic client patterns (module stores) look identical to the dangerous server pattern — the boundary is *where the module gets imported from*, which no local read of the file reveals. **Rules:** per-user data lives in `event.locals`/`load` returns/cookies; module scope = constants and per-process infra; CI grep from production-patterns. (Svelte 5 SSR renders synchronously per component tree, which narrows—but does not close—interleaving windows for shared state; treat it as forbidden, not "probably fine.")

## 4. Navigation & action races

- `load` re-runs get aborted/superseded by the framework on rapid navigation — but only if your fetching *lives in `load`* and uses `event.fetch`. Hand-rolled `onMount` fetching re-owns `principles/concurrency.md` §1 manually (pitfall §7).
- Form actions: `use:enhance` serializes per-form submissions and gives pending state — wire it to disable (double-submit table stakes), and money paths still need idempotency keys (§3 of the principles catalog; two tabs, retries, and the back button don't care about your per-form queue).
- `invalidate()` storms: an action invalidating a broad `depends` key re-runs many `load`s concurrently; if those loads write shared client state (rather than returning data), you've built a last-write-wins race — `load` returns data, it doesn't imperatively set stores.

## Review checklist

1. `$effect` with `await` → deps read before first await? abort in teardown? or should this be `load`/query-layer? → §1.
2. Module-scope mutable state imported by server-rendered code → §3, sev-high (CI grep).
3. Forms without `use:enhance`-driven pending-disable; money actions without idempotency keys → §4.
4. DOM reads after state writes without `tick()` → §2.
