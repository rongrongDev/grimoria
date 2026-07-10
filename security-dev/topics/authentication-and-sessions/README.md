# Authentication & Session Management

**Date:** 2026-07-06 · **Tier:** core (full depth) · **Standards:** OWASP Top 10 2021 A07 (Identification & Authentication Failures); NIST SP 800-63B; CWE-287, CWE-384 (session fixation), CWE-613 (insufficient session expiration), CWE-522 · **Standalone:** yes · **Related:** [../authorization/](../authorization/README.md) (what authN is NOT), [../oauth-oidc-jwt/](../oauth-oidc-jwt/README.md) (federated/token authN), [../cryptography/](../cryptography/README.md) (password hashing primitives)

Authentication answers *who is this*; it never answers *may they do this* — that's [authorization](../authorization/README.md), and conflating the two is a top root cause of real breaches. This doc covers proving identity and keeping that proof (the session) from being stolen, fixed, or outliving its welcome.

**Prime directive: don't build authN from parts if you can help it.** Use your framework's session machinery or a managed IdP. When you must build (and someone on your team is deciding this right now, wrongly), the failure modes below are the complete map of what kills you. Every one is from a real incident.

## 1. Credential storage (CWE-522, CWE-916)

**Failure mode.** Passwords stored plaintext, encrypted (reversible — the key leaks with the DB), fast-hashed (MD5/SHA-x, GPU-crackable at billions/sec), or slow-hashed without salt (rainbow tables). Breach of the user table then converts to breach of *every account* — and, since users reuse passwords, accounts elsewhere. Your DB dump becomes someone else's credential-stuffing list.

**Detection.** Column named `password` whose values are reversible or fixed-length hex of MD5/SHA length; hashing done with a general-purpose hash API rather than a password-hashing API; absence of a per-user salt column *and* absence of a modern PHC-format string (`$argon2id$...`, `$2b$...` embed salt+params). Also grep for `md5(`, `sha1(`, `sha256(` within arm's reach of "password."

**Fix.** Argon2id (preferred) or bcrypt/scrypt via a maintained library, with library-default-or-stronger cost parameters, per-user salt handled by the library. Migration without forcing resets: wrap-and-rehash — verify against old hash on next login, immediately store the new-format hash; expire the wrapped stragglers after a deadline.

**Prevention.** SAST rule: general-purpose hash functions may not appear in files matching auth/credential paths; the password-hashing call goes through exactly one internal function (single point to audit and upgrade); a unit test asserting stored credentials parse as PHC-format Argon2id/bcrypt (catches a regression to `sha256` in review's blind spot).

## 2. Password policy & the login endpoint as attack surface

**Failure mode(s), bundled because the fix is one endpoint's design:** credential stuffing (breached-elsewhere passwords replayed against you — the #1 real-world account-takeover vector); brute force on short passwords; **user enumeration** — the login/reset/registration trio leaking which emails have accounts via message differences ("wrong password" vs "no such user"), status codes, or *response-time* differences; composition rules (`P@ssw0rd1!` passes, real entropy fails) driving users to predictable patterns.

**Detection.** Read the three endpoints (login, reset-request, register) and diff their failure responses — message, status, and timing (does the no-such-user path skip the hash computation? that's a measurable oracle). Check for rate limiting: per-account, per-IP, and global. Load logs: is there alerting on failed-login spikes or on many-accounts-one-IP patterns?

**Fix.** NIST SP 800-63B posture: length (8 min, allow 64+), no composition rules, no periodic forced rotation (rotation only on evidence of compromise — forced rotation measurably degrades password quality); screen against breached-password corpora at set/change time; uniform failure responses across all three endpoints — same message, same status, and compute the hash even on the no-such-user path (verify against a dummy hash) to level timing; rate-limit per-account (lockout-with-backoff or CAPTCHA escalation) *and* per-IP, remembering attackers rotate IPs (per-account is the one that matters for stuffing); MFA — offering TOTP/WebAuthn is worth more than every other item in this section combined; make it mandatory for admin/privileged accounts, day one.

**Prevention.** The uniform-response property gets a test (assert byte-identical bodies and ±ε timing for the two failure paths); rate-limit config lives in code, reviewed, with an integration test that the 11th rapid attempt is rejected; failed-auth metrics with alert thresholds wired before launch, not after the first stuffing run ([../../principles/incident-response.md](../../principles/incident-response.md) — detection is a control).

## 3. Session fixation (CWE-384)

**Failure mode.** The session identifier survives the authentication boundary: attacker obtains/plants a session ID pre-login (URL parameter, subdomain cookie injection, walking up to a kiosk), victim logs in, session is now authenticated — and the attacker holds a copy. The subtle modern variant: SPA backends that "upgrade" an anonymous session object in place instead of reissuing the cookie.

**Detection.** Read the login handler: is a *new* session identifier issued on successful authentication (and on every privilege transition — sudo-mode, role switch)? Grep session middleware config for `regenerate`/`cycle_key`/equivalent at the login site. Accepting session IDs from URL parameters is an automatic finding wherever it appears.

**Fix.** Regenerate the session ID at every trust-level change; invalidate the old ID server-side (not just reissue); session IDs only in cookies, never URLs (referer leakage + fixation).

**Prevention.** Integration test: capture pre-login session cookie, log in, assert the cookie changed AND the old ID no longer resolves to the authenticated session. This one test permanently closes the class; almost nobody writes it.

## 4. Session lifecycle & cookie hardening (CWE-613)

**Failure mode.** Sessions that never expire (stolen cookie = permanent access); logout that clears the browser cookie but leaves the server-side session valid (the "logout that doesn't" — check yours today, it's wrong more often than not); no revocation story ("log out everywhere" impossible during an account takeover — this becomes an incident-response gap, [../../principles/incident-response.md](../../principles/incident-response.md) §4); cookies missing `HttpOnly` (readable by any XSS — one reflected XSS now equals account takeover), `Secure`, or `SameSite` (CSRF surface); session IDs from weak randomness (guessable).

**Detection.** Hit the app once and read the `Set-Cookie` header — this is the fastest security test in existence: `HttpOnly; Secure; SameSite=Lax` (or `Strict`) or findings. Server side: is there an absolute lifetime and an idle timeout? Does logout delete the *server-side* record? Is there a sessions table/store supporting per-user revocation? Is the ID ≥128 bits from a CSPRNG (framework default: yes; homegrown hex-of-timestamp: seen it)?

**Fix.** Framework session store with: CSPRNG IDs, idle timeout (risk-tiered: minutes for banking, days for a forum), absolute lifetime, server-side invalidation on logout, a revoke-all-sessions operation *and its trigger on password change* — users changing their password mid-takeover expect it to evict the attacker; make that true. Cookie flags all three, `__Host-` prefix where deployable.

**Prevention.** A `Set-Cookie` assertion test in CI (flags never regress silently); "password change revokes all sessions" as an integration test; session-store choice documented so the next engineer doesn't add a second, unhardened one for a new endpoint.

## 5. Password reset — the second front door

**Failure mode.** The reset flow *is* an authentication path and gets a fraction of the scrutiny: tokens that are guessable, long-lived, reusable, or not invalidated after use/after a new reset; host-header injection poisoning the emailed link (attacker sets `Host:`, victim's reset link points at attacker's server, token harvested — this one is chronic in the wild); reset endpoints as enumeration/flooding oracles; and knowledge-based fallbacks ("last four of...") that combine with data leaks into full ATO ([../../principles/security-mindset.md](../../principles/security-mindset.md) §3's chain story — that chain went *through* the reset flow).

**Detection.** Token properties: length/entropy, single-use, TTL ≤1h, stored hashed (a reset-token table readable via SQLi should not equal ATO); link construction: is the base URL from config or from request headers (grep the mailer for `Host`/`X-Forwarded-Host`)? Post-use invalidation: does consuming the token kill older tokens and other live sessions?

**Fix.** 128-bit CSPRNG token, stored hashed, single-use, short TTL; base URL from server config only; uniform response whether the account exists or not; rate-limited; successful reset revokes all sessions and all outstanding reset tokens, and notifies the account's email ("your password was changed") — that notification is your user-powered breach detection.

**Prevention.** Reset flow gets the same test suite rigor as login (token reuse test, expiry test, host-header test with a forged header asserting the link still points at config's base URL); reset-flow changes flagged for security review by CODEOWNERS on the mailer + reset handler paths.

## 6. Service-to-service authentication

**Failure mode.** "Internal, therefore trusted": services accepting any in-VPC caller ([zero trust](../../GLOSSARY.md) is the counter-stance); one shared API key for all internal callers (no attribution — a repudiation gap, and rotation means fleet-wide coordinated pain, so it never rotates); static bearer secrets in env files outliving employees and laptops.

**Detection.** For each internal endpoint: what does it check about the caller? Map credentials: how many services share each? When did each last rotate ([../secrets-and-keys/](../secrets-and-keys/README.md) owns rotation mechanics)?

**Fix/prevention.** Per-caller identity (mTLS via mesh, or platform-issued identity tokens — cloud IAM/workload identity); authorize the *service*, not just authenticate it (billing-service may call `charge`; avatar-service may not); short-lived credentials from the platform over static secrets — the rotation problem dissolves when nothing lives long enough to rotate. Gate: new internal endpoints must declare their caller-authZ policy in the same PR (deny-by-default middleware makes this structural, per [../../principles/security-mindset.md](../../principles/security-mindset.md) §5).

## 7. Review drill for any authN-touching diff

1. Does any response differ by account-existence? (§2)
2. Is the session ID regenerated at this trust transition? (§3)
3. What's the revocation story for whatever this issues? (§4, and tokens: [../oauth-oidc-jwt/](../oauth-oidc-jwt/README.md))
4. Is every new failure path fail-closed — including the catch blocks? ([../../principles/secure-code-review.md](../../principles/secure-code-review.md) §2)
5. Does the accompanying test suite include the *negative* cases (wrong password, expired token, reused token, foreign session)? Positive-only auth tests are decoration.
