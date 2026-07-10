# Next.js — Testing Delta

**Read first:** `principles/testing.md`, then `frameworks/react/testing.md` (client components test exactly as described there). This doc: what App Router changes. **Applies to:** Next.js 15–16, App Router; Vitest, Playwright, MSW 2. **Date:** 2026-07-06.

## The structural shift: the unit-testable surface moved server-side

Async Server Components don't render meaningfully in jsdom (no stable unit-test story for `async` RSC — Vercel's own guidance is e2e). Don't fight it; re-slice the layers:

| Target | How to test | Notes |
|---|---|---|
| Data/query functions (`lib/queries/*`) | Vitest unit/integration with Testcontainers DB | Extract logic *out* of page components precisely so this layer exists |
| Server Actions | Direct invocation as functions in Vitest | The highest-value Next-specific tests — see below |
| Client components | Testing Library + MSW (react/testing.md verbatim) | |
| Route handlers | Call the handler with a `Request`, assert on the `Response` | They're plain functions: `await GET(new Request(url))` |
| Pages/layouts/streaming/caching behavior | Playwright against `next build && next start` | Not `next dev` — dev mode's caching semantics differ from prod, and cache bugs are the #1 Next failure mode |
| Middleware | Unit-test the pure logic extracted from it; e2e the redirect behavior | |

The RSC *composition* (does the page wire the right data into the right components) is exactly what e2e is uniquely good at — a handful of Playwright specs per key route cover what component tests structurally can't.

## Testing Server Actions — the pattern

Actions are functions; test them as the public endpoints they are (`nextjs/security.md` §1):

```ts
// Mock next's request-context modules once in setup:
vi.mock('next/headers', () => ({ cookies: () => mockCookies, headers: () => new Headers() }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

test('rejects other org\'s order', async () => {
  mockSession({ userId: 'u1', orgId: 'A' });
  const result = await updateOrder(undefined, formDataFrom({ id: orderInOrgB.id, qty: 2 }));
  expect(result).toMatchObject({ ok: false });            // the wrong-user test, principles doc
  expect(await db.order.find(orderInOrgB.id)).toMatchObject({ qty: 1 }); // and the DB didn't move
});
```

Required per action: happy path, validation rejection (malformed FormData — remember it's attacker-reachable), **wrong-user 403 path**, and revalidation called with the right tag. That last one catches the "my edit didn't save" cache bug at unit cost instead of e2e cost.

## Next-specific traps

1. **Testing against `next dev`** — dev disables/alters caching and prerendering; your cache-behavior e2e passes in dev and the prod bug ships. CI must run `next build && next start`. (The build's static/dynamic route table is itself an assertable artifact — snapshot it; an unexpected `○`→`ƒ` flip or vice versa is a regression, see production-patterns war story.)
2. **`next/navigation` in component tests** — client components using `useRouter`/`useSearchParams` need the router mocked (`vi.mock('next/navigation')` with a shared helper) or wrapped; centralize this in the one AppProviders test wrapper (react/testing.md) rather than per-file copy-paste that drifts.
3. **MSW and server-side fetches:** MSW's Node interception covers `fetch` from RSC/actions in Vitest — but in Playwright-vs-real-server tests, the *server's* outbound calls bypass browser-level mocks. For e2e, point the app at a stub upstream via env (or MSW's server in the Next process via `instrumentation.ts` in a test profile). Decide this consciously; teams discover it mid-flake.
4. **Suspense/streaming assertions:** Playwright's auto-waiting handles popping-in content, but assert *fallbacks* deliberately (`expect(page.getByTestId('skeleton'))` before the slow region resolves) when the loading experience is a requirement — CLS from bad fallbacks is a real regression class (`principles/performance.md`).

## CI shape

PR: Vitest (queries, actions, client components) + `next build` (type errors, route table diff) — inside the 10-minute budget. Merge/nightly: Playwright suite against built app with Testcontainers Postgres + stub upstreams; Lighthouse-CI budgets on the top routes (`principles/performance.md` gates).
