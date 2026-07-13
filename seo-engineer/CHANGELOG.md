# Changelog — seo-engineer/

All docs state their date and the guideline revision they reflect. This file tracks KB-level changes. **Maintainers:** when Google announces a relevant change (Search Central blog / documentation changelog / Search Status Dashboard), update the affected doc and log it here in the same change.

## 2026-07-13 — Initial release

Authored against: Google Search Central documentation as of mid-2026; CWV metric set LCP/INP/CLS (INP since 2024-03); mobile-first indexing universal (since 2023-10); robots.txt per RFC 9309; `rel=prev/next` ignored (since 2019); dynamic rendering deprecated (since 2022); schema.org v29.x.

- `DESIGN.md` — structure rationale and maintenance rules.
- `principles/` — core tier, full depth: crawlability-indexability, site-architecture, rendering-strategy, structured-data, core-web-vitals-seo, monitoring-diagnosis.
- `topics/` — extended tier (production-patterns + common-pitfalls): international-seo, site-migrations, log-file-analysis, mobile-first-indexing.
- `building-from-scratch/README.md` — capability A playbook (start-to-finish build guide).
- `auditing-existing-sites/README.md` — capability B playbook (four-artifact audit).
- `orchestration/README.md` — multi-agent patterns and failure modes.
- `skills/` — indexability-regression-reviewer, structured-data-validator, redirect-map-generator.
- `agents/` — site-crawl-auditor, log-file-analyzer.
- `GLOSSARY.md`, `README.md`.

### Known-volatile sections (check first when revalidating this KB)

1. Rich-result feature support list (`principles/structured-data.md`, `skills/structured-data-validator/`) — Google adds/removes types regularly.
2. CWV metric definitions/thresholds (`principles/core-web-vitals-seo.md`) — the FID→INP replacement will not be the last change.
3. Googlebot UA strings and published IP ranges (`topics/mobile-first-indexing/`, `agents/log-file-analyzer.md`) — fetch current values at use time; docs deliberately avoid hardcoding them.
4. GSC report names/features (`principles/monitoring-diagnosis.md`) — UI churns; the workflow logic outlives the labels.
5. AI-search/SERP-feature landscape (`principles/monitoring-diagnosis.md` step 6) — CTR-per-position assumptions age fastest of all.
