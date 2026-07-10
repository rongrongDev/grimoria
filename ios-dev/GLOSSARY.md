# Glossary

> **Applies to:** Swift 6.2 · Xcode 26 · iOS 26 SDK · **Last reviewed:** 2026-07-06
> Single shared vocabulary for the whole KB. Terms are defined the way a working engineer uses them, with the sharp edge included.

**ARC (Automatic Reference Counting)** — Compile-time insertion of retain/release calls for class instances. Not garbage collection: cycles are *your* problem, and deallocation is deterministic (which is why `deinit` timing is testable). See [topics/memory-management.md](topics/memory-management.md).

**Retain cycle** — Two or more objects holding strong references to each other (directly, or via a closure/collection), so ARC never frees them. Classic: `self` strongly stores a closure that strongly captures `self`.

**Zeroing weak reference (`weak`)** — Reference that does not increment retain count and becomes `nil` when the target deallocates. Slight runtime cost (side-table lookup); always Optional.

**`unowned`** — Non-zeroing, non-retaining reference. Access after the target deallocates **traps deterministically** (`unowned(safe)`, the default). `unowned(unsafe)` is a dangling pointer — treat as forbidden.

**Actor** — Reference type whose mutable state is protected by serialized execution ("actor isolation"). Crucially, actors are **reentrant**: every `await` inside an actor method is a point where other work can interleave and mutate state.

**Actor isolation** — The compile-time rule that isolated state may only be touched from the actor's executor. Crossing an isolation boundary requires `await` and `Sendable` arguments.

**`@MainActor`** — Global actor bound to the main thread/main dispatch queue. Annotating a type/function isolates it to the main thread *at compile time* — but calls from elsewhere still *hop*, i.e., they suspend and resume later, not immediately.

**Sendable** — Marker protocol meaning "safe to pass across isolation boundaries." Value types with Sendable members get it implicitly; classes almost never should claim it without immutability. `@unchecked Sendable` is a promise the compiler cannot verify — every data race postmortem starts with one.

**Data race** — Two threads accessing the same memory, at least one writing, without ordering. Undefined behavior — not "sometimes wrong values" but *anything*, including heap corruption crashes far from the race. Swift 6 language mode makes most of them compile errors; `@unchecked Sendable` and `nonisolated(unsafe)` are the escape hatches that reintroduce them.

**Race condition** — Order-dependent logic bug (e.g., stale network response overwrites a newer one). Can exist with zero data races and full Swift 6 compliance. See [topics/async-patterns.md](topics/async-patterns.md).

**Actor reentrancy bug** — Check-then-act logic in an actor invalidated by an interleaved call during an `await`. The actor serializes *access*, not *your intent*.

**Structured concurrency** — Tasks with parent-child relationships (`async let`, `TaskGroup`) where cancellation and lifetime propagate automatically. `Task {}` and `Task.detached {}` are *unstructured* — you own their cancellation and lifetime.

**Cooperative cancellation** — Cancellation in Swift Concurrency sets a flag; nothing stops unless code checks `Task.isCancelled` / `Task.checkCancellation()` or awaits a cancellation-aware API.

**Continuation (`withCheckedContinuation`)** — Bridge from callback code to async. Must be resumed **exactly once**: zero resumes hangs the caller forever (and leaks); double resume is a crash (`withChecked...`) or UB (`withUnsafe...`).

**Swift 6 language mode** — Per-module setting (`SWIFT_VERSION = 6` / `swiftLanguageModes: [.v6]`) that turns strict-concurrency diagnostics into errors. Distinct from the compiler version: Swift 6.2 *compiler* can build Swift 5 *mode* modules.

**Approachable concurrency (Swift 6.2)** — Umbrella for SE-0466 (opt-in module-wide default `@MainActor` isolation), `nonisolated(nonsending)` (SE-0461: nonisolated async functions run on the caller's actor by default), and `@concurrent` (explicitly request off-actor execution).

**`@Observable`** — Swift 5.9+ macro (Observation framework, iOS 17+). Views track *which properties* they read; only those invalidate the view. Replaces `ObservableObject`/`@Published`, whose `objectWillChange` invalidates every subscriber on any change.

**View identity (SwiftUI)** — SwiftUI's notion of "same view" across body evaluations: structural (position in the type tree) or explicit (`.id()`). Identity change ⇒ state (`@State`) is destroyed and recreated. Most "my state randomly resets" bugs are identity churn.

**`@State` / `@Binding` / `@StateObject` / `@ObservedObject`** — Ownership markers. `@State`/`@StateObject`: this view *owns and creates* the value (survives body re-evaluation, dies with identity). `@Binding`/`@ObservedObject`: this view *borrows* it. Wrong choice = state resets or duplicated objects.

**MVVM** — View → ViewModel (presentation state + logic) → Model/Services. In SwiftUI, the view model's *lifetime* must be tied to view identity deliberately (`@State` + `@Observable`), or you get churn bugs.

**TCA (The Composable Architecture)** — Point-Free's unidirectional architecture: State/Action/Reducer/Store, with a dependency system and exhaustive testing. See [topics/tca.md](topics/tca.md) for when its costs pay off.

**Backpressure** — A consumer's ability to slow a producer. `AsyncStream` has a buffer policy instead of true backpressure (default: unbounded — a silent memory leak with fast producers); Combine has `Subscribers.Demand`, which almost nobody uses correctly.

**Hang** — Main thread unresponsive. >250 ms is a *micro-hang* (perceptible), >500 ms reported by the Hangs instrument and MetricKit; the watchdog kills apps blocked at launch (~20 s) with `0x8badf00d`.

**Symbolication** — Translating crash-log addresses to function/file/line using the dSYM matching the exact build UUID. No matching dSYM ⇒ the log is nearly useless. See the `crash-log-tracer` subagent.

**dSYM** — Debug symbol bundle produced per build. Archive it; upload it to your crash reporter; match by UUID (`dwarfdump --uuid`).

**Memory graph debugger** — Xcode's runtime heap snapshot (Debug bar → ⃞⃝ icon). Shows every live object and its retainers; the fastest way to answer "why is this view controller still alive?"

**Instruments** — Xcode's profiler. The workhorses: Time Profiler (CPU), Allocations (heap growth), Leaks (unreferenced cycles — *misses abandoned-but-referenced memory*), Hangs, SwiftUI (body evaluation counts).

**QoS (Quality of Service)** — Priority band for GCD/Task work (`userInteractive` … `background`). **Priority inversion**: high-QoS work waiting on a low-QoS queue; GCD sometimes boosts, but `.sync` from high onto low is a classic hang source.

**Keychain** — The only correct at-rest store for secrets on iOS. Items survive app deletion (historically) and can be iCloud-synced; accessibility class (`kSecAttrAccessible...`) decides when they're readable. `UserDefaults` is plaintext — never secrets.

**ATS (App Transport Security)** — System-enforced TLS policy. Exceptions live in Info.plist and are reviewed by App Review; `NSAllowsArbitraryLoads` requires justification.

**Certificate pinning** — Rejecting TLS connections whose chain doesn't include a known key. Pin the **SPKI (public key)**, not the leaf certificate, or routine cert rotation bricks your app in the field.

**Secure Enclave** — Coprocessor that generates and holds private keys that *cannot be exported* — you get key *operations*, not key *bytes*. For data encryption you wrap a symmetric key with an SE-held key.

**Snapshot test** — Assertion that rendered output matches a recorded reference image/text. Deterministic only if you pin device, OS, locale, and appearance.

**Mutation testing** — Tooling (e.g., Muter) that mutates your source and checks whether tests fail. Measures whether your tests *assert*, not just execute. See [topics/testing.md](topics/testing.md) for what score matters.

**Provisioning profile** — Signed plist binding an App ID + entitlements + certificates (+ device list for dev/ad-hoc). Nearly every "works locally, fails in CI" signing failure is an entitlement/profile mismatch.

**Phased release** — App Store staged rollout to automatic-update users over 7 days (1→2→5→10→20→50→100%). Can be paused; **cannot un-ship** — pausing stops new automatic updates only.

**pbxproj** — `project.pbxproj`, the Xcode project file. A merge-conflict magnet; the reason parallel agents must not both edit project structure. See [principles/multi-agent-orchestration.md](principles/multi-agent-orchestration.md).
