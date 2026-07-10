# Node.js — Security Delta

**Read first:** `principles/security.md` — injection, SSRF, prototype pollution, access control, and supply chain are all *primarily* server-side; this doc adds the Node-specific mechanics. **Applies to:** Node 22/24; Express 5, Fastify 5, Hono 4. **Date:** 2026-07-06.
**Operationalized by:** `security-auditor` skill; supply chain by the `dependency-security-scanner` subagent.

## The Node-specific sink map

| Untrusted data reaching… | Becomes | Grep / fix |
|---|---|---|
| `exec`/`execSync`/shell strings | Command injection | `execFile` with args array; no shell string interpolation, ever |
| `fs` paths (`readFile(base + userPath)`) | Path traversal (`../../etc/passwd`, and URL-encoded variants) | Resolve then verify prefix: `const p = path.resolve(base, userPath); if (!p.startsWith(base + path.sep)) throw` |
| `require`/`import()` specifiers | Arbitrary code load | Never dynamic-import user input; allowlist map |
| `new Function` / `eval` / `vm` without isolation | RCE | `vm` is **not** a security sandbox (its own docs say so); use isolated-vm or a separate process/container for untrusted code |
| Deep merge / `Object.assign` chains on `req.body` | Prototype pollution → often RCE via template engines/child_process env | principles doc §prototype pollution; `--disable-proto=delete`; Zod-strip unknown keys |
| Outbound `fetch`/`http.request` URLs | SSRF (metadata endpoints) | principles doc §SSRF: resolved-IP validation, redirect re-checks, egress policy |
| `res.redirect(req.query.next)` | Open redirect (phishing hop) | Relative-path allowlist; never absolute URLs from input |
| Regex built from or run on user input | ReDoS = event-loop DoS (`node/concurrency.md` §3) | RE2/linear-time engine, input length caps, `recheck` in CI |
| Headers you trust (`Host`, `X-Forwarded-For`) | Cache poisoning, IP-spoofed rate-limit bypass, password-reset-link poisoning | Canonical host from config, `trust proxy` configured to your actual proxy depth only |

## Auth & session mechanics

- Sessions: `HttpOnly; Secure; SameSite=Lax` cookies backed by a server store (Redis) — the principles-doc default. If JWTs: `jose`, explicit `algorithms`, `aud`/`iss` verification, short expiry + rotation; the `alg:none` and unverified-audience classes still appear in every third audit I've done.
- Password hashing: **argon2id** (or bcrypt with adequate cost) — *async* variants only (sync hashing on the request path is a self-DoS, `node/concurrency.md` §3). Rate-limit + constant-time compare on verification endpoints.
- CSRF for cookie-authed APIs: origin checks + SameSite per principles doc — Node frameworks don't do this for you (unlike the meta-frameworks); `csrf-csrf` or hand-rolled origin verification middleware, registered *before* routes (ordering is the API — `node/from-scratch.md` §3).

## Platform hardening

- **Headers:** helmet (Express/Fastify variants) — CSP, HSTS, nosniff et al. per the principles checklist.
- **Body/query limits:** JSON body caps (you built why — `from-scratch.md` §4), `parameterLimit`, and qs-parser depth limits (deep-nested query bombs are a cheap CPU DoS on Express's extended parser).
- **Node permission model** (`--permission --allow-fs-read=…`, stable in 22+): real defense-in-depth for services that shouldn't touch the fs/network broadly — adopt for anything processing untrusted files.
- **Env & secrets:** boot-time Zod validation (`node/production-patterns.md`); secret manager over env files in production; logger redaction lists (pino `redact`) for `authorization`, `cookie`, `password` — check what your logs actually contain, that's where secrets leak in practice (principles doc §secrets).
- **Supply chain:** the full principles-doc regimen (lockfile + `npm ci`, scoped registry, `ignore-scripts` in CI, cooldown on updates, `npm audit signatures`) — Node services are the highest-value target for the dependency-confusion war story in that doc. Dispatch the `dependency-security-scanner` subagent for the periodic deep audit.

## Multi-tenancy — where Node apps actually get owned

Restating the principles doc's #1 with the Node idiom because it is *that* common: every repository method takes the tenant/org id **from the session context** (`AsyncLocalStorage` — `node/concurrency.md` §1) and scopes the query. Handlers must be unable to express "fetch by id without tenant." If your data layer exposes `findById(id)`, the IDOR already exists; the audit just hasn't happened yet. The wrong-user integration test per endpoint (`principles/testing.md`) is the regression harness for this.

## Audit quick list (node additions for the security-auditor skill)

```
grep -rnE "exec(Sync)?\(|spawn\(.*shell" src/         # command injection
grep -rnE "readFile|createReadStream|sendFile" src/ | grep -iE "req\.|params|query|body"
grep -rnE "\.(merge|defaultsDeep|set)\(" src/ | grep -iE "req\.|body"   # proto pollution
grep -rnE "redirect\(.*(req|query|body)" src/
grep -rn "trust proxy" src/                            # true (blanket) is a finding
grep -rnE "jwt|jsonwebtoken|jose" src/ -l              # verify: algorithms? aud/iss? expiry?
grep -rn "findById\|findOne({ *id" src/data/           # tenant-scoping bypass surface
```
