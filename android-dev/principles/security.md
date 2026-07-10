# Security — Keystore, Storage, Pinning, R8, and the Intent System's Sharp Edges

> **Applies to:** API 24–36 (targetSdk 36), R8 in AGP 8.x, Tink 1.15+ · **Last reviewed:** 2026-07-06
> **Related:** [build-and-release.md](build-and-release.md) · guide: [analyze-existing-app.md](../guides/analyze-existing-app.md)

## Threat-model honesty first

Android app security has two distinct adversaries, and conflating them wastes effort:

1. **Other apps / network attackers on the user's device.** You can genuinely defend here: sandboxing, permissions, Keystore, TLS. Spend your effort here.
2. **The user themselves (or someone with their rooted device).** You *cannot* durably defend the client from its owner. Obfuscation, root detection, and client-side checks raise cost; they don't stop anyone determined. Any security control whose failure would be catastrophic **must live on the server**. I have sat in the meeting where "the discount logic is validated client-side, obfuscated" met "someone published a patched APK"; the fix was a backend sprint, as it always was going to be.

## Failure modes

### 1. Tokens in the wrong place

- **Failure:** Auth tokens in plain `SharedPreferences`, in `externalFilesDir`, logged via OkHttp logging interceptor left at `Level.BODY` in release (I have seen this in three separate production apps — it's the single most common real leak), or baked into `BuildConfig` fields ("API_SECRET") which are trivially read from the APK.
- **Detection:** `analyze-existing-app` guide has the grep list. Quick audit: `apkanalyzer`/`jadx` your own release APK and search for your own secrets — 15 minutes, deeply humbling. Check `HttpLoggingInterceptor` level wiring and any `Log.` call in auth code paths.
- **Fix:** Tokens: `DataStore`/prefs in internal storage is *acceptable* for ordinary session tokens — internal storage is sandboxed; the marginal attacker who can read it (root/full-device compromise) also beats anything else client-side. Encrypt-at-rest for defense in depth: **do not use `androidx.security.crypto` (`EncryptedSharedPreferences`) in new code — it was deprecated in 2024 and abandoned.** Use Google **Tink** with a Keystore-held master key, or Keystore directly for the key + your own AES-GCM. True secrets (signing keys for requests): don't ship them; use a server-mediated or attestation-based flow.
- **Prevention:** Lint rule banning `HttpLoggingInterceptor` in release source sets; a release-build CI step that greps the APK's strings for known secret prefixes (`sk_live`, `AIza`, your own token format).

### 2. Keystore misuse

- **Failure:** (a) Generating a key without `setUserAuthenticationRequired` for keys guarding sensitive actions, then advertising "biometric-protected"; (b) not handling `KeyPermanentlyInvalidatedException` — user enrolls a new fingerprint, key dies, app crashes or silently locks the user out of their data forever (support ticket: "app logged me out and my vault is gone"); (c) assuming Keystore ops are fast — on some OEM TEE implementations, first-use-after-boot key operations take *seconds*; doing them on the main thread ANRs; (d) assuming hardware-backed on all devices — check `KeyInfo.securityLevel`; ship telemetry on it before promising it.
- **Detection:** Crash reports for `KeyPermanentlyInvalidatedException` / `UserNotAuthenticatedException`; ANR traces containing `AndroidKeyStore` frames.
- **Fix:** Design key invalidation as a *normal* flow (re-auth and re-derive; never make Keystore the only copy of user data's key unless invalidation-lockout is the *intended* property); all Keystore ops off the main thread; catch and route the full exception taxonomy.
- **Prevention:** A single `CryptoManager` module owning all Keystore access, with the exception handling written once; ban direct `KeyStore.getInstance` elsewhere (Konsist rule).

### 3. Certificate pinning that bricks your app

- **Failure:** Pinning the leaf certificate with no backup pins; cert rotates (your infra team doesn't know the app pinned it — they never know); every install's networking dies until a store update propagates. This has taken down banks for days. It's the most self-inflicted outage in mobile.
- **Detection:** Staging environment with a rotated cert; a `CertificatePinner` entry count check (≥2 pins) in CI.
- **Fix / policy:** Pin the **intermediate/CA SPKI**, not the leaf; always ≥1 backup pin for a key you keep *offline*; a remote kill-switch (server-controlled config that can relax pinning enforcement — fetched over a *non-pinned* well-known endpoint) so recovery doesn't require a store release. Decide honestly whether you need pinning at all: for most apps, modern TLS + Network Security Config (block user-added CAs for your domains, which is the *default* for targetSdk ≥ 24) is the right cost/benefit; pinning is for finance/health/messaging threat models.
- **Prevention:** Pin rotation is an *operational* runbook owned jointly with infra, with calendar reminders tied to cert expiry. If no one owns the runbook, remove the pinning — unowned pinning is a scheduled outage.

### 4. R8 configured as a security tool (it isn't) and R8 breaking crypto/reflection

- See [build-and-release.md](build-and-release.md) for the reflection-breakage mechanics. Security-specific point: R8 renames things; it does not *hide* them. String constants, endpoints, and logic flow remain readable in jadx. Treat R8 as size/perf tooling with a mild deterrence side effect.

### 5. Exported components and deep-link injection

- **Failure:** (a) `android:exported="true"` (required to be explicit since API 31) on Activities that trust their Intent extras — any app on the device can start them with arbitrary extras: skip your auth wall, inject a `url` extra into your WebView Activity (the classic: exported WebView activity + `url` extra = every other app can load arbitrary JS-enabled web content *inside your app's cookie jar*); (b) deep links that navigate to privileged screens without re-checking auth state; (c) implicit intents carrying sensitive payloads (any matching app receives them); (d) `PendingIntent` without `FLAG_IMMUTABLE` (mandatory decision since API 31) letting the receiver rewrite the intent.
- **Detection:** `adb shell dumpsys package <pkg>` exported-component list, or the manifest itself; then for each exported component ask "what does it do with untrusted extras?" Test: `adb shell am start -n pkg/.WebViewActivity -e url "https://evil.example"`.
- **Fix:** Default every component to `exported="false"`; components that must be exported treat *every* extra as attacker-controlled input — validate scheme/host allowlists for URLs, re-check session state on privileged deep links; use explicit intents internally; `FLAG_IMMUTABLE` everywhere unless you can articulate the mutation you're enabling.
- **Prevention:** Lint has `ExportedActivity`-family checks — set to error. CI test that dumps the merged manifest and diffs the exported set against an allowlist file; new exported component = failed build until the allowlist (and thus a reviewer) is updated. This one CI check has caught SDK manifests silently exporting things more than once in my career.

### 6. Permission over-ask and misuse

- **Failure:** Asking for everything at first launch (acceptance craters and Play flags you); using a permission-gated API as the only path with no denial UX — deny once and the feature is a dead button forever; requesting `MANAGE_EXTERNAL_STORAGE` when SAF/Photo Picker suffices (Play policy rejection).
- **Fix:** Ask in context at moment of use, with a pre-permission explainer only when the benefit isn't self-evident; every permission-gated feature has a designed denied-state; use the Photo Picker (no permission at all) for media selection — the permissionless option that most teams still don't know exists.
- **Prevention:** A "permissions ledger" doc in-repo: every manifest permission, why, what happens on denial. The `gradle-config-auditor` subagent diffs the merged manifest's permissions against it (libraries add permissions transitively — that's how you end up shipping `READ_PHONE_STATE` you never asked for).

## Callable capabilities

- Subagent **`gradle-config-auditor`** — merged-manifest permission and exported-component drift.
- Guide **`analyze-existing-app`** — contains the 30-minute security triage checklist derived from this doc.
