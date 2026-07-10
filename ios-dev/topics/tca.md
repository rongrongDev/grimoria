# The Composable Architecture (TCA) — Production Patterns & Pitfalls (Extended Tier)

> **Applies to:** TCA 1.x (observation era: `@Reducer`, `@ObservableState`, `@Dependency`) · Swift 6.2 · iOS 17+ · **Last reviewed:** 2026-07-06
> Extended-tier doc: what actually happens when teams run TCA in production. The adopt/don't-adopt argument lives in [../principles/architecture-judgment.md](../principles/architecture-judgment.md); mechanics of vanilla state ownership in [state-and-architecture.md](state-and-architecture.md).

## The shape, in one block (for readers who've never seen it)

```swift
@Reducer
struct Feature {
    @ObservableState
    struct State: Equatable { var items: [Item] = []; var isLoading = false }
    enum Action { case load, loaded(Result<[Item], Error>) }
    @Dependency(\.apiClient) var api

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .load:
                state.isLoading = true
                return .run { send in await send(.loaded(Result { try await api.fetchItems() })) }
            case let .loaded(result):
                state.isLoading = false
                state.items = (try? result.get()) ?? state.items
                return .none
            }
        }
    }
}
```

All state mutation happens in the reducer; all side effects are returned `Effect`s; dependencies are injected via the dependency system; `TestStore` replays actions and asserts **every** state change and effect exhaustively.

## Production patterns

1. **Exhaustive `TestStore` tests are the product you're buying.** If your team writes TCA but tests with `store.exhaustivity = .off` everywhere, you've paid TCA's complexity tax for MVVM-grade assurance. Pattern: exhaustive tests for reducers with real logic; non-exhaustive reserved for long-flow integration tests, each with a comment saying why.
2. **Dependencies through `@Dependency`, all of them.** The moment one service is reached via a singleton "just this once," test determinism dies silently — the suite still passes, on live clocks and real UserDefaults. `@Dependency(\.continuousClock)` + `TestClock` is how debounce/retry logic gets microsecond-fast deterministic tests ([testing.md](testing.md) §1). CI grep: `.shared` / `Date()` / `UUID()` inside reducer bodies ⇒ flagged (use `@Dependency(\.date)`, `\.uuid`).
3. **Scope state narrowly at view boundaries.** Views observe stores; with `@ObservableState` invalidation is per-field (same machinery as `@Observable`), but passing a parent store into every leaf still couples features. Child features get scoped stores (`store.scope(state:action:)`); leaves that need two fields get two fields.
4. **Tree-based navigation (`@Presents`, `StackState`) instead of hand-rolled booleans** — you get deep-linking, state restoration, and testable navigation as data. This is TCA's genuinely differentiated feature; teams that adopt TCA but keep `@State var showsSheet` navigation left the best part on the table.

## Pitfalls (failure → detection → fix)

### 1. The giant-app-state performance cliff

**Failure.** One root store with the entire app's state; every action funnels through the root reducer; large `Equatable` states diffed per action. Symptoms: typing lag in text fields bound to store state (an action per keystroke traversing the whole reducer tree), Time Profiler showing `==` on big states and reducer dispatch high in the profile.

**Fix.** Keep high-frequency interaction state (in-progress text, scroll positions, gesture state) in *local* `@State`, committing to the store on meaningful boundaries (submit, debounce) — TCA's authors endorse this; storing every keystroke is a misreading of "single source of truth." Scope child stores so actions short-circuit; check `Reducer` composition depth on hot paths.

**Detection.** Instruments: Time Profiler on a typing/scrolling session; any `Equatable.==` of app-level State in the hot stack is the tell.

### 2. Effect lifetime ≠ view lifetime

**Failure.** A `.run` effect subscribing to a long-lived stream (`for await` on a socket) started by `.onAppear` action, never cancelled — feature dismissed, effect lives on, sends actions into a store whose state moved on (or crashes on force-unwrapped child state). TCA's version of [memory-management.md](memory-management.md) §5.

**Fix.** Every long-lived effect gets `.cancellable(id:)`; teardown action (or `@Presents` dismissal, which auto-cancels child effects in tree-based navigation) sends `.cancel(id:)`. Review rule: `.run` containing `for await` without `.cancellable` ⇒ change requested.

### 3. Version-churn risk as an operational fact

**Failure.** TCA 0.x→1.x and the observation migration were *real* multi-week migrations; teams stuck on old majors accumulate a fork's maintenance burden — pinned to old Swift/Xcode behaviors, community answers no longer match your API surface.

**Mitigation.** Budget one engineer-week per year for TCA majors as a line item (not a surprise); isolate TCA types from your domain layer (reducers import your models; your models never import ComposableArchitecture) so the blast radius of a TCA API change is the feature layer only. That import rule is CI-greppable and is the single best TCA-risk hedge.

### 4. Half-adoption incoherence

**Failure.** Some features TCA, some MVVM, dependencies reached both via `@Dependency` and singletons, navigation half in `StackState` half in `NavigationPath`. Every seam between the worlds is hand-glued and untested; new engineers learn *two* architectures and the glue. This outcome is worse than either architecture done consistently — it's the most common TCA failure I've seen, and it's organizational, not technical.

**Fix.** Adopt per **bounded region** (a whole tab/flow), not per file; write the seam pattern down once (how a TCA feature is hosted inside a UIKit/MVVM shell and vice versa — `UIHostingController` + store ownership rules); set a direction (all-in within N quarters, or TCA-for-new-complex-features-only) and hold it. No third state.

## Minimum bar for a TCA codebase

- [ ] Reducer logic covered by exhaustive `TestStore` tests; non-exhaustive tests carry justification comments
- [ ] No `Date()`/`UUID()`/`.shared` in reducers (CI grep) — dependency system only
- [ ] Long-lived effects `.cancellable`, teardown verified in tests
- [ ] Domain models free of `import ComposableArchitecture`
- [ ] High-frequency UI state local, committed on boundaries
- [ ] TCA major-version budget acknowledged by the team lead in writing

**Related:** adopt/don't decision → [../principles/architecture-judgment.md](../principles/architecture-judgment.md) · observation mechanics shared with vanilla → [state-and-architecture.md](state-and-architecture.md) · clock injection → [testing.md](testing.md)
