# Next.js — Security Delta

**Read first:** `principles/security.md`, then `frameworks/react/security.md` (client-side sinks apply unchanged). This doc: what the server side of Next adds. **Applies to:** Next.js 15–16, App Router. **Date:** 2026-07-06.

## 1. Server Actions are public endpoints — the #1 audit finding

Every exported `'use server'` function is callable by anyone who can send a POST with the right action ID — not just from the form you rendered. Consequences:

- **Authorize inside every action.** Not in the page that renders the form (pages are reachability, not authorization), not in middleware (see §3). First line: session check; second: ownership-scoped data access (`WHERE id = ? AND org_id = ?` — principles doc §broken access control).
- **Validate every argument with Zod.** Action args arrive as attacker-controlled serialized data; `formData` doubly so. Type annotations are not validation.
- **Don't take authorization-relevant values as arguments.** `updateUser(userId, data)` where the client supplies `userId` is an IDOR generator — derive the subject from the session.
- Audit: `grep -rn "'use server'"` and read every exported function against the three rules above. Unused-but-exported actions are still live endpoints — delete dead ones.

## 2. The server/client data boundary leaks by convenience

- **Passing whole DB objects to client components** serializes every field into the RSC payload — `passwordHash`, `stripeCustomerId`, internal flags, all view-source-visible. Fix: select/DTO at the boundary (`select: { id, name, avatarUrl }`), and enforce with **taint APIs**: `experimental_taintObjectReference(user)` after fetch makes accidental pass-to-client a build-time error. Adopt tainting for your top 3 sensitive models; it converts a silent leak class into a loud one.
- **Secrets:** only `NEXT_PUBLIC_` vars reach the client bundle — but a *server* secret interpolated into JSX or passed as a prop crosses anyway. The prefix protects the env mechanism, not your prop-passing.
- `server-only` package import in modules that must never be bundled client-side (db clients, secret-consuming SDKs) — a one-line import that turns a catastrophic mistake into a build error.

## 3. Middleware is not an auth layer (CVE-2025-29927)

The 2025 headline Next.js vuln: a crafted `x-middleware-subrequest` header made Next skip middleware entirely — every app whose *only* auth check lived in `middleware.ts` was fully open. Patched, but the architectural lesson is permanent and framework-agnostic: **middleware is a UX/routing convenience layer; authorization lives at the data access** (each action/handler/query re-checks). If your pentest report says "auth enforced in middleware," treat it as a finding, not a feature. Defense in depth: keep the middleware redirect *and* the per-handler checks.

## 4. Route handlers, SSRF, and the image proxy

- Route handlers (`app/api/*`) get the full principles-doc treatment: schema validation, authz per handler, rate limiting on auth/expensive routes.
- `next/image` remote patterns: `remotePatterns` with wildcard hosts (`hostname: '**'`) turns the image optimizer into an open proxy/SSRF primitive (fetches arbitrary URLs server-side) plus a resource-exhaustion vector. Allowlist exact hosts.
- Any "fetch this URL" feature (link unfurls, webhook testers, OG-image fetchers) → full SSRF checklist in `principles/security.md` (metadata IPs, redirect re-validation).

## 5. Headers, CSP, and the checklist deltas

- Set security headers in `next.config.js` `headers()` (or middleware for nonce-based CSP — per-request nonces require dynamic rendering; budget for that or scope nonce-CSP to the routes that need it).
- Server Action CSRF: same-origin enforced by Next (Origin checks) — but this protects the action *transport*, not your route handlers; cookie-authenticated route handlers need their own origin/SameSite posture (principles doc §CSRF).
- Bootstrap/serialization XSS (`react/security.md` §JSON) is handled by the framework's RSC serializer — the hole reopens the moment someone hand-writes `<script dangerouslySetInnerHTML>` for analytics bootstrapping. Grep for it.
- Cache poisoning: anything keyed off headers you don't validate (`Host`, `x-forwarded-*`) that flows into cached HTML is a poisoning vector — normalize at the edge, and be suspicious of `Vary`-dependent logic.

## Audit quick list (nextjs additions to the security-auditor skill)

```
grep -rn "'use server'" app/ src/            # every export: session? zod? ownership scope?
grep -rn "server-only" package.json           # present and used in db/secret modules?
grep -rn "remotePatterns" next.config.*       # wildcard hosts?
grep -rn "NEXT_PUBLIC_" .env* src/            # nothing secret behind the public prefix
grep -rnE "cookies\(\)|headers\(\)" middleware.ts  # is middleware the ONLY auth? → finding
```
