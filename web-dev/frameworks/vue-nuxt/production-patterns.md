# Vue / Nuxt — Production Patterns

**Applies to:** Vue 3.5+ (Composition API + `<script setup>`), Nuxt 3.x–4. **Date:** 2026-07-06.
**Mental model prerequisite:** `vue-nuxt/from-scratch.md` — track/trigger reactivity; this doc assumes it.

## Vue-side rules

- **Composition API + `<script setup>` everywhere new.** Options API is fine legacy, but mixing styles per-file is how a codebase becomes two codebases. Composables (`useX()`) are the reuse unit — same role, same design care as React custom hooks (`react/production-patterns.md`): capability-named, evolvable return shape.
- **State taxonomy — identical to React's** (`react/production-patterns.md` §state), with the local dialect: server state → **TanStack Query (Vue)** or Nuxt's `useAsyncData`/`useFetch`; URL state → route query; shared client state → **Pinia** (small, typed stores — one per domain, not one giant store); local state → `ref`/`reactive` in the component.
- **`ref` vs `reactive`:** default to `ref` for everything. `reactive` can't hold primitives, can't be reassigned wholesale, and loses reactivity on destructure (from-scratch §2's `track`-requires-property-access rule). One primitive (`ref`) means one set of habits; teams that mix both by mood produce the §1 pitfall constantly.
- **`computed` for derivation, never watcher-sets-state.** `watch(a, () => b.value = f(a.value))` is the React "useEffect-to-sync" anti-pattern (`react/common-pitfalls.md` §3) wearing a Vue costume — same double-update, same drift. Watchers are for *side effects* (analytics, imperative APIs, debounced server calls); prefer `watchEffect` only when deps are genuinely dynamic, and always handle cleanup via `onCleanup` for the fetch-race reasons in `vue-nuxt/concurrency.md`.
- **Props down, events up, `defineModel` for two-way sugar.** Mutating props is reactivity-graph vandalism (and Vue warns); `provide/inject` is for library-ish deep context (form ↔ field), typed with `InjectionKey`, not a Pinia substitute.

## Nuxt-side rules

- **Data fetching:** `useFetch`/`useAsyncData` for SSR-transferred data (fetch on server, serialize, no client refetch — the payload dedupe is the framework's core value). Key them explicitly and stably; auto-keys derived from file/line break on refactor and cause cache collisions. `$fetch` alone inside event handlers (post-load mutations); TanStack Query for rich client-side cache needs (mutations + invalidation graphs).
- **Server routes (`server/api/*`, Nitro/h3):** treat exactly as `frameworks/node/security.md` handlers — Zod-validate (`readValidatedBody`), authorize per-handler, ownership-scope queries. Nuxt server routes are a Node backend; all of `frameworks/node/` applies, including module-scope state leaks (`node/concurrency.md` §1) — Nitro serves concurrent users from one process.
- **Rendering strategy per route** via `routeRules` — the Nuxt equivalent of Next's per-segment declaration, same decision tree as `nextjs/production-patterns.md`: `prerender` for marketing, `swr`/`isr` TTLs for content, default SSR for personalized, `ssr: false` only for truly app-only routes (and know that disables the SEO/LCP benefits you paid for).
- **Auto-imports:** convenient and hostile to grep/review at scale. Keep them for Vue/Nuxt built-ins; for your own composables past ~20, prefer explicit imports (`imports.autoImport: false` is a legitimate large-team choice). Un-greppable dependencies are un-auditable dependencies — the same argument as `react/production-patterns.md` boundary enforcement.
- **Plugins/middleware:** Nuxt route middleware is UX gating, not authorization — the Next middleware lesson (`nextjs/security.md` §3) applies verbatim: authorize in the server handler that touches data.
- **Payload discipline:** everything returned from `useAsyncData` is serialized into the page payload. Select DTOs server-side (`pick`/`transform` options) — shipping whole DB rows is the Next §2 leak *plus* a payload-size performance tax. Audit `_payload.json` sizes in CI; > ~100KB payloads are a smell worth a build failure.

## The default stack (2026)

| Concern | Default |
|---|---|
| Build | Vite (Nuxt bundles it) |
| State | Pinia + TanStack Query (Vue) / Nuxt data layer |
| Forms | vee-validate + Zod (or Formkit) |
| Components | Radix Vue / Reka UI primitives (a11y — `principles/accessibility.md`) |
| Tests | Vitest + Vue Testing Library + Playwright + MSW (`vue-nuxt/testing.md`) |

## War story — the watcher web

Inherited Vue 2→3 migration: 40+ `watch`ers in one dashboard component, each setting state that other watchers watched. Update order depended on registration order; a Vue minor changed flush timing subtly and three KPIs started showing the previous filter's data — sometimes. Nobody could say what the component's state *should* be for a given input, because the answer was "whatever the watcher cascade converges to." The rewrite: every derived value became `computed` (pure, ordered by the dependency graph automatically — the from-scratch §3 machinery), watchers dropped to two (both genuine side effects). Diff: −600 lines, bug unreproducible-by-construction. **Rule that generalizes:** if you can't state a component's state as a pure function of its inputs, you don't have state management, you have state *weather*.
