# Memory & Performance — Leaks, Recomposition Storms, Startup, and ANRs

> **Applies to:** API 24–36, Compose BOM 2026.06, LeakCanary 2.14+, Perfetto (AOSP tracing), Macrobenchmark 1.3.x · **Last reviewed:** 2026-07-06
> **Related:** [lifecycle-and-state.md](lifecycle-and-state.md) · [concurrency.md](concurrency.md) · Skills: `compose-recomposition-auditor`, `lifecycle-leak-reviewer` · Subagent: `anr-root-cause-tracer`

## Priorities, in order

1. **Don't crash (OOM) and don't freeze (ANR).** These are Play Vitals "bad behavior" thresholds; exceed them and Google demotes your store ranking — a business problem, not just an engineering one.
2. **Start fast.** Cold start is the single perf number most correlated with retention. Every 100 ms of cold start you add is users you lose before your first screen ever renders.
3. **Don't jank.** 5 ms/frame budget overspend = dropped frames on 120 Hz devices (8.3 ms total frame budget).
4. Only then micro-optimize.

Measure before touching anything. The most expensive performance work I've ever seen was three engineer-months optimizing a code path that Perfetto later showed was 2% of startup. **Perfetto trace first, opinion second.**

## Memory leaks

### The taxonomy (ordered by how often I've actually seen each in the wild)

1. **Listener registered, never unregistered** — callbacks into an Activity/Fragment held by a longer-lived object (location manager, event bus, a singleton "SessionManager" with an observer list). The Activity leaks *with its entire view tree* — typically 5–50 MB each, and rotation mints a new leaked copy every time. Ten rotations on a photo-heavy screen = OOM. This is the leak in probably half of the heap dumps I've read.
2. **Static / singleton reference to a Context** — `companion object { var context: Context }` or a singleton initialized with `context` instead of `context.applicationContext`. Kotlin makes this *look* innocent.
3. **Coroutine/Rx work holding the screen** — a lambda capturing `this@Fragment` in an unscoped coroutine (see [concurrency.md](concurrency.md) #zombie work).
4. **Fragment view bindings past `onDestroyView`** — see [lifecycle-and-state.md](lifecycle-and-state.md) failure #4.
5. **Inner classes / non-static handlers** (legacy Java): anonymous `Handler`/`Runnable` with delayed messages holding the Activity. Rare in Kotlin codebases, rampant in the Java strata beneath them.
6. **Compose-specific:** long-lived lambdas capturing `Context`/`View` stored in objects that outlive composition (e.g., stashing an `onClick` in a singleton analytics helper); `staticCompositionLocalOf` holding screen-scoped objects.

### Detection → fix → prevention

- **Detection:** **LeakCanary in every debug build, non-negotiable, from project day one.** Its retained-object watch list (destroyed activities/fragments/view models/views) catches taxonomy items 1–5 automatically with a full reference chain. For release-build monitoring: `ApplicationExitInfo` (API 30+) tells you *why* your process last died — `REASON_LOW_MEMORY` trends by screen are your OOM radar without shipping a profiler.
- **Reading a LeakCanary trace:** the leak is at the *first* link in the chain that *shouldn't* exist, not the last. Everyone stares at the leaked Activity at the bottom; look instead for the topmost frame that's yours — that's the reference someone forgot to clear.
- **Fix patterns:** `applicationContext` for anything singleton-held; unregister in the mirror callback (`onStart`/`onStop` pairs — never register in `onCreate` and unregister in `onDestroy`, because `onDestroy` isn't guaranteed and the asymmetric pair is where double-registration bugs breed); lifecycle-aware wrappers (`DefaultLifecycleObserver`) so cleanup is co-located with setup.
- **Prevention:** CI: LeakCanary can run as instrumentation (`leakcanary-android-instrumentation`) failing UI tests on leaks. Review: `lifecycle-leak-reviewer` skill. The strongest prevention is architectural: **if nothing below the ViewModel ever sees an Activity/Fragment/View reference, taxonomy items 1–3 become impossible.** Enforce "no `android.view` / `Activity` imports in data & domain modules" with Konsist — one test, entire bug class gone.

## Compose recomposition storms

- **Failure:** A screen recomposing hundreds of times per second. Causes, ranked: (1) unstable lambda/parameters — a lambda capturing a method reference on an unstable class, or passing a `List` (unstable!) instead of an immutable/stable collection, defeats skipping so every parent recomposition cascades down; (2) reading state too high — `scrollState.value` read in the screen-level composable recomposes the whole screen per scroll pixel; (3) `derivedStateOf` missing where a rapidly-changing input maps to a rarely-changing output (`firstVisibleItemIndex > 0`); (4) infinite loops — writing to state you read in the same composition.
- **A war story for scale:** a chat app's message list janked only when the keyboard was open. Cause: an `imePadding()` read at the Scaffold level + an unstable `onMessageClick` lambda → every IME animation frame recomposed all ~200 message rows. Two-line fix (hoist the padding read, `remember` the lambda), 90 → 8 ms/frame with the keyboard animating.
- **Detection:** Layout Inspector recomposition counts (the skip/recompose columns); Composition Tracing in Perfetto for release-ish measurement; compiler reports (`-Pandroidx.compose.compiler.plugins.kotlin.reportsDestination`) list which composables are skippable and which parameters are stable — read these for your top 5 screens once per quarter.
- **Fix decision tree:**
  ```
  Parameter is a collection            → kotlinx.collections.immutable, or wrap in a @Immutable data class
  Class from another module unstable   → compose-compiler stability config file, or @Stable/@Immutable if you own it
  Lambda unstable                      → method reference to a stable receiver, or remember the lambda
  State read too high                  → push the read down into the smallest composable, or into a lambda
                                         (Modifier.offset { } / graphicsLayer { } defers to layout/draw phase — no recomposition)
  Fast input, slow output              → derivedStateOf
  ```
- **Prevention:** `compose-recomposition-auditor` skill on every new screen PR. Strong-skipping mode (default since Kotlin 2.0-era compilers) fixes most lambda instability automatically — verify it's on (`composeCompiler { featureFlags += StrongSkipping }` or default in current AGP) rather than hand-fixing what the compiler now does.
- **Perspective check:** recomposition is not free but it's also not the enemy — *unskippable recomposition of expensive subtrees* is. Don't let a junior spend a week making a settings screen skip-perfect. Audit the screens users scroll.

## Startup

- **Failure:** Cold start dominated by (ranked by what I've found in real traces): synchronous DI graph construction of the entire app on `Application.onCreate`; third-party SDKs initializing on the main thread via `ContentProvider` auto-init (each analytics SDK adds 50–200 ms and they add up — I've counted 11 auto-init providers in one app); disk reads (SharedPreferences first-load, see [concurrency.md](concurrency.md)); inflating/composing too much for first frame.
- **Detection:** Macrobenchmark `StartupBenchmark` with `CompilationMode.Partial` on a *physical mid-range device* (emulator startup numbers are fiction); Perfetto trace of the launch — look at the main thread between `bindApplication` and first `Choreographer#doFrame` — that gap is 100% your code and your SDKs.
- **Fix:** App Startup library / manual `ContentProvider` removal (`tools:node="remove"`) + lazy init for every SDK not needed for first frame; Baseline Profiles (Macrobenchmark generates them; typically 15–30% cold-start win for free — if you do one perf task this year, this is it); defer everything behind first frame with a `reportFullyDrawn()` discipline.
- **Prevention:** Macrobenchmark in CI with a regression budget (fail PR if startup +10% vs baseline). A manifest-merger check that new `ContentProvider` nodes require review sign-off — SDKs sneak them in via transitive dependencies.

## ANRs

- **What actually causes them** (from years of Vitals triage, roughly in order): main-thread I/O (the big one — see [concurrency.md](concurrency.md)); lock contention — main thread blocking on a `synchronized`/`Mutex` held by a background thread doing I/O (the deadliest, because the stack trace blames the innocent lock line, not the background thread holding it); binder calls to a busy system service in a hot path (`PackageManager` queries, `AppOpsManager`); broadcast receivers' `onReceive` >10 s; FGS start timeout (see [background-work.md](background-work.md)); and on specific OEMs, *their* code — e.g., a major OEM's clipboard service being slow made every long-press ANR-adjacent for one release; we could only detect, report, and route around it.
- **Detection:** Play Vitals ANR clusters give you the main-thread stack — but the main-thread stack is often the *victim*. Get the full ANR trace (`data/anr/`, or Vitals' full dump) and find what holds the lock. Perfetto with `sched` + `binder` tracks shows the main thread's blocked-state timeline: what it waits on and who was running instead.
- **Fix:** per root cause above. For lock contention specifically: shrink critical sections to pure memory operations; never do I/O under a lock that the main thread can ever want.
- **Prevention:** StrictMode `penaltyDeath` in debug; the `anr-root-cause-tracer` subagent for triage; a "no locks on the main thread's path" review rule for anything touching `synchronized`.

## Callable capabilities

- Skill **`compose-recomposition-auditor`** — the recomposition section, operationalized per-screen.
- Skill **`lifecycle-leak-reviewer`** — the leak taxonomy, operationalized per-PR.
- Subagent **`anr-root-cause-tracer`** — the ANR section, operationalized per-bug-report.
