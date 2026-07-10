# Security — OWASP Mapped to How Web Apps Actually Get Owned

**Scope:** framework-agnostic reasoning + the web-specific exploit catalog. Framework secure-defaults: `frameworks/<x>/security.md`. **Date:** 2026-07-06.
**Operationalized by:** the `security-auditor` skill (audits a codebase) and `dependency-security-scanner` subagent (supply chain).

## The mental model

Every vulnerability below is the same root failure wearing different clothes: **data crossed a trust boundary and was treated as more trustworthy on the far side.** User input became HTML (XSS), became a query (injection), became a URL the server fetches (SSRF), became object keys (prototype pollution). Security review is boundary review: find every place untrusted bytes enter, and every place bytes become *executable/interpreted*, and verify what happens between.

Untrusted means: request bodies, query params, headers (including `Host` and `X-Forwarded-*`), cookies, file uploads, URLs, webhook payloads, third-party API responses, database contents that other users wrote, and — increasingly — LLM output.

## The catalog: failure → detection → fix → prevention

### XSS (Cross-Site Scripting) — OWASP A03 Injection
- **Failure:** Attacker-controlled content executes as script in another user's page. Stored (in your DB, served to everyone), reflected (in the URL, delivered by link), DOM-based (client JS writes input into a sink like `innerHTML`).
- **The modern reality:** frameworks auto-escape interpolated text, so 95% of framework-app XSS comes through the escape hatches: `dangerouslySetInnerHTML`, `v-html`, `{@html}`, `[innerHTML]`, direct `document.*` manipulation, `href`/`src` built from user input (`javascript:` URLs), and third-party HTML (markdown renderers, rich-text editors, embeds).
- **Detection:** Grep the escape hatches (the `security-auditor` skill has the list per framework). For each hit, trace where the value originates. Semgrep rules catch new ones; eslint-plugin-react's `no-danger` and framework equivalents flag at write time.
- **Fix:** Sanitize HTML at the *render* boundary with DOMPurify (never a hand-rolled regex — I have watched three different teams' regex sanitizers bypassed with `<img src=x onerror=…>` variants). Validate URL protocols against an allowlist (`http:`, `https:`, `mailto:`) before rendering user-supplied links.
- **Prevention:** CSP with nonces (`script-src 'nonce-…' 'strict-dynamic'`) so injected script doesn't execute even when a sink slips through — CSP is the seatbelt, not the brakes. Lint rules on sinks. Sanitization owned by one shared component (e.g., `<SafeHtml>`), so review means "grep for uses outside SafeHtml."

### CSRF — OWASP A01 Broken Access Control (adjacent)
- **Failure:** Victim's browser sends an authenticated state-changing request the victim never intended (their cookies ride along automatically).
- **Detection:** Any cookie-authenticated mutation endpoint that doesn't verify request provenance. Test: replay a mutation with the cookie but a foreign `Origin` header.
- **Fix:** `SameSite=Lax` (default) or `Strict` on session cookies kills the classic form-POST vector. Add origin verification: reject state-changing requests whose `Origin`/`Sec-Fetch-Site` doesn't match. Anti-CSRF tokens remain necessary if you must support `SameSite=None` or old embedded contexts.
- **Prevention:** Framework middleware (SvelteKit and Angular ship origin/XSRF checks; add `csrf-csrf` or equivalent on bare Node). Bearer-token APIs (no cookies) are structurally immune — but only if the token isn't *also* readable by XSS'd script from localStorage, which trades CSRF for a worse problem. Cookies `HttpOnly; Secure; SameSite=Lax` + origin checks is the sane default for browser apps.

### SSRF — OWASP A10
- **Failure:** Your server fetches a URL influenced by the user — image proxy, webhook tester, PDF renderer, "import from URL" — and the attacker points it at `http://169.254.169.254/` (cloud metadata → credentials) or internal admin services.
- **Detection:** Grep server code for `fetch`/`axios`/`got`/`http.request` whose URL derives from request data. Don't forget indirect flows: URL stored in DB now, fetched by a cron job later.
- **Fix:** Allowlist destination hosts where possible. Otherwise: resolve DNS and reject private/link-local/metadata ranges (and re-check on redirect — `302` to an internal IP is the classic bypass; so is DNS rebinding, so validate the *resolved* IP you actually connect to, e.g. via `ssrf-req-filter` or an egress proxy).
- **Prevention:** Network-level egress policy for the app's runtime (the fix that survives new code paths). IMDSv2 on AWS (session-token requirement defeats basic SSRF). Code review flag on any "server fetches user-supplied URL" feature — it's *always* riskier than the ticket implies.

### Injection (SQL/NoSQL/command) — OWASP A03
- **Failure:** Input concatenated into a query or shell command changes its structure.
- **Detection:** Grep for template literals/concatenation feeding `query(`, `raw(`, `exec(`, `execSync(`. In Mongo-land, look for query objects built directly from `req.body` (`{ $gt: "" }` operator injection bypasses login checks).
- **Fix:** Parameterized queries / ORM query builders exclusively; `execFile` with an args array instead of `exec` with a string. For Mongo, validate body shape with Zod *before* it touches a query (a string field that arrives as an object is an attack, and schema validation rejects it for free).
- **Prevention:** Ban raw-query APIs via lint except in an audited `db/raw/` module. Semgrep in CI.

### Dependency confusion & supply chain — OWASP A06
- **Failure modes:** (a) internal package name not registered publicly; resolver installs attacker's public version. (b) Typosquats. (c) Legitimate package version hijacked (event-stream, ua-parser-js, xz-style maintainer compromise). (d) Install scripts exfiltrating env vars at `npm install` time.
- **Detection:** Dispatch the `dependency-security-scanner` subagent. Key checks: scoped registry config, lockfile integrity, install scripts of new deps, advisory feeds.
- **Fix/Prevention:** Use a scope (`@yourco/…`) and pin the scope to your private registry in `.npmrc`; lockfiles committed and `npm ci` (never `npm install`) in CI; `ignore-scripts=true` in CI where feasible; Renovate/Dependabot with a *cooldown* (e.g., minimumReleaseAge of 3–7 days — hijacked versions are usually caught within days); provenance/signature verification where the ecosystem supports it (`npm audit signatures`).

### Prototype pollution
- **Failure:** Unsafe recursive merge/`set` of user JSON writes to `__proto__`/`constructor.prototype`, adding properties to *every* object in the process. Escalates to RCE when a polluted property reaches something like a template engine option or `child_process` env.
- **Detection:** Grep for hand-rolled deep merge, `lodash.merge`/`set` on request data, `Object.assign` chains over parsed JSON. Test: send `{"__proto__": {"polluted": true}}` and check `({}).polluted`.
- **Fix:** Validate input shape with Zod before merging (unknown keys stripped); use `structuredClone` + explicit field mapping instead of generic deep merge; `Object.create(null)` for dictionaries keyed by user input.
- **Prevention:** `--disable-proto=delete` Node flag; Semgrep rule on deep-merge-of-request-data; keep lodash patched.

### Broken access control — OWASP A01, and the #1 real-world app vuln
- **Failure:** Authorization checked in the UI but not the API (hidden button ≠ forbidden action); or authenticated-but-not-authorized: `GET /api/orders/12345` returns any order if you're logged in at all (IDOR).
- **Detection:** For every handler, answer "who may call this, and where is that enforced *in this handler's call path*?" If the answer involves the client, it's broken. Automated: integration tests that call each endpoint as the wrong user and assert 403/404.
- **Fix:** Centralize authorization (middleware + per-resource ownership checks in the data layer: `WHERE id = ? AND org_id = ?` — make the *query* unable to return foreign rows, don't check after fetching).
- **Prevention:** Ownership scoping in a shared repository layer so new endpoints inherit it. The "wrong-user 403 test" as a required test category for new endpoints. This is the area where I've seen the most sev-1s in 20 years — not exotic crypto, just `WHERE org_id` missing.

### Secrets & auth material — OWASP A02/A07
- **Failure:** Secrets in client bundles (`NEXT_PUBLIC_`/`VITE_` prefixed by mistake), in git history, in logs. Long-lived unrotatable API keys. JWTs with `alg: none` or unverified `aud`/`iss`, or 30-day expiry with no revocation story.
- **Detection:** gitleaks/trufflehog on history in CI; grep client bundles for high-entropy strings; check what your logger does with request headers.
- **Fix/Prevention:** Secret manager (not env-in-repo); pre-commit + CI secret scanning; session cookies over hand-rolled JWT auth for first-party browser apps (revocation, rotation, and `HttpOnly` for free); if JWTs, short expiry + rotation via refresh token, and verify with a maintained library configured with explicit algorithm and audience.

## Secure-by-default checklist for any new web service

1. Security headers on every response: `Content-Security-Policy` (nonce-based), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal. (helmet on Node; framework config elsewhere.)
2. Cookies: `HttpOnly; Secure; SameSite=Lax` minimum.
3. All input validated at the boundary with a schema (Zod), *including* params and headers you "control."
4. Parameterized data access only; raw queries quarantined and reviewed.
5. Rate limiting on auth endpoints and expensive routes; generic error messages outward, detailed logs inward.
6. Lockfile + `npm ci` + scoped registry + dependency cooldown.
7. Every mutation endpoint has a wrong-user test.

## War story — the audit that mattered

A fintech client passed two commercial pentests. The breach still happened: an internal npm package `@corp/billing-utils` was published unscoped as `billing-utils` on a laptop with a stale `.npmrc`, an attacker later registered the name publicly with a higher version, and a CI misconfiguration pulled it. Exfiltrated: CI env, including a database URL. Nothing in the OWASP Top 10 checklist run caught it, because the checklist was run against the *app*, not the *pipeline*. Lesson: your supply chain and CI are part of the attack surface, and they're usually the softest part. That's why the `dependency-security-scanner` subagent exists and why "checklist passed" is the beginning of an audit, not the end.
