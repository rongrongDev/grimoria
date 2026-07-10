# Vue / Nuxt — Testing Delta

**Read first:** `principles/testing.md`; the React testing doc's *philosophy* section (`react/testing.md`) applies verbatim — user-facing queries, userEvent-style interaction, MSW at the network, no snapshots-of-trees. This doc: Vue/Nuxt mechanics only. **Applies to:** Vue 3.5+, Nuxt 3.x–4; Vitest, @testing-library/vue, @vue/test-utils, @nuxt/test-utils, MSW 2, Playwright. **Date:** 2026-07-06.

## Tool selection

- **Components:** `@testing-library/vue` (behavior-facing) as the default; drop to `@vue/test-utils` only when you genuinely need wrapper internals (emitted events assertions, slot plumbing in library components). Mixing freely per-test is fine; mixing *philosophies* (asserting `wrapper.vm.internalRef`) recreates the hollow-suite failure.
- **Composables:** pure ones → call them in a test `effectScope`; lifecycle-dependent ones → mount a host component or use `withSetup` helper. Test composables that encode business rules; composables that just wrap a fetch are covered by component tests over MSW.
- **Pinia:** `createTestingPinia()` for component tests (auto-stubbed actions, seedable state); real Pinia + MSW for integration-style tests of store logic itself. Store getters with logic = unit-test targets (the Stryker layer from `principles/testing.md`).
- **Nuxt:** `@nuxt/test-utils` gives you (a) `mountSuspended` for components needing the Nuxt context (auto-imports, `useFetch`), and (b) e2e mode (`setup()` + `$fetch`) that boots a real built Nuxt server — the equivalent of the "test `next build`, not dev" rule (`nextjs/testing.md` §trap 1) and used the same way. Server routes (`server/api`) are h3 handlers — test them directly as functions per `frameworks/node/testing.md`.

## The Vue-specific traps

1. **`await nextTick()` — or async assertion — after every state change.** You built the reason in `from-scratch.md` §4: DOM updates flush in a microtask. Testing Library's `findBy*` absorbs this; raw `wrapper.text()` immediately after a mutation reads the old world. Flaky-looking Vue tests are usually just missing this await — fix the await, don't add retries (principles doc §flaky).
2. **Reactivity loss reproduces in tests** — a test seeding a destructured copy passes while the real binding is broken, or vice versa. Seed state through the same path production uses (props, store, provide), not by poking `wrapper.vm`.
3. **Stubbed children hide slot/emit contracts.** `shallow: true` by default turns integration tests into "renders some stub names" — the snapshot-hollow failure. Stub only heavyweight boundaries (charts, maps, `<ClientOnly>` innards).
4. **Teleport/Suspense:** components using `<Teleport>` need the target in the test DOM (or stub teleport); async setup components must be mounted inside `<Suspense>` (or `mountSuspended` in Nuxt) — otherwise silent empty renders that "pass."
5. **Hydration-dependent bugs don't reproduce in jsdom mounts** — jsdom tests client-render only. The `common-pitfalls.md` §7 mismatch class needs the Nuxt e2e mode (real SSR + real hydration) or Playwright against a built app; put one "no hydration warnings in console" assertion in your e2e smoke — it's a two-line canary for a whole bug family.

## What to test at which layer (Vue/Nuxt edition)

| Target | Layer/tool |
|---|---|
| Composables with logic, store getters/actions, form schemas | Vitest unit (Stryker scope) |
| Component + store + interaction | Testing Library + createTestingPinia + MSW |
| Nuxt server routes | Direct handler tests (node/testing.md) + wrong-user cases |
| Route-level flows, SSR/hydration behavior, payload size | @nuxt/test-utils e2e / Playwright vs built app |
| a11y states | vitest-axe on key component states |
