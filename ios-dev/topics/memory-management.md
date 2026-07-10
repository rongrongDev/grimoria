# Memory Management: ARC, Retain Cycles, and the Leaks You'll Actually Ship

> **Applies to:** Swift 6.2 / Swift 6 language mode · iOS 17+ deployment · Xcode 26 (memory graph, Instruments 26) · **Last reviewed:** 2026-07-06
> **Judgment companion:** [../principles/memory-judgment.md](../principles/memory-judgment.md) · **Callable:** `.claude/skills/retain-cycle-reviewer`

## ARC in three paragraphs (the parts that matter)

ARC inserts retain/release at **compile time** based on ownership rules — it is not a garbage collector. Consequences: deallocation is deterministic (you can unit-test it), there is no cycle collector (cycles leak forever), and lifetime is exactly as long as the strongest reference chain from a root (globals, the view hierarchy, running Tasks, dispatch queues holding blocks).

Three reference flavors: **strong** (default, +1 retain), **weak** (no retain, zeroed to `nil` on target dealloc via a side table — always Optional, small runtime cost), **unowned** (no retain, *not* zeroed — access after dealloc is a deterministic trap: `Fatal error: Attempted to read an unowned reference but object 0x… was already deallocated`). `unowned(unsafe)` skips even the trap and dangles; never use it outside FFI.

Closures are reference types. A closure **strongly captures** every reference-type variable it uses unless the capture list says otherwise. Structs holding closures still participate: the struct is copied, but the closure inside is a shared reference.

---

## Failure catalog

Each entry: **failure mode → detection → fix → prevention.**

### 1. Closure retain cycle (`self` → stored closure → `self`)

**Failure.** An object stores a closure (handler property, Combine sink, callback registration) that captures `self` strongly. Retain count never hits zero; `deinit` never runs. Symptoms: memory climbs per screen visit; view controllers keep receiving notifications/timers after dismissal; "impossible" states because two instances of the same screen are alive.

```swift
final class SearchViewModel {
    var onResults: (([Result]) -> Void)?
    private var debouncer = Debouncer(delay: 0.3)

    func queryChanged(_ q: String) {
        debouncer.schedule {           // Debouncer stores this closure…
            self.performSearch(q)      // …which captures self strongly. Cycle if self stores debouncer. Leak.
        }
    }
}
```

**Detection.**
- **Memory graph debugger** (Debug bar → memory-graph icon): filter to your module, look for instances with the leak badge or an unexpectedly alive VC; select it, read the retainer chain in the left panel. This answers "who is keeping this alive" in under a minute — it's the tool to reach for *first*, before Instruments.
- **`deinit` canary:** during development, log or breakpoint `deinit` on every screen-level object. Dismiss the screen; no log ⇒ leak. Cheap and brutal.
- **Instruments → Leaks** finds *unreferenced* cycles only. A cycle rooted to a live object (e.g., a static registry) is "abandoned memory," invisible to Leaks — use Allocations with generation marking (see §Detection workflow).

**Fix.** Capture-list decision tree (the full argument is in [../principles/memory-judgment.md](../principles/memory-judgment.md)):

- **Non-escaping closure** (executed before the call returns — `map`, `filter`, most `with...` APIs): plain `self` is *correct*. Adding `[weak self]` here is cargo cult and adds an impossible-nil branch.
- **Escaping + stored on `self` or on something `self` owns** → `[weak self]`, always. This is the cycle case.
- **Escaping + fire-once + short-lived** (network completion, animation completion): plain `self` is often *desirable* — it keeps the object alive to receive the result. Only use `[weak self]` if receiving the result after dismissal is wrong or wasteful.
- **`[unowned self]`** only when you can *prove* the closure cannot outlive `self` — same-object property initialization executed synchronously, or a child whose lifetime is strictly nested. If you have to think about it, you can't prove it; use `weak`.

The `guard let self else { return }` idiom is the default body prologue. Note: after the guard, the *local* `self` is strong for the closure's remaining execution — that's fine and intended (prevents mid-execution deallocation).

**Prevention.**
- SwiftLint: `unowned_variable_capture` (warn on `[unowned`), plus a custom rule flagging stored-closure properties assigned without a capture list.
- Deallocation unit test — put this helper in your test target and use it on every coordinator/view-model:

```swift
func assertDeallocated<T: AnyObject>(_ make: () -> T,
                                     after exercise: (T) -> Void = { _ in },
                                     file: StaticString = #filePath, line: UInt = #line) {
    weak var weakRef: T?
    autoreleasepool {
        let strong = make()
        exercise(strong)
        weakRef = strong
    }
    XCTAssertNil(weakRef, "Instance leaked — check retainer chain in memory graph", file: file, line: line)
}
```

- PR review: run the `retain-cycle-reviewer` skill on any diff adding stored closures, delegates, timers, or Combine subscriptions.

### 2. Delegate cycle (strong delegate property)

**Failure.** `var delegate: FooDelegate?` (strong). The delegating child is owned by its delegate parent ⇒ parent → child → parent cycle. Both leak, and every screen re-entry stacks another pair.

**Detection.** Memory graph: two objects retaining each other with a two-hop chain. Grep is faster: any `var delegate` / `var dataSource` not marked `weak` is guilty until proven innocent.

**Fix.**

```swift
protocol FooDelegate: AnyObject { ... }   // AnyObject constraint is REQUIRED for weak
weak var delegate: (any FooDelegate)?
```

**Prevention.** SwiftLint `weak_delegate` rule (built in). Exception that proves the rule: delegates that are *not* owners (e.g., `CLLocationManagerDelegate` where you own the manager) still should be weak — the cost is one optional; the failure is a leak.

**War story worth internalizing:** `URLSession` **retains its delegate strongly until you call `invalidateAndCancel()` or `finishTasksAndInvalidate()`** — documented, and it still leaks a session-owning object in roughly every third codebase I've audited. If you create a `URLSession` with a delegate, you own an invalidation call. (`URLSession.shared` and delegate-less sessions are exempt.)

### 3. Timer / CADisplayLink / NotificationCenter block observers

**Failure.** These APIs hold your target/closure from a **runloop or singleton root**, so the "cycle" is really a global strong reference — `weak` on your side of a target-action Timer doesn't help because *the runloop retains the timer, and the timer retains the target*.

- `Timer.scheduledTimer(target: self, ...)` → runloop → timer → self. `self.deinit` can never run to invalidate the timer. Chicken-and-egg.
- `NotificationCenter.addObserver(forName:object:queue:using:)` returns a token; the center holds the *closure* strongly until you call `removeObserver(token)`. Capturing `self` strongly in that closure roots `self` in a process-lifetime singleton.
- `CADisplayLink(target: self, ...)` — same shape as Timer; requires `invalidate()`.

**Detection.** Memory graph retainer chain will show `__NSCFTimer` / `NotificationCenter` in the path. Also: screens that keep animating or logging after dismissal.

**Fix.**

```swift
// Timer: block-based + weak, or invalidate at a deterministic lifecycle point
timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
    self?.tick()
}
// AND still invalidate in viewDidDisappear / deinit — weak fixes the leak,
// but a live timer firing no-ops forever is a battery bug, not a fixed bug.

// NotificationCenter (pre-async-sequence style): store token, remove deterministically.
// Better on iOS 15+: for await in NotificationCenter.default.notifications(named:) inside a
// .task — cancellation on view disappearance removes the observer for free.
```

**Prevention.** Ban `Timer.scheduledTimer(target:selector:)` via lint (custom regex rule). Convention: every `addObserver` in a type must have a matching removal visible in the same file, or use the async-sequence form.

### 4. Combine subscription cycles

**Failure.** `publisher.sink { self.update($0) }.store(in: &cancellables)` where `cancellables` lives on `self`: self → cancellables → sink closure → self. The subscription also keeps the *pipeline* alive, so upstream timers/subjects keep firing.

**Fix.** `[weak self]` in every `sink`/`assign` closure stored on `self`. `assign(to: \.prop, on: self)` **cannot take a weak target** — it's a documented cycle factory; use `sink` + weak, or `assign(to: &$published)` (the Published-projected overload, which manages lifetime correctly).

**Prevention.** Custom SwiftLint regex: `assign\(to:.*on:\s*self\)` → error. Code-review rule: any `.store(in: &cancellables)` line ⇒ check the closure above it for a capture list.

### 5. `Task { }` lifetime extension (not a cycle — worse, because Leaks won't see it)

**Failure.** `Task { await self.load() }` strongly captures `self` for as long as the task runs. A task awaiting a never-ending stream (`for await value in socket.values`) keeps the view model alive **forever** after the screen is gone. No cycle exists; Leaks and the memory graph "leak" badge stay quiet; memory just grows per navigation.

**Detection.** `deinit` canary (never fires), memory graph shows a Task-related retainer chain, or Allocations generations show one extra view-model instance per screen visit.

**Fix.** Two independent levers — you usually want both:
1. **Cancel the task at a lifecycle boundary.** SwiftUI `.task {}` does this automatically on identity change/disappearance — prefer it over ad-hoc `Task {}` in view/view-model init. In UIKit, store the task and cancel in `viewDidDisappear`/`deinit`.
2. `[weak self]` in long-running task closures, re-guarding after each `await`:

```swift
task = Task { [weak self] in
    guard let stream = self?.makeStream() else { return }
    for await event in stream {
        guard let self else { return }   // re-check after every suspension
        self.apply(event)
    }
}
```

**Prevention.** Rule: unstructured `Task {}` in an object requires (a) storage + cancellation, or (b) a comment proving it's short-lived and fire-once. The `concurrency-migration-auditor` skill checks this.

### 6. Abandoned memory via caches and static registries

**Failure.** `static var shared` registries, `NSCache`-that's-actually-a-Dictionary, closure-based "listener" arrays that are appended to and never pruned. Not a cycle — a legitimate strong root that nobody prunes. This is the #1 source of "memory grows over a 40-minute session" reports.

**Detection.** Allocations with **generation marking** (below). Leaks shows nothing, by design.

**Fix/Prevention.** Use real `NSCache` (evicts under pressure) for recreatable data; listener lists hold weak boxes or use `NotificationCenter`/AsyncStream with cancellation; respond to memory-pressure warnings (`UIApplication.didReceiveMemoryWarningNotification`, or `DispatchSource.makeMemoryPressureSource`) by purging.

---

## Detection workflow (the one to memorize)

1. **Reproduce with the `deinit` canary** — confirm *what* leaks before hunting *why*.
2. **Memory graph debugger** — run the leak scenario, snapshot, filter to your module, follow the retainer chain of the alive-but-shouldn't-be object. 80% of hunts end here.
3. **Instruments → Allocations, generation marking** for growth-without-cycles: start the app, reach steady state, press **Mark Generation**, perform the suspect flow 3–5 times, mark again after each. Any generation that doesn't trend to ~zero holds abandoned memory; drill into it sorted by persistent bytes. Enable **Malloc Stack Logging** (scheme → Diagnostics) so each allocation carries its backtrace.
4. **Instruments → Leaks** last — it only catches fully unreferenced cycles, but it's cheap to leave running during 3.
5. For the "only after 40 minutes" class: soak it. XCUITest loop driving the flow 200×, `XCTMemoryMetric` via `measure(metrics:)` as the CI gate.

## Prevention summary (CI-enforceable)

| Gate | Tool | Catches |
|---|---|---|
| `weak_delegate`, `unowned_variable_capture` | SwiftLint (built-in) | §2, worst of §1 |
| Custom regex: `assign\(to:.*on: self\)`, `Timer.scheduledTimer(target:` | SwiftLint custom rules | §3, §4 |
| `assertDeallocated` tests on every coordinator/VM | XCTest helper (§1) | §1–§5 |
| `XCTMemoryMetric` soak on the top 3 user flows | XCUITest perf test | §6, slow leaks |
| Skill run on risky diffs | `retain-cycle-reviewer` | all, at review time |

**Related:** lifetime-vs-cancellation interplay → [concurrency.md](concurrency.md) · Combine pipeline lifetime → [async-patterns.md](async-patterns.md) · Allocations/Hangs workflow detail → [performance.md](performance.md)
