# Next.js — Common Pitfalls

**Applies to:** Next.js 15–16, App Router. React pitfalls apply inside client components: `frameworks/react/common-pitfalls.md`. **Date:** 2026-07-06.

## 1. Silent static-when-you-meant-dynamic (and its inverse)
The signature Next failure (war story in `nextjs/production-patterns.md`): a route full-static-optimizes because nothing in it *looked* dynamic, and production serves build-time data forever. Inverse: one `cookies()` call in the root layout makes the entire site dynamic and your CDN hit rate goes to zero. **Detect:** the `next build` route table (`○`/`ƒ`), reviewed per PR. **Fix/prevent:** declare intent per segment (`export const dynamic`/`revalidate`), keep request-data reads (`cookies()`, `headers()`, `searchParams`) out of layouts and in the narrowest component.

## 2. `'use client'` at the top of the tree
One directive on a layout/page drags the subtree into the bundle: hydration cost, bundle bloat, and "why is my DB client erroring in the browser." **Fix:** push the directive to leaves; pass server-rendered children *into* client wrappers (`nextjs/production-patterns.md` §server-first). **Detect:** bundle analyzer per route; `server-only` imports to make wrong-side imports fail loudly.

## 3. Fetching in client components what the server already had
`useEffect`+fetch (or even TanStack Query) for data the RSC could have passed as props — extra round trip, loading spinner for data the server knew at render time, and the react-concurrency race class re-imported for nothing. **Rule:** initial data server-side; client fetching is for data that *changes while the user watches*.

## 4. Server Action without revalidation (or with `redirect` swallowing it)
Mutation succeeds, UI shows stale cache, user retries, now you have duplicates (compounding into `principles/concurrency.md` §3). Every action that writes: `revalidateTag`/`revalidatePath` for what changed. Note `redirect()` throws — code after it never runs; revalidate *before* redirecting.

## 5. Treating middleware as the security layer
Covered fully in `nextjs/security.md` §3 (CVE-2025-29927). Pitfall form: "auth works" because the redirect happens in the happy path, while every action/handler trusts the request. Authorization at data access, always.

## 6. Module-scope state on the server
`export let currentUser` / module-level caches keyed per-user → cross-user data leaks under concurrency. Full treatment `nextjs/concurrency.md` §1. This one is a career-limiting bug; grep for it in every review.

## 7. Client bundle contamination via "shared" modules
A `utils.ts` that imports `fs`/db/secret-env at the top, imported by one client component → build error if you're lucky, secret-in-bundle if the import graph is subtler. **Fix:** split server modules; mark with `server-only`; keep the dependency direction clean (features → ui, server-lib ↛ client — same boundary-enforcement argument as `react/production-patterns.md` project shape).

## 8. Dynamic APIs are async now (15+) — and the lint autofix isn't semantic
`params`, `searchParams`, `cookies()`, `headers()` are Promises in Next 15+. Codemods make it compile; the *pitfall* is sequentializing: awaiting them at the top of a page before independent fetches serializes your waterfall. Await late, `Promise.all` independent work (`principles/performance.md` §waterfalls).

## 9. `next/image` misuse triad
(a) `remotePatterns` wildcard → SSRF/open proxy (`nextjs/security.md` §4); (b) hero image without `priority` → LCP regression; (c) `fill` without a sized container → CLS. The image component encodes the `principles/performance.md` rules only if you pass it the truth.

## 10. ISR as a message queue
Teams discover `revalidate = 10` and build "real-time" features on cache expiry — dashboards that are 0–10s stale per node, differently per node (see multi-instance cache note in production-patterns §self-hosting). ISR is for content freshness, not data sync; live views are client components with a query layer.

## 11. Giant `page.tsx` doing data + layout + logic
No unit-testable surface (see `nextjs/testing.md` table): extract `lib/queries/*` and keep pages as composition. The pitfall is structural, and it's also why "we can't test our Next app" is usually self-inflicted.

## 12. Version-upgrade fatalism
App Router majors move fast (caching defaults flipped in 15; `middleware`→`proxy` naming and cache components in 16). The pitfall is pinning to an old major "because upgrades are scary" until you're three majors behind a supported security baseline (the 2025 middleware CVE forced exactly this reckoning on laggards). **Prevention:** upgrade one major per quarter max-lag policy, with the codemods (`npx @next/codemod`), behind the e2e suite from testing.md.
