# Authorization — IDOR/BOLA, Privilege Escalation, and the Deny-by-Default Architecture

**Date:** 2026-07-06 · **Tier:** core (full depth) · **Standards:** OWASP Top 10 2021 A01 (Broken Access Control — the #1 category by incidence); OWASP API Top 10 2023 API1 (BOLA), API3 (BOPLA), API5 (BFLA); CWE-639, CWE-862, CWE-863, CWE-269 · **Standalone:** yes · **Executable review procedure:** [../../skills/authz-review/SKILL.md](../../skills/authz-review/SKILL.md) · **Related:** [../authentication-and-sessions/](../authentication-and-sessions/README.md) (who ≠ may), [../api-security/](../api-security/README.md) (property-level variant)

Broken access control is OWASP's #1 for a structural reason: **frameworks give you authentication for free and authorization not at all.** Login middleware ships in every stack; "may user U perform verb V on object O" is your domain logic, invisible to scanners (a 200 for the wrong user looks identical to a 200 for the right one), absent from framework defaults, and re-implemented per-endpoint by whoever was in a hurry that sprint. This is why IDOR is simultaneously the most boring and most damaging vulnerability in practice.

## 1. The model: three questions, every request

Every authorization decision decomposes to:

1. **Object-level** — may U act on *this specific* O? (BOLA/IDOR when missing)
2. **Function-level** — may U invoke this verb/endpoint at all? (BFLA when missing — admin routes, internal APIs)
3. **Property-level** — may U read/write *these fields* of O? (BOPLA/mass assignment when missing — covered in depth in [../api-security/](../api-security/README.md) §2)

An endpoint is correctly authorized when all three have answers *enforced at the resource access*, not inferred from "the UI doesn't show that button." Requests don't come from your UI; they come from the network.

## 2. IDOR / BOLA (CWE-639)

**Failure mode.** Handler fetches by identifier without binding the query to the caller's permission scope: `GET /invoices/9142` returns invoice 9142 for any authenticated user, because `Invoice.find(params.id)` has no idea whose invoice it is. Variants that pass casual review: the *write-side* IDOR (`PUT /invoices/9142` — read-side gets checked, write-side forgotten); the *second route* to the same object (the export endpoint, the search index, the PDF renderer, the GraphQL node resolver — each fetches the object through a different code path, and only one has the check); *indirect references* (attachment IDs, notification IDs) that dereference to a parent object nobody re-checks; and UUIDs treated as authorization ("unguessable" — until they leak via referers, logs, screenshots, or the *list* endpoint that returns them; an identifier is a name, never a permission).

**Impact chains.** IDORs triage as "medium" alone and become catastrophic in chains — the canonical war story ([../../principles/security-mindset.md](../../principles/security-mindset.md) §3): profile-metadata IDOR + informative reset flow + no rate limit = arbitrary account takeover. Any IDOR touching identity-adjacent data (emails, phone, recovery info) is a chain link to ATO; rate the chain.

**Detection.**
- *Code review pattern:* every fetch-by-id in a handler; ask "where between the route and the row does the caller's identity constrain this lookup?" Acceptable answers: tenant/owner scoping *in the query* (`.where(owner: current_user)`), a policy check on the loaded object before use, or a route mounted under an already-scoped parent. Unacceptable: "IDs are UUIDs," "the frontend only shows your own," or silence. The [authz-review skill](../../skills/authz-review/SKILL.md) mechanizes this as the *scoped-fetch* rule.
- *Testing:* two-account testing — create user A's object, request it as user B, assert 404. This is cheap, deterministic, and the single highest-value security test type per line of code. DAST tools mostly cannot do this (they don't know your object model), which is why IDOR survives scanning regimes.
- *Runtime:* access-log analytics for one principal touching many distinct object IDs on one endpoint, and for sequential-ID walking. This is both your detection and your incident-scoping tool ([../../principles/incident-response.md](../../principles/incident-response.md) §4).

**Fix.** Prefer scoping over checking: `current_tenant.invoices.find(id)` cannot return a foreign row, whereas load-then-check (`load; assert policy; use`) leaves a window for the *forgotten assert* on the next endpoint. Where load-then-check is the codebase idiom, centralize it (policy objects — Pundit/CanCan/Casbin/OPA-style) so it's one grep to audit. Return **404, not 403**, for foreign objects — 403 confirms existence and feeds enumeration.

**Prevention.**
- **Two-account tests as a CI suite:** every resource type gets the foreign-object 404 test at creation time; the suite is the durable control. Make the test scaffold so cheap (fixture with users A/B pre-built) that writing the test is easier than skipping it.
- **Repository-layer default scoping:** unscoped fetch methods (`findUnscoped`) exist but are named loudly, and a lint rule requires a justification comment at each call site — same auditable-exception pattern as ORM raw SQL ([../injection/](../injection/README.md) §1).
- Review checklist line: "every ID this diff accepts is either scope-fetched or policy-checked, on read AND write AND every alternate route to the same object."

## 3. Function-level authorization / BFLA (CWE-862)

**Failure mode.** The verb itself is unprotected: admin endpoints "protected" by not being linked in the UI; internal/debug routes (`/internal/requeue`, `/actuator/*`, GraphQL mutations left in the schema) reachable by any authenticated — or any *unauthenticated* — caller; HTTP-method gaps (GET checked, DELETE forgotten on the same path); API versions diverging (`/v2/users/:id/role` checks admin, `/v1` still deployed, doesn't).

**Detection.** Route-inventory diff: enumerate every route the framework actually serves (`rails routes`, router dumps, OpenAPI spec — the *served* one, not the documented one) and annotate each with its authZ requirement; anything annotated "none" that isn't a public health/login endpoint is a finding. Automatable and worth automating — see prevention. For GraphQL: the schema *is* the route inventory; walk every query/mutation/subscription.

**Fix.** Deny-by-default routing: authZ middleware that rejects any route without an explicit policy declaration — routes *cannot ship* unprotected because unprotected routes don't route ([../../principles/security-mindset.md](../../principles/security-mindset.md) §5, secure-by-default). Retrofit order: inventory → classify (public/authenticated/role-gated) → flip middleware to deny-unclassified.

**Prevention.** CI gate comparing served routes against the policy manifest — new route without a policy entry fails the build; kill-switch discipline for debug/internal routes: compiled out of production builds, not "hidden"; version-sunset policy so `/v1` doesn't outlive its authZ assumptions.

## 4. Privilege escalation (CWE-269)

**Failure mode — vertical:** a lower-privilege actor gains higher-privilege capability. Concrete recurring shapes: role stored in a client-writable place (JWT claim the server doesn't re-verify against the DB, hidden form field, `role` in a mass-assignable body — the BOPLA overlap); role checked at *login* and cached in the session, so demotion/firing doesn't take effect until logout (revocation gap — pair with [../authentication-and-sessions/](../authentication-and-sessions/README.md) §4); invitation/signup flows where the *inviter* controls the granted role; admin capabilities reachable through a non-admin composite endpoint (the report generator that runs with system privileges and accepts arbitrary query parameters).

**Failure mode — horizontal:** peer-to-peer access — which is IDOR (§2) viewed from the role lens; listed here because reviews that look only for "user→admin" miss "user→other-user," the more common and equally reportable case.

**Detection.** Trace every write path to role/permission/group fields: who can reach each, and is the *assigner's* privilege checked (may U grant role R? — grant-what-you-hold is the invariant; an org-admin granting global-admin is the classic gap)? Search for permission checks reading from token claims vs. authoritative store, and note the staleness window of each. Two-account testing again, vertical flavor: as a plain user, replay an admin's request captured from your own staging session; assert rejection.

**Fix.** Roles/permissions live in the authoritative store, written only through endpoints that check the assigner's own privilege against what's being assigned; privilege-affecting claims in tokens are acceptable only with short TTLs and a revocation check for sensitive operations ([../oauth-oidc-jwt/](../oauth-oidc-jwt/README.md) §4 owns the token-freshness tradeoff); sensitive state transitions (role change, email change, MFA disable) require recent re-authentication (sudo mode) and generate notification + audit events.

**Prevention.** Audit log on every privilege mutation (who, whom, what, when — the repudiation control from [../../principles/threat-modeling.md](../../principles/threat-modeling.md)'s STRIDE table), with an alert on anomalies (self-grants, out-of-hours grants, grants by service accounts); test suite: role-escalation attempts per §detection as permanent CI members; quarterly access review with actual teeth — dormant admin accounts are attacker inventory.

## 5. Multi-tenancy — the highest-stakes special case

Cross-tenant authorization failure is existential for a B2B product in a way single-user IDOR isn't: one incident is a churn event and a disclosure obligation across every affected customer. Patterns, strongest first: **physical isolation** (DB-per-tenant — expensive, small tenant counts); **row-level security in the database** (Postgres RLS keyed to a session variable — enforcement below the app layer, so an app-layer bug can't cross tenants; costs migration/complexity discipline); **query-scoping discipline** (§2's approach, tenant edition — every table has `tenant_id`, every query goes through a tenant-scoped repository, unscoped access is the loudly-named exception). The failure to design against: *the background path* — cron jobs, exports, search indexers, and analytics pipelines that run without a tenant context and write into tenant-visible places. Every cross-tenant leak I've triaged came through one of those, not through a request handler; handlers get reviewed, batch jobs don't. Give background jobs an explicit tenant parameter and the same scoped-repository rules.

## 6. Review drill (any diff touching data access)

1. New/changed fetch-by-id → scoped or policy-checked? Read *and* write? All routes to the object? (§2)
2. New route/mutation → in the policy manifest? What role? (§3)
3. Anything writing role/permission/group fields → assigner privilege checked; audit event emitted? (§4)
4. Background job touching tenant data → explicit tenant scope? (§5)
5. Foreign-object and role-escalation tests present in the diff? A missing test is a finding, not a nitpick ([../../principles/threat-modeling.md](../../principles/threat-modeling.md) §4: unmitigated-in-costume).
