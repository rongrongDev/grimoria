# Vue / Nuxt — Concurrency Delta

**Read first:** `principles/concurrency.md`. Server-side (Nitro) inherits `frameworks/node/concurrency.md`; SSR-specific interleavings parallel `nextjs/concurrency.md`. This doc: Vue's client-side specifics. **Applies to:** Vue 3.5+, Nuxt 3.x–4. **Date:** 2026-07-06.

## 1. Vue's stale-closure profile — smaller, not zero

Vue's reactivity reads values at access time through the Proxy (`from-scratch.md`), so the React §1 "captured old render's value" class mostly doesn't exist — a watcher reading `state.count` always sees current state. Where staleness *does* survive:

- **Destructured/copied values** captured by long-lived callbacks (the reactivity-loss pitfall doing double duty as a staleness bug).
- **Async gaps:** `watch(id, async () => { const d = await fetchThing(id.value); state.thing = d; })` — by the time the await resolves, `id` may have changed; you just committed thing-for-old-id. This is the out-of-order race, `principles/concurrency.md` §1, and it's *the* Vue async bug.

**The canonical fix — `onCleanup` (or `watchEffect`'s):**

```ts
watch(id, async (newId, _old, onCleanup) => {
  const ac = new AbortController();
  onCleanup(() => ac.abort());                     // fires before next run AND on unmount
  try {
    state.thing = await fetchThing(newId, ac.signal);
  } catch (e) { if (e.name !== 'AbortError') state.error = e; }
});
```

Exactly one live request per watcher by construction — the same shape as React's effect-cleanup idiom (`react/concurrency.md` §2). **Real fix**, also the same: keyed query layer (`useAsyncData` keyed by id / TanStack Query) instead of hand-rolled watch-and-fetch.

## 2. Flush timing — the "DOM isn't updated yet" family

Effects flush in microtask batches (`from-scratch.md` §4). Consequences:

- Code reading the DOM right after a mutation reads stale DOM → `await nextTick()`.
- Watchers default to `flush: 'pre'` (before render) — a watcher that measures the DOM needs `flush: 'post'`. Sprinkling `nextTick` inside pre-watchers until it works is the smell; declaring the right flush is the fix.
- Two rapid mutations = one flush: don't write tests (or logic!) assuming one render per write.

## 3. Nuxt SSR interleavings

- **Cross-request state:** module-scope `ref`/`reactive` in server-run code = user A's data served to user B (`common-pitfalls.md` §8; mechanism in `node/concurrency.md` §1). Nuxt's `useState` is the request-scoped answer.
- **`useAsyncData` double-execution/race:** unstable or colliding keys (two components, same auto-derived key) make results land in each other's slots — explicit stable keys, per production-patterns.
- **Navigation races:** client-side route change mid-fetch — `useAsyncData` handles its own cancellation on key change; hand-rolled `$fetch` in setup doesn't. If you left the query layer, you re-own `principles/concurrency.md` §1 manually.

## 4. Double-submit

Same rules as everywhere (`principles/concurrency.md` §3): pending-disable from the mutation state (TanStack Query's `isPending` / your own single source), idempotency key for money paths. Vue-specific note: a `loading` ref set in a try/finally is fine *if* it's the only submit path — the bug arrives when a second component binds the same action without the flag; centralize mutations in the store/query layer, not per-component booleans.

## Review checklist

1. `watch`/`watchEffect` containing `await` without `onCleanup`+signal → §1.
2. Module-scope reactive state in anything server-executed → §3, sev-high.
3. DOM reads after mutations without `nextTick`/`flush: 'post'` → §2.
4. Hand-rolled fetch-into-ref keyed by changing input → §1/§3, demand query layer.
