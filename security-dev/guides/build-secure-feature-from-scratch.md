# Guide: Build a Secure Feature From Scratch

**Date:** 2026-07-06 · **Capability:** design and implement a minimal but properly secured feature from zero — threat model, implementation, secret handling, and test checklist included · **Standalone:** yes (links are enrichment) · **Audience:** any engineer or AI agent; no prior security specialization assumed

This guide walks one concrete feature end-to-end: **an authenticated API endpoint set for "invoices" in a multi-user SaaS** — create, fetch, list, and a PDF-export that calls a third-party renderer. It's chosen because it forces every core decision: authN, object-level authZ, input validation, secret handling, an outbound call (SSRF surface), and the test suite that keeps all of it true. Follow the *sequence* for any feature; substitute your nouns.

The sequence matters more than any step: **threat model → controls chosen → paved-road implementation → negative tests → gates.** Teams that invert it (build, then "add security") pay the [10×–100× retrofit multiple](../principles/secure-sdlc.md) and usually skip the tests that make controls durable.

---

## Phase 0 — Establish the paved road (once per codebase, not per feature)

Before feature one, verify the codebase defaults ([mindset §5](../principles/security-mindset.md): secure-by-default beats vigilance). If these exist, every later phase gets cheaper; if not, building them *is* the first feature:

- [ ] ORM/query builder is the only DB path; raw-SQL escape hatches lint-flagged ([injection §1](../topics/injection/README.md))
- [ ] Request-validation middleware every route must pass (schema, types, `additionalProperties: false`) ([injection §2](../topics/injection/README.md), [api-security §2](../topics/api-security/README.md))
- [ ] Deny-by-default authZ middleware: a route without a declared policy does not serve ([authorization §3](../topics/authorization/README.md))
- [ ] Session/auth machinery from the framework or IdP — not hand-built ([authentication §0](../topics/authentication-and-sessions/README.md))
- [ ] Secret manager wired; pre-commit + CI secret scanning on ([secrets-and-keys §1](../topics/secrets-and-keys/README.md))
- [ ] Rate limiting, size caps, and pagination caps default-on at the gateway/middleware ([api-security §3](../topics/api-security/README.md))
- [ ] CI: SAST (curated rules), dependency scan + lockfile enforcement, security-test suite as a required check ([secure-sdlc §3](../principles/secure-sdlc.md))

## Phase 1 — Threat model the feature (30–60 minutes, Level 1 per [threat-modeling §5](../principles/threat-modeling.md))

**1a. Draw the flow (one page):** browser → API gateway → invoice handlers → DB; export handler → renderer-service (third party, outbound). Mark trust boundaries: internet→gateway, handler→DB, **handler→renderer** (outbound crossing — the one most feature designs forget to mark), and note the stored invoices are later *rendered* (DB→browser is a crossing too; [storage doesn't launder taint](../principles/security-mindset.md)).

**1b. STRIDE pass on the new crossings** — name actor, verb, object ([threat-modeling §3](../principles/threat-modeling.md)). For this feature the honest output is short:

| # | Threat (actor–verb–object) | Class | Disposition |
|---|---|---|---|
| T1 | Logged-in user B fetches/exports user A's invoice by ID | BOLA | Mitigate: tenant-scoped fetch + two-account tests |
| T2 | User sets `tenant_id`/`status`/`total` via create/update body | Mass assignment | Mitigate: input DTO allowlist |
| T3 | Attacker enumerates invoice IDs at API speed | Enumeration/DoS | Mitigate: non-sequential IDs, per-principal rate limit, 404-not-403 |
| T4 | Injection via invoice fields (memo, customer name) into SQL now or PDF/HTML render later | Injection/stored XSS | Mitigate: parameterized ORM; encode-at-render; renderer treats fields as data |
| T5 | Export feature coerced into fetching internal URLs (logo-by-URL, webhook-on-complete) | SSRF | **Eliminate**: no user-supplied URLs in v1 — logo upload only, no completion webhook |
| T6 | Renderer credential leaks or is over-scoped | Secrets | Mitigate: manager-injected, narrow key; egress allowlist to renderer host only |
| T7 | Renderer response trusted blindly (HTML/PDF passthrough to user) | 3rd-party consumption | Mitigate: content-type check, size cap, serve as `attachment` ([api-security §7](../topics/api-security/README.md)) |
| T8 | Unauthenticated access to any invoice route | BFLA/authN | Mitigate: structural — deny-by-default middleware (Phase 0) |

Note T5: the *eliminate* disposition — cutting a requirement — is the highest-leverage security move available at design time and only at design time. Say "no URLs in v1" in the design review, and threat class [SSRF](../topics/ssrf-xxe-deserialization/README.md) exits the feature entirely.

**1c. Convert every *mitigate* row into its proof artifact now** — the test or gate named before code exists ([threat-modeling §4](../principles/threat-modeling.md): a mitigation without its test is an acceptance in costume). That's Phase 4's checklist, pre-written.

## Phase 2 — Design decisions, made explicitly

- **AuthN:** platform session/OIDC from Phase 0. Decide token vs session per [oauth-oidc-jwt §4](../topics/oauth-oidc-jwt/README.md) (first-party web → session; this guide assumes it). No new credential types invented for the feature.
- **AuthZ model:** invoices belong to a tenant; users belong to a tenant; rule = *requesting user's tenant owns the invoice*. Enforce by **scoped fetch** — `current_tenant.invoices.find(id)` — not load-then-check ([authorization §2](../topics/authorization/README.md) explains why scoping wins). Declare route policies for the deny-by-default middleware: all five routes `authenticated + tenant-member`.
- **Identifiers:** random (UUIDv4/ULID), *and* the check exists anyway — unguessable is not authorization ([authorization §2](../topics/authorization/README.md)); randomness just removes the enumeration freeway (T3).
- **Input contract:** creation DTO allowlists exactly: `customer_name`, `line_items[] {description, quantity, unit_price_cents}`, `memo`. Server computes `total`, assigns `tenant_id` from session, sets `status`. Types strict, lengths capped, `quantity/unit_price` bounded positive integers (money as integer cents — float money is its own incident genre), `additionalProperties: false` (T2 dead).
- **Output contract:** response DTO names its fields: id, customer_name, line_items, total_cents, status, created_at. No internal flags, no tenant internals ([api-security §2](../topics/api-security/README.md) read-side).
- **Renderer integration:** credential from the secret manager with owner/rotation metadata ([secrets-and-keys §2](../topics/secrets-and-keys/README.md)); calls through the egress-allowlisted HTTP client, timeout + response-size cap; invoice fields passed as *data parameters* to a fixed template, never concatenated into markup (T4's render half; [injection §4](../topics/injection/README.md) if the renderer is a template engine); response validated content-type `application/pdf`, size-capped, served `Content-Disposition: attachment` (T7).

## Phase 3 — Implementation notes (where the bugs would land)

Pseudocode shape for the load-bearing handler; every line traces to a threat row:

```
GET /invoices/:id
  policy: authenticated + tenant-member          # T8 — declared, or the route doesn't serve
  handler:
    invoice = current_tenant().invoices.find(id) # T1 — scoped fetch; cannot return foreign row
    if not invoice: return 404                   # T3 — same status as never-existed
    return InvoiceDTO(invoice)                   # T2/read — explicit fields only
```

- Create: DTO-validated body only; `tenant_id`/`total`/`status` come from session/server computation — grep your handler for any `req.body` field reaching the model that isn't in the DTO.
- List: scoped query + enforced page cap (Phase 0 default) — the list endpoint is where excessive-exposure and unbounded-response bugs hide.
- Export: the scoped fetch *again* (T1's classic miss is the second route — export/PDF paths skipping the check that the GET has; [authorization §2](../topics/authorization/README.md)); then the Phase 2 renderer rules.
- Failure paths fail closed and uniformly: validation errors → 400 with generic envelope; authZ misses → 404; renderer failure → 502 with no upstream detail ([api-security §5](../topics/api-security/README.md)); *catch blocks reviewed for log-and-continue* ([code-review §2](../principles/secure-code-review.md)).

## Phase 4 — The test checklist (the feature is done when these are green, permanently)

Negative tests are the point; positive-only suites are decoration ([authentication §7](../topics/authentication-and-sessions/README.md)):

- [ ] **T1:** user B (other tenant) GETs A's invoice → 404; same for export; same for list-filter tricks (B's list never contains A's rows)
- [ ] **T2:** create/update with extra fields (`tenant_id`, `total_cents`, `status`, unknown junk) → rejected or ignored, asserted explicitly
- [ ] **T3:** N+1th rapid request → 429; ID in error responses identical for "foreign" and "nonexistent"
- [ ] **T4:** metacharacter-bearing memo/customer_name (quotes, angle brackets, template braces) round-trips inert in JSON and renders inert in export (correctness test with hostile-shaped data, not an exploit)
- [ ] **T5:** *design* test — API schema contains no URL-typed input field (a contract assertion, so v2 can't quietly add one without tripping review)
- [ ] **T6:** repo + history scan clean ([secret-leak-scanner](../skills/secret-leak-scanner/SKILL.md)); renderer key absent from code/config/image/logs
- [ ] **T7:** oversized / wrong-content-type renderer response → 502, nothing forwarded; response served as attachment
- [ ] **T8:** unauthenticated request to each of the five routes → 401 (this test also guards the middleware wiring itself)
- [ ] Structural: two-account fixture (tenants A/B, one user each) is in the shared scaffold so the *next* feature's T1 tests cost five minutes ([authorization §2](../topics/authorization/README.md) prevention — cheap tests are the ones that get written)

## Phase 5 — Pre-merge close-out

- [ ] Run the three review skills against the diff: [authz-review](../skills/authz-review/SKILL.md), [injection-review](../skills/injection-review/SKILL.md), [secret-leak-scanner](../skills/secret-leak-scanner/SKILL.md) — independent-context review if agent-driven ([orchestration §2](../principles/multi-agent-orchestration.md))
- [ ] Threat table T1–T8 each shows: control merged + test green, or a named/dated acceptance ([threat-modeling §4](../principles/threat-modeling.md))
- [ ] New dependency (renderer SDK?) passed the [adoption gate](../topics/supply-chain/README.md) §1; lockfile diff read
- [ ] Rate-limit/velocity metrics on the new routes visible in monitoring, alert on export-endpoint anomalies (it's the expensive one) — detection is a control ([mindset heuristic 8](../principles/security-mindset.md))
- [ ] The threat model file lives next to the code (`docs/threat-model.md` in the feature dir), so the next person changing this feature updates the table instead of re-deriving it

**Definition of secure-done for any feature, generalized:** every trust-boundary crossing has a named enforced control; every control has a negative test in CI; every secret is manager-held and narrow; every outbound call is allowlisted and validated; and the threats you chose *not* to handle have names and dates next to them.
