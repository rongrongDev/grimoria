# Changelog

Tracks KB content against the dated standards it encodes. When a tracked standard revises, add an entry stating what was re-verified or changed. Format: newest first.

## Standards currently tracked

| Standard | Revision encoded | Watch for |
|---|---|---|
| OWASP Top 10 | 2021 | next major revision (draft cycles announced on owasp.org) |
| OWASP API Security Top 10 | 2023 | next revision |
| CWE | v4.x (top-25 lists updated annually) | annual Top 25 refresh |
| ASVS | 5.0 (May 2025) | point releases |
| OAuth 2.0 Security BCP | RFC 9700 (Jan 2025) | successor RFCs; OAuth 2.1 draft progress |
| NIST Digital Identity (passwords/sessions) | SP 800-63B | rev updates |
| CVSS | v4.0 (2023) | scoring-guidance updates |
| SLSA (supply chain) | v1.0 | v1.1+ |

## 2026-07-06 — Initial release

- Full tree created: 4 root docs, 6 principles docs, 11 topic docs (9 core-tier at full failure→detection→fix→prevention depth; 2 extended-tier at production-patterns + pitfalls depth), 2 end-to-end guides, 3 skills, 2 subagents.
- Core-tier coverage verified against OWASP Top 10 2021 and OWASP API Security Top 10 2023 category-by-category (mapping tables in `topics/api-security/README.md` and each topic doc's header).
- JWT/OAuth guidance aligned to RFC 9700 (OAuth 2.0 Security BCP): implicit grant deprecated, PKCE required for all authorization-code clients, exact redirect-URI matching.
- Password/session guidance aligned to NIST SP 800-63B (length over composition rules, breached-password screening, no forced periodic rotation without evidence of compromise).
- Supply-chain guidance aligned to SLSA v1.0 provenance levels; SBOM guidance covers SPDX and CycloneDX.
- Scope discipline audit: zero exploit payloads/attack walkthroughs in tree; all examples are vulnerable-pattern vs fixed-pattern pairs.

## Maintenance rules (for whoever inherits this)

1. **When OWASP/CWE lists revise:** re-map the affected topic docs' header tables; the *judgment* content rarely changes — category names and numbers do. Record the re-verification here even if nothing changed.
2. **When a skill and its topic doc share a table** (they intentionally duplicate — see DESIGN.md), update both in the same commit or neither.
3. **Date-stamp every edited doc** at the top on change.
4. **Never add exploit code** during updates, including in "detection" sections. Detection signatures describe shapes, not payloads.
