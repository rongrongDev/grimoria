# Remix / React Router v7 — Production Patterns (Extended Tier)

**Applies to:** React Router v7 framework mode (the Remix lineage — Remix v2 merged into RRv7; "Remix" as a separate package is legacy). React 19 underneath: all of `frameworks/react/` applies. **Date:** 2026-07-06.

## The model: web-standards-first request/response

RRv7's identity (inherited from Remix): loaders and actions are plain functions over the platform's `Request`/`Response`, forms are `<Form>`s that work before hydration, mutations revalidate loaders automatically. If you internalized SvelteKit's model (`svelte-sveltekit/production-patterns.md`), this is the same religion with React syntax — the doc cross-references accordingly.

## Loaders & actions — the rules

- **Route modules own data:** `loader` (GET) / `action` (mutations) colocated with the route. Server-only by construction in framework mode; `clientLoader`/`clientAction` exist for the client-side layer — keep secrets/db strictly in the server variants (the file-boundary discipline of `svelte-sveltekit/security.md`, minus the helpful file-suffix — so lint it: `.server.ts` modules for anything sensitive, which RRv7 *does* enforce).
- **Parallelize:** parent/child route loaders already run in parallel (the framework's structural answer to `principles/performance.md` waterfalls) — don't defeat it by having children await parent data via `context`; independent data per route segment.
- **`defer`-style streaming** (return promises from loaders, `<Await>`/`Suspense` in the component) for slow secondary data — same critical/deferred split as every meta-framework (`nextjs/production-patterns.md` §streaming), same rule: auth/redirect decisions before streaming starts.
- **Actions are public endpoints** — the invariant catalog (`nextjs/security.md` §1): Zod-validate `formData`, authorize inside, ownership-scope queries. `redirect()` and thrown Responses for control flow; error boundaries per route segment (`ErrorBoundary` export) so failures degrade by region, not by page.
- **Revalidation is the cache story:** after any action, loaders re-run — you get read-your-own-writes *for free*, which is why hand-adding TanStack Query for loader data is usually double-bookkeeping. Add a client cache only for live/polling data the loader model doesn't fit; tune over-revalidation with `shouldRevalidate` when profiling shows it (not before — premature `shouldRevalidate` is how stale-view bugs enter).

## Forms, mutations, and pending UI

`<Form>` + `useNavigation().state` for pending (route-level), `useFetcher()` for concurrent/localized mutations (a row's like button, a combobox search — each fetcher has independent pending/error state and doesn't navigate). Fetchers are the framework's answer to the double-submit and race classes: submissions within one fetcher are serialized, latest-wins; *across* fetchers/tabs the usual rules stand — idempotency keys for money paths (`principles/concurrency.md` §3). Progressive enhancement: forms work pre-hydration; keep that property (the SvelteKit `use:enhance` argument — `svelte-sveltekit/production-patterns.md` §mutations) by not rewriting forms as `onClick` fetches.

## Structure & rendering

- Route-tree = information architecture: nested layouts with `<Outlet>`, pathless routes for shared chrome, resource routes (loader/action without a component) as your API endpoints.
- Rendering modes per route: SSR default, `prerender` config for static paths, SPA mode exists for full-client apps — declare intent per the universal meta-framework rule; on Node deployments the whole `frameworks/node/` operational surface is yours (module-scope leaks included — `node/concurrency.md` §1).

## Testing & security pointers

- **Loaders/actions are plain functions — test them directly** with a `Request` (the highest-value layer, same as `nextjs/testing.md` actions pattern): happy/invalid/wrong-user/redirect cases. `createRoutesStub` for component-with-route-context tests; Playwright (built app + a `javaScriptEnabled: false` project for the progressive-enhancement money paths — the SvelteKit test idea, verbatim) for flows.
- Security: React sinks per `react/security.md`; server surface per `node/security.md`; session cookies via the framework's `createCookieSessionStorage` with `httpOnly/secure/sameSite` set (it makes the principles-doc defaults one config object).

## War story — the revalidation they turned off

A team profiled "too many loader calls" after every action and reached for `shouldRevalidate: () => false` across half the routes. Two sprints later: a support queue of "I archived it but it's still in the list," "the count is wrong until refresh" — they had traded the framework's consistency guarantee for a cache-invalidation problem they now owned by hand, route by route (the hardest problem in CS, adopted voluntarily). The actual perf issue was one loader doing an unindexed count query — 40ms of SQL fixed what config had "fixed" by breaking correctness. **Rule:** in revalidation frameworks, correctness is the default and opting out is taking on cache invalidation as a personal hobby — profile the slow loader before silencing the framework.
