# Legacy Views, XML Layouts, and Compose Interop — Production Patterns & Pitfalls

> **Tier: extended** — production patterns + common pitfalls; not exhaustive View-system reference.
> **Applies to:** Compose BOM 2026.06, AppCompat 1.7.x, RecyclerView 1.4.x, API 24–36 · **Last reviewed:** 2026-07-06
> **Related:** [lifecycle-and-state.md](../principles/lifecycle-and-state.md) · [memory-and-performance.md](../principles/memory-and-performance.md)

## Strategic posture (the decision that matters more than any pattern)

Every mixed codebase needs a written one-liner policy or it drifts forever. The one that works: **new screens in Compose; existing View screens migrated only when materially changed; shared design-system components get Compose-first implementations with View wrappers.** Screen-by-screen migration (whole screen at a time) beats widget-by-widget — each interop boundary you add is a seam with its own bug classes (below), so minimize the number of live seams, not the amount of legacy code.

## Compose in Views: `ComposeView`

- **The `ViewCompositionStrategy` pitfall (the big one):** a `ComposeView` in a Fragment defaults to disposing composition when its *window* detaches — but Fragments on the back stack detach views while the Fragment lives. Without `setViewCompositionStrategy(DisposeOnViewTreeLifecycleDestroyed)`, you get state loss and re-composition churn on back-stack pops, and with certain transition animations, briefly *blank* content — a bug that looks like a rendering glitch and gets misfiled for weeks (we chased one as a "Samsung animation bug" for a sprint; it was the default strategy). **Rule: every `ComposeView` in a Fragment sets `DisposeOnViewTreeLifecycleDestroyed`. No exceptions.**
- **In `RecyclerView` items:** modern Compose UI (1.7+) pools/reuses compositions acceptably; still, measure scroll perf before converting a heavy list item-by-item — a RecyclerView of 30 `ComposeView` rows each hosting its own composition costs more than one `LazyColumn`. If the list is the screen, migrate the whole list.

## Views in Compose: `AndroidView`

- `AndroidView(factory = { ... }, update = { view -> ... })` — **`update` runs on every recomposition of the call site.** Doing non-idempotent work there (re-setting an adapter, re-adding a listener, calling `loadUrl` unconditionally) is the seam's classic bug: I've debugged a `MapView` that re-animated the camera on every keystroke of an unrelated search field, and a WebView that reloaded on every recomposition (burning data and resetting scroll). Guard `update` with equality checks: only push what changed.
- Views with their own state/lifecycle (`MapView`, `WebView`, players, ad views) need lifecycle forwarding: observe the composition's `LifecycleOwner` (`LocalLifecycleOwner`) in a `DisposableEffect` and forward `onResume`/`onPause`/`onDestroy` to the View. Skipping this leaks GL contexts and keeps sensors alive — it's the interop version of the listener-leak taxonomy in [memory-and-performance.md](../principles/memory-and-performance.md).
- **Focus & IME at the seam:** focus traversal and keyboard behavior across a Compose↔View boundary is the least-polished part of interop. Text input fields *straddling* a seam (Compose field, View field, same form) produce IME-restart jank and broken "next" navigation on some OEM keyboards (Samsung keyboard being the recurring offender in my bug history). Keep whole forms on one side of the seam.

## The View-system pitfalls that still page people (for the legacy code you keep)

- **Fragment view lifecycle** — the double-lifecycle problem and `viewLifecycleOwner`: see [lifecycle-and-state.md](../principles/lifecycle-and-state.md) failure #4; it's the top legacy crash/leak source, full stop.
- **RecyclerView adapter correctness:** use `ListAdapter` + `DiffUtil` (never `notifyDataSetChanged` — it kills animations and scroll position); stable IDs only when actually stable; never hold item `View` references outside `onBindViewHolder` (recycled views = the "wrong row's image after fast scroll" bug — that's a *recycling* bug, not a Glide bug, though Glide gets blamed every time; the fix is cancel-and-set in `onBind`, which Glide/Coil `into()` does for you if you call it *every* bind, conditionals are the bug).
- **Custom views:** save state via `onSaveInstanceState`/`BaseSavedState` with a **unique view ID** — two same-ID instances silently swap state after rotation (the "my two sliders exchanged values" mystery).
- **XML performance:** nested `LinearLayout` weights → exponential measure passes; deep hierarchies jank at inflation. `ConstraintLayout` flattens; `ViewStub` defers. But: **don't invest in optimizing XML you plan to migrate** — write the migration ticket instead.
- **Window insets:** legacy screens using `fitsSystemWindows` half-work under targetSdk 35's forced edge-to-edge; audit every one when bumping targetSdk ([accessibility-and-ui-correctness.md](../principles/accessibility-and-ui-correctness.md) fragmentation section).

## Theming across the seam

Two theme systems (XML themes vs `MaterialTheme`) will drift unless bridged: generate both from one token source, or use the `Material3 themeAdapter`-style bridges (XML → Compose) so Compose islands inherit the View theme. The drift bug report is always "this screen's primary color is slightly off" — file it under process, not polish: it means two sources of truth exist.

## When NOT to use this doc

Greenfield app → skip interop entirely, go all-Compose ([build-from-scratch.md](../guides/build-from-scratch.md)). TV/Wear → [compose-tv-wear.md](compose-tv-wear.md).
