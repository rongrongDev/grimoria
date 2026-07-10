# Angular — Production Patterns (Extended Tier)

**Applies to:** Angular 19–20 (signals era, standalone components, zoneless available). **Date:** 2026-07-06.
**Cross-cutting depth:** `principles/` docs apply in full; this doc is the Angular dialect.

## The modernization stance (most Angular work is brownfield)

New code targets the modern trio: **standalone components** (NgModules are legacy organization), **signals** for component state (`signal`/`computed`/`input()`/`model()`), **built-in control flow** (`@if`/`@for` — note `@for` *requires* `track`, finally making the keyed-list rule from `react/from-scratch.md` §5 compulsory). Migrate opportunistically per-component (the schematics are good); don't big-bang.

## State & reactivity — the signals/RxJS treaty

The confusion in every Angular codebase I audit is two reactive systems used interchangeably. The treaty:

- **Signals**: state you *hold* (component/UI state, derived values via `computed` — same lazy dependency-tracking family you built in `vue-nuxt/from-scratch.md`).
- **RxJS**: events you *react to over time* (HTTP, websockets, debounced inputs, anything with cancellation/combination semantics — `switchMap` is still the correct answer to the out-of-order fetch race, `principles/concurrency.md` §1).
- Bridge at boundaries with `toSignal`/`toObservable`; don't hand-subscribe in components — `toSignal`, the `async` pipe, or `takeUntilDestroyed` manage the unsubscribe that hand-`subscribe()` forgets (the §7 init/teardown leak class).
- `effect()` follows the same law as every framework's effect: side effects only, never state-sync (`react/common-pitfalls.md` §3 — Angular even makes you opt in to writes with `allowSignalWrites`; treat needing it as a design smell).

**Server state:** TanStack Query (angular) or a resource-style loader (`resource()`/`httpResource` as they stabilize) — the "no hand-rolled fetch-into-state" rule (`react/production-patterns.md` §state) is framework-independent. **Shared client state:** signal-based services (a class with private `signal`s and public `computed`s is the modern "store"); NgRx only when the org genuinely wants the event-sourced discipline at scale.

## DI, structure, change detection

- DI is Angular's superpower — use it as designed: `inject()` function style, `providedIn: 'root'` services, `InjectionToken` for config. Feature-folder structure with standalone lazy routes (`loadChildren` per feature) — the same boundary/dependency-direction enforcement argument as `react/production-patterns.md` (eslint-plugin-boundaries or Nx rules).
- **Change detection:** `OnPush` everywhere is the pre-signals survival rule; signal-driven components make it near-automatic, and **zoneless** (stable-ish since v20) is the destination — budget the migration for libraries still assuming zone patching. Until zoneless: know that Zone.js triggers CD on *every* async event, which is where mystery jank comes from (profile with Angular DevTools before blaming the framework).
- **SSR:** Angular Universal is now just `@angular/ssr` with hydration (incremental hydration in 19+). The meta-framework server rules apply: no module/platform-scope per-user state (`node/concurrency.md` §1), `TransferState` for the payload (DTO discipline per `nextjs/security.md` §2).

## Security & testing pointers (extended-tier summary)

- Angular auto-sanitizes interpolations and property bindings by *context* — the escape hatch is `bypassSecurityTrust*` (grep for it; every call needs a provenance story — it's `dangerouslySetInnerHTML` with a scarier name) and `[innerHTML]` (sanitized, but sanitization ≠ your CSP excuse). `HttpClient` has XSRF support; enable and configure it (principles §CSRF).
- Testing: Vitest is now the supported default runner (Karma is dead); component tests via Testing Library (angular) follow `react/testing.md` philosophy verbatim; `HttpTestingController` or MSW for network; the wrong-user tests live on your API, not in Angular.

## War story — the zone that re-rendered the world

A trading dashboard: 60fps price websocket, every tick triggering Zone.js change detection across 3,000 components — CPU pegged, INP catastrophic. The team's fix attempt was `runOutsideAngular` sprinkled ad hoc until updates *stopped appearing* (now outside the zone, nothing re-rendered). The durable fix was architectural: prices into signals (fine-grained invalidation — only subscribed cells update), `OnPush` boundary components, zone work reserved for genuinely global events. Lesson: in Angular, *change-detection topology is a design decision*, not a framework detail — decide it per feature, or Zone.js decides for you, expensively.
