# Design Note — How This Knowledge Base Is Organized, and Why

**Author:** Principal technical SEO engineer (retiring). **Date:** 2026-07-13.
**Applies to:** Google Search documentation and Core Web Vitals thresholds as published mid-2026.
**Audience:** Whoever maintains this after me — human or model. Read this before restructuring anything.

## What this KB is and is not

Technical SEO is the discipline of making sure the site engineers ship is *findable, crawlable, renderable, and correctly understood* by search engines. It is not content writing, not keyword research, not link building — those are adjacent crafts with their own experts. When a recommendation here needs performance or rendering *implementation* detail (how to actually make LCP faster, how SSR works in Next.js), we link out to `../web-dev/` rather than duplicating it. This KB owns the *search-consequence* layer: what crawlers do with what you shipped, and how rankings respond.

One property makes this KB different from its siblings: **the ground truth is a third party's black box that changes without notice.** Google's crawler behavior, rich-result eligibility, and CWV thresholds are documented but revised continuously, and the algorithm itself is not documented at all. That's why every doc here carries a date and a guidelines-revision stamp, and why the maintenance rules below are stricter about staleness than the other KBs in this repo.

## The three primitives, and the test for each

1. **Principles doc** (`principles/`, `topics/<name>/`) — judgment to be read and reasoned with. Test: "would an engineer read this once and be permanently better at decisions?" Docs teach.
2. **Skill** (`skills/<name>/SKILL.md`) — a procedure executed against a concrete artifact (a deploy diff, a page's markup, a URL inventory). Test: "does it have inputs, steps, and an output format?" Skills do.
3. **Subagent** (`agents/<name>.md`) — work whose intermediate noise would poison the dispatcher's context: crawling hundreds of URLs, parsing millions of log lines, for one page of conclusions. Test: "is the intermediate work 10x larger than the useful output?" Subagents isolate.

Corollary: one topic legitimately appears in all three layers. Canonicalization is *explained* in `principles/crawlability-indexability.md`, *checked in a diff* by the `indexability-regression-reviewer` skill, and *surveyed across a whole site* by the `site-crawl-auditor` subagent. Each executable layer links back to the doc for the "why" and adds only its own "how."

## Tiering

**Core tier — full depth** (failure mode → detection → fix → prevention, war story, decision tree), one doc each in `principles/`:

- `crawlability-indexability.md` — robots.txt, meta robots, canonicalization, crawl budget, orphaned pages
- `site-architecture.md` — URL structure, internal linking, pagination, crawl traps
- `rendering-strategy.md` — how crawlers render JS, SSR/SSG/CSR decision tree, hydration pitfalls
- `structured-data.md` — schema markup, rich-result eligibility, accuracy and manual actions
- `core-web-vitals-seo.md` — the *SEO-specific* slice of CWV: thresholds, field vs lab, ranking weight
- `monitoring-diagnosis.md` — traffic-drop triage, algorithm update vs regression, ongoing monitoring

`monitoring-diagnosis.md` is in core even though §2 of the original brief doesn't name it, because every other doc's "detection" section depends on it — it is the shared diagnostic spine.

**Extended tier — production-patterns + common-pitfalls only**, in `topics/<name>/`:

- `international-seo/` — hreflang, geo-targeting, cross-locale duplication
- `site-migrations/` — domain/URL changes, redirect strategy, replatforming
- `log-file-analysis/` — reading crawler behavior from server logs
- `mobile-first-indexing/` — what mobile-first indexing actually changes

## The two capabilities get their own playbooks

- `building-from-scratch/README.md` — capability A: design a crawlable architecture, pick a rendering strategy, implement structured data, wire up monitoring, start to finish. This is the fully-followable guide the Definition of Done requires.
- `auditing-existing-sites/README.md` — capability B: a bounded-time audit playbook for an unfamiliar site producing four artifacts (indexability audit, structured-data review, CWV risk assessment, prioritized remediation plan).

These are playbooks, not principles — they sequence the principles docs into a workflow. They live at the top level because they're the two most common entry points.

## Why the skills are these three

- `indexability-regression-reviewer` — the single highest-value automatable check in this discipline. Most catastrophic SEO incidents are one-line diffs (a `noindex`, a robots.txt line, a canonical change) shipped in routine deploys. Reviewing a diff for these is pure procedure with a checklist shape.
- `structured-data-validator` — validation against schema.org *and* Google's stricter rich-result requirements *and* the accuracy-vs-page-content check (the one validators can't do and manual actions punish). Inputs (markup + page content), steps, output format: skill.
- `redirect-map-generator` — migrations are where rankings go to die, and the redirect map is the artifact that decides survival. Generating and verifying one is mechanical enough to proceduralize, judgment-laden enough to need the checklist.

Not skills: "choose a rendering strategy" (that's reading `principles/rendering-strategy.md` — a decision tree, not a procedure against an artifact) and "triage a traffic drop" (starts as reading `monitoring-diagnosis.md`; the heavy-data parts dispatch to the subagents).

## Why the subagents are these two

- `site-crawl-auditor` — crawling a site's sitemap and link graph means fetching hundreds of URLs and holding a link matrix in memory; the useful output is one page (orphans, traps, canonical conflicts, noindex inventory). Canonical context-poisoning work. Read-only tools — an auditor that can edit is an incident waiting to happen.
- `log-file-analyzer` — server log exports run to millions of lines; the conclusions (crawl-budget allocation, bot verification, wasted-crawl hotspots) fit in a page. Needs Bash for awk/grep aggregation but never writes to the repo.

## Map of the tree

```
seo-engineer/
├── README.md                    ← start here; 30-second routing table
├── DESIGN.md                    ← this file
├── GLOSSARY.md                  ← single source of terminology
├── CHANGELOG.md                 ← what changed, against which guideline revisions
├── principles/                  ← core tier, full depth (6 docs)
├── topics/                      ← extended tier (4 topics × 2 docs)
├── building-from-scratch/       ← capability A playbook
├── auditing-existing-sites/     ← capability B playbook
├── orchestration/               ← deploying agent teams on SEO work
├── skills/                      ← indexability-regression-reviewer, structured-data-validator, redirect-map-generator
└── agents/                      ← site-crawl-auditor.md, log-file-analyzer.md
```

## Maintenance rules (non-negotiable)

1. **Every doc carries a date and states which guideline revision it reflects.** SEO advice rots faster than any other KB in this repo — Google deprecated dynamic rendering, retired FID for INP, and killed multiple structured-data rich results *within the span I was writing my last three annual audits*. Undated SEO advice is actively harmful.
2. When Google announces a relevant change (check Search Central blog + documentation changelog), update the affected doc *and* `CHANGELOG.md` in the same edit. If you can't verify current guidance, mark the section "unverified as of <date>" rather than silently keeping stale advice.
3. New content passes the primitive test above before it gets a location. General judgment in a skill file, or a procedure in a principles file, is a filing error — fix it.
4. Skills and subagents never inline knowledge that exists in a doc — link it. When the doc improves, the skill improves for free.
5. Never duplicate `../web-dev/` material. Performance implementation, framework rendering mechanics, and hydration internals live there; this KB owns only their search consequences.
