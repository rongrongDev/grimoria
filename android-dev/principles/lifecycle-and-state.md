# Lifecycle & State — Surviving Configuration Change, Process Death, and Your Own Assumptions

> **Applies to:** API 24–36 (targetSdk 36), Compose BOM 2026.06, Lifecycle 2.9.x, Kotlin 2.2 · **Last reviewed:** 2026-07-06
> **Related:** [concurrency.md](concurrency.md) · [memory-and-performance.md](memory-and-performance.md) · Skill: `lifecycle-leak-reviewer`

## The one mental model that prevents 80% of lifecycle bugs

**Your process is a guest in someone else's house.** The OS can and will:

1. **Recreate your Activity** (configuration change: rotation, locale, dark mode, window resize, unfolding a foldable) — your objects die, your process lives.
2. **Kill your process** (memory pressure while backgrounded) — everything in RAM dies. The user reopens the app and Android *pretends nothing happened* by restoring the back stack and `SavedStateHandle`/`onSaveInstanceState` bundles.
3. **Stop but not destroy** your Activity (another app in front) — your code keeps existing but must not touch UI or hold expensive resources.

Every lifecycle bug I've shipped in 20 years was a failure to plan for exactly one of these three. When reviewing code, ask three questions: *what happens on rotation? what happens on process death? what happens while stopped?*

**Process death is the one everyone skips.** It doesn't reproduce on a developer's 12 GB Pixel sitting in a cradle. It reproduces constantly on a 4 GB Samsung A-series with Chrome open. Users experience it as "the app lost my half-written post," and you will never see it in a crash reporter because *nothing crashed*.

Test it honestly: background the app, then
`adb shell am kill <package>` (not force-stop — force-stop clears state and is not what the OS does), then relaunch from Recents. Do this to every screen that accepts input. Make it a release checklist item.

## Where state belongs — the decision tree

```
Is it derived from other state?            → derive it (derivedStateOf / computed property). Never store.
Does the user lose work if it vanishes?    → SavedStateHandle (VM) or rememberSaveable (Compose).
                                             Keep it SMALL (< ~50KB per bundle; TransactionTooLargeException
                                             kills you at ~500KB for ALL bundles combined, and it kills you
                                             as a crash in Binder, blaming a random Activity transition).
Is it expensive to recreate but refetchable? → ViewModel (survives config change, NOT process death)
                                               + repository-layer cache.
Must it outlive the screen?                → repository / DataStore / Room. NOT a singleton with a
                                             mutable var — see war story below.
Is it purely visual & cheap?               → remember { } and accept it resets on config change.
```

Corollary: **ViewModel + SavedStateHandle is a pair, not a choice.** The VM holds the working set; SavedStateHandle holds the minimal seed (IDs, query text, scroll anchor) needed to rebuild the working set after process death.

## Failure modes

### 1. State stored in the Activity/Fragment/composable that should survive

- **Failure:** Form input, scroll position, or selection resets on rotation or after backgrounding. In Compose: `remember { mutableStateOf(...) }` for user input.
- **Detection:** Rotation test + the `adb shell am kill` test above. Lint has no rule for this; it's a review-time catch. In Compose, grep for `remember {` holding a `mutableStateOf` of anything typed by the user.
- **Fix:** `rememberSaveable` for small UI state; hoist to ViewModel + `SavedStateHandle` for anything the screen's logic reads.
- **Prevention:** PR checklist line: "process-death tested: Y/N". The `lifecycle-leak-reviewer` skill flags `remember`-held input state. For teams: a debug-menu toggle for the developer setting "Don't keep activities" (it approximates activity death, though not process death).

### 2. ViewModel scoped to the wrong owner

- **Failure:** Two flavors. (a) VM scoped to a Fragment when the state must be shared across the flow → sibling fragments see different instances, "why is my cart empty on the checkout screen." (b) VM scoped to the Activity (`activityViewModels()`) for screen-local state → state from a previous visit leaks into the next visit, and the VM never clears until the Activity dies.
- **Detection:** Search for `activityViewModels()` / `hiltViewModel()` without a nav-graph scope and ask "who else reads this?" If the answer is "nobody," it's over-scoped. Symptom (b) shows up as "stale data on second visit" bug reports.
- **Fix:** Scope shared flow state to a Navigation graph: `hiltViewModel(remember(backStackEntry) { navController.getBackStackEntry("checkout_graph") })` or `navGraphViewModels(R.id.checkout_graph)`. Screen-local state → default `viewModel()` scoped to the destination.
- **Prevention:** Document each VM's intended owner in its KDoc header. Review rule: an `activityViewModels()` call requires a comment naming the second consumer.

### 3. Observing with the wrong lifecycle — the invisible battery drain

- **Failure:** Collecting a Flow in `lifecycleScope.launch { flow.collect { } }` without `repeatOnLifecycle(STARTED)`. The collection keeps running while the app is backgrounded: location updates keep flowing, the DB keeps being queried, the UI keeps recomposing invisibly. I once traced a 6%/hour idle battery drain to exactly this — a screen collecting a 1 Hz ticker flow while the app sat in Recents overnight. Nothing crashed; the app just quietly ate the battery, and the Play Store "excessive background battery" vitals flag ate our install conversion.
- **Detection:** Perfetto trace while app is backgrounded — any recurring main-thread wakeups from your process are suspect. Code-side: grep `lifecycleScope.launch` and check each for `repeatOnLifecycle`.
- **Fix:** `viewLifecycleOwner.lifecycleScope.launch { viewLifecycleOwner.repeatOnLifecycle(State.STARTED) { flow.collect {...} } }`. In Compose: `collectAsStateWithLifecycle()` (lifecycle-runtime-compose) — **always**, never plain `collectAsState()` for anything that does work upstream.
- **Prevention:** Lint: forbid `collectAsState(` via a custom lint rule or Konsist test; require `collectAsStateWithLifecycle`. It's a one-day investment that pays forever.

### 4. Fragment view lifecycle vs Fragment lifecycle

- **Failure:** Holding a view binding, adapter, or observer past `onDestroyView` because the *Fragment* outlives its *view* on the back stack. Classic: `binding` as a non-null `lateinit` accessed after `onDestroyView` → crash; or LiveData observed with `this` instead of `viewLifecycleOwner` → duplicate observers after each back-stack return, each firing your handler once (the "why did this dialog show twice" bug).
- **Detection:** LeakCanary flags retained view bindings out of the box. The double-observer variant: log observer registration counts.
- **Fix:** `viewLifecycleOwner` for all view-touching observation; null out bindings in `onDestroyView` or use a delegate that does.
- **Prevention:** `lifecycle-leak-reviewer` skill checks this pattern. Better: new screens go in Compose, where this entire bug class doesn't exist.

### 5. Compose effect misuse

- **Failure:** Side effects in composition (`viewModel.load()` called directly in a composable body) run on *every recomposition* — I've seen a search endpoint hit 40×/second because a network call sat in a composable body during a text-field edit storm.
- **Detection:** Layout Inspector recomposition counts; server-side rate anomalies; the `compose-recomposition-auditor` skill.
- **Fix / decision tree:**
  - Run once per key value, with coroutine support → `LaunchedEffect(key)`
  - Run on user event (click) → `rememberCoroutineScope().launch` in the callback
  - Needs cleanup on leave → `DisposableEffect(key) { onDispose { } }`
  - Publish composed state to non-compose code → `SideEffect`
  - Fire when composition *settles*, not per-frame → don't; hoist to the VM
  - "Load on screen entry" → don't do it in the composable at all; do it in the VM's `init` or a cold flow started by `stateIn(WhileSubscribed(5000))` — survives rotation without refetching, stops when nobody watches.
- **Prevention:** Review rule: any expression with side effects in a composable body must be wrapped in an effect API, and every `LaunchedEffect(Unit)` needs a justifying comment (usually it's a "load on entry" smell — see above).

### 6. Trusting `onDestroy` / `onCleared` for critical work

- **Failure:** Saving a draft, flushing analytics, or committing a transaction in `onDestroy`. Process death skips every lifecycle callback — the OS just SIGKILLs you. `onDestroy` is *not guaranteed*, and on several OEM battery managers (MIUI, older EMUI) apps are killed aggressively enough that this is the common path, not the rare one.
- **Detection:** Data-loss bug reports concentrated on Xiaomi/Huawei/Oppo devices in your analytics — that device-skew is the fingerprint.
- **Fix:** Save eagerly and continuously (`onStop` at the latest for UI state; write-through to Room/DataStore for user data). `onStop` is guaranteed on API 11+ for normal backgrounding; nothing after it is.
- **Prevention:** Rule: `onDestroy`/`onCleared` may only *cancel* and *release* — never *persist*.

## Configuration change in 2026: don't opt out

`android:configChanges="orientation|screenSize"` to "fix" rotation bugs is deferring the debt with interest: foldables, desktop windowing (API 34+ forces resizability for large screens), and split-screen make config changes constant. Apps that opted out are the ones that render a phone layout in a freeform window. Handle recreation properly instead; if a specific surface truly can't recreate (an active video call), opt out *that Activity only* and handle `onConfigurationChanged` completely.

## Callable capabilities

- Skill **`lifecycle-leak-reviewer`** — applies failure modes 1–4 to a PR diff.
- Subagent **`anr-root-cause-tracer`** — lifecycle callbacks doing blocking work are a top-3 ANR cause; it cross-references this doc.
