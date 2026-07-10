---
name: authz-review
description: >-
  Review a diff, PR, or named handler/resolver files for object-level and function-level authorization gaps — IDOR/BOLA, missing route policies, privilege-field writes, batch/GraphQL check bypasses — producing severity-rated findings with the concrete fix in the codebase's own idiom. Use when reviewing any PR that adds or changes routes, handlers, resolvers, or data-access code; when asked to "check this for IDOR/access-control issues"; or as the authZ pass of security-dev/guides/analyze-existing-project.md Phase 3 on a bounded surface. Do NOT use for whole-codebase authZ audits with no named surface (follow the guide's Phase 1 mapping first — this skill needs a bounded input), for authentication problems (login, sessions, token validation — that's the authentication-and-sessions and oauth-oidc-jwt topic docs), or for infrastructure IAM policies (cloud-and-infra topic doc). Defensive review only: report gaps and fixes, never construct exploitation steps.
---

# Authorization Review (IDOR/BOLA/BFLA)

**Date:** 2026-07-06 · **Standards:** OWASP Top 10 2021 A01; OWASP API Top 10 2023 API1/API3/API5; CWE-639/862/863

You are reviewing a bounded set of changes for missing or broken authorization. This file is self-contained — execute it without other docs in context. Background/why lives in `security-dev/topics/authorization/README.md`.

Core distinction driving every check: **authentication answers "who is this"; authorization answers "may they do THIS to THIS object."** A logged-in check is never an ownership check. Scanners cannot detect these gaps (a 200 for the wrong user looks like a 200 for the right user) — that's why this review exists.

## Procedure

1. **Scope:** obtain the diff or named files. In-scope: routes, handlers, resolvers, repositories/data access, policy/middleware config, background jobs touching per-user/per-tenant data. If handed >~30 files with no focus, stop and ask for the surface (or route the caller to the analyze-existing-project guide).
2. **Enumerate the access points** in scope: every (route|mutation|resolver|job) × (object type it touches). For GraphQL, the schema is the route list — include nested field resolvers and `node`/relay-style lookups, not just top-level queries.
3. **Run the four checks below against each access point.** Judge changed code primarily, but flag pre-existing gaps the change extends (a new route reusing an unscoped repository method inherits its hole).
4. **For each finding produce:** severity · `file:line` · the gap in one sentence (actor–verb–object: "any authenticated user can PATCH any tenant's invoice") · evidence (the fetch/write with no scope) · the fix in this codebase's own idiom (find how the *correctly-scoped* code elsewhere in the repo does it and mirror that; if no correct example exists, say so — that's a structural finding) · the missing test.
5. **Verdict:** BLOCK (any Critical) / FIX-BEFORE-MERGE (High) / ADVISE (Medium/Low only). List UNKNOWNs explicitly ("could not locate where policy X is enforced — gap or invisible middleware; verify") rather than guessing either way.

## Check 1 — Object-level: the scoped-fetch rule [Critical when missed on user/tenant data]

For every fetch-or-mutate-by-identifier, exactly one of these must hold, **on the read path AND the write path AND every alternate route to the same object** (export, search, batch, PDF, GraphQL node — the second route is where this fails):

- **Scoped query** (preferred): the caller's identity constrains the lookup itself — `current_tenant.invoices.find(id)`, `WHERE owner_id = :current_user` in the query, route mounted under an already-scoped parent.
- **Load-then-policy-check**: object loaded, then an explicit policy/ability check on *that object instance* before any use — and the check appears on every sibling endpoint, not just the one that got reviewed last time.

**Not acceptable as authorization (each is a named anti-pattern — flag on sight):**
- "IDs are UUIDs/unguessable" — identifiers are names, not permissions; they leak via lists, logs, referers.
- "The frontend only shows your own" — requests come from the network, not your UI.
- "The query joins through user data implicitly" — verify the join actually constrains; `LEFT JOIN` + missing `WHERE` doesn't.
- Ownership checked on the parent but children fetched by raw child-ID (attachment/comment/line-item IDs dereferencing across parents).

Also check: **batch endpoints** — per-item checks inside the loop, not one check before it; **foreign-object response** — must be 404 (indistinguishable from nonexistent), not 403 (existence oracle feeding enumeration).

## Check 2 — Function-level: the route-policy rule [Critical for privileged verbs, High otherwise]

- Every new/changed route, mutation, or RPC method has an explicit authZ declaration (middleware policy, decorator, guard). "No declaration" is a finding even if the handler looks harmless — in deny-by-default codebases it won't route; in allow-by-default codebases it's live and open.
- HTTP-method completeness: the check on GET exists on PUT/PATCH/DELETE of the same path.
- Admin/internal/debug routes: gated by role checks *server-side*, not by absence from the UI or "internal" URL prefixes. Flag any `/internal`, `/admin`, `/debug`, actuator-style route relying on obscurity.
- Version skew: if the diff fixes authZ on `/v2/...`, ask whether `/v1` equivalent still serves without the fix.

## Check 3 — Privilege writes: the assigner rule [Critical]

Any write path touching `role`, `permissions`, `is_admin`, `verified`, `tenant_id`, `owner`, plan/entitlement fields, or group membership:

- The **assigner's** privilege is checked against **what's being assigned** (grant-what-you-hold; org-admin must not mint global-admin).
- The field is not reachable via generic update endpoints (mass assignment: body bound wholesale to the model — grep the handler for spread/`update(params)`/`Object.assign(model, body)` shapes). Privileged fields change only through dedicated, role-gated endpoints.
- The mutation emits an audit event (who, whom, what, when). Missing audit = Medium finding on its own.
- Role/permission read for the *decision* comes from the authoritative store or a short-TTL token — flag privilege checks against long-lived cached claims for destructive operations.

## Check 4 — Background and non-HTTP paths [High]

Queue consumers, cron jobs, exporters, indexers, report generators in the diff: do they carry an explicit tenant/user scope parameter and use the same scoped repositories as handlers? Jobs running "as the system" that write into tenant-visible places are the classic cross-tenant leak path — handlers get reviewed, jobs don't.

## Required tests (name the missing ones as findings)

- Two-account test per object type: create as A, fetch/mutate/export as B → 404. The cheapest, highest-value security test that exists; its absence on a new resource is a High finding.
- Role-escalation test per privilege write: lower-role actor replays a higher-role request → rejected + no state change.
- Policy-manifest test where the codebase has deny-by-default middleware: new route present in the manifest.

## Severity calibration

Critical: cross-tenant/cross-user read or write of sensitive data (financial, PII, credentials, identity-adjacent fields — anything feeding account takeover chains), or privilege escalation. High: cross-user access to low-sensitivity data; missing function-level check on non-privileged mutation; unscoped background job. Medium: 403-instead-of-404 oracles; missing audit events; stale-claim privilege checks. Low: hardening (sequential IDs without a current gap, etc.). When rating, ask the chain question: what does this combine with? An IDOR on "just metadata" that includes recovery email rates as the ATO chain it enables, not as metadata.
