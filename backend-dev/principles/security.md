# Backend Security — The Attacks That Actually Happen

**Last reviewed:** 2026-07-06. Maps to OWASP API Security Top 10 (2023 edition); OAuth 2.0/2.1 + OIDC current practice as of mid-2026.
**Related:** [api-design.md](api-design.md) (error contracts, rate limits as API surface), stack docs for framework-specific mitigations.

Twenty years of incident reviews taught me this: **you will not be breached by a cryptographic breakthrough. You will be breached by an endpoint that forgot to check `resource.owner_id == current_user.id`.** Security work is mostly the unglamorous, systematic closing of ordinary doors. This doc is ordered by real-world frequency, not theoretical severity.

---

## 1. Broken object-level authorization (BOLA) — the #1 API vulnerability, by a mile

The bug: `GET /orders/12345` checks that you're logged in, but not that order 12345 is *yours*. Attacker iterates ids. This is OWASP API #1 because it's created one endpoint at a time, forever, by developers who each assumed someone else's layer checked.

- **Fix pattern:** authorization is **ownership/tenancy scoping in the data access itself**, not a check bolted before it: `SELECT ... WHERE id = $1 AND tenant_id = $2` — the tenant predicate comes from the *session*, never from the request. Make the scoped query the only convenient path: a repository layer whose methods all require the tenant/actor, so the insecure query is the one that's hard to write. In Postgres, row-level security (RLS) keyed on a session variable is the strongest backstop for multi-tenant systems.
- **Detection:** automated IDOR probing in CI (call every id-bearing endpoint as user B with user A's resource ids and assert 404); access logs showing sequential-id walks.
- **Prevention:** unguessable public ids (prefixed random ids, [api-design.md](api-design.md) §7) raise the bar but are *not* authorization; the check is still mandatory. Review rule: any handler receiving a resource id must show where the ownership predicate lives.
- **Function-level cousin (BFLA):** admin endpoints protected by "the UI doesn't show the button." Every route declares its required permission **in code, at the route definition**, with deny-by-default middleware — a route with no permission annotation fails closed and fails CI.

## 2. Injection — solved in theory, shipped in practice

- **SQL injection** survives wherever queries are assembled by string concatenation — today that's mostly: dynamic ORDER BY/column names ("sort by any field the client names"), `LIKE` patterns, raw-SQL escape hatches in ORMs, and log-search/reporting endpoints. Parameterized queries always; for identifiers (which can't be parameters), **allowlist** against a literal set — never quote-escape.
- **Command injection:** any `exec`/`system` call with request-derived data. Use arg-array exec forms (no shell), allowlist inputs; better, don't shell out — the image-resize-via-ImageMagick-CLI endpoint is a recurring breach vector.
- **NoSQL/query-object injection:** `db.users.find({user: req.body.user})` where body is `{"user": {"$ne": null}}`. Validate types at the boundary — a field expected to be a string must be *rejected* if it's an object. This is one instance of the general rule: **parse, don't validate** — convert untrusted input into typed values at the edge (schema validation: zod/Pydantic/bean validation), and let nothing downstream touch raw request data.

## 3. SSRF — the cloud-era privilege escalation

Server-Side Request Forgery: any feature where the server fetches a user-supplied URL — webhooks, URL previews, importers, PDF renderers. The attacker's target is your *internal* network, and above all the **cloud metadata endpoint** (`169.254.169.254`), which turns "your server fetched my URL" into "I have your IAM credentials." This is how Capital One happened; it is not exotic.

Defenses, layered because each alone has bypasses:
1. Allowlist schemes (`https` only) and, where possible, destination domains.
2. Resolve DNS, then verify the **resolved IP** is not private/link-local/loopback — and pin that IP for the actual connection (checking then re-resolving = TOCTOU bypass). Handle redirects by re-validating every hop, or refuse redirects.
3. Egress-isolate the fetcher: run URL-fetching in a network segment with no route to internal services, with IMDSv2 enforced (hop limit 1) on the cloud side.
4. Never return raw fetch errors/bodies to the caller (internal-network mapping oracle).

## 4. AuthN — OAuth2/OIDC and JWT pitfalls

Rules first: **never build your own password protocol; use OIDC against a provider (or a mature library) and spend your innovation budget elsewhere.** Specifics that still go wrong when you do use the standard stack:

- **Authorization Code + PKCE** is the grant for everything user-facing (SPA, mobile, server-web). Implicit grant is dead; ROPC (password grant) is dead. `client_credentials` for machine-to-machine.
- **JWT pitfalls, each of which I've seen exploited or nearly so:**
  - `alg` confusion: accept only the algorithm you issued (`RS256`/`EdDSA`); explicitly reject `none` and never let the token choose its own verification algorithm (HS256-with-public-key-as-secret attack).
  - **Validate `aud` and `iss`.** A token minted for service A being accepted by service B (because both trust the same issuer and B skipped `aud`) is a cross-service impersonation hole that auditors find in most microservice fleets.
  - **JWTs are not sessions.** They're unrevocable until expiry. Access token TTL ≤ 15 min, rotating refresh tokens (with reuse detection — a replayed old refresh token means theft: kill the whole family), and a denylist path for emergency revocation. If you find yourself building per-request DB lookups to check JWT validity, notice you've rebuilt sessions with extra steps — plain server-side sessions are the *right* default for a single web app.
  - Don't put PII or authorization data that changes (roles!) in long-lived tokens — role changes must not wait for token expiry to take effect on sensitive operations; re-check authoritative state server-side for those.
- **Session security (cookie-based):** `HttpOnly; Secure; SameSite=Lax` minimum; **regenerate the session id on login** (session fixation — attacker sets a known session id pre-auth, victim logs in, attacker rides the now-authenticated id); absolute + idle timeouts; server-side revocation on logout/password change.

## 5. Secrets management

- Secrets never in: source control (one leaked `.env` in git history is forever — assume compromised and rotate, don't just delete the file), build artifacts/images (`docker history` reveals build args), client-side code, or logs.
- Runtime delivery: a secrets manager (Vault/AWS SM/GCP SM) with per-service identity (IAM role / workload identity), not a shared `.env` handed around Slack. Prefer **short-lived, auto-issued credentials** (IAM roles, Vault dynamic DB creds) over long-lived static ones — the best secret is one that expires before it leaks.
- **Rotation must be a routine, tested, zero-downtime operation** — dual-secret acceptance windows (accept N and N-1 during rotation). The org that can't rotate without an incident *won't* rotate during an incident, which is exactly when it matters. Rotate on every offboarding of anyone who had prod access.
- *Detection:* secret scanning (gitleaks/trufflehog) in CI *and* retroactively over history; canary tokens; alerts on secrets-manager access anomalies.

## 6. Mass assignment & data exposure

- **Mass assignment:** `User.update(req.body)` and the attacker adds `"role": "admin"` to the JSON. Every framework has the footgun (Rails strong params exist *because* of the GitHub 2012 incident). Rule: request bodies bind to **explicit input DTOs/schemas** (allowlist), never directly to persistence models.
- **Excessive data exposure:** serializing the ORM entity returns `password_hash`, internal flags, other users' emails. Rule: explicit **response DTOs** too. Serialization by allowlist in both directions is one of the highest-leverage conventions a codebase can adopt — make it the paved road in the service template.

## 7. Rate limiting & abuse prevention

Rate limiting is three different problems; teams that build one knob get burned by the other two:

1. **Brute-force protection** (login, OTP, password reset): strict per-account *and* per-IP limits with lockout/backoff and CAPTCHA escalation. Alert on distributed credential-stuffing patterns (many accounts × few attempts each — per-account limits alone are blind to it).
2. **Fairness/quota** (API tiers): token bucket per API key — allows bursts, enforces sustained rate; return `429` + `Retry-After` + `RateLimit-*` headers ([api-design.md](api-design.md) §7).
3. **Load shedding** (protecting yourself): global concurrency/queue-depth caps that reject early when the system is at capacity ([observability.md](observability.md) on graceful degradation).

Implementation: token bucket in Redis (atomic Lua per check, one round trip — see [stacks/redis.md](../stacks/redis.md)); fail-open on limiter outage for revenue paths, fail-closed for auth endpoints — decide *per route class*, in advance, not during the Redis outage. Also cap request body sizes, JSON depth, and array lengths at the edge; "a 500MB JSON body" and "an array of 10M items" are both denial-of-service vectors your validator happily chews on.

## 8. The boring, load-bearing rest

- **Unrestricted resource consumption is OWASP API #4** — timeouts on *every* outbound call, LIMIT on every list query, pagination caps ([api-design.md](api-design.md) §5).
- **TLS everywhere internal too** (mTLS or mesh) — "internal network = trusted" dies the day one pod is compromised.
- **Dependency/supply chain:** lockfiles, automated vulnerability scanning with an SLA on criticals, and no `latest` tags in production images.
- **Audit logging** for authz-sensitive events (login, permission change, data export, admin actions): who, what, when, from where — append-only, retained per compliance. When (not if) you investigate an incident, this log is the difference between an answer and a shrug.
- **404 vs 403 discipline:** return 404 for resources the caller cannot know exist ([api-design.md](api-design.md) §6), consistently — a 403 on `/users/123/orders` confirms user 123 exists.

## Failure-mode index

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| BOLA/IDOR | CI cross-tenant probes; sequential-id access patterns in logs | Ownership predicate in the query | Tenant-scoped repository layer; RLS backstop; review rule on id-bearing handlers |
| SQLi via dynamic identifiers | SAST; grep raw-SQL escape hatches; WAF hits | Parameterize; allowlist identifiers | ORM lint bans string-built SQL; code-scanning gate |
| SSRF to metadata endpoint | Egress logs to 169.254.169.254 / private ranges | Layered validation + egress isolation | IMDSv2 hop-limit 1; fetcher runs in egress-restricted segment |
| JWT `aud`/`alg` laxity | AuthZ audit; cross-service token replay test | Strict verification config | Shared verified-JWT middleware — no per-service hand-rolls |
| Session fixation | Pen test; session id unchanged across login in logs | Regenerate on login | Framework default verified in the service template |
| Secret in git | gitleaks in CI + history scan | Rotate immediately (deletion ≠ remediation) | Pre-commit hooks; short-lived creds so leaks age out |
| Mass assignment | Fuzz unexpected fields in CI; diff persisted vs allowed fields | Input DTO allowlist | Ban model-binding from raw request bodies, lint-enforced |
| Credential stuffing | Many-accounts × few-attempts alert | Per-account+per-IP limits, CAPTCHA escalation | Login limiter is part of the auth module, not an afterthought |
