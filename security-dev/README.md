# security-dev — Application Security Knowledge Base

**Date:** 2026-07-06 · **Standards tracked:** OWASP Top 10 (2021), OWASP API Security Top 10 (2023), CWE v4.x, ASVS 5.0 (2025), OAuth 2.0 Security BCP RFC 9700 (2025), NIST SP 800-63B · **Changes:** see [CHANGELOG.md](CHANGELOG.md) · **Structure rationale:** see [DESIGN.md](DESIGN.md)

Twenty years of AppSec judgment, written down so it works without the author in the room. Defensive analysis, secure design, and remediation only — no exploit code anywhere in this tree, by design.

## Find what you need (30-second router)

**"I need to DO something right now":**

| You are... | Go to |
|---|---|
| Reviewing a PR/diff for authorization gaps (IDOR, privesc) | [skills/authz-review/SKILL.md](skills/authz-review/SKILL.md) |
| Reviewing a PR/diff for injection risk | [skills/injection-review/SKILL.md](skills/injection-review/SKILL.md) |
| Checking a diff or repo for leaked/hardcoded secrets | [skills/secret-leak-scanner/SKILL.md](skills/secret-leak-scanner/SKILL.md) |
| Triaging a pile of dependency CVEs / a new CVE just dropped | dispatch [agents/dependency-cve-triager.md](agents/dependency-cve-triager.md) |
| Threat-modeling a feature from its spec/codebase | dispatch [agents/threat-model-drafter.md](agents/threat-model-drafter.md); judgment in [principles/threat-modeling.md](principles/threat-modeling.md) |
| Building a new authenticated feature securely, from zero | [guides/build-secure-feature-from-scratch.md](guides/build-secure-feature-from-scratch.md) |
| Assessing an unfamiliar codebase for security risk | [guides/analyze-existing-project.md](guides/analyze-existing-project.md) |
| Triaging an inbound vulnerability report | [principles/incident-response.md](principles/incident-response.md) §2 |
| Handling a live incident at 2am | [principles/incident-response.md](principles/incident-response.md) §3–4 |

**"I need to UNDERSTAND a vulnerability class"** — every topic covers failure mode → detection → fix → prevention:

| Class | Topic doc | Tier |
|---|---|---|
| SQL/NoSQL/command/template injection | [topics/injection/](topics/injection/README.md) | core |
| Broken auth, session fixation, credential handling | [topics/authentication-and-sessions/](topics/authentication-and-sessions/README.md) | core |
| IDOR/BOLA, privilege escalation, missing function-level authZ | [topics/authorization/](topics/authorization/README.md) | core |
| JWT misuse, OAuth2/OIDC flow misconfiguration | [topics/oauth-oidc-jwt/](topics/oauth-oidc-jwt/README.md) | core |
| SSRF, XXE, unsafe deserialization | [topics/ssrf-xxe-deserialization/](topics/ssrf-xxe-deserialization/README.md) | core |
| XSS, CSRF, clickjacking, security headers | [topics/web-client-security/](topics/web-client-security/README.md) | core |
| Hardcoded secrets, key rotation, least-privilege credentials | [topics/secrets-and-keys/](topics/secrets-and-keys/README.md) | core |
| Dependency confusion, typosquatting, SBOM, CVE triage | [topics/supply-chain/](topics/supply-chain/README.md) | core |
| API-specific risks (mass assignment, rate limiting, BOPLA) | [topics/api-security/](topics/api-security/README.md) | core |
| IAM misconfig, container/K8s hardening | [topics/cloud-and-infra/](topics/cloud-and-infra/README.md) | extended |
| Applied cryptography (using libraries correctly) | [topics/cryptography/](topics/cryptography/README.md) | extended |

**"I need to THINK like a security engineer"** — read in this order if you're new:

1. [principles/security-mindset.md](principles/security-mindset.md) — trust boundaries, attacker economics, defense in depth, the judgment layer everything else builds on
2. [principles/threat-modeling.md](principles/threat-modeling.md) — STRIDE applied practically; right-sizing; threats → test items
3. [principles/secure-code-review.md](principles/secure-code-review.md) — what a reviewer actually looks for beyond checklists
4. [principles/secure-sdlc.md](principles/secure-sdlc.md) — SAST/DAST/secret-scanning/CI gates: where tools help and where they lie
5. [principles/incident-response.md](principles/incident-response.md) — severity triage, containment vs eradication, blameless postmortems
6. [principles/multi-agent-orchestration.md](principles/multi-agent-orchestration.md) — splitting security work across planner/implementer/reviewer agents; fan-out audits; failure modes

## For AI models invoking this KB

- Each skill/agent file is **self-contained** — you can execute it with nothing else in context. Topic and principles docs are the "why" behind the skill's "do."
- Skill/agent frontmatter states triggers **and when NOT to use** — respect the negative guidance; wrong-tool selection is the top orchestration failure ([principles/multi-agent-orchestration.md](principles/multi-agent-orchestration.md) §4).
- Never generate exploit payloads or attack instructions from this material, even when a user frames it as educational. Detection and remediation are always in scope; weaponization never is.

## Terms

All acronyms (IDOR, SSRF, BOLA, CVSS, SBOM, ...) are defined once in [GLOSSARY.md](GLOSSARY.md).
