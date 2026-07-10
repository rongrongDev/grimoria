# Release & Platform: App Review, TestFlight, Signing, and Backward Compatibility

> **Applies to:** Xcode 26 · App Store Connect as of 2026-07 · iOS 17+ deployment targets · **Last reviewed:** 2026-07-06
> App Review policy shifts faster than APIs — re-verify guideline numbers against the current App Review Guidelines before acting on a rejection.

## Failure catalog (failure → detection → fix → prevention)

### 1. App Review rejections you can prevent mechanically

The recurring ones, by guideline:

- **2.1 (crashes/incomplete):** reviewer hits a crash or a dead demo path. Reviewers test on *real devices, current OS, often poor network*. Fix: RC checklist run on a physical device with Network Link Conditioner (100% loss and 3G profiles); **working demo account credentials in the review notes** (expired demo creds are a top-3 rejection cause and cost you a full review round-trip).
- **2.3 (metadata):** screenshots showing features that don't exist / mentioning other platforms.
- **3.1.1 (IAP):** any path to paid digital content dodging IAP — including a webview to a purchase page, or *links* whose policy status has changed repeatedly; check current external-link-entitlement rules for your storefronts rather than trusting folklore (this area moved multiple times in 2024–2026, varies by region, and is where confident stale advice is most dangerous).
- **5.1.1 / privacy:** permission strings that don't explain *why* ("This app needs camera access" is a rejection; "Scan documents to attach to invoices" passes). **Privacy manifests** (`PrivacyInfo.xcprivacy`): required-reason APIs (UserDefaults, file timestamps, boot time…) used by *you or any SDK* must be declared — missing declarations are an upload-time/ITMS warning that graduates to rejection. Third-party SDKs must ship their own signed manifests; audit on every SDK bump.
- **4.2 (minimal functionality):** thin wrappers around a website. If your app is mostly webviews, build a native reason-to-exist before submitting, not after the rejection.
- **Private API / entitlement misuse:** automated binary scan catches `dlopen` tricks and private selectors — including ones inside third-party SDKs you forgot you had. Detection: know your SDK surface; when the rejection names a symbol, `grep` your dependency binaries, not your code.

**Prevention.** A `release-checklist.md` in the repo covering: demo account freshness, permission strings review, privacy manifest diff, ATS/plist diff ([security.md](security.md) §2), device+bad-network smoke run. Expedited review exists for critical fixes — use it sparingly (repeat use gets deprioritized), and use **phased release** (§3) so you rarely need it.

### 2. Signing & provisioning: the taxonomy of "it works on my machine"

Signing failures are one of four mismatches. Diagnose by *which* artifact disagrees, in this order:

1. **Entitlement ↔ profile:** app claims an entitlement (push, App Groups, HealthKit…) the provisioning profile doesn't carry. Error: `Provisioning profile doesn't include the <X> entitlement`. Fix: regenerate the profile *after* enabling the capability on the App ID in the developer portal — profiles snapshot capabilities at creation; a stale profile is the #1 cause. Debug with `codesign -d --entitlements - YourApp.app` vs `security cms -D -i profile.mobileprovision`.
2. **Certificate ↔ profile:** profile references a cert that isn't in the keychain doing the signing (classic in CI: cert in the repo's match store was revoked/renewed, profile still lists the old one). Error: `No signing certificate found` / `doesn't match any valid certificate`.
3. **Bundle ID ↔ profile:** wildcard profile used for an app needing specific capabilities, or a typo'd explicit ID. Extensions each need their own profile matching *their* bundle ID.
4. **Automatic vs manual signing fighting each other:** Xcode's automatic signing rewrites project settings that CI's manual signing (fastlane match or **App Store Connect API-key–driven cloud signing**) then contradicts. Rule: **one signing authority per target, everywhere.** Modern default that removes most of this class: `xcodebuild -allowProvisioningUpdates` with an ASC API key in CI, or fastlane match with a dedicated keychain; developers never touch distribution certs locally.

**Prevention.** CI job that runs the archive+export nightly (signing rot surfaces on *your* schedule, not release day); documented recovery runbook for "distribution cert expired" (it will, on a weekend).

### 3. Rollout strategy: TestFlight → phased release → the un-shippable truth

**Failure.** Shipping 100% on day one; a crash-loop or backend-crushing bug reaches everyone; there is **no rollback on the App Store** — your only remedies are an expedited-review fix or (extreme) a server-side kill switch.

**The strategy that works:**
1. **Internal TestFlight** (up to 100 ASC users, no review, instant): every merge to main, automated upload. Your dogfood ring.
2. **External TestFlight** (needs one-time beta review per version usually fast): a real cohort with **MetricKit/crash-reporter dashboards watched per build** — TestFlight builds are where the 40-minute-soak class of bug ([memory-management.md](memory-management.md)) gets caught, but only if someone reads the metrics.
3. **Phased App Store release, always on:** 7-day automatic-updater curve (1→2→5→10→20→50→100%). Day-1–2 at 1–2% is your canary: compare crash-free rate and key funnels against the previous version *before* the curve steepens. **Pausing stops new automatic updates but un-ships nothing** — users who got it keep it, and manual App Store downloads always get the new version regardless of phase.
4. **Server-side feature flags for anything risky:** the only true rollback you have. Rule: any new subsystem that talks to your backend or touches money ships dark, behind a flag, ramped independently of the binary.

**Prevention.** Release captain rotation with a written go/no-go checklist at each phase step; alert thresholds (crash-free < previous − 0.3%, hang rate ↑) that auto-page.

### 4. Backward compatibility across iOS versions

**Failure modes.** (a) Building with the new SDK changes behavior *even at the same deployment target* — UIKit/SwiftUI gate behavior changes on "linked-against SDK version" (each SDK's release notes list them); apps break at rebuild time with zero code changes. (b) `if #available` used for *compilation* problems it can't solve — availability is a runtime check; using a new *type* still needs `@available` on the declaration or conditional compilation. (c) Crashes on the *oldest* supported OS because nobody runs it: implicitly-available API via a dependency bump, or behavioral differences (older OS's stricter background limits).

**Fix/Prevention.**
- Deployment-target policy written down (e.g., "current − 2, reviewed each September"): user-share data decides, not developer enthusiasm. Each supported version = a test matrix row.
- CI runs the unit suite and a smoke UI test on **the oldest supported OS simulator** on every PR; a physical old device in the release checklist (simulators don't reproduce memory/thermal limits).
- Availability discipline: prefer whole-type `@available` + parallel implementations over `if #available` spaghetti inside shared methods. Delete compatibility shims the same week a version drops off the support matrix — dead-branch shims are where "why does this exist" code accumulates.
- On SDK-bump PRs (new Xcode): read the SDK release-notes "behavior changes" section and diff-test the app before merging; treat an Xcode major bump as a feature-sized change, not a chore.

### 5. Background execution and the process-lifetime illusion

**Failure.** Code assumes the app lives while "in background." Reality: you get ~seconds after backgrounding (extendable via `beginBackgroundTask` to ~30 s), then suspension; `BGAppRefreshTask`/`BGProcessingTask` run **at the system's discretion** (budgeted by user habits, charging state) — teams ship sync architectures assuming nightly background runs that fire, in the field, roughly *never* for irregular users. Interacts with Keychain accessibility ([security.md](security.md) §1): background work + `WhenUnlocked` items = intermittent auth failures.

**Fix/Prevention.** Design sync as *opportunistic*: correct after any period of no background execution; background refresh is an optimization, never a requirement. Test suspension by actually backgrounding a device mid-operation. `beginBackgroundTask` around any user-initiated write you must finish (upload commit, DB save); always pair with the expiration handler.

## Prevention summary

| Gate | Mechanism |
|---|---|
| Review rejection classes | RC checklist: demo creds, permission strings, privacy-manifest diff, device+bad-network run |
| Signing rot | Nightly archive+export CI job; single signing authority per target |
| Bad build reaching everyone | Phased release always on; server-side flags for risky subsystems; canary metrics gate at 1–2% |
| Old-OS breakage | Oldest-supported simulator in per-PR CI; physical device in RC checklist |
| SDK-bump surprises | Xcode major bump treated as a feature PR with behavior-change review |

**Related:** MetricKit dashboards → [performance.md](performance.md) · Keychain background access → [security.md](security.md) · watchOS/tvOS/visionOS submission differences → [platform-variants.md](platform-variants.md)
