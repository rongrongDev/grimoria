# SwiftUI State Ownership, View Identity, and Architecture

> **Applies to:** Swift 6.2 · SwiftUI iOS 17+ (`@Observable` era; `ObservableObject` legacy notes inline) · Xcode 26 · **Last reviewed:** 2026-07-06
> **Judgment companion:** [../principles/architecture-judgment.md](../principles/architecture-judgment.md) · TCA depth: [tca.md](tca.md)

## The two ideas everything else hangs on

**1. Ownership.** Every piece of state has exactly one owner. The property wrapper you choose *declares* ownership; SwiftUI *enforces* your declaration, including the parts you didn't mean.

| Wrapper | Declares | Lifetime |
|---|---|---|
| `@State` | "this view owns and creates it" | Survives body re-evaluation; **destroyed when view identity changes** |
| `@Binding` | "borrowed; owner is elsewhere" | Owner's |
| `@State` + `@Observable` class | modern owned view-model | Same as `@State` |
| `@StateObject` (legacy `ObservableObject`) | owned reference-type model | Same as `@State` |
| `@ObservedObject` / plain `@Observable` param | borrowed reference-type model | **None — caller must own it** |
| `@Environment` | borrowed from an ancestor's injection | Injector's |

**2. Identity.** SwiftUI decides "is this the *same* view as last frame" structurally (position in the type tree, `ForEach` IDs) or explicitly (`.id()`). Same identity ⇒ state persists, transitions animate. New identity ⇒ **all `@State`/`@StateObject` below that point is discarded and rebuilt.** Most "my state randomly resets," "my task restarts," and "my animation jumps" bugs are identity bugs, not state bugs.

---

## Failure catalog (failure → detection → fix → prevention)

### 1. View-model churn: `@ObservedObject`/plain init where ownership was intended

**Failure.**

```swift
struct ProfileView: View {
    @ObservedObject var model = ProfileViewModel()   // ← new VM every time the PARENT re-evaluates
    // modern equivalent of the same bug:
    // let model = ProfileViewModel()                // @Observable, created in init — same churn
}
```

Parent re-renders (any parent state change) ⇒ `ProfileView.init` runs ⇒ fresh view model ⇒ in-flight loads restart, scroll position resets, text fields clear. Intermittent, because it only bites when the parent happens to update — the classic "works in preview, breaks in app."

**Detection.** Log `init`/`deinit` of the VM (or use `Self._printChanges()` in body). Symptom heuristic: state that resets "sometimes," correlated with unrelated UI activity.

**Fix.** Owner creates with `@State` (Observable) / `@StateObject` (ObservableObject); everyone else borrows:

```swift
struct ProfileView: View {
    @State private var model: ProfileViewModel      // @Observable class
    init(userID: User.ID) { _model = State(initialValue: ProfileViewModel(userID: userID)) }
    // Note: the State initialValue is captured on FIRST creation for a given identity —
    // a changed userID with the same view identity will NOT rebuild the VM. If it should,
    // that's an identity decision: .id(userID) on the view. (See §2 — this is a feature.)
}
```

**Prevention.** Lint: `@ObservedObject` with an inline default value ⇒ error. Review rule: every `@Observable` VM has exactly one `@State` owner; passing a VM down = plain `let`.

### 2. Identity churn destroying state (and spawning `.task`s)

**Failure.** Conditional branches change structural identity:

```swift
if isLoading { ContentView(model: model).overlay(spinner) }
else         { ContentView(model: model) }          // ← DIFFERENT identity than the if-branch
```

Each toggle of `isLoading` destroys and recreates `ContentView`'s subtree: `@State` gone, `.task` cancelled and restarted (→ duplicate network calls), transitions replace instead of animate. Same failure from an unstable `.id(...)` (e.g., `.id(UUID())` — I've seen it shipped as a "force refresh" hack) and from `ForEach` with non-stable IDs (`id: \.self` on non-unique values, or index-based IDs under reordering).

**Detection.** `Self._printChanges()` in body; onAppear/onDisappear logging firing on every toggle; Instruments' **SwiftUI template → View Body** counts spiking.

**Fix.** Keep one identity and vary its *content*: `ContentView(model: model).overlay { if isLoading { spinner } }`. Use `ForEach` over `Identifiable` items with genuinely stable IDs. Use `.id()` only to *deliberately* reset (search-results list on new query — resetting scroll is then the point).

**Prevention.** Review rule: any `if/else` returning "the same screen twice" is a bug; any `.id(` call needs a comment saying what reset it intends.

### 3. `ObservableObject` over-invalidation (legacy tier, still everywhere)

**Failure.** `ObservableObject` publishes `objectWillChange` for **any** `@Published` change; **every** subscribed view re-evaluates. One 20-property session object observed by 40 views ⇒ whole-app body storm on every keystroke into any field. CPU burn, dropped frames, animation hitches.

**Detection.** Instruments SwiftUI template: body-evaluation counts wildly exceeding interaction counts. `Self._printChanges()` printing `@self, @identity, _session` everywhere.

**Fix (in order).** Migrate the type to `@Observable` (iOS 17+): tracking becomes per-*property* — views re-evaluate only when a property they actually *read in body* changes. If stuck on `ObservableObject`: split the god-object into narrow objects per concern, and pass leaf views plain values instead of the object.

**Prevention.** New code: `@Observable` only. Architecture rule: no view observes an object with more properties than its body reads — pass narrower slices down.

### 4. State duplication and the source-of-truth fork

**Failure.** `@State private var localItems: [Item]` initialized from `model.items`, then edited locally "for responsiveness." Now two truths; a background refresh clobbers user edits, or edits silently never persist. Variant: caching a `@Binding`'s value into `@State` and forgetting to write back.

**Detection.** Bug reports of the "my edit vanished" shape. Grep: `@State` initialized from another state-carrying property.

**Fix.** One owner; everyone else gets `@Binding`/`let`. For deliberate edit-then-commit flows, make the fork *explicit and named* (a draft: copy on sheet-present, merge on Save) rather than incidental.

**Prevention.** Review rule: `@State var x = <something derived from model>` requires a written draft/commit story.

### 5. View-model lifecycle vs. async work (where architecture meets concurrency)

**Failure.** VM spawns `Task {}` in `init`; identity churn (§1/§2) recreates the VM; now N tasks race to write results into whichever VM is newest — stale data flashes, duplicate side effects fire. This is the intersection bug: neither the state doc nor the concurrency doc alone catches it.

**Fix.** Views own async lifetime: `.task(id:)` tied to the input drives loading; the VM exposes `func load() async`. Task cancellation then rides identity *by construction* — an identity change cancels the old load before starting the new. VMs that must own long-lived work store the `Task` and cancel it in `deinit` (and see [memory-management.md](memory-management.md) §5 for why that task must hold `self` weakly).

---

## MVVM vs TCA (the honest tradeoff table)

Full argument in [../principles/architecture-judgment.md](../principles/architecture-judgment.md); the compressed version:

| Axis | Vanilla SwiftUI + @Observable MVVM | TCA 1.x |
|---|---|---|
| Learning curve | Low; new hires productive in days | Weeks; reducer/effect/dependency idioms |
| Testability of logic | Good *if* you inject dependencies (most teams don't, then can't) | Exhaustive by construction (`TestStore` asserts every state change and effect) |
| Consistency across a large team | Drifts — every VM its own micro-architecture | Enforced by the framework's shape |
| Navigation/deep-link state | DIY (`NavigationPath` + discipline) | First-class, serializable, testable |
| Performance ceiling | High; you control observation granularity | Good since ObservableState, but large single stores need care |
| Dependency-update risk | Apple only | Point-Free's release cadence; major-version migrations are real work |

**My rule after watching both fail:** default to MVVM-with-injected-dependencies for apps under ~5 engineers or with simple navigation. Choose TCA when you need *exhaustively tested*, *deeply composed* feature logic and the team will invest in learning it properly — a half-adopted TCA codebase (some features TCA, some ad-hoc, dependencies reached via singletons anyway) is worse than either done consistently. Never adopt TCA to "fix" an architecture problem the team can't articulate; it will faithfully reproduce the confusion with more types.

## Prevention summary

| Gate | Mechanism |
|---|---|
| `@ObservedObject`/`let` VM with inline default | SwiftLint custom rule → error |
| `.id(` without justifying comment | Review checklist |
| `ForEach(... , id: \.self)` on non-Hashable-stable data | Review checklist + runtime duplicate-ID warnings in console (treat as errors) |
| Body-evaluation regression | Instruments SwiftUI template pass before each release on the 3 heaviest screens |
| VM ownership correctness | `assertDeallocated` tests ([memory-management.md](memory-management.md)) — churned VMs show up as *extra* instances |

**Related:** async loading races → [async-patterns.md](async-patterns.md) · body-evaluation cost → [performance.md](performance.md) · TCA specifics → [tca.md](tca.md)
