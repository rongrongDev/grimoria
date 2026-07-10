# Svelte / SvelteKit — Production Patterns

**Applies to:** Svelte 5 (runes), SvelteKit 2. **Date:** 2026-07-06.
**Mental model prerequisite:** `svelte-sveltekit/from-scratch.md` (signals + compiler).

## Svelte-side rules

- **Runes everywhere new; don't mix eras.** Svelte 5 supports legacy (`$:`, stores-as-`$store`) per component for migration — treat mixed files as migration debt with a burn-down list, not a permanent style. `$derived` replaces most `$:`; `$effect` replaces the rest *only when it's a genuine side effect* — the derivation-vs-effect discipline is the same law as React (`react/common-pitfalls.md` §3) and Vue (watcher war story): **if `$effect` writes state, you almost certainly wanted `$derived`.** Svelte even throws on some `$effect`-writes-`$state` loops; listen to it.
- **Shared state:** module-scope `$state` in a `.svelte.js`/`.svelte.ts` file is the idiomatic store now (`export const cart = $state({ items: [] })`) — typed, fine-grained, no library. Classic `writable` stores remain fine for streams/interop. **But:** module-scope state is per-process — it must never hold per-user data in SSR-executed code (see concurrency delta §3; SvelteKit runs your modules on the server).
- **Props:** `let { value = 0, onchange } = $props()` — callback props over `createEventDispatcher` (deprecated direction); `$bindable` sparingly (two-way binding is a coupling decision, same argument as Vue's `defineModel`).
- **Snippets** (`{#snippet}`/`{@render}`) are the composition primitive replacing slots — use them the way `react/production-patterns.md` uses children-composition: pass content, not config props.
- **Keys on `{#each}`** — `(item.id)`, always, for the from-scratch/React reasons (the compiler can't save you from list identity).

## SvelteKit-side rules

- **Data flows through `load`.** Universal `load` (`+page.js`) runs server *and* client — no secrets, no Node APIs; server `load` (`+page.server.js`) for anything touching db/secrets. The classification mistake (secret work in universal load) is the SvelteKit equivalent of the `NEXT_PUBLIC_` leak — the file naming *is* the security boundary; teach it that way.
- **Parallelize in `load`:** return promises for non-critical data (streaming — SvelteKit awaits top-level, streams nested promises) and `Promise.all` the critical ones; `await event.parent()` *after* your own independent fetches, or you serialize the layout chain (the `principles/performance.md` waterfall, SvelteKit spelling).
- **Use `event.fetch` in `load`**, not global fetch: it forwards cookies, resolves relative URLs, dedupes into the SSR payload (the request that skips the client refetch).
- **Mutations = form actions** (`+page.server.js` `actions`) with `use:enhance` for progressive enhancement — a SvelteKit form works before hydration, which is a genuinely differentiating resilience/perf property; don't throw it away by fetch-ing everything. Validate every action with Zod (actions are public endpoints — the `nextjs/security.md` §1 rules, SvelteKit spelling); return `fail(400, data)` for repopulation.
- **Invalidation model:** after actions, SvelteKit re-runs relevant `load`s automatically; for finer control `depends('app:cart')` + `invalidate('app:cart')`. This replaces most client cache libraries for page-level data — add TanStack Query (svelte) only for genuinely live/interactive client caches, same boundary as Nuxt (`vue-nuxt/production-patterns.md`).
- **Rendering per route:** `export const prerender/ssr/csr` — same decision tree as `nextjs/production-patterns.md` §rendering. `adapter-node`/`adapter-vercel`/etc. chosen per target; with adapter-node you own the `frameworks/node/` operational surface (event loop, module-scope leaks, headers).
- **Hooks (`hooks.server.ts`):** the middleware slot — auth session resolution into `event.locals` (typed via `app.d.ts`), security headers, logging. Same law as Next/Nuxt: hooks *resolve* identity; **authorization happens in each server `load`/action that touches data** (`nextjs/security.md` §3's CVE lesson is framework-portable).

## The default stack (2026)

| Concern | Default |
|---|---|
| State | Runes + module `$state`; TanStack Query (svelte) for live client caches |
| Forms | Form actions + `use:enhance`; superforms + Zod when forms get rich |
| Components | Bits UI / Melt (headless, a11y — `principles/accessibility.md`) |
| Tests | Vitest + Testing Library (svelte) + Playwright (`svelte-sveltekit/testing.md`) |

## War story — the store that was everyone's cart

A SvelteKit shop kept the cart in a module-scope writable store, imported by header and checkout. Perfect locally. In production (adapter-node, SSR), the store lived once *per server process*: user A adds an item; user B's SSR render reads A's cart into their HTML. Sporadic, load-dependent, reported as "I saw someone else's items" — the exact cross-request leak of `nextjs/concurrency.md` §1, arrived at through Svelte's most idiomatic-looking pattern, which is what makes it vicious: nothing about `export const cart = writable([])` *looks* like a server bug. Fix: per-user state flows through `load`/`locals`/cookies; module state holds only global constants and per-process infrastructure. The grep (`export (const|let).*\b(writable|\$state)\(` in universally-imported modules) went into their CI and belongs in yours.
