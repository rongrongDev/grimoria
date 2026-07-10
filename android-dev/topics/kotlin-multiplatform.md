# Kotlin Multiplatform — Production Patterns & Pitfalls (Android-Perspective)

> **Tier: extended** — production patterns + common pitfalls, from the Android side of shared code. Not an iOS guide.
> **Applies to:** Kotlin 2.2 (K2), KMP stable tooling (2024+), Compose Multiplatform noted where relevant · **Last reviewed:** 2026-07-06
> **Related:** [architecture.md](../principles/architecture.md) · [concurrency.md](../principles/concurrency.md) · [build-and-release.md](../principles/build-and-release.md)

## The adoption decision (make it about teams, not tech)

KMP succeeds where the *organization* can support it and fails where it can't. The precondition isn't technical: **you need at least one engineer who can debug the iOS side of the seam** (Xcode, Instruments, Swift interop). Every failed KMP adoption I've watched died the same way — Android team ships shared code, iOS team hits an opaque `kotlin.native` crash or a framework-size regression, nobody on either side owns the seam, iOS team quietly rewrites in Swift, shared module rots.

**What to share (in order of proven ROI):** models + serialization, business rules/validation, networking (Ktor) + repository logic, analytics schemas. **What not to share (as defaults):** UI (Compose Multiplatform on iOS is production-viable now, but evaluate it as a *separate* decision with your iOS team holding veto), anything OS-service-heavy (background scheduling, permissions, keystore — the `expect`/`actual` surface exceeds the shared logic).

Start with **one leaf module** (e.g., pricing rules) shipped to production on both platforms before any broader commitment. This validates the toolchain, the CI, and the org seam at minimum blast radius.

## Pitfalls (each one observed in production)

- **The `expect/actual` sprawl:** teams discover platform differences one at a time and mint an `expect` for each → 40 tiny `expect` declarations, unreviewable `actual` drift. Pattern: **interfaces + DI over `expect/actual`** for anything behavioral (`expect` is for types/constants/factories); platform implementations are then ordinary classes, testable and mockable on both sides. (Koin is the DI that spans KMP naturally; Hilt is Android-only — this is the one context where I recommend Koin, [architecture.md](../principles/architecture.md).)
- **Coroutines at the Swift boundary:** suspend functions surface in Swift as completion-handler/async functions **without structured cancellation by default**, and Flows don't surface usefully at all without help. Use SKIE (Touchlab) or KMP-NativeCoroutines — *chosen once, project-wide* — or iOS accumulates hand-rolled bridge code per call site, each with its own cancellation bug. The production symptom of getting this wrong: iOS screens keep collecting after dismissal — the exact zombie-work class from [concurrency.md](../principles/concurrency.md), but invisible to the Android team who "owns" the shared code.
- **The frozen-memory-model scar tissue:** any KMP advice mentioning `freeze()`, `@ThreadLocal` workarounds, or "flows can't cross threads" predates the new memory manager (default since Kotlin 1.7.20) — **discard it on sight**, including old team wikis. Stale KMP folklore causes more design damage today than current limitations do.
- **iOS binary size & export surface:** every public declaration in the shared module lands in the exported framework's Objective-C header; a kitchen-sink shared module bloats iOS app size and compile times, and generic-heavy Kotlin APIs surface in Swift with erased, ugly types. Keep the exported API layer small, concrete, and `internal`-by-default (`explicitApi()` mode on shared modules).
- **Dependency reality check:** every dependency of shared code must itself be KMP (Ktor not OkHttp/Retrofit, SQLDelight or Room-KMP not classic Room, kotlinx-datetime not `java.time` in `commonMain`). Teams discover this mid-migration; do the dependency census *before* committing a module.
- **Build/CI tax:** macOS runners required for iOS targets; K/Native compile times are the slow lane of the build; Gradle config for KMP modules is meaningfully more complex ([build-and-release.md](../principles/build-and-release.md) convention plugins help — write one `myapp.kmp.library` convention early).
- **Testing seam:** `commonTest` runs on every target — and *should*, in CI: JVM-only test runs miss K/Native-specific behavior (the classic: a regex or number-formatting difference surfacing only on iOS). Budget CI minutes for `iosSimulatorArm64Test`.

## Architecture note for the Android reader

Your shared module is, from Android's perspective, just another Kotlin-only library module — the layering rules of [architecture.md](../principles/architecture.md) apply unchanged: shared code is domain/data layer material, ViewModels stay platform-side (or use shared "presenter" state holders only if iOS genuinely consumes them — sharing VMs that only Android uses is ceremony), and the repository contract (main-safe, Flow-out) holds. KMP done well is invisible to your Compose layer.

## When NOT to use this doc

Single-platform app with no iOS roadmap → KMP adds cost for zero benefit; a Kotlin-only JVM module gives you the same architectural enforcement ([build-and-release.md](../principles/build-and-release.md)) without the toolchain. Sharing with *web* (Kotlin/JS or WASM) → different maturity level entirely; evaluate independently and more skeptically.
