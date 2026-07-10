# Remix / React Router v7 — Common Pitfalls (Extended Tier)

**Applies to:** React Router v7 framework mode. React pitfalls inside components: `frameworks/react/common-pitfalls.md`. **Date:** 2026-07-06.

## 1. Fetching in components what the loader should own
`useEffect`+fetch (or TanStack Query) for route data — skips SSR, loses revalidation consistency, re-imports the race class the loader layer solved (abort-on-navigation is built in). The universal meta-framework pitfall (Next §3, Nuxt §6, SvelteKit §7): initial/route data in loaders; client fetching for genuinely live data.

## 2. Loader waterfalls via `context`/parent coupling
Child loaders awaiting parent-derived promises, or one fat root loader feeding everything — serializes what the router runs in parallel. Independent loaders per segment; share via the request (session, params), not cross-loader data dependencies.

## 3. `shouldRevalidate: false` as a performance tool
The war story (`remix-react-router/production-patterns.md`): opting out of revalidation to hide a slow query = adopting manual cache invalidation. Fix the query; scope `shouldRevalidate` narrowly and only with a profile in hand.

## 4. Secrets/db in code that isn't `.server.`
Framework mode strips server code from client bundles *when modules are marked* (`.server.ts`) or only imported from loaders/actions — a "shared util" importing the db that some component also imports = build error at best, bundle leak at worst. Same boundary discipline as SvelteKit (`svelte-sveltekit/security.md` §file boundary); use the suffix proactively.

## 5. Actions without the public-endpoint mindset
Trusting hidden form fields (price, userId), skipping Zod on `formData`, authorizing in the component that renders the form — the actions catalog (`nextjs/security.md` §1) applies in full; the wrong-user test per action (`principles/testing.md`).

## 6. `useFetcher` misuse: one fetcher for many things
A single fetcher instance shared across a list's rows: latest-wins semantics make row B's pending state overwrite row A's (a UI race you built yourself). One fetcher per independent interaction (`useFetcher({ key })` for identity across components).

## 7. Redirects and thrown Responses swallowed
`redirect()` must be *returned/thrown*, not called; `throw` in loaders is control flow (404s via `throw new Response(null, {status: 404})`) — wrapping loader bodies in broad try/catch "for logging" eats the framework's error/redirect semantics and turns 404s into 500s. Catch narrowly; rethrow Responses.

## 8. Pending UI ignored (double-submit reopened)
Forms without `useNavigation`/fetcher-state-driven disable reopen the double-submit class the framework half-closed (`principles/concurrency.md` §3) — plus idempotency keys for money paths; two tabs don't share your fetcher's queue.

## 9. Error boundaries only at the root
One top-level `ErrorBoundary` means any segment's loader failure blanks the whole page. Boundary per meaningful layout region (the Suspense/error pairing rule, `react/production-patterns.md`) — the nested-route architecture exists precisely so failures can be regional.

## 10. Session cookie misconfiguration
`createCookieSessionStorage` with default-ish secrets in the repo, missing `secure`/`sameSite`, or unsigned cookies read as truth — the principles-doc cookie posture (`HttpOnly; Secure; SameSite=Lax`, secret from the secret manager, rotation plan) is three lines of config here; audit them per environment.
