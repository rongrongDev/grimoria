# Testing: Boundaries, Async Correctness, Snapshots, UI Tests, and Mutation Scores

> **Applies to:** Swift 6.2 · Xcode 26 (Swift Testing + XCTest both supported) · iOS 17+ · SnapshotTesting 1.x (Point-Free) · Muter (latest) · **Last reviewed:** 2026-07-06

## Where each kind of test earns its keep

| Layer | Framework | What it should assert | Budget |
|---|---|---|---|
| Pure logic, models, reducers | Swift Testing (`@Test`, `#expect`) | Behavior with injected dependencies | The bulk — hundreds, milliseconds each |
| View models / services (integration across your own seams) | Swift Testing | Wiring: does the VM call the repo, map errors, publish state | Dozens |
| Rendered UI | SnapshotTesting | Pixel/hierarchy output of a view given fixed state | Dozens, curated |
| Full-app flows | XCUITest | The 5–10 revenue-critical paths only | Few; each costs minutes and flake-risk |
| Deallocation / perf | XCTest (`XCTMemoryMetric`, launch metrics) | Lifetimes and regressions | Per-flow, see [memory-management.md](memory-management.md) / [performance.md](performance.md) |

**The boundary rule:** a *unit* test's subject owns no clock, no network, no disk, no singletons. If a test needs `sleep`, a real URL, or ordering luck, it's an integration test wearing a unit test's runtime budget — move the dependency behind a protocol and inject it. Testability problems are architecture problems surfacing early; don't fix them in the test.

New code: **Swift Testing** (`@Test`, `#expect`, parameterized tests, `confirmation`). Keep XCTest where you need `XCUITest`, performance metrics, or `XCTestExpectation`-heavy legacy — they coexist in one target.

---

## Failure catalog (failure → detection → fix → prevention)

### 1. Async tests that pass by luck (or hang by design)

**Failure.** (a) Firing async work then asserting immediately — passes on fast CI, fails on slow, or worse, always passes because it asserts before anything happened. (b) `sleep`/`Task.sleep` to "wait for" completion — flaky *and* slow; the sleep is always either too short (flake) or too long (waste). (c) `waitForExpectations` with generous timeouts papering over a race.

**Detection.** Flake-rate dashboards; grep tests for `sleep`, `Task.sleep`, timeout > 2 s.

**Fix.** Make completion *awaitable*, not observable-by-polling:
- The method under test is `async` → just `await` it. Most "how do I wait" questions dissolve when the API is properly async.
- Fire-and-forget internals → restructure so tests can await (expose `func load() async` and have the `.task` call it — now tests call `await vm.load()` directly and assert after).
- Event counting → Swift Testing `confirmation("event fired", expectedCount: 2) { confirm in … }`.
- **Control the clock.** Inject `any Clock<Duration>` (or Point-Free's `TestClock`) wherever code debounces/times out; tests advance time explicitly. This is what makes debounce/retry logic testable in microseconds, and what lets you express the out-of-order-response race test from [async-patterns.md](async-patterns.md) §1 deterministically.

**Prevention.** Lint: `sleep(` in test targets ⇒ error. Review rule: injected clock for any time-dependent code.

### 2. Testing actors and `@MainActor` types wrong

**Failure.** (a) Tests touch actor state via multiple unsynchronized tasks and assert intermediate values — nondeterministic by construction. (b) `@MainActor` view models tested from nonisolated test methods: pre-Swift-6 this silently ran main-actor code off-main (testing a lie); Swift 6 mode makes it a compile error — teams then scatter `MainActor.assumeIsolated` instead of the right fix.

**Fix.**
- Annotate the test *suite* to match the subject: `@MainActor struct ProfileVMTests { … }` — every test runs isolated correctly, awaits hop as needed. (Swift Testing runs `@Test` functions on arbitrary executors unless you isolate them.)
- Test actors through their **async API surface**, asserting *post-conditions*, never internal ordering. To exercise reentrancy ([concurrency.md](concurrency.md) §2): launch N concurrent calls in a `TaskGroup`, await all, assert the invariant (e.g., "download ran once"):

```swift
@Test func cacheDownloadsOnce() async throws {
    let (cache, spy) = makeCacheWithSpy()
    try await withThrowingTaskGroup(of: UIImage.self) { group in
        for _ in 0..<50 { group.addTask { try await cache.image(for: url) } }
        for try await _ in group {}
    }
    #expect(spy.downloadCount == 1)      // fails loudly on the reentrancy bug
}
```

**Prevention.** Template test files per subject kind (actor / @MainActor VM / pure logic) so the isolation annotation comes free.

### 3. Snapshot tests that cry wolf (or never cry)

**Failure.** (a) Unpinned environment: snapshots recorded on an M-series Mac / iOS 26.0 simulator fail en masse on CI's 26.1 image — team learns to re-record on red, at which point the suite verifies nothing. (b) Over-snapshotting: 900 snapshots of every state of every view; any design-token change means an hour of image diff review, so reviewers rubber-stamp. (c) Snapshotting animated/async content mid-flight — nondeterministic pixels.

**Fix.**
- **Pin everything:** device (`ViewImageConfig.iPhone13` or one fixed config), OS (CI simulator runtime version-locked and recorded in the repo), locale, light/dark explicitly, fixed `traits`. Record on CI or in a container matching CI — never "whatever simulator was open."
- `precision`/`perceptualPrecision` (e.g., `perceptualPrecision: 0.98`) absorbs GPU-level antialiasing noise across hardware without absorbing real regressions.
- Curate: snapshot *canonical* states (empty, loaded, error, long-text/RTL/huge-Dynamic-Type) of *design-system components and full screens*, not every intermediate. Prefer text-hierarchy snapshots (`as: .recursiveDescription`) where layout, not pixels, is the contract — they diff readably in PRs.
- Inject fixed data/time (snapshot a view whose model contains `Date.now` and it expires tomorrow).

**Prevention.** CI job fails if recorded-OS ≠ runtime-OS; a `record` mode gated behind an explicit flag so accidental re-record can't merge.

### 4. XCUITest flakiness economics

**Failure.** 40-minute UI suites at 85% pass rate. Team retries red builds by habit ⇒ real regressions ride the retry through ⇒ the suite has negative value (cost without signal).

**Fix.**
- Cut scope to the flows whose breakage is a company incident (launch→login, purchase, core loop). Everything else moves down the pyramid.
- Determinism kit: launch arguments switching the app to **mock network + fixed clock + reset state** (`app.launchArguments += ["-uiTesting"]`; the app composition root reads it and swaps dependencies). UI tests against live backends are end-to-end tests — run those nightly, not per-PR.
- Replace every `sleep` with existence waits (`element.waitForExistence(timeout:)`); prefer accessibility identifiers over label text (labels change with copy/localization).
- Quarantine lane: a flaky test moves to non-blocking within a day, with an owner and a fix-by date — a flaky blocking test trains people to ignore CI.

**Prevention.** Track per-test pass rate; alert under 99%. New UI test requires justification for why the check can't live lower in the pyramid.

### 5. Coverage theater — and what a mutation score is actually for

**Failure.** 90% line coverage from tests that *execute* code and assert nearly nothing (or assert `!= nil`). Coverage measures execution, not verification; teams gate on it and ship logic bugs through green builds.

**Detection → mutation testing (Muter).** Muter mutates your source (flips `>=` to `<`, negates conditions, removes side effects) and re-runs tests; surviving mutants = code your tests execute but don't verify.

**What score means (from running it on real codebases):** don't chase a global number. Muter on a whole app target is slow (full rebuild per mutant batch) and the global score mixes trivial UI glue with core logic. Run it **scoped to the modules where a logic bug is expensive** (pricing, sync, permissions, reducers). There, treat **< ~60% as alarming, 75–85% as healthy**; pushing past ~90% buys asymptotically little and encourages brittle over-specified tests. The *list of surviving mutants* is the deliverable — each one is a concrete missing assertion; triage those, ignore the headline number's second decimal.

**Prevention.** Nightly/weekly Muter run on the 2–3 critical modules with surviving-mutant diffs posted to the team; never a per-PR gate (too slow, too noisy).

## Prevention summary

| Gate | Mechanism |
|---|---|
| Flaky async tests | `sleep` banned in test targets; injected clocks |
| Isolation-wrong tests | Suite-level `@MainActor`/actor-API-only conventions + Swift 6 mode |
| Snapshot drift | Pinned simulator runtime in CI; record-flag gating |
| UI-suite decay | Pass-rate tracking, quarantine lane, mock-mode launch args |
| Coverage theater | Scoped Muter runs on critical modules, surviving mutants triaged |

**Related:** deallocation tests → [memory-management.md](memory-management.md) · out-of-order network mocks → [async-patterns.md](async-patterns.md) · test-first architecture leverage → [../principles/architecture-judgment.md](../principles/architecture-judgment.md)
