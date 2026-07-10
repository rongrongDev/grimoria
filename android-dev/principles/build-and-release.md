# Build & Release — Gradle at Scale, R8's Silent Breakage, and Shipping Without Fear

> **Applies to:** AGP 8.9–8.12, Gradle 8.14+, Kotlin 2.2, R8 (bundled with AGP) · **Last reviewed:** 2026-07-06
> **Related:** [architecture.md](architecture.md) · [security.md](security.md) · Subagent: `gradle-config-auditor`

## Module structure at scale

### Why modularize at all (the honest reasons)

1. **Build speed** — but *only* via cache/parallelism on incremental builds; modularizing badly (a linear chain of modules) makes builds *slower* than a monolith.
2. **Compile-time enforcement of architecture** — a `domain` module that doesn't depend on Android *cannot* import an Activity. This is the only architecture enforcement that survives staff turnover. Docs decay; `dependencies {}` blocks don't.
3. **Ownership boundaries** for teams >~8 engineers.

If none of the three applies (small app, small team), a single `app` module with package discipline is *fine* — I've watched two-person teams burn a quarter on a 40-module structure for an app with six screens. Modularization is a scaling tool, not a virtue.

### The shape that works

`app` (thin: DI wiring, navigation graph) → `feature:*` (one per user-facing feature; **feature modules never depend on each other** — cross-feature navigation goes through an API/navigation abstraction in `core:navigation`) → `core:*` (`core:data`, `core:domain`, `core:ui`, `core:testing`...). Kotlin-only modules (`domain`) use `kotlin("jvm")` — they build dramatically faster than Android library modules and can't regress into importing the framework.

**Convention plugins** (`build-logic/` included build) from the moment you have 3+ modules: every module's build file becomes ~5 lines applying `myapp.android.library` etc. Without them, every AGP upgrade is a 40-file diff and modules drift (one module still on Java 11 toolchain, three different `compileSdk`s — all real audit findings). **Version catalogs** (`libs.versions.toml`) as the single version source; ban hardcoded coordinates in review.

## Failure modes

### 1. R8/ProGuard silently breaking reflection — the release-only crash

- **Failure:** Everything using reflection breaks *only in minified release builds*: Gson/kotlinx-serialization-reflect models silently deserializing to objects full of nulls **in non-null Kotlin fields** (no crash at parse time — an NPE three screens later, or worse, wrong data displayed); `Class.forName` on names that no longer exist; JNI callbacks into renamed methods; `WorkManager` workers referenced by class name string. The insidious flavor is the *silent* one: Gson + R8 doesn't crash — it constructs objects via `Unsafe` without running constructors, bypassing Kotlin null-safety entirely. I shipped this once in 2019: prices displayed as `0` for 4 hours because a renamed field defaulted to zero. No crash, no Vitals signal, only revenue graphs.
- **Detection:** **Test the minified build.** A small instrumented smoke suite against `release` (or a `minifiedDebug` build type with `isMinifyEnabled=true` + debug signing) exercising every network model and every reflection seam. `-printusage`/missing_rules.txt output review on dependency bumps. For the silent-Gson class specifically: a debug assertion that walks deserialized models checking non-null fields (or just migrate to kotlinx-serialization, which is codegen-based and R8-immune for this class of bug).
- **Fix:** `@Keep`/keep rules for reflectively-reached code; prefer *codegen* libraries (kotlinx-serialization, Moshi-codegen, Room, Hilt) over reflection libraries (Gson, moshi-reflect) — the entire failure class evaporates.
- **Prevention:** CI job running the smoke suite on the minified build for every RC. Policy: new dependencies using runtime reflection need a written justification. Keep rules live next to the code needing them (consumer rules in the owning module via `consumerProguardFiles`), not in one 400-line app-level file nobody understands.

### 2. Build variant / flavor combinatorics

- **Failure:** Flavor dimensions multiply: 3 environments × 2 brands × 2 form factors = 12 variants; each adds config drift surface (a `staging` `google-services.json` missing → crash only in that variant; a manifest placeholder set in 11 of 12). Teams then test only `devDebug` and ship `prodRelease` — the variant that runs *only* on users' devices.
- **Detection:** `gradle-config-auditor` subagent enumerates variants and diffs their effective config. CI assembling *all* release variants (assemble is cheap; it's testing that's expensive).
- **Fix / prevention:** Environments via a single flavor dimension *or* (often better) build-time property + runtime config; brands as separate modules or dynamic theming, not flavors, where feasible. Rule: every flavor dimension must justify itself against "could this be a runtime flag?" — flavors are for things that *must* differ at compile/packaging time (applicationId, signing, bundled assets).

### 3. Dependency & AGP drift

- **Failure:** Transitive-dependency surprises: a minor bump of an SDK pulls a new major of OkHttp, changing TLS behavior; or adds permissions/ContentProviders via manifest merge ([security.md](security.md), [memory-and-performance.md](memory-and-performance.md)). Also: `compileSdk`/`targetSdk` drift across modules producing behavior differences.
- **Detection:** Dependency-diff CI bot (print `./gradlew :app:dependencies` diff + merged-manifest diff on every PR that touches version catalogs — the merged-manifest diff is the highest-signal 20 lines in a dependency-bump PR). Dependency Analysis Gradle Plugin for unused/misdeclared deps.
- **Prevention:** Renovate/Dependabot with grouped updates + the diff bot; convention plugin pinning `compileSdk`/`targetSdk` in exactly one place.

### 4. Slow builds nobody owns

- **Failure:** Incremental build creeps from 30 s to 4 min over two years; engineers batch changes, iteration quality drops. Causes ranked by frequency in audits: no build caching (local or remote); `kapt` lingering where KSP exists (kapt disables compile avoidance and stubs are expensive — migrating Hilt/Room/Glide to KSP is often the single biggest win); annotation processors in hot modules; unnecessary `api` dependencies (invalidation cascades — `api` leaks your dependency to all consumers, so a change recompiles the world; default to `implementation`); Compose in modules that don't need it; one god-module everything depends on (`core:common` with 200 files — split it).
- **Detection:** Build scans (`--scan` / Develocity); track P50/P90 local incremental build time as a team KPI quarterly.
- **Prevention:** `org.gradle.caching=true` + configuration cache on from day one; KSP-only policy; the `gradle-config-auditor` checks `api` vs `implementation` and kapt residue.

## Release engineering

- **Staged rollout is non-negotiable.** 1% → 5% (24 h soak watching Vitals crash/ANR deltas vs previous version, not absolutes) → 20% → 50% → 100% over ~a week. Halting at 5% turns a catastrophic bug into a bad day. The 4-hour silent-pricing bug above was caught *only* because of a 5% stage plus a revenue dashboard — instrument business metrics per app-version, not just crashes: **silent bugs don't crash**.
- **You cannot roll back on Play.** You can only halt and ship a higher `versionCode`. Therefore: keep a hotfix branch protocol (release branch cut per release; hotfixes cherry-picked, not shipped from a moving main), and make your release build reproducible from a tag in one command.
- **Feature flags over release trains** for risky changes: decouple deploy from enable; kill switches for new networking/storage code paths. The flag *cleanup* debt is real — flags older than 2 releases get a ticket or get hard-coded.
- **App Bundle realities:** Play signs and serves splits; test the *bundle-derived* APKs (`bundletool build-apks --connected-device`) not the universal APK, or you'll miss missing-split-resource crashes on niche configs (an Arabic-locale-only crash from a stripped resource once reached 100% before we understood this).
- **Crash-free sessions ≥ 99.9%** as the release gate; ANR rate < 0.47% (Play's bad-behavior threshold) as a hard line — Play *demotes discovery* above it.

## Callable capabilities

- Subagent **`gradle-config-auditor`** — operationalizes failure modes 2–4 across a repo.
- Guide [analyze-existing-app.md](../guides/analyze-existing-app.md) — build-health section of the audit.
