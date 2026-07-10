# Next.js — Production Patterns

**Applies to:** Next.js 15–16, App Router. (Pages Router is maintenance-mode; if you're on it, this doc is directional only.) React layer: `frameworks/react/`. **Date:** 2026-07-06.

## The one decision that shapes everything: server-first

App Router components are **Server Components by default**, and that default is correct. The discipline:

- **Start every component as a server component.** Add `'use client'` only when the component needs state, effects, or browser APIs — and add it at the *leaf*, not the layout. One `'use client'` at a high node drags the entire subtree into the client bundle (the directive marks a *boundary*, not a file).
- **Fetch on the server, as close to where data is used as possible.** Duplicate `fetch` calls dedupe per-request automatically; wrap non-fetch data access in `cache()` for the same effect. Stop hoisting all fetching to a top-level loader and prop-drilling — colocate.
- **Pass server data down as props; pass interactivity up as server components in `children`/slots of client components.** A client `<Tabs>` can render server-component children — teams that miss this rebuild whole pages as client code the first time they need one stateful wrapper.
- Read `frameworks/react/production-patterns.md` for everything inside the client islands (state taxonomy, TanStack Query for client-refetched data, etc.). RSC replaces the *initial load* data story, not client-side server-state management for live-updating views.

## Caching — the part everyone gets burned by

The App Router has four caches (request memoization, data cache, full route cache, client router cache). Post-Next-15 defaults are saner (`fetch` is no-store by default; GET route handlers uncached), but the burn pattern persists: **a page silently becomes fully static at build time because every input looked static, then production serves stale data forever.**

Working rules:

- **Declare, don't infer.** Per route segment, state intent explicitly: `export const dynamic = 'force-dynamic'` for always-fresh, or time-based `revalidate = N` for ISR-style, or (Next 15.1+/16) `'use cache'` + `cacheLife`/`cacheTag` where adopted. Explicit beats debugging implicit static-optimization.
- **Tag-based invalidation over time-based guessing:** `fetch(url, { next: { tags: ['product-42'] } })` + `revalidateTag('product-42')` in the mutation/webhook. Time-based `revalidate` is for content with tolerable staleness windows; tags are for correctness.
- After every mutation (Server Action), call `revalidatePath`/`revalidateTag` for what changed — otherwise the router cache serves the user their own pre-mutation data and they file "my edit didn't save."
- **Verify with the build output** (`ƒ` dynamic vs `○` static per route) in CI review; the build table is the truth, not your intent.

## Server Actions — mutations

```ts
'use server';
export async function updateOrder(prev: State, formData: FormData) {
  const session = await requireSession();                    // 1. authz IN the action
  const input = OrderSchema.parse(Object.fromEntries(formData)); // 2. validate — it's a public endpoint
  await db.order.update({ where: { id: input.id, orgId: session.orgId }, data: input }); // 3. ownership-scoped
  revalidateTag(`order-${input.id}`);                        // 4. invalidate
  return { ok: true };
}
```

Non-negotiables: a server action is a **public HTTP endpoint** whether or not any UI references it — authorize and validate inside it, every time (see `nextjs/security.md`). Client side: `useActionState` for pending/error, and the idempotency-key rule from `principles/concurrency.md` §3 for anything money-shaped. Use actions for mutations; use route handlers (`app/api/…`) when you need a real API surface (external consumers, webhooks, non-React clients).

## Rendering strategy per route — the decision tree

- Marketing/docs/blog → static (default) + ISR (`revalidate`) if content changes without deploys.
- Personalized dashboard → dynamic SSR, stream it (below).
- Live/interactive views (editors, feeds) → server-render the shell + client components with TanStack Query for the live data.
- Truly-static-with-auth-gate → static page + client-side session check for the chrome, or middleware redirect; don't force the whole route dynamic to read a cookie for an avatar. `cookies()`/`headers()` in a layout makes *everything under it* dynamic — the single most common accidental-dynamic cause.

## Streaming & Suspense

Don't let the slowest query set TTFB. Await the critical data in the page; wrap slow/secondary sections in `<Suspense fallback>` so the shell streams immediately and sections pop in. `loading.tsx` is route-level Suspense for free. Pair every Suspense boundary with an error boundary (`error.tsx`) — the React rule (`react/production-patterns.md`) applies per segment. And run independent awaits in parallel (`Promise.all`) inside loaders — the server waterfall war story in `principles/performance.md` was a Next.js app.

## Operational patterns

- **Middleware (`middleware.ts` / `proxy.ts` in 16):** redirects, locale, coarse route gating. It runs on every matched request with tight limits — keep it under a millisecond of logic, no DB calls, and **never as the only auth check** (CVE-2025-29927 was exactly a middleware-bypass — see `nextjs/security.md`).
- **Env vars:** `NEXT_PUBLIC_` = shipped to the browser, forever, in every bundle. Audit that prefix list in CI (`react/security.md` grep list). Validate server env at boot with Zod (`@t3-oss/env-nextjs` pattern) so a missing var fails the deploy, not the 3am request.
- **Images/fonts:** `next/image` and `next/font` always — they encode the LCP/CLS rules from `principles/performance.md` (priority hero images, dimension reservation, self-hosted font subsetting).
- **Self-hosting:** the standalone output + Docker works well; the caches default to in-memory/disk per instance — multi-instance deployments need a shared cache handler (`cacheHandler` config) or users see inconsistent revalidation. This bites everyone who scales past one pod; plan it before the second replica, not after the bug report.
- **Observability:** `instrumentation.ts` + OpenTelemetry; tag spans per route segment. The server-waterfall class of regression is invisible without tracing.

## War story — the static page that took the site down (in the boring way)

An e-commerce team shipped a "flash sale" banner driven by a CMS flag, rendered in the root layout, fetched with default caching (this was pre-15 defaults, but the shape survives via `'use cache'` misuse today). Build ran at 2am; every page baked the flag in as `false`; sale started at 9am; no banner, no sale traffic, six-figure marketing spend pointing at full-price pages. No error, no alert — the site was *fast and wrong*. Postmortem rules that stuck: (1) any data that changes without a deploy gets a tag and a webhook invalidation, (2) the build-output route table is reviewed in every PR that touches data fetching, (3) "static vs dynamic" is written in the PR description, i.e., declared intent. Silent staleness is Next's characteristic failure mode the way stale closures are React's.
