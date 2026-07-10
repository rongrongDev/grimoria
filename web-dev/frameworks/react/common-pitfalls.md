# React — Common Pitfalls

**Applies to:** React 19.x. **Date:** 2026-07-06.
**Format:** each pitfall = why it happens (usually provable from `from-scratch.md`), how it bites, the fix. Concurrency-class pitfalls (stale closures, fetch races, StrictMode) live in `react/concurrency.md`; this file is everything else.

## 1. Mutating state
`items.push(x); setItems(items)` — no render. You built the reason: `Object.is` bail-out in `from-scratch.md` Step 3. Worse than "no render": the mutation is *visible to everything sharing the reference*, so a later unrelated render shows the change and everyone blames that render. **Fix:** new references (`[...items, x]`), or Immer/`useImmer` for deep updates. **Prevent:** treat state as frozen (`Object.freeze` in dev helpers catches offenders loudly).

## 2. Index as key (or `Math.random()` as key)
`from-scratch.md` Step 5's `unkeyedOld[u++]` line, and its test, *prove* this one: index keys are positional matching, so insert/remove/reorder shifts every row's DOM-held state — inputs swap values, the wrong row animates, focus jumps. `Math.random()` keys are worse: everything unmounts and remounts every render. **Fix:** stable identity from the data. Index is acceptable only for never-reordered, never-filtered, stateless static lists — and lists have a way of gaining sorting later.

## 3. `useEffect` as a state synchronizer
`useEffect(() => setB(f(a)), [a])` — double render per change, a frame of inconsistent UI, and an invitation to circular updates. **Fix:** derive during render (`const b = f(a)`), memoize if expensive. If you're syncing *to* something external (DOM, subscription, analytics), fine — that's what effects are for. The smell is effect-sets-React-state-from-React-state. Deeper treatment: react.dev "You Might Not Need an Effect" — the most-linked doc in my review history.

## 4. Resetting state when props change — the missing `key`
"Edit form shows the previous user's data when I navigate between users": the component stayed mounted (same type, same position — you built that rule in `patch`), so state persisted. Teams "fix" it with the §3 anti-pattern. **Fix:** `<UserForm key={userId} />` — different key = different identity = fresh mount, by the differ's own rules.

## 5. Conditional / loop / early-return hooks
Hooks are order-indexed slots (from-scratch Step 3). A conditional hook shifts every subsequent index and state cross-wires — the error is thrown at a distance from the cause. **Fix:** hooks unconditionally at the top; branch *inside* the hook or after all hooks. Lint rules-of-hooks as error — also required for React Compiler to optimize the component at all.

## 6. Giant context, or context-as-store
One `AppContext` holding user+theme+cart+search re-renders every consumer on any change (see the war story in `react/production-patterns.md`). **Fix:** split contexts by change-frequency; keep values referentially stable (`useMemo` the provider value — this is a *semantic* memo, allowed under compiler policy); move high-frequency shared state to Zustand/Jotai which subscribe per-selector.

## 7. `useState` initialized from props (and never again)
`useState(props.value)` reads props **once** — the initial-value branch in the `useState` you wrote runs only when the slot is empty. Prop changes after mount do nothing, and the component now has two sources of truth. **Fix:** decide who owns the state. Controlled (parent owns: `value` + `onChange`) or uncontrolled with reset (`key`, pitfall #4). The half-controlled hybrid is the bug.

## 8. Effects with object/array/function deps re-running every render
Deps compare with `Object.is` per slot (you wrote the comparison). An inline `{}` or `[]` or arrow in deps is new every render → effect storms, resubscribe loops, fetch loops that hit rate limits. **Fix:** depend on primitives (`user.id`, not `user`); hoist static objects out of the component; `useMemo` for computed objects that must be deps.

## 9. Derived-state props copying (`getDerivedStateFromProps` nostalgia)
Copying props into state "so I can edit it" then fighting sync bugs. Same root cause as #7. **Fix:** edit a *draft* keyed to the entity (`key={id}` + `useState(() => toDraft(props.entity))`), submit the draft; or lift editing state up.

## 10. Layout thrash via effects: `useEffect` vs `useLayoutEffect`
Measuring DOM then setting state in `useEffect` paints the wrong frame first (flicker); doing heavy work in `useLayoutEffect` blocks paint (jank — `principles/performance.md` INP). **Rule:** `useLayoutEffect` only for read-DOM-then-synchronously-adjust (tooltip positioning, scroll restoration); everything else `useEffect`. If you're measuring for styling, check whether CSS (`anchor positioning`, container queries) has made the JS unnecessary — increasingly it has.

## 11. Prop drilling "fixed" with global state
Threading a prop three levels is annoying but *explicit*; reflexively globalizing it invisibly couples the tree. Try **component composition first** (pass the composed child down: `<Layout sidebar={<UserPanel user={user}/>} />` — the intermediate layers stop caring). Global state is for genuinely global things (production-patterns state taxonomy).

## 12. The bundle you didn't mean to ship
`import { Button } from '@corp/design-system'` pulling the whole kit because the package has no tree-shakeable exports; moment/lodash whole-imports; a "constants" barrel importing an SDK. React-flavored instance of `principles/performance.md` §bundles — detection and CI gates there. React-specific note: `React.lazy` route-level splitting is the highest-yield single change, and it needs the Suspense+error-boundary pairing from production-patterns.

## Anti-pattern spotting drill (for reviewers and models)

Given a diff, the highest-yield greps, in order: `eslint-disable.*hooks` (pitfalls 5/8 + concurrency §1) → `useEffect` bodies that call a state setter synchronously (#3, #9) → `useState(props.` (#7) → `key={index}`/`key={i}` (#2) → `.push(`/`.splice(` near `useState` (#1). The `react-code-reviewer` skill automates this list and cites this file per finding.
