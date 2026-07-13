# seo-engineer/ — Technical SEO Knowledge Base & Skill Library

**Date:** 2026-07-13. **Reflects:** Google Search Central documentation as of mid-2026 — see [`CHANGELOG.md`](CHANGELOG.md) for the exact revision basis and the known-volatile sections.

Technical SEO: making sure the sites engineers ship are findable, crawlable, correctly rendered, and correctly understood by search engines. **In scope:** crawlability/indexability, site architecture, rendering strategy for crawlers, structured data, Core Web Vitals as a ranking input, migrations, international, log analysis, monitoring. **Out of scope:** content writing, keyword research, link building (adjacent disciplines), and performance/rendering *implementation* — that lives in [`../web-dev/`](../web-dev/README.md); this KB owns the search consequences.

## Find what you need in 30 seconds

| You want to… | Go to |
|---|---|
| **Understand how this KB is organized** | [`DESIGN.md`](DESIGN.md) |
| **Build a new site right, start to finish** | [`building-from-scratch/README.md`](building-from-scratch/README.md) |
| **Audit an unfamiliar site for SEO risk** | [`auditing-existing-sites/README.md`](auditing-existing-sites/README.md) |
| **Triage a traffic drop, NOW** | [`principles/monitoring-diagnosis.md`](principles/monitoring-diagnosis.md) — run the numbered triage |
| Understand robots.txt / noindex / canonicals / crawl budget / orphans | [`principles/crawlability-indexability.md`](principles/crawlability-indexability.md) |
| Design URLs, internal linking, pagination, facets | [`principles/site-architecture.md`](principles/site-architecture.md) |
| Choose SSR/SSG/CSR; debug JS-invisible content | [`principles/rendering-strategy.md`](principles/rendering-strategy.md) |
| Implement or debug schema markup / rich results | [`principles/structured-data.md`](principles/structured-data.md) |
| Know what CWV means *for rankings* (vs general perf) | [`principles/core-web-vitals-seo.md`](principles/core-web-vitals-seo.md) |
| Set up monitoring that catches regressions pre-Google | [`principles/monitoring-diagnosis.md`](principles/monitoring-diagnosis.md) §monitoring-stack |
| Do hreflang / multi-locale correctly | [`topics/international-seo/`](topics/international-seo/production-patterns.md) |
| Plan or rescue a migration / domain change | [`topics/site-migrations/`](topics/site-migrations/production-patterns.md) |
| Read crawler behavior from server logs | [`topics/log-file-analysis/`](topics/log-file-analysis/production-patterns.md) |
| Mobile-first indexing obligations | [`topics/mobile-first-indexing/`](topics/mobile-first-indexing/production-patterns.md) |
| Run multiple agents on SEO work safely | [`orchestration/README.md`](orchestration/README.md) |
| Look up a term | [`GLOSSARY.md`](GLOSSARY.md) |

## Callable capabilities

**Skills** (procedures against a concrete artifact — each SKILL.md states when *not* to use it):

- [`skills/indexability-regression-reviewer/`](skills/indexability-regression-reviewer/SKILL.md) — review a diff/PR for accidental noindex/robots/canonical/redirect/rendering regressions. Run on anything touching robots.txt, head templates, middleware, edge config, redirects, or SSR flags.
- [`skills/structured-data-validator/`](skills/structured-data-validator/SKILL.md) — validate markup against schema.org, Google rich-result requirements, and truthfulness vs page content (the manual-action check).
- [`skills/redirect-map-generator/`](skills/redirect-map-generator/SKILL.md) — build and verify the complete one-hop redirect map for a URL migration.

**Subagents** (context-isolating bulk work; read-only against targets):

- [`agents/site-crawl-auditor.md`](agents/site-crawl-auditor.md) — crawl sitemap + link graph: orphans, traps, canonical conflicts, noindex inventory, depth, hreflang closure. Quarterly baseline and audit collection.
- [`agents/log-file-analyzer.md`](agents/log-file-analyzer.md) — grind a server-log export into verified crawler-behavior facts: budget distribution, coverage/freshness, waste, change dating.

## Reading order by role

- **New to technical SEO:** `GLOSSARY.md` → `principles/crawlability-indexability.md` (the four-gates mental model everything hangs on) → `principles/rendering-strategy.md` → the rest of `principles/` as needed.
- **Engineer shipping a change to a site that ranks:** the skills table above; if your diff touches anything SEO-sensitive, `indexability-regression-reviewer` is the one habit that prevents career-limiting incidents.
- **Staff engineer / agent designing systems:** `DESIGN.md` → both playbooks → `orchestration/README.md`.

Every doc is standalone: it states its date, its guideline basis, and links what it depends on. If a doc's date is old and the [`CHANGELOG.md`](CHANGELOG.md) volatile-list touches it, verify against current Google documentation before acting on specifics.
