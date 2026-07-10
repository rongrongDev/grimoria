# React — Production Patterns

**Applies to:** React 19.x (client-side React; for RSC/server specifics see `frameworks/nextjs/`). **Date:** 2026-07-06.
**Prerequisite mental model:** `from-scratch.md` — this doc assumes you know UI = diffed data and reference equality drives everything.

## State: the four kinds, and where each lives

Most React messes are one kind of state stored in another kind's home. Classify before you code:

1. **Server state** (data that lives in a database and you're caching a copy): **TanStack Query** (or your framework's loader layer). Not `useState` + `useEffect` + fetch — that hand-rolled trio has no dedup, no staleness, no retry, no race protection (`principles/concurrency.md` §1). This one decision deletes more bugs than any other in this doc.
2. **URL state** (filters, tabs, pagination, anything you'd want in a shared link): the router's search params. If refreshing loses the user's place, this rule was broken.
3. **Local UI state** (an open dropdown, a controlled input): `useState`/`useReducer` in the component. Reach for `useReducer` when several values update together or transitions have rules — a reducer is a state machine you can unit-test without rendering.
4. **Shared client state** (theme, current user, cross-cutting UI): context for low-frequency values; **Zustand** (or Jotai) once updates are frequent — context re-renders every consumer on every change, and "context for everything" is the #1 performance complaint I've audited. Redux Toolkit still earns its keep in large apps needing devtools time-travel and strict conventions; don't add it to small ones.

**Derive, don't sync.** If a value can be computed from existing state, compute it during render. `useEffect` that watches state A to `setState` B is a red flag ("the useEffect-to-sync anti-pattern") — it double-renders, races, and drifts. `const fullName = first + ' ' + last;` needs no hook at all.

## Component architecture

- **Composition over configuration.** A component with 12 boolean props is three components wearing a trenchcoat. Use `children` and slots; export compound parts (`<Card.Header>`) rather than `headerTitle`/`headerIcon`/`headerAction` props.
- **Lift state to where it's shared, no higher.** Global-by-default is how every click re-renders the app shell.
- **Push state down / pull content up.** Extract the stateful bit into a small leaf (state stays local, re-renders stay cheap), and accept expensive subtrees via `children` — children passed from a parent that didn't re-render are referentially stable and skip re-rendering. These two moves fix most perf problems *structurally*, before memo enters the conversation.
- **Custom hooks are the unit of reuse for logic** (`useDebounce`, `useMediaQuery`, `usePermission`) — but a custom hook is an API: name it for the capability, not the implementation, and give it a return shape you can evolve.

## Memoization in the compiler era

React Compiler (stable since late 2025) auto-memoizes components and values in most code. Policy:

- **With the compiler on:** stop hand-writing `memo`/`useMemo`/`useCallback` for render performance. Keep `useMemo` only for *semantic* stability (a value used as an effect dep or context value where identity matters) and genuinely expensive computation. Keep the ESLint rules-of-hooks + compiler lint clean — the compiler skips components that violate the rules, silently un-optimizing exactly the messy components that needed help.
- **Without the compiler:** memoize by *measurement* (React DevTools profiler → find the actually-hot subtree), not by reflex. `useCallback` everywhere costs more in review comprehension than it saves in renders; a `memo`'d child with an un-memoized object prop is cargo cult (reference changes every render anyway — you built `setProps` in from-scratch; you know why).

## Data fetching & mutations

- Reads: query cache keyed by inputs (`useQuery({ queryKey: ['order', id], queryFn, staleTime })`). Set `staleTime` deliberately — the default 0 refetches on every focus, which surprises teams into "why is my API getting hammered."
- Writes: `useMutation` + invalidate affected queries on settle. Optimistic updates only via the library's pattern (`principles/concurrency.md` §4 for why hand-rolling goes wrong).
- Forms: **React Hook Form** + Zod resolver for anything beyond two fields (uncontrolled = keystrokes don't re-render the tree); React 19 Actions/`useActionState` when you're on a framework that gives you server actions.
- **Suspense boundaries + error boundaries come in pairs.** Every `<Suspense>` needs a sibling error story; a suspense boundary without one turns fetch failures into infinite spinners. Place boundaries at *layout* seams (page, panel), not around every component.

## Project shape that survives growth

Feature folders, not layer folders. `features/checkout/{components,hooks,api,types}` beats global `components/` + `hooks/` + `utils/` — the day you need to delete or rewrite checkout, it's one directory, not a scavenger hunt. Shared truly-generic UI goes in `ui/` (your design system). Enforce the dependency direction (features may import `ui`, never each other's internals) with eslint-plugin-boundaries — unenforced conventions decay in ~6 months, measured across every team I've watched try.

TypeScript: `strict: true` non-negotiable. Type props as `interface Props`, avoid `React.FC` (legacy, made `children` implicit). Zod-validate at runtime boundaries (API responses, URL params, localStorage) — TS types are compile-time fiction about runtime data (`principles/security.md`).

## The default stack (2026, opinionated)

| Concern | Default | Notes |
|---|---|---|
| Build | Vite | CRA is dead; don't resurrect it |
| Framework (if SSR/routing needed) | Next.js App Router or React Router v7 | see those dirs |
| Server state | TanStack Query v5 | |
| Client state | Zustand | Context for low-frequency only |
| Forms | React Hook Form + Zod | |
| Components | Radix/React Aria primitives (+ Tailwind or CSS Modules) | a11y for free — `principles/accessibility.md` |
| Tests | Vitest + Testing Library + Playwright + MSW | `react/testing.md` |

Deviate with reasons, not preferences.

## War story — the memo blizzard

Inherited codebase, 2,300 components, `useCallback`/`useMemo` on ~80% of them, still janky. Profiling showed the app shell re-rendered on every keystroke: a context provider held `{user, theme, setSearch, search}` in one object, recreated each render — every memo below it was defeated by the one unstable reference above it. Deleting ~1,800 memoizations and splitting one context into three fixed more than the previous team's year of micro-optimizing. Lesson: memoization is a chain that fails at its weakest link; **structure (state placement, context granularity) dominates annotation.** Measure first; the profiler flame graph outranks anyone's intuition, including mine.
