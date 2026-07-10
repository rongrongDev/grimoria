# Solid — Common Pitfalls (Extended Tier)

**Applies to:** Solid 1.9. **Date:** 2026-07-06.
Most pitfalls derive from one fact: **components run once** (`solid/production-patterns.md`).

## 1. Destructuring props / early signal reads
The war story pitfall: `const { user } = props` or `const c = count()` at component scope = frozen values. **Fix:** access late (`props.user`, `count()` at use site), `splitProps` for forwarding. **Prevent:** eslint-plugin-solid (`solid/reactivity`, `no-destructure`) as errors, day one.

## 2. Reading signals outside tracking scopes and expecting reactivity
Event handlers, timers, and plain module functions aren't tracked (only JSX bindings, effects, memos are — the `activeReaction` rule you built in the Svelte guide). A `setInterval` reading `count()` gets fresh values (access-time!) but *changing* what the interval does requires the effect to re-run — restructure so the reactive part lives in `createEffect`.

## 3. `.map()` / ternaries instead of `<For>` / `<Show>`
Naked `.map()` recreates all nodes per change (no keyed diff); ternaries recreate branches per toggle. `<For>` (identity-keyed), `<Index>` (position-keyed — primitives), `<Show>` (cached branches). Choosing `<For>` vs `<Index>` wrong = Solid's index-key bug: `<Index>` over objects patches the wrong rows' fields on reorder.

## 4. Setting signals during render / circular effects
Writing a signal inside the component body (runs at mount, mid-creation) or effects writing what they read (the infinite-loop guard from your from-scratch build — Solid batches and warns, but the design smell stands): derivation belongs in `createMemo`, the universal derive-don't-sync law (`react/common-pitfalls.md` §3).

## 5. Store mutation outside `setStore`
`store.items.push(x)` mutates without notifying (stores track through the setter's path syntax / `produce`). Same physics as React's `Object.is` bail-out (`react/from-scratch.md` §3) with a different API: the write must go through the instrumented channel.

## 6. Resource misuse: unkeyed or hand-rolled
`createResource(fetcher)` without a reactive *source* never refetches when inputs change; fetch-in-`createEffect` re-owns the out-of-order race manually. Source-keyed resources or TanStack Query — `principles/concurrency.md` §1's structural fix, Solid spelling.

## 7. Module-scope signals in SSR code
Beautiful client pattern, cross-request leak on the server (SolidStart) — the `node/concurrency.md` §1 / SvelteKit-cart class. Per-user state through request context; module signals for client-only or truly-global data.

## 8. Missing `onCleanup` in effects that subscribe/listen
Interval/websocket/observer created in `createEffect` without `onCleanup` → re-run stacks another one (and unmount leaks) — the init/teardown class (`principles/concurrency.md` §7). Every effect that acquires must release in `onCleanup`, same line it was acquired.

## 9. Treating Suspense/ErrorBoundary as optional
Resources integrate with `<Suspense>`; without boundaries, loading states flash unstyled and thrown fetch errors vanish upward. Boundary pairing per layout seam — the React rule (`react/production-patterns.md` §data) transfers verbatim.

## 10. Porting React performance rituals
`useCallback`-style wrapper memos, `memo`-equivalent component wrapping, dependency arrays out of habit — all no-ops or noise in Solid (fine-grained tracking already did it; there are no deps arrays because tracking is automatic — the trade you mapped in `vue-nuxt/from-scratch.md` §2). Porting *rituals* instead of models adds code that does nothing and misleads reviewers.
