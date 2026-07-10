# Next.js — Concurrency Delta

**Read first:** `principles/concurrency.md`, then `frameworks/react/concurrency.md` (client islands inherit all of it). This doc: server-render and App-Router-specific interleavings. **Applies to:** Next.js 15–16, App Router. **Date:** 2026-07-06.

## 1. Per-request isolation — the thing SSR quietly breaks

A Node server renders many users' requests concurrently in one process. **Any module-scope mutable state is shared across users.** The classic leak:

```ts
// lib/context.ts — BUG: module scope = process scope, not request scope
export let currentUser: User | null = null;   // request A sets it; request B reads A's user
```

This exact shape has produced "I logged in and saw someone else's account" incidents at multiple companies — it is the single worst bug class in SSR. Detection: grep for mutable module-scope (`export let`, module-level `Map`/object caches keyed by nothing). Fix: request-scoped context via `AsyncLocalStorage` (what Next's own `cookies()`/`headers()` use), or pass explicitly. Prevention: lint rule banning `export let`; review rule: module scope is for constants and per-process singletons (db pool), never per-user data. Full treatment: `frameworks/node/concurrency.md` — it applies verbatim to your Next server code.

## 2. Server Actions: serial per client, concurrent per world

- Next serializes actions *from the same browser tab* (they queue). Two tabs, retries, or scripted calls still race — the server-side TOCTOU rules (`principles/concurrency.md` §5) and idempotency keys (§3) are not optional because "actions queue."
- A mutation landing between a page's parallel data fetches can produce a page assembled from two different world-states (fetch A pre-mutation, fetch B post-). Usually cosmetic; for money screens (balances + transactions), fetch coupled data in **one** query/transaction, not two parallel ones.

## 3. Revalidation races

`revalidateTag` during in-flight renders: a request that already read the stale cache entry completes with stale data — revalidation affects *subsequent* requests. Don't build read-your-own-writes on cache revalidation alone; after a mutation, the acting user's next view should come from `router.refresh()` (which re-renders from source) or the action's returned fresh data, with revalidation handling *other* users' freshness.

## 4. Streaming changes failure timing

With Suspense streaming, the status code and shell are sent before slow sections resolve — a section that fails after streaming started can't 500 or redirect; it renders its error boundary inline. Consequences: auth checks and "should this page exist" decisions (`notFound()`, `redirect()`) belong *before* streaming starts (in the page/layout awaited section), not inside deferred Suspense children where they arrive too late to set headers.

## 5. The client-side navigation races

- Route transitions don't abort in-flight client fetches from the previous page — island components need the standard AbortController cleanup (`react/concurrency.md` §2) or TanStack Query.
- `router.push` after an action + `revalidatePath` in the action: order matters; do revalidation server-side in the action, navigate on the client after it resolves — firing both concurrently shows the destination with pre-mutation cache, the "my edit didn't save" report from `nextjs/production-patterns.md`.

## Review checklist additions

1. `export let` / module-scope mutable containers in any file imported by server code → §1, sev-high.
2. Money-adjacent action without idempotency key → §2.
3. `redirect()`/`notFound()`/cookie-setting inside Suspense-deferred components → §4.
4. Read-your-own-writes flows relying on `revalidateTag` alone → §3.
