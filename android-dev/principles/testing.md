# Testing — What to Test, Where to Run It, and When Coverage Numbers Lie

> **Applies to:** Kotlin 2.2, kotlinx-coroutines-test 1.10.x, Compose BOM 2026.06, Robolectric 4.14+, JUnit 4/5, Turbine 1.2 · **Last reviewed:** 2026-07-06
> **Related:** [concurrency.md](concurrency.md) · [architecture.md](architecture.md) · guide: [build-from-scratch.md](../guides/build-from-scratch.md)

## The economics, stated plainly

Android tests have wildly different cost curves:

| Layer | Runtime | Flake rate (honest) | Where bugs actually live |
|---|---|---|---|
| JVM unit (ViewModel/domain/data) | ms | ~0 | most logic bugs — **put 80% of effort here** |
| Robolectric | 100 ms–1 s | low | Android-API-touching logic |
| Compose UI test (device/Robolectric) | 1–10 s | moderate | state-to-UI wiring |
| Espresso/instrumented e2e | 10 s–min | **high** | integration seams; also where flakes live |

The strategic consequence: **architecture exists partly to move logic down this table.** A ViewModel that needs an emulator to test is an architecture bug (see [architecture.md](architecture.md)). Every hour spent making domain code Android-free repays itself in test speed forever.

## Coroutine & Flow testing — where most test bugs live

### The rules

1. **Inject dispatchers** ([concurrency.md](concurrency.md) failure #5). Code with a hardcoded `Dispatchers.IO` inside is untestable-in-principle: `runTest`'s virtual clock can't see real threads, so your test either flakes or sneaks in real delays.
2. `runTest` skips `delay`s on the *test* dispatcher — that's its point. If your test needs `Thread.sleep`, something is wrong upstream.
3. **`StandardTestDispatcher` vs `UnconfinedTestDispatcher`, the honest guidance:** Standard queues coroutines until the clock advances (`advanceUntilIdle()`/`runCurrent()`) — deterministic, forces you to be explicit about ordering; use it as the default. Unconfined runs eagerly — convenient for "collect this StateFlow now" setup lines, but it hides ordering bugs because production dispatchers are never unconfined. When a test passes with Unconfined and fails with Standard, the *code* usually has an ordering assumption bug — that test just found something; don't "fix" it by switching dispatchers.
4. A `MainDispatcherRule` (swap `Dispatchers.Main` for a test dispatcher) is mandatory boilerplate for any VM test — `viewModelScope` uses `Main` and JVM tests have no `Main`.

### Testing flows

- **Turbine** (`flow.test { awaitItem() … }`) for anything beyond a single emission. Hand-rolled `launch { flow.toList(results) }` collection works but reinvents Turbine badly — timeouts, unconsumed-event detection, and failure messages are why Turbine exists.
- **The `stateIn(WhileSubscribed)` trap:** a VM exposing `stateIn(..., WhileSubscribed(5000), initial)` emits only `initial` in tests unless *something collects it* — the upstream never starts. Every team hits this once and loses an afternoon. Pattern: start a collector (Turbine does this naturally) *then* act, or in setup: `backgroundScope.launch { vm.state.collect() }`.
- Assert on **states, not sequences**, where possible: `awaitItem() shouldBe Loading; awaitItem() shouldBe Content(x)` is brittle to conflation (StateFlow conflates! intermediate states may legally vanish). Prefer "eventually reaches `Content(x)`" semantics (`expectMostRecentItem()`) unless the intermediate state is a contract.

## Compose UI testing

- `createComposeRule` + `setContent` testing a **stateless** composable with fake state and captured callbacks is 90% of the value at 10% of the cost: no VM, no DI, no navigation. This is the payoff of state hoisting.
- Finders: prefer semantics the user perceives (`onNodeWithText`, roles, state descriptions) — doubles as an accessibility audit. `testTag` is for genuinely un-semantic nodes only; a screen navigated entirely by testTags is telling you TalkBack users can't navigate it at all.
- Synchronization: Compose tests auto-wait for composition/layout idle, but **not** for your coroutines on injected dispatchers or for infinite animations. Infinite animations are the top cause of "test hangs then times out" — gate them behind a param or use `composeTestRule.mainClock` manual control.
- Run Compose UI tests on **Robolectric** (they work since Robolectric 4.9+) for CI speed; keep a small device-executed smoke set for input/IME/scroll physics, which Robolectric approximates imperfectly.

## Robolectric vs instrumented — the decision

```
Pure logic, no Android types        → plain JVM. Don't pay Robolectric's classloader tax.
Android types but no real UI/IPC    → Robolectric (Context, resources, Room with in-memory DB,
                                      SharedPreferences, Uri parsing).
Real rendering/IME/system services/ → instrumented on emulator (GMD — see below).
  binder behavior, WorkManager
  constraint semantics, Keystore
Anything where Robolectric shadow   → instrumented. A test passing against a shadow that
  behavior differs from the device    lies is worse than no test: it certifies falsely.
  (camera, GL, some media)
```

Room deserves a note: in-memory Room on Robolectric is fast and honest for DAO logic, but **migration tests** (`MigrationTestHelper`) should run instrumented at least once per release — SQLite versions differ between the JVM's bundled SQLite and devices, and I have seen a migration pass on Robolectric and corrupt data on API 26 devices due to SQLite version behavior differences.

**Gradle Managed Devices (GMD)** for CI emulators — declarative, cacheable, no hand-rolled emulator scripts in CI YAML. Hand-rolled emulator boot scripts are where CI maintenance time goes to die.

## Coverage and mutation testing — when numbers lie

- **Line coverage is a floor-finder, not a goal.** Below ~40% on core modules you're flying blind; the difference between 75% and 90% is usually tests of getters and mapping boilerplate. Never gate a PR on "coverage must not decrease" globally — it produces assertion-free tests written to appease the gate (I've deleted hundreds of such tests; they had no assertions or asserted `!= null` on non-nullable Kotlin types).
- **Mutation testing** (PIT with Kotlin support / pitest-kotlin, or Arcmutate for commercial): mutates your code and checks tests fail. This measures what coverage pretends to: *do the tests constrain behavior?* It's expensive — run nightly, scoped to `domain`/`data` modules only (mutating UI modules mostly measures your Compose snapshot noise).
- **What score is meaningful:** on domain/business-logic modules, a mutation score of **~70–85% killed** is a strong suite; below 50% your green checkmarks are decorative. 100% is not a goal — equivalent mutants and defensive code make the last 15% cost more than the bugs it prevents. Use the *surviving-mutant report*, not the score, as the deliverable: each surviving mutant on a business rule is a specific missing test, reviewable in ten minutes.

## Failure modes summary

| Failure | Detection | Fix | Prevention |
|---|---|---|---|
| Flaky instrumented suite → devs ignore red | flake-rate dashboard per test | quarantine + fix or delete; move logic down the pyramid | flake budget: >2% auto-quarantines |
| Tests pass, prod breaks (mocked everything) | mutation testing; incident retros | fakes over mocks for repositories; contract tests at seams | team rule: mock only what you don't own, fake what you do |
| Hardcoded dispatcher untestability | test needs `Thread.sleep` | inject dispatchers | lint ban on `Dispatchers.` literals ([concurrency.md](concurrency.md)) |
| `stateIn` never-starts trap | state stuck at initial in test | collect before acting | shared VM-test base class encoding the pattern |
| Coverage-gaming assertion-free tests | mutation score vs coverage gap | delete them | review: every test names the behavior it constrains |

## Callable capabilities

- Skills `lifecycle-leak-reviewer` / `compose-recomposition-auditor` both check that fixes come with a regression test where one is feasible.
- Guide [build-from-scratch.md](../guides/build-from-scratch.md) contains a worked example of the full VM + Turbine + Compose-rule test stack.
