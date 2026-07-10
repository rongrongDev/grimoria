# watchOS / tvOS / visionOS — Production Patterns & Pitfalls (Extended Tier)

> **Applies to:** watchOS 26 · tvOS 26 · visionOS 26 SDKs · Xcode 26 · Swift 6.2 · **Last reviewed:** 2026-07-06
> Extended-tier doc: what breaks when an iOS team ships to these platforms. Everything in the core-tier docs applies; this covers only the deltas.

## watchOS

**The two constraints that dominate everything:**

1. **Memory ceiling.** Watch apps get a hard per-app limit in the low tens of MB (varies by hardware generation — treat ~30 MB as your working budget, verify on your oldest supported watch). Exceeding it is a **jetsam kill**, not a warning: the app just dies, crash reporters often miss it (look for `EXC_RESOURCE` / jetsam event reports in the device console). Pitfall: sharing an iOS view/model layer that caches images at iPhone sizes. Pattern: separate, watch-sized asset pipeline; no in-memory caches beyond current-screen needs; Allocations runs *on watch hardware* in the release checklist.
2. **Execution budget.** Foreground time is seconds, not minutes; background refresh (`WKApplicationRefreshBackgroundTask`) is budgeted to a handful of wakes per hour *at best*, complication-holding apps get more. Design exactly like [release-and-platform.md](release-and-platform.md) §5, stricter: every sync opportunistic and resumable, all state persisted at every scene-phase change — assume the process dies the moment the wrist drops.

**Connectivity pitfalls.** `WatchConnectivity`: `sendMessage` requires *reachable* counterpart (fails offline — always implement the fallback via `transferUserInfo`/`updateApplicationContext`, which queue); `updateApplicationContext` **coalesces** (only latest state arrives — never send deltas through it, send full snapshots). The classic bug: deltas via applicationContext → watch misses intermediate states → divergent state forever. Structure as: context = latest full state; userInfo transfers = must-arrive events; and reconcile on `activationDidComplete`.

**Complications/widgets:** timeline-budgeted; a complication that "updates live" is actually a pre-computed timeline plus rare reloads — design data freshness honestly around that or ship a complication that lies.

## tvOS

**Focus is the input model, not a styling detail.** There is no touch; the **focus engine** decides what's selectable. Pitfalls:
- Custom views that aren't focusable (`canBecomeFocused`, or SwiftUI `.focusable()`) create dead zones the remote can't reach — QA on device with the physical remote, simulators lie about remote ergonomics.
- Focus-driven `UICollectionView`/`ScrollView` layouts: off-screen items must be reachable *by geometry*; a grid with irregular gaps traps focus. Use `UIFocusGuide` (UIKit) / `focusSection()` (SwiftUI) to bridge gaps deliberately.
- Debug with `UIFocusDebugger` (`po UIFocusDebugger.checkFocusability(for:)` / `.simulateFocusUpdateRequest(from:)`) — it names exactly why a view can't be focused; nobody finds this tool until week three of a tvOS port.

**Storage:** tvOS apps have **no persistent local storage guarantee** — the on-demand-resource model means your app's local data can be purged; anything durable lives in CloudKit/your backend/`NSUbiquitousKeyValueStore`. Teams discover this when "saved" state vanishes between sessions.

**The oversized-content trap:** TV artwork at 4K balloons memory; same jetsam physics as watchOS with bigger numbers. Downsample to display size ([performance.md](performance.md) §3) — 4K TVs make "just load the image" 8× the bytes of iPhone.

## visionOS

**Scene model first.** Windows (2D, resizable), volumes (bounded 3D), and immersive spaces (exclusive). Architectural consequence: an app is a *set of scenes* the user arranges — assumptions like "one screen at a time," "the app is foreground or background," and screen-size math all break. State shared across simultaneously-open scenes must be a single source of truth ([state-and-architecture.md](state-and-architecture.md)) — scene-local copies desync visibly when both are on screen.

**Input pitfalls:**
- Gaze + pinch replaces touch: **hover effects are system-rendered for privacy** — you cannot know where the user looks, only that they pinched on something. Custom controls need explicit `.hoverEffect()` and generous hit targets (60 pt equivalent); tiny tap targets that were merely annoying on iPhone are *unusable* here.
- `onTapGesture` works, but drags/rotations in 3D need `targetedToEntity` RealityKit gestures — mixing SwiftUI gesture assumptions into volumes produces gestures that fire on the wrong entity or not at all.

**Rendering/perf:** immersive spaces run your content at high, sustained frame rates on a thermal budget; dropped frames cause *physical discomfort*, not just jank — the hitch tolerances from [performance.md](performance.md) tighten from "annoying" to "nauseating." Profile with RealityKit Trace in Instruments; treat sustained thermals as a first-class test (20-minute immersive session on device).

**Porting honesty:** "Designed for iPad" mode runs most iOS apps unmodified in a window — ship that first, learn from real usage, and build native visionOS surfaces only where spatial presentation earns its cost. A rushed native port that ignores the scene/input model reviews worse than the compatible iPad app.

## Cross-platform engineering patterns

- **Target membership discipline:** shared core (models, services — platform-free, `Foundation`-only) as an SPM package; per-platform UI targets. `#if os(watchOS)` scattered through view models is the smell that the layering failed.
- **Per-platform CI rows:** each platform builds+tests on every PR touching shared code — watch/TV breakage from iOS-driven refactors is otherwise found at release time.
- **Review differences:** each platform has its own App Review quirks (tvOS: top-shelf image required; visionOS: comfort/motion guidelines; watchOS: complication assets) — extend the [release-and-platform.md](release-and-platform.md) checklist per shipping platform.

**Related:** memory ceilings & jetsam diagnostics → [memory-management.md](memory-management.md), [performance.md](performance.md) · opportunistic sync design → [release-and-platform.md](release-and-platform.md) §5
