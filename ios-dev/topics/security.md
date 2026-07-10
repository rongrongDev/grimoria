# Security: Keychain, Transport, Secure Enclave, and Tamper-Detection Tradeoffs

> **Applies to:** Swift 6.2 · iOS 17+ · Xcode 26 · **Last reviewed:** 2026-07-06
> Scope: *defensive* app-side security for a production app. Threat-model note inline per section — controls are worthless without knowing what they defend against.

## Failure catalog (failure → detection → fix → prevention)

### 1. Secrets in the wrong store

**Failure.** Tokens/keys in `UserDefaults`, a plist, Core Data, or hardcoded in source. All are plaintext on disk (or in the binary — `strings YourApp | grep -i key` finds hardcoded secrets, and so do automated scrapers within hours of App Store release). Backup extraction and forensic tools read them without jailbreak.

**Detection.** Audit greps: `UserDefaults` near `token|secret|password|key`; `strings` + entropy scan on the release binary; check what lands in backups (unencrypted local backup, inspect).

**Fix.** Runtime secrets (auth tokens, refresh tokens, encryption keys) → **Keychain**. API keys that must ship in the binary → accept that they are *public* and design accordingly (server-side proxy for anything privileged; a client-embedded key is a speed bump, not a control — obfuscation only raises the effort bar).

**Keychain correctly, the decisions that matter:**

```swift
var query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "com.yourco.app.authtoken",
    kSecAttrAccount as String: userID,
    kSecValueData as String: tokenData,
    // THE decision: accessibility class
    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
]
```

- `kSecAttrAccessibleWhenUnlocked...` — best protection; **fails for background refresh/silent push** work while the device is locked. Choosing it and then reading tokens from a background task gives you `errSecItemNotFound` *only when locked* — an infamous intermittent field bug (symptom: users randomly logged out overnight).
- `...AfterFirstUnlockThisDeviceOnly` — the right default for auth tokens in apps with any background behavior.
- `ThisDeviceOnly` variants exclude the item from iCloud Keychain/device transfers — right for device-bound tokens, wrong for user passwords the user expects to migrate.
- Keychain items **historically persist across app deletion**. Treat first-launch-after-install as "stale credentials may exist": key items by account, clear on first run if your model requires it.
- Wrap the C API once, behind a protocol, with typed errors; test against `errSecDuplicateItem` (add vs update paths) — the raw API's most common misuse.

**Prevention.** Lint/danger rule: `UserDefaults` + secret-shaped identifier ⇒ blocked. Secret scanning (gitleaks) in CI. Periodic `strings`-scan of the release artifact.

### 2. Transport: ATS erosion and pinning done wrong

**Failure (erosion).** ATS exceptions added "temporarily" for a broken staging cert (`NSAllowsArbitraryLoads: true`) ship to production and stay for years. Every HTTP fetch is now interceptable; App Review may also reject or demand justification.

**Fix/Prevention.** Exceptions must be **per-domain** (`NSExceptionDomains`) with a linked ticket and expiry; CI check diffing Info.plist ATS keys against an allowlist; `NSAllowsArbitraryLoads` blocked outright in the release scheme's plist.

**Failure (pinning).** Two opposite failures:
- *No pinning where it matters*: apps handling money/health accept any CA-signed cert; a compromised or user-installed CA (enterprise MDM, malware-added profile) can MITM.
- *Pinning the leaf certificate*: routine cert renewal changes the leaf → **every installed app instance hard-fails networking simultaneously** until users update. I've watched this take down an app for four days; App Review turnaround was the recovery bottleneck. This failure mode is worse than what pinning defends against for most consumer apps.

**Fix.** Threat-model first: pin only if MITM-with-trusted-CA is in-model (finance, health, hostile-network user bases). Then:
- Pin the **SPKI hash (public key)**, not the certificate, and keep the key stable across renewals — or pin a *set* including a backup key held offline.
- Use `URLSessionDelegate.urlSession(_:didReceive:completionHandler:)` evaluating the server trust chain against pinned SPKI hashes, **or** the zero-code option: **`NSPinnedDomains` in Info.plist** (iOS 14+), which pins SPKI hashes declaratively and avoids the classic delegate bug (forgetting to call the completion handler on all paths → hangs).
- Ship a **kill switch**: remote config that can relax pinning enforcement, because your recovery path during a pinning incident must not be App Review.

**Prevention.** Calendar the key rotation with the backup-pin procedure; a staging test that serves a *wrong* cert and asserts the app refuses (verifies pinning is actually on — silent-no-op pinning code is common).

### 3. Secure Enclave misunderstood

**Failure.** Teams "store data in the Secure Enclave." The SE doesn't store your data — it generates and holds **P-256 private keys whose bytes never leave the enclave**; you get signing/ECIES operations, not key export. Misdesigns: trying to put symmetric keys "in" the SE, or assuming SE = biometric gate (separate concern via `kSecAccessControl`).

**Fix — the correct pattern (envelope encryption):**
1. Create an SE key: `SecKeyCreateRandomKey` with `kSecAttrTokenID = kSecAttrTokenIDSecureEnclave` and an access-control object (`SecAccessControlCreateWithFlags` — add `.biometryCurrentSet` only if you want key use gated on the *currently enrolled* biometrics; note that flag **invalidates the key when biometrics are re-enrolled** — that's a feature for high-security, a support-ticket generator otherwise).
2. Encrypt data with a symmetric key (CryptoKit `AES.GCM`/`ChaChaPoly`); wrap that symmetric key using the SE key (`SecKeyCreateEncryptedData`, ECIES) or use CryptoKit's `SecureEnclave.P256` for signing/agreement.
3. Store wrapped key + ciphertext anywhere; only the enclave can unwrap.

**Reality check before building this:** iOS **Data Protection already encrypts files at rest** (`FileProtectionType.complete...`) keyed through hardware. SE envelope encryption earns its complexity when you need key-use gating (biometric per-operation), non-exportable signing identities, or defense against a *jailbroken-device* file-system read. If your threat model is "phone thief without the passcode," Data Protection classes already cover you at 5% of the code.

**Prevention.** Security-design review template asking "what does the SE add over Data Protection *for this threat*?" before any enclave code merges.

### 4. Jailbreak / tamper detection: know what you're buying

**Failure.** Weeks spent on jailbreak checks (path probes for `/Applications/Cydia.app`, fork checks, dylib-injection scans) that: (a) any current jailbreak hides from automatically (detection bypass is a *commodity* — tweaks hook exactly your checks), (b) false-positive on odd but legitimate devices, locking out paying users, (c) get your security posture *audited as if it were a control* when it's a speed bump.

**The honest tradeoff.** Client-side tamper detection raises attacker cost linearly; determined attackers pay it in hours. It is worth shipping when a compliance regime demands it (banking regulations, DRM contracts) or as *telemetry* (flagging sessions server-side for extra scrutiny) — it is not worth trusting. **Never make client-side checks the enforcement point**: the client is the attacker's machine; enforcement lives server-side (anomaly detection, attestation).

**Fix (the modern control).** **App Attest / DeviceCheck** (`DCAppAttestService`): hardware-backed attestation that requests come from *your unmodified app on genuine Apple hardware*, verified **server-side**. This moves the trust decision off the attacker's device and is the single highest-value anti-tamper investment. Pair with server-side risk scoring; degrade (extra verification) rather than hard-block on signals, to survive false positives.

**Prevention.** Threat-model doc for the app stating which client-side checks exist, what they defend, and the explicit statement that they are advisory; revisit at each pen test.

### 5. Leakage side channels (the audit findings everyone gets)

**Failure.** Sensitive screens captured in the **app-switcher snapshot**; passwords visible via third-party keyboards; secrets in logs (`print`/os_log of raw responses) shipped in Release; pasteboard scraping of copied sensitive values; URLs with tokens landing in server/CDN logs.

**Fix.** Snapshot: overlay/blur in `sceneWillResignActive`. Fields: `isSecureTextEntry` (also disables 3rd-party keyboards for that field), `textContentType` set correctly. Logging: os_log **defaults to `%{private}`-redacting dynamic strings — don't blanket-override with `%{public}`**; strip verbose logging from Release; never log Authorization headers (write the redacting `CustomStringConvertible` for your request type once). Pasteboard: `UIPasteboard.general.setItems(_, options: [.expirationDate: …, .localOnly: true])` for OTP-ish values. Tokens travel in headers/body, never query strings.

**Prevention.** Release-candidate checklist: run the app, background it on every sensitive screen, inspect snapshots; grep build logs for auth material; periodic proxy session (Charles/mitmproxy against a debug-trusted build) reviewing what actually leaves the device — the findings are always surprising.

## Prevention summary

| Gate | Mechanism |
|---|---|
| Secrets in source/defaults | gitleaks in CI + lint rule + release-binary `strings` scan |
| ATS erosion | Info.plist ATS-key diff check against allowlist in CI |
| Pinning bricking | SPKI(-set) pinning + backup key + remote kill switch + wrong-cert staging test |
| Enclave misuse | Design-review question: "what does SE add over Data Protection here?" |
| Snapshot/log leakage | RC checklist + proxy session per major release |
| Tamper enforcement client-side | Architecture rule: client signals advisory; App Attest + server-side enforcement |

**Related:** Keychain-in-background failure interacts with BGTask scheduling → [release-and-platform.md](release-and-platform.md) · secure storage of test credentials → [testing.md](testing.md)
