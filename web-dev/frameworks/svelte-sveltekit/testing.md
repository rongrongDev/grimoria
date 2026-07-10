# Svelte / SvelteKit — Testing Delta

**Read first:** `principles/testing.md`; philosophy from `react/testing.md` applies (user-facing queries, MSW at network, no tree snapshots). **Applies to:** Svelte 5, SvelteKit 2; Vitest (browser mode where noted), @testing-library/svelte, Playwright, MSW 2. **Date:** 2026-07-06.

## Layer map (SvelteKit edition)

| Target | How |
|---|---|
| Rune logic in `.svelte.ts` modules, form schemas, utilities | Vitest unit — **note:** rune-using files need the `.svelte.ts` suffix and Svelte's Vitest plugin so `$state`/`$derived` compile; effects need `flushSync` or a microtask await (from-scratch §1 batching) |
| Components + interaction | @testing-library/svelte; Svelte 5 works in jsdom, but **Vitest browser mode is the better default here** — Svelte's compiled output touches real-DOM behaviors (transitions, bindings) that jsdom stubs poorly |
| Server `load` / form actions / hooks | Direct function invocation with a mocked `event` (see below) — the highest-value SvelteKit-specific layer, same argument as Next actions (`nextjs/testing.md`) |
| API routes (`+server.ts`) | Call `GET/POST` with a `Request`, assert the `Response` (`node/testing.md` shape) |
| Routing, streaming, progressive enhancement, hydration | Playwright vs `vite build && vite preview` (never dev server — same rule and reason as `nextjs/testing.md` trap 1) |

## Testing `load` and actions directly

```ts
test('action rejects other org\'s order', async () => {
  const event = makeEvent({                       // one shared factory: locals, cookies, request
    locals: { session: { userId: 'u1', orgId: 'A' } },
    request: formRequest({ id: orderInOrgB.id, qty: '2' }),
  });
  const result = await actions.update(event);
  expect(result.status).toBe(403);                // the wrong-user test, principles doc
  expect(await db.order.find(orderInOrgB.id)).toMatchObject({ qty: 1 });
});
```

Build `makeEvent` once, in a shared test util, mirroring your `app.d.ts` `Locals` — per-file ad-hoc event mocks drift (the providers-wrapper argument from react/testing.md). Required cases per action: happy, malformed-FormData rejection, wrong-user, and redirect/fail branches (`redirect()` and `fail()` *throw/return* — assert both styles correctly: `expect(fn).rejects` for redirects).

## Svelte-specific traps

1. **Effects don't run on write, they run on flush** — after `user.click`, Testing Library awaits for you; after direct `$state` pokes in unit tests, `flushSync()` (svelte) or await a tick. The Vue `nextTick` trap (§vue-nuxt/testing.md trap 1) with a Svelte spelling.
2. **Progressive enhancement is a test target, not a footnote:** one Playwright project with `javaScriptEnabled: false` covering the money-path form actions verifies the no-JS path SvelteKit gives you (production-patterns §mutations) still works — it regresses silently the day someone swaps a form action for an `onclick` fetch.
3. **Transitions/animations:** disable globally in test config (flake source — principles §flaky big four); assert end-states, not mid-flight frames.
4. **Streamed `load` promises:** in Playwright, assert the shell renders before the deferred section (loading state is a requirement, `nextjs/testing.md` trap 4); in unit tests, remember nested promises in `load` returns need explicit awaiting in assertions.
5. **Hydration canary:** one e2e smoke asserting no hydration-mismatch console errors on key routes — cheap detector for the whole `common-pitfalls.md` §9/nondeterminism family (same two-line canary as Nuxt).
