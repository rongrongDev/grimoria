# React — Testing Delta

**Read first:** `principles/testing.md` (layers, mutation testing, flakiness, contracts). This doc: React specifics only. **Applies to:** React 19.x; Vitest, Testing Library 16+, MSW 2, Playwright. **Date:** 2026-07-06.

## The stack and the stance

Vitest + `@testing-library/react` + `@testing-library/user-event` + MSW for component/integration; Playwright for e2e. The Testing Library discipline in one line: **test what the user perceives (roles, labels, text), not what the component contains (state, instances, CSS classes).** A test that queries `data-testid` on everything or asserts `component.state` breaks on refactor and misses real regressions — the hollow-suite failure mode from the principles doc.

```tsx
// Good: behaves like a user, asserts what a user sees
test('adds item to cart', async () => {
  const user = userEvent.setup();
  render(<Product id="42" />, { wrapper: AppProviders });
  await user.click(await screen.findByRole('button', { name: /add to cart/i }));
  expect(await screen.findByRole('status')).toHaveTextContent('1 item');
});
```

Rules embedded in those five lines, each earned by a flaky suite somewhere:

- **`userEvent`, not `fireEvent`** — fireEvent dispatches one synthetic event; userEvent simulates the real sequence (pointer, focus, keyboard), which is what catches "the handler is on mousedown but users tab+enter."
- **Role/name queries first** (`getByRole`, `getByLabelText`) — they double as a continuous a11y assertion. If you can't query it by role, a screen reader can't find it either (`principles/accessibility.md`). `getByTestId` is the escape hatch, not the default.
- **`findBy*`/`await` for anything async; never `waitFor(() => {})` with an empty body, never fixed sleeps.**
- **One providers wrapper** (`AppProviders`: QueryClient, router, theme) shared by all tests — per-test ad-hoc provider stacks drift from production wiring, and the drift is where bugs hide.

## Mock at the network with MSW — the React-specific payoff

Because server state should live in TanStack Query (`react/production-patterns.md`), mocking `useQuery` or the api module means testing a mock of a cache. MSW intercepts at the network layer, so the *real* query client, retries, and cache behavior run in tests:

```ts
export const handlers = [
  http.get('/api/cart', () => HttpResponse.json({ items: [] })),
];
```

Per-test override for error paths: `server.use(http.get('/api/cart', () => HttpResponse.error()))`. Type handlers from your OpenAPI schema (contract testing, principles doc) so mock rot can't happen silently. Test config: QueryClient with `retry: false` and `gcTime: Infinity` — default retries turn one failing-response test into a 15-second test.

## React-specific traps

1. **`act()` warnings are race reports, not noise to suppress.** They mean state updated outside a tracked flush — usually an unawaited async in the component or a missing `await` in the test. Fix the await; never wrap random things in `act()` until warnings stop (Testing Library already wraps correctly).
2. **Fake timers + userEvent deadlock:** `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` when using `vi.useFakeTimers()`, or user events hang.
3. **Testing custom hooks:** `renderHook` for genuinely reusable hooks; hooks that exist for one component are tested *through* that component.
4. **jsdom lies about layout.** Anything depending on sizes, IntersectionObserver, CSS visibility → jsdom returns zeros/undefined. Don't unit-test virtualized lists' windowing or "is it visible" logic in jsdom; that's Playwright's job (or Vitest browser mode, stable and worth adopting for component tests that touch layout).
5. **Snapshot tests of component trees are hollow-suite fuel** — they assert markup, fail on every intentional change, and get `--u`'d reflexively within a month. Allowed: small, reviewed snapshots of serialized *data* (a reducer result, a generated config).

## What to test at which layer (React edition)

| Target | Layer/tool | Notes |
|---|---|---|
| Reducers, selectors, form schemas, custom logic hooks | Vitest unit | This is where Stryker runs (principles doc) |
| Component + query + user interaction | Testing Library + MSW | The budget's center of mass |
| Route-level flows (loader + page + navigation) | Testing Library with router test harness, or Playwright | |
| Money paths, cross-browser, layout-dependent behavior | Playwright | Few, stable, `--repeat-each=10` before merge |
| a11y states | jest-axe on key component states | Catches the objective 30% |

## CI notes

- Vitest workspace: run unit/integration sharded; they should stay under the 10-minute PR budget from the principles doc.
- Playwright: trace on first retry (`trace: 'on-first-retry'`) — a flake without a trace is unfixable and will be retried into the quarantine graveyard.
- Component tests run against the **built** providers wrapper, not a parallel test-only universe: when someone swaps the QueryClient config in prod, tests must feel it.
