# React — Concurrency Delta

**Read first:** `principles/concurrency.md` (the general catalog). This doc is only what React adds or renames. **Applies to:** React 19.x. **Date:** 2026-07-06.
**Operationalized by:** the `react-code-reviewer` skill.

## 1. Stale closures — React's signature bug

Every render creates new functions closing over *that render's* props/state (you built this in `from-scratch.md` Step 3 — the component body closes over the value; the setter closes over the slot). Anything that outlives the render — timers, subscriptions, event listeners, resolved promises — may run with old values.

```jsx
// BUG: logs 0 forever — the interval closure captured render #1's `count`
useEffect(() => {
  const id = setInterval(() => console.log(count), 1000);
  return () => clearInterval(id);
}, []); // lied about deps to "run once"
```

- **Detection:** `eslint-plugin-react-hooks` `exhaustive-deps` as an **error**, not warning. Every suppression comment is a filed IOU for this bug.
- **Fix, in order of preference:** (a) functional updates `setCount(c => c + 1)` when the closure only needs to *update*; (b) include the dep and let the effect re-subscribe; (c) `useEffectEvent` (stable-identity event reading latest values — React 19.2+) or the ref-mirror pattern for "subscribe once, read fresh."
- **Prevention:** lint-as-error + the review question "what does this callback see when it finally runs?"

## 2. Out-of-order fetches in effects

The typeahead race (`principles/concurrency.md` §1) in its React costume:

```jsx
useEffect(() => {
  fetch(`/api/search?q=${query}`).then(r => r.json()).then(setResults); // stale response lands late, wins
}, [query]);
```

**Fix — the canonical effect shape.** If you must fetch in an effect (you usually shouldn't — next point), cancellation is not optional:

```jsx
useEffect(() => {
  const ac = new AbortController();
  fetch(`/api/search?q=${query}`, { signal: ac.signal })
    .then(r => r.json())
    .then(setResults)
    .catch(e => { if (e.name !== 'AbortError') setError(e); });
  return () => ac.abort();          // cleanup runs before the next effect AND on unmount:
}, [query]);                        // exactly one live request at a time, by construction
```

**Real fix:** `useQuery({ queryKey: ['search', query] })` — keyed caching makes the race structurally impossible and deletes the boilerplate. Team rule from `react/production-patterns.md`: no hand-rolled fetch-into-state.

The same cleanup-cancels-setup shape solves setState-after-unmount and subscription leaks (`principles/concurrency.md` §7).

## 3. Renders can run and be discarded

Concurrent React (transitions, Suspense, StrictMode double-render in dev) may execute your component and throw the result away, or run effects setup→cleanup→setup. Consequences:

- **Render must be pure.** No mutation of external state, no logging-as-side-effect, no `analytics.track` in the body. A discarded render's side effects still happened; a replayed render's happened twice.
- **Effects must be idempotent-with-cleanup.** StrictMode's dev double-invoke is not a bug to silence — it's a fuzzer for exactly this. The team that "fixed" StrictMode by removing it shipped the duplicate-WebSocket-connection bug to prod three sprints later; every message handler fired twice, and the duplicate *writes* made it a data incident, not a perf quirk.
- **Detection:** keep StrictMode on in dev, period.

## 4. Double-submit

General treatment (idempotency keys, server dedupe): `principles/concurrency.md` §3. React-side:

- `useMutation`'s `isPending` (or React 19 `useActionState`'s pending flag / `useFormStatus`) drives `disabled` — don't hand-roll a `submitting` boolean with `useState`; you'll forget the error path and the button bricks after a failure.
- Form Actions in React 19 serialize submissions per-form automatically — still send the idempotency key; the client can't dedupe two tabs.

## 5. Transitions & `useDeferredValue` — concurrency you opt into

- Wrap **state updates that trigger expensive re-renders** in `startTransition` so typing/clicking stays responsive: input value updates urgently, the 5,000-row filter result renders at low priority and can be interrupted.
- `useDeferredValue(query)` — same idea when you don't own the setState.
- These fix **render-cost** jank only. They do nothing for network races (§2) or slow effects. Misapplied transitions are the new misapplied `useMemo`: measure INP first (`principles/performance.md`).
- `useOptimistic` (React 19) for optimistic UI inside actions — it auto-reverts on settle, avoiding the snapshot-rollback races of `principles/concurrency.md` §4.

## Review checklist (what the skill greps for)

1. `useEffect` containing `fetch`/subscription with no cleanup or no `AbortController` → §2.
2. `eslint-disable.*exhaustive-deps` → §1; demand the functional-update or `useEffectEvent` rewrite.
3. `setInterval`/`addEventListener` in effects reading state without functional update/ref → §1.
4. Side effects in render body (mutations, tracking calls, `Date.now()` fed into state initialization per render) → §3.
5. Submit handlers without a pending-disable AND no idempotency key → §4.
6. Hand-rolled `isMounted` refs → replace with AbortController cleanup (the `isMounted` pattern hides the leak instead of fixing it — the request still runs).
