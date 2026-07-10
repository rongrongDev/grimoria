# Solid — Production Patterns (Extended Tier)

**Applies to:** Solid 1.9 (SolidStart 1.x noted where relevant). **Date:** 2026-07-06.
**Mental model:** you already built Solid's core — it's the signals runtime from `svelte-sveltekit/from-scratch.md` §1 (Solid pioneered the pattern), minus the compiler-rewrites-your-variables layer: in Solid, *you* call the getters.

## The rule that changes everything: components run once

A Solid component function executes **once**, at mount. There is no re-render. JSX compiles to real DOM creation plus fine-grained effects per binding (the Step-3 output of the Svelte from-scratch guide, hand-visible). Everything follows from this:

- **Props and signals are accessed, not read.** `props.name` and `count()` inside JSX/effects are tracked; copying them to a local (`const n = count()`) at component top-level freezes the value forever — the reactivity-loss family (`vue-nuxt/common-pitfalls.md` §1), at its most absolute, because there's no re-render to accidentally rescue you.
- **Don't destructure props.** Use `props.x` inline, or `splitProps`/`mergeProps` (which preserve getter-based reactivity).
- **Control flow is components, not array methods:** `<For>`/`<Show>`/`<Switch>` instead of `.map()`/ternaries — `<For>` does keyed reconciliation by reference; naked `.map()` in JSX rebuilds nodes wholesale. `<For>` vs `<Index>`: `<For>` keys by item identity (lists of objects); `<Index>` by position (lists of primitives you edit in place). Choosing wrong is Solid's version of the index-key pitfall.

## State architecture

- `createSignal` for atoms; `createMemo` for derived (lazy, cached — only when the computation is expensive or diamond-shaped; plain derived functions are often enough since *everything* is fine-grained anyway); **stores** (`createStore` + `produce`) for nested/keyed data — path-granular tracking means updating `store.users[3].name` wakes only bindings on that leaf.
- Effects: `createEffect` for reactive side effects; `onCleanup` *inside* it for teardown (the fetch-race/cleanup idiom — same shape as Vue's `onCleanup`, `vue-nuxt/concurrency.md` §1); `on(...)` when you need explicit deps or `defer`.
- **Async: `createResource`** (or TanStack Query solid) — keyed by a reactive source, handles the out-of-order race (`principles/concurrency.md` §1) and Suspense integration. Hand-rolled fetch-in-effect re-owns the race manually; same law as every framework.
- Shared state: plain modules exporting signals/stores work beautifully client-side — **but are per-process on the server** (SolidStart SSR): the cross-request leak (`node/concurrency.md` §1) applies; per-user state flows through request context, never module scope.

## SolidStart notes (briefly — it's SvelteKit-shaped)

File routes; `"use server"` server functions (public endpoints — the full `nextjs/security.md` §1 discipline: validate, authorize, ownership-scope); `query`/`action` primitives with revalidation; the meta-framework laws from Next/SvelteKit docs (declare rendering intent, middleware ≠ authorization, DTO the payload) transfer intact.

## Testing & security pointers

- Testing: Vitest + @solidjs/testing-library, philosophy per `react/testing.md`; the trap list from Svelte (flush timing — effects are scheduled, await microtasks) applies. Solid's `testEffect` helper for asserting reactive flows.
- Security: JSX escapes text; `innerHTML` prop is the raw hatch (one SafeHtml wrapper, DOMPurify, grep-expects-one — the universal policy); URL/spread sinks per `react/security.md`.

## War story — the destructure that froze a dashboard

Team ported a React dashboard to Solid for performance; two weeks in, "props randomly don't update." Every broken component destructured props (`const { data } = props`) — muscle memory from React, where destructuring is idiomatic *because* the whole function re-runs. In Solid nothing re-runs; the destructure ran once, captured once, froze forever. The fix was mechanical (eslint-plugin-solid's `no-destructure` — turn it on before writing a line); the lesson wasn't: **frameworks with identical-looking JSX have opposite execution models, and the porting bugs live exactly in the idioms that *look* transferable.** Half of `react/common-pitfalls.md` doesn't exist in Solid; a new class (access-time discipline) replaces it. Learn the execution model, not the syntax.
