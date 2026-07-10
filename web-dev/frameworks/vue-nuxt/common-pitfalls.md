# Vue / Nuxt — Common Pitfalls

**Applies to:** Vue 3.5+, Nuxt 3.x–4. **Date:** 2026-07-06.
Each pitfall's mechanism is provable from `vue-nuxt/from-scratch.md`.

## 1. Reactivity loss — the umbrella pitfall
All four spellings are the same bug (`track` requires a property read inside an effect; a copied value is just a value):
- `const { count } = state` (destructure) → use `toRefs(state)` / `storeToRefs(store)` for Pinia.
- Passing `state.count` into a function that expects to *react* → pass the ref, or a getter `() => state.count`.
- `let x = ref(0); x = ref(1)` reassigning the container instead of `.value`.
- Spreading a reactive object into a new one (`{...state}`) and expecting the copy to update.
**Detect:** "UI doesn't update but the data is right in devtools" — 90% odds it's this. eslint-plugin-vue catches some spellings.

## 2. `.value` in the wrong place
Forgetting `.value` in script (silently comparing/serializing the ref object — `if (loading)` is always truthy!), or writing `.value` in templates (auto-unwrapped there). The `if (someRef)` truthiness bug ships to production regularly because it *runs* without error. **Prevent:** TypeScript (`Ref<boolean>` vs `boolean` misuse fails typecheck) — this is a top-three argument for strict TS in Vue codebases.

## 3. Mutating props / `reactive` prop copies
Child mutates a prop object — works (shared reference!), then breaks mysteriously when the parent passes a fresh object. Or copying a prop into `reactive` at setup and wondering why prop updates stop arriving (same one-time-read as `react/common-pitfalls.md` §7 — the frameworks share this bug shape exactly). **Fix:** `defineModel` for two-way intent; `computed` wrapping the prop for derived; explicit `watch` if you truly need a resettable draft.

## 4. `v-if` with `v-for` on the same node, and index keys
`v-for` + `v-if` on one element: precedence changed between Vue 2 and 3 — banned by lint for that reason. Index keys: identical DOM-state-shifting failure as React (`react/common-pitfalls.md` §2 — the from-scratch keyed-diff test proves it); Vue's differ needs stable keys just as much.

## 5. Watcher cascades and `watch` with `immediate`/`deep` sprinkled until it works
The war story in `vue-nuxt/production-patterns.md`. Deep watchers on big objects are also a performance trap (full traversal per trigger). **Rule:** derivation = `computed`; side effect = shallow watcher on the narrowest source (watch a getter `() => obj.field`, not `obj` with `deep`).

## 6. Nuxt: fetching in the wrong lifecycle
`$fetch` in setup directly (runs on server AND client — double fetch, hydration mismatch), or `useFetch` inside event handlers (it's a composable, setup-only), or `onMounted` fetching for SSR-visible content (kills the SSR benefit; content pops after hydration). **Rule:** setup + `useFetch`/`useAsyncData` for render data; `$fetch` in handlers for interactions.

## 7. Nuxt: hydration mismatches from non-deterministic render
`Date.now()`, locale formatting, `Math.random()`, browser-only branching in templates (`process.client` conditionals changing structure) → server/client trees differ → Vue patches over, styles/handlers land on wrong nodes downstream. Same physics as `principles/performance.md` §hydration. **Fix:** `<ClientOnly>` for genuinely client-only islands; compute non-deterministic values once server-side and transfer; `useState` (Nuxt's SSR-safe state) instead of module-scope or `ref` created at module top-level.

## 8. Nuxt: module/plugin state shared across requests
`ref` or plain object at module scope in server-executed code = cross-request leak (`nextjs/concurrency.md` §1, `node/concurrency.md` §1 — same career-limiting bug, Nitro flavor). Nuxt's `useState` exists precisely to give per-request-then-hydrated state. **Grep:** top-level `ref(`/`reactive(` in composables/plugins that run server-side.

## 9. Auto-import roulette
A composable shadowing a built-in name (or two modules exporting `useUser`) silently resolves to the wrong one; refactors change resolution without any diff at call sites. See production-patterns §auto-imports for the policy fix.

## 10. Giant Pinia store as the new Vuex god-object
One `useAppStore` holding auth+cart+ui+cache defeats code-splitting (every route imports everything) and makes every mutation a suspect in every bug. Per-domain stores; server-cache data stays in the query layer, not copied into Pinia (double source of truth = the sync bugs of `react/common-pitfalls.md` §3/#7).
