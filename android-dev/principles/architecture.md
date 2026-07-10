# Architecture — Unidirectional Data Flow, Layering, and Knowing When to Stop

> **Applies to:** Kotlin 2.2, Compose BOM 2026.06, Jetpack ViewModel/Navigation 2.9.x, Hilt 2.5x · **Last reviewed:** 2026-07-06
> **Related:** [lifecycle-and-state.md](lifecycle-and-state.md) · [concurrency.md](concurrency.md) · [testing.md](testing.md) · [build-and-release.md](build-and-release.md) · guide: [build-from-scratch.md](../guides/build-from-scratch.md)

## What architecture is for (and the trap)

Architecture on Android exists to solve exactly three recurring problems:

1. **The OS destroys your objects** (config change, process death) — so state must live somewhere with a defined lifetime. → [lifecycle-and-state.md](lifecycle-and-state.md)
2. **The UI thread must never wait** — so async must be structural, not ad-hoc. → [concurrency.md](concurrency.md)
3. **Logic must be testable without an emulator** — so business code must not touch Android types. → [testing.md](testing.md)

Any architectural element that doesn't serve one of these three is ceremony. The trap I've watched teams fall into for two decades — from Clean-Architecture-maximalism through MVI-framework-of-the-month — is adopting *structure* as a proxy for *discipline*. Twelve interfaces per feature don't prevent a `GlobalScope.launch`; a Konsist test does. Add layers when a concrete pressure demands them, and be able to name the pressure.

## The layering that has survived every fad

```
UI layer          Compose screens (stateless) + ViewModel (state holder)
                    │  exposes: StateFlow<UiState>, fun onEvent(e)
                    │  never exposes: suspend funs to UI, mutable state, Android views to VM
Domain layer      OPTIONAL. Use-case classes ONLY where logic is (a) shared by 2+ VMs,
(use cases)         or (b) complex enough to name and test in isolation.
                    A use case that is one line delegating to a repository is noise —
                    I've deleted thousands of lines of `class GetUserUseCase(repo) {
                    operator fun invoke() = repo.getUser() }`. Add them per-case, not per-rule.
Data layer        Repository (the API other layers see) → data sources (Room, Retrofit, DataStore).
                    Contract: main-safe suspend/Flow, domain types out (map DTOs HERE),
                    single source of truth per entity.
```

**Unidirectional data flow (UDF)** is the one non-negotiable: state flows down (`StateFlow<UiState>` → composables as parameters), events flow up (lambdas → `onEvent`). Every violation I've debugged — a composable writing a VM property directly, two VMs both owning "the cart" — eventually produced the same symptom: *state you can't reason about at 2 a.m. during an incident.*

### UiState design rules (hard-won)

- **One `data class UiState` per screen** (or a sealed hierarchy of Loading/Content/Error when the states share nothing). Not seventeen separate `StateFlow`s — consumers need a consistent snapshot; separate flows tear (list from one emission, selection from another → IndexOutOfBounds in prod).
- **UiState is immutable and contains no behavior** — data class, `val`s, immutable collections.
- **Model events-to-UI as state**, not SharedFlow — see the settled position in [concurrency.md](concurrency.md) ("Flow judgment calls").
- The VM **transforms**, the UI **renders**: no `if (user.subscription == PREMIUM && …)` in composables. If a designer question ("when exactly does this badge show?") requires reading composables, the logic is in the wrong layer.

## MVVM vs MVI (asked in every design review since 2019)

They differ less than their advocates claim once you adopt single-UiState + UDF. Actual decision:

- **Default: "MVVM with a single UiState"** (which is 80% of MVI's value): `StateFlow<UiState>` + plain `fun onX()` methods per event.
- **Full MVI** (sealed `Intent` type, single `reduce`, explicit effect channel) earns its ceremony when: state transitions are complex enough to want an auditable reducer (editors, players, multi-step wizards), you need state-transition logging/time-travel for debugging, or a large team needs the structure to converge on.
- **Never adopt an MVI *framework*** (Orbit, MVIKotlin, homegrown) before feeling the pain it solves. Framework lock-in outlives the fad; sealed classes and a `when` don't.

## Dependency injection

Hilt is the default: compile-time validated, lifecycle-integrated (`@HiltViewModel`, `SavedStateHandle` injection for free), understood by every hire. Koin is defensible in KMP codebases ([kotlin-multiplatform.md](../topics/kotlin-multiplatform.md)); manual DI is defensible below ~10 injectable classes. What is *not* defensible is the pattern DI exists to prevent: **singletons with mutable state accessed statically** (`object SessionManager { var user: User? }`) — untestable, hidden coupling, and a process-death trap (that `var` silently resets to null when the process is recreated, and the app "randomly logs out"; I've root-caused exactly this at three different companies — it is *the* classic process-death bug).

**Scoping discipline:** `@Singleton` for stateless services and true app-wide state only. A `@Singleton` holding per-user state must be explicitly reset on logout — audit these at review; they're the #1 source of "previous user's data flashed after account switch" (a privacy incident, not a cosmetic bug).

## Failure modes

| Failure | Detection | Fix | Prevention |
|---|---|---|---|
| Android types below the VM (Context in repo, Activity in use case) | Konsist/lint import scan | pass primitives/abstractions down; `applicationContext` behind an injected interface where unavoidable | Kotlin-only `domain` module — makes it a compile error ([build-and-release.md](build-and-release.md)) |
| God ViewModel (1000+ lines, 8 concerns) | line count + flow count per VM | split by screen region or extract use cases/state holders | review heuristic: VM > ~300 lines triggers a design conversation |
| Two sources of truth for one entity (cart in VM *and* singleton *and* DB) | "stale after X" bug pattern | pick the SSOT (usually data layer), everything else observes | repository-per-entity ownership table in docs |
| Stateful composables accreting logic | composables with 5+ `remember`/branches on business rules | hoist state to VM; composable takes `UiState` + lambdas | `compose-recomposition-auditor` flags business logic in bodies |
| Layer bypass (UI calls Retrofit service directly "just this once") | dependency graph / import scan | route through repository | module boundaries: UI module has no Retrofit dependency |

## Navigation

- Navigation-Compose with **type-safe routes** (kotlinx-serialization `@Serializable` route classes, Navigation 2.8+). String-route concatenation was a bug factory (encoding, nullability) — don't write new string routes.
- Arguments are IDs, not objects. Passing a full `User` through navigation breaks on process death and creates a second source of truth; pass `userId`, let the destination's VM load from the repository (SSOT holds).
- Cross-feature navigation behind an interface in `core:navigation` so feature modules stay independent ([build-and-release.md](build-and-release.md)).

## When to deviate

Deviation is fine when you can write the pressure down: prototypes wearing their throwaway status honestly; a legacy migration living in a hybrid state *with a direction*; a genuinely local-only trivial screen keeping state in `rememberSaveable` without a VM. The failure isn't deviation — it's *undocumented* deviation that the next engineer copies as precedent. Every deviation gets a comment naming the tradeoff; then it's a decision, not a hole.

## Callable capabilities

- Guide **[build-from-scratch.md](../guides/build-from-scratch.md)** — this doc's rules, instantiated in a working minimal app.
- Guide **[analyze-existing-app.md](../guides/analyze-existing-app.md)** — how to reverse-engineer an unknown codebase's actual architecture (vs its claimed one).
- Skills `lifecycle-leak-reviewer`, `compose-recomposition-auditor` enforce the UI-layer contracts above.
