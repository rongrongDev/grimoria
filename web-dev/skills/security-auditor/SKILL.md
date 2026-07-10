---
name: security-auditor
description: >
  Run a structured OWASP-mapped security audit of a web codebase or a specific
  surface (auth flow, API routes, a new feature), producing severity-rated
  findings with evidence and fixes. Use when the user asks to "audit security",
  "check for vulnerabilities/XSS/injection", "security-review this feature/PR",
  or before exposing a surface publicly. Defensive review only. Do NOT use for:
  dependency/supply-chain deep scans (dispatch the dependency-security-scanner
  subagent — noisy, context-heavy), penetration testing against live systems,
  full unfamiliar-repo onboarding (legacy-project-onboarder first, then this
  on flagged areas), or non-web codebases.
---

# Security Auditor

You are applying `web-dev/principles/security.md` (the catalog and mental model) plus the framework-specific `web-dev/frameworks/<x>/security.md` for whatever stack this is. Read the principles doc's framing first: every finding is "untrusted data crossed a boundary and gained trust" — locate the boundaries, then the sinks.

## Scope first (5 minutes, always)

1. Identify stack + versions from package.json → select the framework security delta doc(s).
2. Identify the trust boundaries: request inputs, cookies/session, file uploads, webhooks, third-party responses, DB content authored by other users.
3. Agree scope with the user if ambiguous: whole codebase vs a surface. Whole-codebase on a large repo → recommend fan-out per `web-dev/orchestration/README.md`, or the onboarder subagent for a first pass.

## Procedure

**Phase 1 — mechanical sink sweep.** Run the grep batteries from the applicable framework docs (`react/security.md`, `nextjs/security.md`, `vue-nuxt/security.md`, `svelte-sveltekit/security.md`, `node/security.md` each end with one). Every hit gets traced: where does the value originate? Untrusted-reachable = finding; provably static = note and move on. Don't report raw grep hits as findings — trace or mark "needs trace."

**Phase 2 — the access-control review (the highest-severity-density phase).** Per principles/security.md §broken access control: enumerate mutation endpoints/actions/handlers; for each, answer *"who may call this, and where in THIS call path is that enforced?"* Check ownership scoping at the query. Flag: authz in middleware only (the CVE-2025-29927 lesson — nextjs/security.md §3), authz in UI only, `findById` without tenant scope (node/security.md §multi-tenancy). Sample honestly: if you check 10 of 40 endpoints, say so and report the ratio.

**Phase 3 — the systemic checks:**
- Session/cookie posture, token storage, JWT config (principles §secrets/auth).
- Headers/CSP presence and whether CSP is enforced or decorative.
- Secrets: public-prefix env vars, bundle grep, logger redaction (per framework doc).
- SSRF surface: server-side fetches of user-influenced URLs (principles §SSRF checklist).
- Prototype pollution: deep merges over request data (principles §prototype pollution).
- Supply-chain *headline* only (lockfile, `npm ci`, scoped registry) — recommend the subagent for depth.

**Phase 4 — verify claims.** For 2–3 top findings, demonstrate reachability (construct the request/payload path in prose or a test — do not exploit live systems). A finding you can't articulate an attack path for gets downgraded to "hardening."

## Output format

```
## Security Audit: <scope> — <date>
Stack: <frameworks+versions> | Coverage: <what was and was NOT examined>
### Findings
| # | Severity (crit/high/med/low) | Certainty (certain/suspected) | Finding | Evidence (file:line) | Fix | Doc |
### Attack-path notes (top findings)
### Hardening recommendations (not vulnerabilities)
### Prevention (lint rules / CI gates that stop recurrence — from the framework docs)
```

Severity honesty is the skill's reputation: reachable-unauthenticated data access is critical; a missing header on an internal tool is low. Coverage honesty likewise — an audit that doesn't state what it skipped is worse than no audit (see the war story in principles/security.md: the checklist that missed the pipeline).
