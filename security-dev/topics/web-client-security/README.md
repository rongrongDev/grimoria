# Web Client Security — XSS, CSRF, and the Browser Trust Model

**Date:** 2026-07-06 · **Tier:** core (full depth) · **Standards:** OWASP Top 10 2021 A03 (XSS lives under Injection since 2021), A05 (Misconfiguration — headers); CWE-79 (XSS), CWE-352 (CSRF), CWE-1021 (clickjacking) · **Standalone:** yes · **Related:** [../injection/](../injection/README.md) (the shared root cause — XSS is injection where the interpreter is the browser), [../authentication-and-sessions/](../authentication-and-sessions/README.md) §4 (cookie flags, the other half of both classes)

This doc completes the OWASP Top 10 web coverage: the classes whose interpreter is the *victim's browser*. The trust-model insight that organizes them: the browser enforces boundaries by **origin**, and both XSS and CSRF are ways attacker code or attacker intent gets to act *as if it were your origin* — XSS by running script inside it, CSRF by riding the credentials the browser attaches automatically.

## 1. Cross-Site Scripting — XSS (CWE-79)

**Failure mode.** Untrusted data rendered into HTML/JS/CSS/URL contexts without context-appropriate encoding; attacker markup executes in victims' browsers *with the victim's session*. Everything the user can do, the script can do: read what's on the page, call the API as the user, exfiltrate tokens readable to JS. Persistence classes: *stored* (planted in data everyone views — the worst: one comment field, every viewer), *reflected* (carried in a link), *DOM-based* (never touches the server: JS reads `location.hash`/`postMessage`/storage and writes it to a sink — invisible to server-side review and most DAST). The modern failure sites, since frameworks killed the easy cases: **escape-hatch APIs** (`dangerouslySetInnerHTML`, `v-html`, `innerHTML =`, `| safe`, `mark_safe`, `html/template` bypasses); **wrong-context encoding** (HTML-escaped value dropped into an inline event handler, a `<script>` block, or a URL attribute — each context has different metacharacters, which is why "escape it" without "for which context" is not a fix); **`javascript:` URLs** in user-supplied links; **user uploads served inline** (SVG/HTML from your origin — [SSRF/XXE doc](../ssrf-xxe-deserialization/README.md) §2 flags SVG for the same reason); **sanitizer misuse** (homegrown regex "sanitizers" — a losing bet against the HTML grammar, same as every hand-rolled defense in [injection](../injection/README.md) §0).

**Detection.** Grep the escape hatches above — each hit needs a "where did this value originate" trace (taint origin includes your DB: stored XSS is written safely and rendered fatally, [mindset](../../principles/security-mindset.md) §2). DOM-based: grep JS for source→sink pairs (`location`, `document.referrer`, `postMessage` data, `localStorage` → `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval`-family, `setAttribute` on event/URL attributes). Check `Content-Type` and `Content-Disposition` on every user-upload serving path. Runtime: CSP violation reports (§3) double as XSS-attempt telemetry — free detection if you set the reporting endpoint.

**Fix.** In order: (1) framework auto-escaping everywhere, escape hatches removed or justified per the [auditable-exception pattern](../injection/README.md); (2) where rich user HTML is the feature, a maintained allowlist sanitizer (DOMPurify-class) at *render or accept* time — never regex; (3) context-aware encoding for the odd non-HTML contexts (prefer restructuring so values land in HTML-text context only: `data-*` attributes read by JS beat inline script interpolation); (4) user uploads: `Content-Disposition: attachment` or a sandboxed/separate origin for user content (the structural fix — hostile content can't act as your origin if it isn't *on* your origin); (5) `HttpOnly` on session cookies so the commonest payload objective (session theft) fails even when XSS lands ([authentication](../authentication-and-sessions/README.md) §4).

**Prevention.** Lint rule on escape-hatch APIs (mechanical, low-noise); CSP as the backstop layer (§3 — makes many XSS bugs unexploitable-in-practice while you fix them; never the primary control); the "one extra context" review question on any template/JSX diff: *which context does each interpolation land in, and who encoded for it?*; stored-content regression test: post a benign marker string containing HTML metacharacters, assert it renders inert everywhere it appears (that's a correctness test, not an exploit).

## 2. Cross-Site Request Forgery — CSRF (CWE-352)

**Failure mode.** The browser attaches cookies automatically to any request aimed at your origin — including requests *initiated by another site* the victim is visiting. A state-changing endpoint authenticated by cookie alone (change email, transfer funds, disable MFA) can therefore be triggered cross-site with the victim's full authority: attacker supplies the intent, browser supplies the credentials. Modern variants that keep the class alive post-`SameSite`: **`SameSite=None` cookies** (required for legitimate cross-site embedding, reopens the hole); **method-override laxity** (state changes via GET — `SameSite=Lax` deliberately allows top-level GET navigation with cookies, so a GET that mutates is CSRF-able *by design*); **CORS misconfiguration promoting simple-request CSRF into full read-write** ([api-security](../api-security/README.md) §5's reflected-origin bug); **login CSRF** (forcing the victim *into the attacker's account* so their subsequent data lands there — the `state` parameter's job in [OAuth](../oauth-oidc-jwt/README.md) §2).

**Detection.** Inventory state-changing endpoints; for each: what proves *intent* beyond the cookie? Acceptable answers: verified anti-CSRF token, `SameSite=Lax/Strict` **plus** no-GET-mutations (both halves — check both), token-in-header auth (non-cookie), or signature (webhooks). Grep for `SameSite=None`, for mutating GET handlers, and for CSRF-middleware exemption decorators (`csrf_exempt` and friends) — every exemption is a finding until justified.

**Fix.** Defense stack, cheapest first: `SameSite=Lax` (or `Strict` for high-value apps) on session cookies + strict no-mutation-via-GET discipline; framework anti-CSRF tokens on cookie-authenticated forms/XHR (synchronizer or double-submit per framework norm — use the framework's, don't hand-roll); for pure token-header APIs (Authorization header, no cookie auth), CSRF is structurally absent — *verify no cookie-auth fallback path exists* before claiming this; re-authentication (sudo mode) on the irreversible operations regardless, per [authorization](../authorization/README.md) §4.

**Prevention.** CSRF middleware default-on, exemptions lint-flagged with justification; cookie-flag assertion test in CI ([authentication](../authentication-and-sessions/README.md) §4 already requires it — `SameSite` rides along); code-review checklist line: "no state change on GET; every new mutating endpoint names its intent-proof."

## 3. The header baseline (A05's client-facing slice)

One config PR, permanent risk reduction; each header is a named layer ([mindset](../../principles/security-mindset.md) §4 — independent-failure layers for the browser):

| Header | Kills | Judgment note |
|---|---|---|
| `Content-Security-Policy` | Most XSS exploitation; data-exfil channels | The big one. Start `report-only`, tighten to nonce/hash-based `script-src` (allowlist-of-domains CSPs are routinely bypassable via JSONP/gadgets on allowed CDNs); wire the report endpoint — it's free attack telemetry (§1) |
| `Strict-Transport-Security` | Protocol downgrade, cookie theft on first hop | Preload only once you're sure; it's near-irreversible |
| `X-Content-Type-Options: nosniff` | MIME-sniffing user uploads into HTML/JS | Mandatory on user-content responses (§1's upload rule depends on it) |
| `frame-ancestors` (CSP) / `X-Frame-Options` | Clickjacking (CWE-1021) — victim clicks your real UI through an invisible overlay | `DENY`/`'none'` unless embedding is a feature; if it is, allowlist the embedders exactly |
| `Referrer-Policy: strict-origin-when-cross-origin` | Tokens/IDs in URLs leaking via referer | Also: stop putting tokens in URLs ([authentication](../authentication-and-sessions/README.md) §3) |
| `Permissions-Policy` | Compromised page accessing camera/mic/geolocation | Deny what you don't use |

**Prevention for the set:** headers asserted by a CI test against the deployed config ([api-security](../api-security/README.md) §5's config-drift rule) — a header removed "temporarily" during an embed experiment otherwise stays removed forever.

## 4. Review drill (any front-end or template diff)

1. Every new interpolation → which context, whose encoding? Escape hatches justified + sanitizer where rich HTML is the feature? (§1)
2. New mutating endpoint → intent-proof named (token/SameSite+no-GET/header-auth)? Any new `csrf_exempt`? (§2)
3. User-supplied URLs → scheme-allowlisted (no `javascript:`)? User uploads → attachment/sandboxed origin + `nosniff`? (§1, §3)
4. Any cookie change → flags intact, `SameSite=None` justified? ([authentication](../authentication-and-sessions/README.md) §4 + §2)
5. CSP touched → still nonce/hash-based, report endpoint alive? (§3)
