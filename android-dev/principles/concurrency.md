# Concurrency — Coroutines, Flow, and the Main Thread You Keep Blocking

> **Applies to:** Kotlin 2.2, kotlinx.coroutines 1.10.x, Compose BOM 2026.06, API 24–36 · **Last reviewed:** 2026-07-06
> **Related:** [lifecycle-and-state.md](lifecycle-and-state.md) · [background-work.md](background-work.md) · [testing.md](testing.md) · Subagent: `anr-root-cause-tracer`

## Structured concurrency is a promise you make to the OS

The entire value of coroutines on Android is one sentence: **when the lifecycle that started the work dies, the work stops.** Every pattern below that I flag as a failure is a way of breaking that promise — work that outlives its reason to exist. Broken promises show up as leaked memory, drained batteries, writes to dead UIs, and crashes in callbacks referencing destroyed objects.

## Choosing a scope — decision tree

```
Result only matters to this screen's UI          → viewModelScope
Result only matters while this exact view exists → viewLifecycleOwner.lifecycleScope + repeatOnLifecycle
Triggered by a user event inside a composable    → rememberCoroutineScope() (cancelled when composable leaves)
Keyed side effect inside a composable            → LaunchedEffect(key)
Must complete even if the user leaves the screen
  ├── but can die with the process (fire logging, warm a cache)
  │     → injected ApplicationScope (a @Singleton CoroutineScope(SupervisorJob() + Dispatchers.Default))
  └── must survive process death (upload, sync, purchase finalization)
        → NOT a coroutine scope at all. WorkManager. See background-work.md.
NEVER → GlobalScope. It has all the costs of ApplicationScope with none of the
        injectability/testability, and it can't be cancelled in tests, so it leaks
        across test methods and produces flaky suites.
NEVER → CoroutineScope(Dispatchers.IO) created ad-hoc in a function. This is an
        unsupervised orphan: no one cancels it, exceptions in it can kill the process.
```

The most common judgment error is one level subtler: putting work in `viewModelScope` that must survive the screen. A "save" that runs in `viewModelScope` is cancelled when the user saves-and-immediately-backs-out — the exact moment they signal they're done and trust you. Saves, uploads, purchases: ApplicationScope at minimum, WorkManager if it must survive process death.

## Failure modes

### 1. Main-thread blocking — the ANR machine

- **Failure:** Synchronous I/O on the main thread: Room queries without `suspend`, `SharedPreferences.commit()` (use `apply()`, or better, DataStore), `runBlocking` anywhere in UI code, OkHttp `execute()`, decoding a bitmap, `File.readText()` for a "small" config file that's on slow flash storage. The 5-second ANR threshold is the *crash* threshold; jank starts at 5 *milliseconds* per frame overspend. War story: an app I audited ANR'd only on one OEM's mid-range line — cause was a 300 KB `SharedPreferences` file (someone cached JSON in it) whose first read is a synchronous main-thread parse, and that OEM shipped notoriously slow eMMC. Devs never reproduced it on UFS-storage flagships.
- **Detection:** `StrictMode` in debug builds (`detectDiskReads/detectDiskWrites/detectNetwork` + `penaltyLog`). Play Vitals ANR clusters. Perfetto: look for long slices on the main thread inside `binder transaction` or `Choreographer#doFrame`.
- **Fix:** `withContext(Dispatchers.IO)` at the *data layer*, not the call site — repositories expose `suspend` functions that are main-safe by contract ("main-safe by construction").
- **Prevention:** StrictMode with `penaltyDeath` in debug builds (yes, death — logs get ignored). CI: forbid `runBlocking` outside `src/test` via lint/Konsist. Room: never allow `allowMainThreadQueries()`.

### 2. Cancellation not propagated — zombies and half-done state

- **Failure:** (a) Catching `CancellationException` in a broad `catch (e: Exception)` and swallowing it — the coroutine *thinks* it handled an error and keeps executing after cancellation; downstream you get writes from dead screens. (b) CPU-bound loops that never suspend, so cancellation never lands. (c) `try/finally` doing suspending cleanup without `withContext(NonCancellable)` — the cleanup itself is cancelled instantly.
- **Detection:** Grep every `catch (e: Exception)` and `catch (e: Throwable)` in coroutine code. Runtime symptom: log lines from screens the user left seconds ago.
- **Fix:**
  ```kotlin
  catch (e: CancellationException) { throw e }   // always rethrow, FIRST
  catch (e: Exception) { ... }
  ```
  CPU loops: `ensureActive()` (or `yield()`) each iteration. Critical cleanup: `finally { withContext(NonCancellable) { release() } }` — keep it milliseconds-short.
- **Prevention:** Custom lint rule (or detekt's `SwallowedException` config) for `CancellationException` swallowing — this is the single highest-value custom lint rule an Android team can write. Use `runCatching` never in coroutines (it catches CE).

### 3. Shared mutable state raced across coroutines

- **Failure:** Two coroutines doing read-modify-write on the same `MutableStateFlow`: `_state.value = _state.value.copy(count = _state.value.count + 1)` — a lost-update race the moment two updates interleave. Same bug with Compose `mutableStateOf` written from `Dispatchers.Default`. These reproduce under load, in the field, never on your desk. Fingerprint in bug reports: counters off by one, lists with a missing item, "my toggle flipped back."
- **Detection:** Nearly impossible at runtime; catch it structurally. Grep for `.value =` on shared flows where the right-hand side *reads* the same flow.
- **Fix:** `_state.update { it.copy(count = it.count + 1) }` — atomic CAS loop, always correct. For Compose state written off-main, use `Snapshot.withMutableSnapshot` or (better) don't: funnel all mutation through the VM on `Dispatchers.Main.immediate` (which `viewModelScope` gives you by default).
- **Prevention:** Team rule: **`MutableStateFlow.value =` is banned when the new value derives from the old; `update {}` is mandatory.** One-line lint rule; catches the whole class.

### 4. `stateIn` / `shareIn` misconfiguration — the refetch-on-rotation bug and its evil twin

- **Failure:** (a) `SharingStarted.Lazily`/`Eagerly` on a flow with an expensive upstream → upstream never stops; background collection forever (see lifecycle doc's battery story). (b) `WhileSubscribed(0)` → rotation drops to zero subscribers for one frame, upstream restarts, screen flickers through loading state and refetches on every rotation. (c) calling `stateIn` inside a function called per-screen-visit, creating a *new* shared flow each time — defeats sharing entirely and leaks the old one.
- **Detection:** Rotation test with Charles/network inspector open: any request on rotate is flavor (b). Flavor (c): grep for `stateIn(` outside property initializers / `init`.
- **Fix:** The default that's right 95% of the time: `.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), initialValue)`. The 5 s bridges config change (subscriber count dips for ~1 frame) and brief backgrounding, while still stopping work when truly abandoned. The value 5 000 isn't magic-sacred, but it's the documented convention — deviating needs a comment.
- **Prevention:** Code snippet/template in the repo; review rule that any other `SharingStarted` carries a justification comment.

### 5. Wrong dispatcher granularity & dispatcher hardcoding

- **Failure:** `Dispatchers.IO` wrapped around CPU work (JSON parsing a 5 MB payload) — IO is an elastic pool (64+ threads); flooding it with CPU work causes thread oversubscription and scheduler thrash. Hardcoded `Dispatchers.Main` in a class also makes it untestable (crashes with "Module with the Main dispatcher had failed to initialize" in JVM tests).
- **Fix:** IO for blocking I/O, `Default` for CPU. Inject dispatchers (`@IoDispatcher CoroutineDispatcher`) — non-negotiable for testability; tests inject `StandardTestDispatcher`. See [testing.md](testing.md).
- **Prevention:** DI module providing named dispatchers from day one; lint/Konsist rule banning `Dispatchers.` literals outside that module.

### 6. `SupervisorJob` cargo-culting and lost exceptions

- **Failure:** Exceptions in a child of `viewModelScope` cancel siblings? No — `viewModelScope` already uses `SupervisorJob`. The real bug is the opposite: adding `SupervisorJob()` inside `async {}` chains and then never calling `await()`, so exceptions evaporate silently. An `async` whose `Deferred` is never awaited is a write-only error channel.
- **Fix:** `async` only when you will `await`. For fire-and-forget, `launch` + a `CoroutineExceptionHandler` on the scope that logs to crash reporting.
- **Prevention:** Review rule: every `async` has a visible `await` in the same structured block (`coroutineScope { }`).

## Flow judgment calls

- **Cold flow vs suspend function:** returns once → `suspend fun`. A stream of values over time → `Flow`. A `Flow` that emits exactly one item is an API lie that costs every caller a `first()`.
- **StateFlow vs SharedFlow:** state (conflated, always-has-value, new subscriber needs latest) → `StateFlow`. Events (each must be handled ~once: navigation, toasts) → this is the famous hard case. `SharedFlow(replay=0)` *drops events emitted while nobody collects* (e.g., during config change). My settled position after years of arguing: **model events as state** (a `pendingNavigation: Destination?` field, consumer calls `onNavigationHandled()` to null it) — survives config change and process death, testable, boring. Boring wins.
- **Backpressure:** on Android you almost never want `buffer()`; you want `conflate()` or `collectLatest` — the UI only cares about the newest value. `collectLatest` + a suspending render is the idiomatic "cancel stale work on new input." For search-as-you-type: `debounce(300).distinctUntilChanged().mapLatest { search(it) }` — this five-token pipeline replaces the hand-rolled, race-prone "cancel previous request" code I've deleted from a dozen codebases.
- **`flowOn` confusion:** affects *upstream* only. `flow.flowOn(IO).map { }` runs `map` on the *collector's* context. When someone can't explain where each operator runs, restructure so it doesn't matter: make the flow's leaf functions main-safe and delete the `flowOn`.

## Callable capabilities

- Subagent **`anr-root-cause-tracer`** — operationalizes failure mode 1 across a codebase.
- Skill **`lifecycle-leak-reviewer`** — catches scope misuse (decision tree above) in PRs.
