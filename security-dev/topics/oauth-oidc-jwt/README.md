# OAuth 2.0, OIDC, and JWT — Token Misuse and Flow Misconfiguration

**Date:** 2026-07-06 · **Tier:** core (full depth) · **Standards:** OAuth 2.0 Security BCP **RFC 9700 (Jan 2025)** — the controlling document for flow guidance here; OIDC Core 1.0; RFC 7519 (JWT), RFC 8725 (JWT BCP); CWE-287, CWE-345, CWE-613 · **Standalone:** yes · **Related:** [../authentication-and-sessions/](../authentication-and-sessions/README.md) (sessions vs tokens), [../authorization/](../authorization/README.md) (claims ≠ permissions), [../cryptography/](../cryptography/README.md) (signature primitives)

Two rules frame everything else. **One:** OAuth is *authorization delegation* ("may this client access this resource on the user's behalf"); OIDC is the identity layer on top ("who is this user"). Using bare OAuth access tokens as login proof is a design bug with a name (the "confused-deputy login") and a history of real ATO. **Two:** a JWT is a *signed claim set*, nothing more — every security property comes from *your validation of it*, and the misuse classes below are all validations someone skipped.

## 1. JWT validation — where the bodies are buried

**Failure mode(s).** In observed-frequency order:

1. **`alg` confusion.** The token header names its own algorithm and the verifier honors it: attacker re-signs an `RS256` token as `HS256` using the *public* key as the HMAC secret (key-type confusion), or the library accepts `alg: none` (signature-optional mode, an actual spec feature, an actual production incident class). The verifier trusting the attacker's metadata about how to verify the attacker's message is the whole bug.
2. **Missing claim validation.** Signature checked, contents believed: no `exp` check (eternal tokens); no `aud` check (a token minted for service A replayed against service B — in a multi-service org this is *cross-service privilege escalation via perfectly valid tokens*); no `iss` check (any IdP the library can fetch keys for becomes *your* IdP); `nbf`/clock-skew handled ad hoc.
3. **No revocation story.** Stateless JWT sessions with 24h+ TTLs: user logs out (nothing happens server-side), gets fired (token works until expiry), reports theft (nothing to revoke). The stateless dream quietly deleted the "log out everywhere" requirement that [../authentication-and-sessions/](../authentication-and-sessions/README.md) §4 makes mandatory.
4. **Sensitive data in payloads.** JWT payloads are base64, not encrypted; PII/secrets in claims are disclosed to anything that logs, stores, or proxies the token.
5. **Weak HMAC secrets.** `HS256` with a dictionary-word secret is offline-crackable from one captured token; then the attacker mints arbitrary identities.

**Detection.** Grep/review: `decode(` calls distinguishing verify-off variants (`jwt.decode(t, verify=False)`, `decode` vs `verify` in JS libs, `ignoreExpiration`, `algorithms` parameter absent = library may honor the header); verifier config missing pinned `algorithms=[...]`, `audience=`, `issuer=`; TTLs in token-mint code (>1h access tokens are a finding needing justification); payload contents audit. Runtime: log `kid`/`alg` distributions — an `alg` you never mint appearing in traffic is an attack in progress, cheap to alert on.

**Fix.** Pin the algorithm allowlist server-side (never from the header); validate `exp`, `aud`, `iss`, `sub` presence on every verification, centralized in one middleware/function so it's one audit point; access tokens ≤15min; anything longer-lived (refresh tokens, session JWTs) gets server-side state — a denylist checked on sensitive operations at minimum, a session record ideally, at which point reconsider whether you wanted JWTs for sessions at all (framework sessions already solved revocation, [../authentication-and-sessions/](../authentication-and-sessions/README.md)); HMAC secrets 256-bit CSPRNG from the secret manager ([../secrets-and-keys/](../secrets-and-keys/README.md)), or prefer asymmetric (RS256/ES256/EdDSA) so verifiers hold no minting capability; rotate signing keys via `kid` + JWKS with overlap windows.

**Prevention.** One blessed verification wrapper, lint rule banning direct library `decode`/`verify` calls outside it; unit tests in CI asserting rejection of: expired token, wrong `aud`, wrong `iss`, `alg: none`, and cross-signed HS/RS confusion attempts (construct these as *malformed inputs to your verifier* — that's defensive test data, not an exploit); secret-scanner rule for JWT-shaped strings (`eyJ` prefix) in code/config/logs.

## 2. OAuth flow misconfiguration (RFC 9700 alignment)

**Failure mode(s).**

1. **Deprecated grants still live.** Implicit grant (tokens in URL fragments: leak via history/referer/JS; no client authentication) and Resource-Owner-Password-Credentials (app handles raw passwords, defeating the point) — both formally deprecated by RFC 9700, both still found in 2026 codebases because "it worked."
2. **Authorization-code interception, no PKCE.** Public clients (SPAs, mobile) whose auth codes can be intercepted (redirect handling, app-link hijack on mobile) and replayed. RFC 9700: PKCE (S256) is required for public clients and recommended for *all* authorization-code flows — confidential clients included (it also kills a CSRF class).
3. **Redirect-URI laxity.** The redirect URI is where the authorization result is *delivered*; loose matching (prefix match, wildcard subdomains, open path) lets an attacker deliver codes/tokens to themselves — often chained through an innocuous open-redirect on an allowed domain. Exact-match is the RFC 9700 requirement, and the incident history behind it is extensive.
4. **Missing `state` / mixed-up flows.** No `state` (or unbound `state`): login CSRF — victim gets silently logged into the attacker's account and enters data into it. Multi-IdP setups that don't bind the flow to the chosen IdP enable IdP mix-up attacks (fixed by `iss` in the auth response / distinct redirect URIs per IdP).
5. **Over-scoped, under-audited grants.** Clients requesting `*` scopes because narrow ones were friction; resource servers checking token *validity* but not *scope* (any valid token calls any API — the `aud`/scope check from §1.2 again, delegation edition).
6. **Client secrets in public clients.** A "confidential" client ID+secret shipped inside a mobile app or SPA bundle is public by definition; anyone can extract and impersonate the client.

**Detection.** Inventory every OAuth client registration: grant types enabled (implicit/ROPC = finding), redirect URIs (any wildcard/prefix = finding), PKCE enforcement flag, scope breadth. Code: `state` generated per-request, cryptographically random, verified on callback and bound to the session? Token endpoint responses cached/logged anywhere? Resource servers: point at the scope-check middleware; absent = finding.

**Fix.** Authorization code + PKCE (S256) as the only user-facing grant; `client_credentials` for service-to-service; exact-match redirect URIs, HTTPS-only, no open-redirect endpoints anywhere on allowed hosts (audit for them — they're chain links); per-request random `state` bound to session, verified; scopes narrowed to operation families, resource servers enforce them; public clients hold no secrets (PKCE replaces the secret's role).

**Prevention.** IdP/AS configuration as code, reviewed like code — client registrations in a console are invisible config drift ([../cloud-and-infra/](../cloud-and-infra/README.md) pitfall #1 generalized); CI test against staging IdP asserting implicit/ROPC rejected, PKCE-less code flow rejected, near-miss redirect URI (`https://app.example.com.evil.tld`, path suffix) rejected; scope audit quarterly, dormant clients disabled.

## 3. OIDC specifics

**Failure mode.** Treating any OAuth access token as identity: the "log in with X" endpoint accepting an access token and calling `/userinfo` — but the token was minted for *any* client of that IdP; a malicious app's legitimately-obtained token logs its attacker into *your* app as the victim (audience confusion, ATO in the wild repeatedly). Also: ID-token signature/`nonce` validation skipped ("it came over TLS from the IdP" — it came from the *browser*), and `email` claim trusted without `email_verified`.

**Fix/detection in one move:** login accepts only **ID tokens**, validated per §1 *plus* `aud` = your client ID, `nonce` bound to the session, and account linking keyed on `iss`+`sub` (stable) never on `email` (reassignable, spoofable via unverified claims — cross-IdP account-takeover class). Use a certified OIDC library; the certification suite exists precisely because hand-rolled validation misses these.

**Prevention.** Integration tests: ID token with wrong `aud`/`nonce`/unverified email → rejected; account-linking logic reviewed whenever a new IdP is added (each IdP's claim semantics differ — document the `iss`+`sub` rule where the next integrator will read it).

## 4. Architecture judgment: tokens vs sessions, and claim freshness

Two recurring decisions this doc owns:

**Sessions vs JWTs for first-party web login:** default to server-side sessions ([../authentication-and-sessions/](../authentication-and-sessions/README.md)) — revocation, logout, and idle-timeout come free, and the "stateless scale" argument is usually solving a problem you don't have with a problem you will. JWTs earn their keep for *cross-service* delegation (microservice hops, third-party API access) where the verifier can't share a session store.

**Claim freshness vs verification cost:** privilege claims in tokens (`role: admin`) are a *cache* of the authoritative store, stale by up to one TTL ([../authorization/](../authorization/README.md) §4's revocation gap). Decision rule: cacheable-in-token = things whose staleness you can tolerate for the TTL (display name, tenant ID); must-check-live = anything whose revocation must be immediate (privilege level for destructive/admin operations, account-disabled status). Short TTL + live check on sensitive ops is the standard compromise; write down which operations are on the live-check list, because the list only matters if the next endpoint author knows it exists.

## 5. Review drill (any diff touching tokens or OAuth config)

1. Token verification: through the blessed wrapper? Algorithm pinned, `exp`/`aud`/`iss` enforced? (§1)
2. Anything minted: TTL justified? Revocation path exists and is tested? (§1, §4)
3. Flow config: code+PKCE only, exact redirect URIs, `state`/`nonce` bound and verified? (§2, §3)
4. Login path: ID tokens only, `iss`+`sub` linking? (§3)
5. Negative tests present for each of the above rejections? Same rule as everywhere in this KB: an unmitigated-in-costume threat is one without its test ([../../principles/threat-modeling.md](../../principles/threat-modeling.md) §4).
