# Glossary

**Date:** 2026-07-06. Single vocabulary for the whole `security-dev/` tree. Terms are defined the way a practitioner uses them, including the judgment nuance a dictionary omits.

**ASVS** — OWASP Application Security Verification Standard; a leveled checklist of security requirements (L1 = every app, L2 = apps handling sensitive data, L3 = high-value targets). Current major: 5.0 (2025). Use it as a requirements source, not a substitute for threat modeling.

**Attack surface** — every point where an attacker can supply input or trigger behavior: routes, parsers, file uploads, webhooks, message consumers, admin panels, dependencies. Grows silently; inventory it explicitly.

**BFLA** — Broken Function-Level Authorization: caller can invoke an operation (e.g., an admin endpoint) they shouldn't. Sibling of BOLA — wrong *verb* vs wrong *object*.

**BOLA** — Broken Object-Level Authorization (OWASP API Top 10 #1, 2023). The API-world name for IDOR: authenticated user accesses objects belonging to others by varying an identifier.

**BOPLA** — Broken Object *Property*-Level Authorization: user can read or write fields of an object they shouldn't (e.g., `"role": "admin"` in a profile update). Encompasses mass assignment and excessive data exposure.

**CSP** — Content Security Policy; HTTP header limiting what a page may load/execute. Defense-in-depth against XSS, never the primary control.

**CSRF** — Cross-Site Request Forgery: victim's browser makes an authenticated state-changing request the victim didn't intend. Mitigated by SameSite cookies, anti-CSRF tokens, and (for APIs) requiring non-simple content types with token auth.

**CVE** — Common Vulnerabilities and Exposures identifier (e.g., CVE-2021-44228). An ID, not a severity — see CVSS, and see reachability before panicking.

**CVSS** — Common Vulnerability Scoring System (current: v4.0, 2023) — 0–10 severity score for a vulnerability *in the abstract*. A CVSS 9.8 in a library function you never call can matter less than a 6.5 in your login path. Score ≠ risk; reachability and exposure decide risk.

**CWE** — Common Weakness Enumeration; taxonomy of vulnerability *classes* (e.g., CWE-89 SQL injection). CVEs are instances; CWEs are the patterns this KB teaches.

**Defense in depth** — layered controls so one failure isn't a breach: parameterized queries AND least-privilege DB user AND egress filtering. Judgment: layers must fail *independently*; two checks reading the same header are one layer.

**Deserialization (unsafe)** — reconstructing objects from attacker-controlled bytes with a format that can encode arbitrary types/behavior (pickle, Java native serialization, PHP unserialize). Root cause of many RCEs. Fix: data-only formats (JSON) + schema validation.

**Egress filtering** — restricting *outbound* network traffic from servers. The unsung control that turns SSRF, exfiltration, and C2 callbacks from breaches into log entries.

**IDOR** — Insecure Direct Object Reference: `GET /invoices/1234` returns invoice 1234 without checking it's *yours*. See BOLA. The most common serious web vulnerability in practice, because it's invisible to scanners and framework defaults don't prevent it.

**JWT** — JSON Web Token; signed (JWS) or encrypted (JWE) claims blob. Misuse class of its own: `alg` confusion, missing `exp`/`aud` validation, no revocation story. See `topics/oauth-oidc-jwt/`.

**Least privilege** — every identity (human, service, CI job, DB account) holds the minimum permissions its function requires, so compromise of one identity buys the attacker as little as possible.

**Mass assignment** — binding request bodies directly to model objects so attackers set fields you never exposed (`isAdmin`, `price`). Fix: explicit allowlists / DTOs. See BOPLA.

**mTLS** — mutual TLS; both sides authenticate with certificates. Standard for service-to-service authN inside a mesh.

**OIDC** — OpenID Connect; identity layer on top of OAuth 2.0. OAuth answers "may this client access this resource"; OIDC answers "who is this user." Using bare OAuth as authentication is a classic misconfiguration.

**PoLP** — Principle of Least Privilege. See Least privilege.

**Reachability** — whether vulnerable code can actually be exercised in *your* deployment with attacker-influenced input. The variable that turns CVE noise into a ranked worklist. Core concept in `topics/supply-chain/` and the `dependency-cve-triager` agent.

**RCE** — Remote Code Execution: attacker runs code on your infrastructure. The ceiling of severity; anything plausibly escalating to RCE triages as critical.

**SAST / DAST / SCA** — Static analysis of source; dynamic testing of a running app; software composition analysis (dependency scanning). Complementary, each blind to what the others see: SAST can't see deployment config, DAST can't see dead code it never triggers, SCA can't see your own bugs.

**SBOM** — Software Bill of Materials: machine-readable inventory (SPDX or CycloneDX) of every component in an artifact. What lets you answer "are we exposed?" in minutes instead of days when the next Log4Shell drops.

**Secret sprawl** — secrets duplicated across env files, CI variables, laptops, and chat history until nobody can enumerate — let alone rotate — them. The precondition that turns a minor leak into a long-lived breach.

**Session fixation** — attacker sets/knows a session identifier *before* the victim logs in; if the app doesn't rotate the session ID at login, the attacker inherits the authenticated session. Fix: always regenerate session ID on privilege change.

**SSRF** — Server-Side Request Forgery: attacker makes *your server* issue requests (to cloud metadata endpoints, internal admin services) that the attacker couldn't reach directly. OWASP Top 10 2021 #10; devastating in cloud environments.

**STRIDE** — threat-modeling mnemonic: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege. A prompt for systematic thinking, not a form to fill.

**Template injection (SSTI)** — untrusted input evaluated *as* a template rather than rendered *into* one. Server-side variants frequently escalate to RCE because template engines expose object graphs.

**Trust boundary** — a line in the data-flow where the trust level changes: internet→app, app→DB, service→service, user content→parser. Security review is largely the discipline of finding every crossing and checking what's enforced there.

**Typosquatting / dependency confusion** — malicious packages named like popular ones (`requets`) / public packages shadowing your internal package names so a resolver fetches the attacker's copy. See `topics/supply-chain/`.

**XXE** — XML External Entity injection: XML parser resolves attacker-defined external entities, yielding file disclosure or SSRF. Fix: disable DTD/external entity processing (rarely the default in older stacks).

**Zero trust** — architecture stance: no request is trusted for *where it comes from* (network location); every request is authenticated and authorized. Practical consequence: internal services enforce authN/authZ too — "it's behind the VPN" is not a control.
