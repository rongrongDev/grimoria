# Svelte / SvelteKit — Common Pitfalls

**Applies to:** Svelte 5 (runes), SvelteKit 2. **Date:** 2026-07-06.
Mechanisms provable from `svelte-sveltekit/from-scratch.md`.

## 1. Reactivity loss by copying
`const items = cart.items` / passing `count` (the value) into a helper / destructuring `$props()` into plain lets that you then expect to update. The compiler rewrites accesses to the *declared reactive binding* (from-scratch §2); a copy is inert. **Fix:** access through the original binding, pass getters (`() => cart.items`), or pass the whole reactive object. Same disease as Vue §1; different infection route (compiler instead of Proxy).

## 2. `$effect` as a state synchronizer
`$effect(() => { total = price * qty })` — you wanted `$derived(price * qty)`. Effect-sync causes the same double-update drift as React §3/Vue §5, plus Svelte-specific infinite-loop errors when the effect writes what it (transitively) reads. Rule: values derive; effects touch the *outside world* (DOM measurements, analytics, imperative libs).

## 3. Legacy/runes era mixing
`$:` reactive statements silently don't track rune state the way you assume, `export let` props in one file and `$props()` in the next — each file is internally consistent but the team's mental model isn't. Policy per production-patterns: runes for new, migration burn-down for old, no per-mood mixing.

## 4. Module-scope state on the server
The war story (production-patterns): module `$state`/`writable` holding per-user data = cross-user leak under SSR. Grep universally-imported modules for exported mutable state; per-user data flows through `load`/`locals`.

## 5. Secret work in universal `load`
`+page.js` runs in the browser too — db clients crash builds if you're lucky, API keys ship to the client if you're not. The file suffix (`.server.`) is the security boundary: anything with secrets/db/Node APIs goes server-side, full stop (`svelte-sveltekit/security.md`).

## 6. `load` waterfalls
`await event.parent()` first, sequential awaits for independent data, forgetting streaming for slow secondary content — TTFB stacks up per the `principles/performance.md` waterfall section. Fix pattern in production-patterns §parallelize.

## 7. Fetch-in-`onMount` for page data
Skips SSR, adds a spinner for data the server had, reintroduces the race class the `load` layer already solved (abort-on-navigation is built in there). `onMount` fetching is for genuinely client-only, post-load data — same boundary as Nuxt pitfall §6 and Next pitfall §3; every meta-framework has this pitfall because every team tries to SPA their way around the framework.

## 8. Unkeyed `{#each}` (or keyed by index)
List DOM state shifts on reorder/removal — the mechanism you proved in `react/from-scratch.md` Step 5's failing test; the compiler's fine-grained updates don't exempt list identity. `{#each items as item (item.id)}`.

## 9. Mutating `$state` across the serialization boundary
Returning reactive proxies from server `load` (they serialize as plain data — fine) then assuming client mutations sync back, or sticking non-POJO classes into `load` returns (devalue serialization errors at runtime). `load` returns *data*; interactivity is client-declared state seeded from it.

## 10. `use:enhance` skipped, or replaced with hand-rolled fetch forms
Loses progressive enhancement (the pre-hydration-working form — a real availability property under slow networks/JS failures), loses SvelteKit's built-in pending/error handling, re-owns double-submit manually (`principles/concurrency.md` §3). Form actions + enhance is the default; deviations need a reason in the PR.

## 11. `browser` checks instead of proper file placement
`if (browser) { … }` sprinkled through shared code is the smell of server/client boundary confusion — usually a §5 or §7 in the making. The framework gives you *files* for the split (`.server.`, `+page.svelte` vs `+page.server.js`, `onMount`); use structure, not conditionals.
