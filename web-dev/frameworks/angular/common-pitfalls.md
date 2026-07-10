# Angular — Common Pitfalls (Extended Tier)

**Applies to:** Angular 19–20. **Date:** 2026-07-06.

## 1. Subscription leaks
Hand-`subscribe()` in components without teardown: the component dies, the subscription doesn't — memory leaks, and ghost handlers writing to dead views (the `principles/concurrency.md` §7 class, Angular's most famous instance). **Fix:** `async` pipe / `toSignal` / `takeUntilDestroyed(inject(DestroyRef))`. **Detect:** grep `\.subscribe\(` in `*.component.ts` — each hit needs a teardown story.

## 2. Nested-subscribe pyramids instead of operators
`subscribe(a => this.svc.b(a).subscribe(b => …))` — loses cancellation (the out-of-order race, `principles/concurrency.md` §1), error propagation, and readability. **Fix:** `switchMap` (cancel previous — typeahead/param changes), `concatMap` (queue — ordered writes), `mergeMap` (parallel — independent), `exhaustMap` (ignore-while-busy — the double-submit guard, principles §3). That four-way choice *is* RxJS competence; put it in review checklists.

## 3. Calling functions in templates
`{{ computeTotal() }}` runs on every change-detection cycle (with Zone.js: every async event app-wide). **Fix:** `computed()` signals or pipes (memoized). This single pitfall explains a remarkable share of "Angular is slow" complaints.

## 4. Signals/RxJS effect-sync spaghetti
`effect()` writing signals from observables mixed with subscriptions writing signals from effects — the two-reactive-systems confusion; state provenance becomes untraceable (the Vue watcher-web war story shape, `vue-nuxt/production-patterns.md`). **Fix:** the treaty in `angular/production-patterns.md`: hold in signals, flow through RxJS, bridge with `toSignal`/`toObservable` only at boundaries.

## 5. `any`-typed template escape hatches
`$any()` in templates and `as any` on `@Input` chains defeat template type-checking — turn on `strictTemplates` (angularCompilerOptions) and treat new `$any` as review-blocking; template type-checking is Angular's best regression net and most codebases run it half-off.

## 6. Providing services in the wrong scope
A service `providedIn: 'root'` holding per-route state leaks state across navigations (stale wizard data bug); providing per-component when root was meant duplicates caches (two instances = two sources of truth). Decide scope *deliberately*; on SSR, root services are also per-*request-container* — never per-user data in module/global scope (`node/concurrency.md` §1).

## 7. `bypassSecurityTrust*` normalization
One legitimate use gets copy-pasted until sanitization is decorative (`angular/production-patterns.md` §security). Same governance as every raw-HTML hatch: one audited wrapper, grep-expects-one.

## 8. NgModule cargo cult in a standalone world
New features still built as NgModules with barrel files re-exporting everything — defeats tree-shaking and lazy loading (the bundle pitfall, `principles/performance.md` §bundles). Standalone + per-route `loadComponent`/`loadChildren`; verify with the route-level bundle analyzer.

## 9. Zone-dependent third-party assumptions under zoneless migration
Libraries relying on Zone.js microtask hooks (some old component kits, analytics wrappers) silently stop updating when you go zoneless — updates happen, views don't. Migrate zoneless *with* the signal migration, feature-flag per route, and keep the Angular DevTools profiler open during the flip.

## 10. Interceptor ordering and multiplication
Auth/retry/error interceptors registered in accidental order (retry outside auth re-sends stale tokens; error-toast interceptor firing per retry attempt — the retry-storm UX). Interceptor order = registration order (the middleware-ordering lesson, `node/from-scratch.md` §3 decision 4): one registration site, ordering comment, and a test that a 401→refresh→replay flows once.
