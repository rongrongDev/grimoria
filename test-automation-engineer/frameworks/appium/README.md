# Appium — Full-Depth Reference (Mobile Automation)

**Stamped:** 2026-07-06 · **Applies to:** Appium 2.12, UiAutomator2 driver (Android), XCUITest driver (iOS). Appium 2's driver-plugin architecture assumed (`appium driver install uiautomator2`); Appium 1 is dead — if you're on it, the 1→2 migration notes in `principles/maintainability-and-tech-debt.md` §big-bang apply (every driver install and half the capability names changed; it took us 3× the estimate).

Mobile automation is web automation with the difficulty knob turned up: slower actions (every command crosses a device bridge), scarcer parallelism (devices, not processes), flakier environments (OS dialogs, IMEs, animations), and a two-platform matrix by default. The principles all apply; the budgets are different. Plan for a mobile E2E test to cost ~5× its web equivalent in runtime and maintenance, and size the suite accordingly — the strategy consequence (push more coverage below the UI layer) is `@quality-dev/` territory; the engineering consequences are this doc.

## Architecture (`principles/framework-architecture.md`)

Screen objects instead of page objects; otherwise identical layering. Mobile-specific additions to the infra layer:

- **Cross-platform screens:** when one suite drives Android + iOS, screen objects expose one intent API with per-platform locators (`@AndroidFindBy`/`@iOSXCUITFindBy` in Java client, or a locator map keyed by platform). Do NOT write per-platform test bodies — that's two suites in a trenchcoat; divergence belongs in the locator layer, and where *flows* genuinely diverge (platform-specific UX), split at the screen-method level, still not the test level.
- **Session cost dominates.** Creating an Appium session (app install + launch) costs 30–90s. Amortize: one session per test *file/class* with app-state reset between tests (`terminateApp`+`activateApp`, or the driver's fast-reset), not one session per test. This is a deliberate, documented trade against per-test hermeticity (`principles/core-principles.md` law 5) — the state-reset step is the compensating control, and it must actually reset (verify: run any two tests in both orders).
- **Deep links are your API-setup equivalent.** Navigating five screens to reach the one under test is the mobile version of UI login (`framework-architecture.md` §setup-through-API). Get the app team to expose deep links/launch arguments to open screen X in state Y; backend state still seeds via API factories (`principles/test-data-management.md`).

## Locators (`principles/locator-strategy.md`)

Hierarchy, mobile edition: **accessibility id** (`content-desc` / `accessibilityIdentifier`) ≻ platform id (`resource-id` / `name`) ≻ class-chain (iOS) / UiSelector (Android) ≻ **XPath: effectively never**. Two things make this stricter than web:

- **XPath is a *performance* catastrophe on mobile, not just a fragility one** — each XPath query forces a full native source-tree dump and parse; 10–100× slower per lookup, and it compounds into minutes per test. The scanner (`agents/suite-wide-antipattern-scanner.md`) treats mobile XPath as a runtime finding, not just fragility.
- **The accessibility-id contract doubles as an accessibility program.** Same ADR as web test IDs (`locator-strategy.md` §contract): app devs set stable accessibility ids on interactive elements; you get resilient locators, users get a screen-reader-usable app. This argument has never lost in a mobile org.

Use Appium Inspector to audit what the driver actually sees — the native hierarchy rarely matches the React-Native/Flutter component tree you imagine (RN: set `testID` + `accessible={false}` on wrappers to avoid element-collapsing surprises; Flutter: prefer the Flutter-aware drivers/semantics labels).

## Waiting & synchronization (`principles/waiting-and-synchronization.md`)

No auto-wait in most Appium clients — you're in Selenium-style explicit-wait land (helper layer + `assertEventually`, per `frameworks/selenium/README.md`), plus mobile-specific settling:

- **Kill animations in the test build:** Android — disable window/transition/animator scales (dev settings, settable via adb in device prep); iOS — `UIView.setAnimationsEnabled(false)` behind a launch argument. Animations are the mobile equivalent of `networkidle` — endless near-settling. This single device-prep step removes a whole flake class.
- **UiAutomator2's `waitForIdle` blocks until the UI thread idles** — on apps with continuous animation (spinners, video, Lottie) it times out on *healthy* screens. Symptom: every action on one screen slow/timing out. Tune `waitForIdleTimeout` down (even 0) and rely on explicit element waits instead; iOS has related implicit quiescence waits with the same failure signature.
- **System dialogs (permissions, rating prompts, OS updates)** are the mobile "unexpected modal" — deterministic prevention beats reactive dismissal: grant permissions at install (`autoGrantPermissions` capability / `xcuitest` equivalents), disable prompts via launch args in the test build. A `dismissSystemDialogs()` helper is the fallback, not the strategy.
- **IME races:** `sendKeys` vs autocorrect/keyboard animation. Disable autocorrect in device prep; hide keyboard explicitly before asserting on elements it may cover.

## Parallelization & the device matrix (`principles/parallelization-and-sharding.md`, `principles/cross-platform-and-browser.md`)

Parallel unit = device/emulator, so parallelism is a capacity question. Emulator/simulator farm in CI (Android emulators with hardware acceleration — beware nested-virt on cloud runners; iOS simulators need macOS runners, budget accordingly) for Tier 0/1; real devices for what virtuals can't show: performance feel, gestures/haptics, camera/biometrics/NFC, OEM skins (Samsung One UI has personally cost me three distinct bug classes), thermal throttling. Matrix policy: analytics-weighted top devices — typically 2 Android (one Samsung, one Pixel) + 2 iOS (current, current−2) covers >80% of defect-relevant variance; the long tail goes to a device farm on nightly (`frameworks/device-farms.md`). Shared-state warning specific to mobile: tests on the *same device* share app state, OS clipboard, notifications — device-per-worker exclusively (never two sessions on one device), lock via your farm's allocation, and reset app state between tests as above.

## Test data, CI, reporting

Data: unchanged (`principles/test-data-management.md`) — factories via backend API; the *app build* is also test data (pin the exact APK/IPA per pipeline run as an artifact; "latest" builds make failures unreproducible). CI (`principles/ci-cd-integration.md`): budget realism — mobile blocking set on emulators ≤ 15 min; real-device suites are nightly by economics. Cache emulator images and app builds. Reporting (`principles/reporting-and-observability.md`): screenshots + **screen recordings** (both platforms support session recording — the mobile trace-equivalent), device logs (`logcat` / `.app` syslog) captured on failure and *filtered to the app's process* (raw logcat is noise), plus device context stamps (model, OS, orientation, locale).

## Appium-specific failure modes

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| XPath-driven runtime bloat | Per-action latency ≫ 1s; profiler shows lookup time dominating | Convert to accessibility id | Lint/scanner ban; a11y-id contract with app team |
| `waitForIdle` timeout on animated screens | All actions on one screen slow; healthy screenshot | Tune `waitForIdleTimeout`, explicit waits | Device-prep disables animations; screen-object owns settings overrides |
| System dialog eats a tap | Screenshot shows OS dialog; "element not found" on element that's clearly behind it | Auto-grant/disable prompts at install | Capabilities + test-build launch args in device prep |
| Session-create flakiness | Failures before first test step; farm/emulator logs show install/boot issues | Retry session create (only) with backoff; recycle emulators | Emulator health checks + periodic recycle; session-create failures categorized as infra |
| Same-device state bleed | Test passes solo, fails after specific predecessor on device | True app reset between tests; verify both orders | Device-per-worker allocation; state-reset step in harness, not in tests |
| Un-pinned app build | Failure not reproducible next morning | Pin APK/IPA artifact per run; record build ID in report | Build ID a mandatory report stamp |
| RN/Flutter hierarchy surprises | Inspector shows collapsed/missing elements vs component tree | `testID` + `accessible` props audit (RN); semantics labels (Flutter) | Locator conventions doc per app framework; inspector audit in onboarding |

## Cross-references

- Wait/helper-layer construction (shared with Selenium): `frameworks/selenium/README.md`
- Cloud device farms (when the in-house lab loses): `frameworks/device-farms.md`
- How much mobile E2E to have at all: `@quality-dev/` test-strategy material
