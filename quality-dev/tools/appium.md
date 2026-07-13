# Appium — mobile E2E production patterns & pitfalls (extended tier)

**Applies to:** Appium 2.x–3.x (UiAutomator2 driver for Android, XCUITest for iOS) · **Last verified:** 2026-07-13 (against Appium 3.5; 3.0 shipped 2025-08 — migration notes below)
**Tier note:** extended — production patterns + common pitfalls only. Strategy questions (how many mobile E2E to have: very few) → `quality-dev/principles/test-strategy.md`; flake triage → `quality-dev/principles/flakiness.md`.

## Production patterns

- **Appium is driver-per-platform (2.x and 3.x alike):** install drivers explicitly (`appium driver install uiautomator2` / `xcuitest`); plugins likewise. Pin driver versions in CI — driver auto-updates are a classic "suite broke, nothing changed" source.
- **Migrating 2 → 3 (verified 2026-07-13):** Appium 3 requires Node 20.19+/22.12+/24 and npm 10; the legacy JSON Wire Protocol is fully removed (W3C only), so pre-W3C clients break outright; `TouchAction`/`MultiTouchAction` are gone — grep the suite and replace with W3C Actions; `--allow-insecure` feature flags now need a driver scope prefix (`uiautomator2:adb_shell`, not `adb_shell`); UiAutomator2's `pressKey`/`longPressKey` were removed in favor of W3C key actions. Treat the upgrade as its own change: pin, upgrade, run the suite, then unpin — never alongside app changes.
- **Budget mobile E2E even harder than web.** Everything that makes web E2E expensive is 3–5× worse here (device provisioning, app install time, OS dialogs). A dozen journey tests per platform is a healthy ceiling; everything else belongs in unit/integration or component tests inside the app codebase.
- **Emulator/simulator for CI gates, real devices for scheduled runs.** Emulators are reproducible and parallelize; real-device clouds (BrowserStack/Sauce-class) catch OEM quirks but add network latency and shared-infra flakiness — run them nightly (Stage 3, `quality-dev/principles/ci-cd-integration.md`), never as merge gates.
- **Deterministic waiting, mobile edition:** no `sleep`/`driver.pause` — explicit waits on element state (`waitForDisplayed`-class in your client), or better, expose test hooks in the app (idling resources on Android, accessibility-identifier state flags on iOS) so the test waits on app-reported readiness. The principle is `quality-dev/principles/concurrency-and-async-testing.md`; the mobile twist is that animations and OS transitions add latency layers web doesn't have — turn animations off in test builds (`adb shell settings put global animator_duration_scale 0`, `UIView.setAnimationsEnabled(false)`).
- **Stable selectors:** accessibility IDs (`content-desc` / `accessibilityIdentifier`) set in the app code — never XPath over the layout tree. XPath on mobile is both slow (full-tree serialization per query) and brittle. Requiring accessibility IDs for testability also drags real accessibility forward (`quality-dev/principles/accessibility-testing.md`).
- **Hermetic app state per test:** fresh app data (`fullReset`/`appium:noReset` chosen deliberately), backend state seeded via API before the UI walk, unique per-test accounts. Reusing an installed app's state across tests is mobile's version of shared-fixture flakiness.
- **Artifacts on failure:** screenshot + device log (`adb logcat` / simulator log) + video where the cloud provides it. Mobile failures are undebuggable from a stack trace alone.

## Common pitfalls

| Pitfall | Consequence | Instead |
|---|---|---|
| XPath selectors | Slow queries, breaks on any layout change | Accessibility IDs baked into app code |
| Animations left on | Waits race transitions; ghost taps | Disable animations in test builds/emulator settings |
| Real-device cloud as merge gate | Shared-infra flakiness blocks every PR | Emulators gate; device cloud scheduled |
| One giant journey test ("login→browse→buy→profile→logout") | 6-minute test, any step's flake kills all signal | Independent journeys, API-seeded state per test |
| OS dialogs unhandled (permissions, updates) | Intermittent "element not found" at random steps | `autoGrantPermissions`/`autoAcceptAlerts` caps + explicit dialog handling for the ones you test |
| Testing web-testable logic through the app | Paying 5× E2E cost for unit-test facts | Push down-layer per `quality-dev/principles/test-strategy.md` |
| Unpinned driver/OS image versions | "Nothing changed" breakage | Pin driver + emulator image versions; upgrade deliberately, log in `quality-dev/CHANGELOG.md` |
| Port/session collisions in parallel runs | Cross-talk between parallel tests | One Appium server (or systemPort) per worker; unique `udid` per session |
