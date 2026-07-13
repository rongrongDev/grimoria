# Building a Technically Sound Site From Scratch — The Complete Playbook

**Date:** 2026-07-13. **Reflects:** Google Search Central guidance as of mid-2026. This is capability A: follow it start to finish and you'll launch a site that is crawlable, indexable, correctly rendered for search, structured-data-complete, and monitored against regressions. Each step links the principles doc that explains *why*; this doc sequences the *what* and the *in-which-order*.

The order matters. Every step below is 10x cheaper before routes are built than after launch — this playbook exists because I spent two decades retrofitting the same six decisions into sites that skipped them.

---

## Phase 0 — Decisions on paper (before any code)

### 0.1 Page-type inventory and intent map

List every *type* of page the site will have (home, category, product/article, search, account, utility) and for each answer: **does it target a search intent?** (what would someone type to want this page?). Pages with no search intent get marked `noindex-by-design` right now — deciding this later is how internal search results end up indexed. Output: a table of `page type | intent | index? | priority (P1/P2/P3)`. Every later step consumes this table.

### 0.2 URL scheme — written down, one page

Per [`../principles/site-architecture.md`](../principles/site-architecture.md) §1: lowercase; hyphenated; trailing-slash policy chosen; no tracking/session params in canonical forms; flat item URLs (`/p/<slug>`) if items belong to multiple categories; slug-rename policy = 301 from old. Write it in the repo (`docs/url-scheme.md`). Then implement the **single URL-builder function** — every internal link, canonical, sitemap entry, and hreflang annotation in the codebase must come from it. This one function is the enforcement mechanism for half this playbook.

### 0.3 Rendering strategy per page type

Run each page type through the decision tree in [`../principles/rendering-strategy.md`](../principles/rendering-strategy.md): indexable content pages → SSG or SSR (framework choice and mechanics: [`../../web-dev/frameworks/`](../../web-dev/frameworks/)); app-internal pages → CSR + noindex. Record the choice in the 0.1 table. The law you're implementing: **everything you need indexed exists in the server HTML response** — content, links, title, meta robots, canonical, structured data.

### 0.4 Architecture: hubs and depth budget

Sketch the link hierarchy: homepage → hubs (categories/topics) → items, with the rule **every P1 page ≤3 clicks from home** ([`site-architecture.md`](../principles/site-architecture.md) §3). If the item count makes that impossible through pagination alone, you need sub-hubs or cross-link modules — design them now. Choose the pagination pattern: real `?page=N` URLs, self-canonical, plain `<a href>` links (never canonical-to-page-1, never load-more-only).

### 0.5 Parameter & facet policy

For every planned query parameter: real intent → real crawlable page; otherwise → not crawlable (robots.txt pattern + no crawlable links emit it). Internal search: `Disallow` + `noindex`, always. Record in the URL-scheme doc. ([`site-architecture.md`](../principles/site-architecture.md) §2.)

### 0.6 If multiple locales: international structure

Subdirectories (`/de/`, `/fr-ca/`) unless you have ccTLD-scale reasons; hreflang generated from the CMS translation relations; no IP redirects. Full pattern: [`../topics/international-seo/production-patterns.md`](../topics/international-seo/production-patterns.md). Deferring "we'll add locales later" is fine; *retrofitting the URL structure* later is a migration — if locales are on the roadmap, reserve the path structure now.

---

## Phase 1 — Build-time implementation

### 1.1 The head, from one code path

One server-side component/function owns per-page: `<title>`, meta description, `rel=canonical` (absolute, from the URL builder, self-referencing by default), meta robots (from the 0.1 table — explicit, not accidental), hreflang (if 0.6). The client never mutates these post-hydration ([`rendering-strategy.md`](../principles/rendering-strategy.md) §2).

### 1.2 robots.txt as reviewed, versioned code

In the repo, not hand-edited in a bucket. Contents: the 0.5 Disallow patterns, sitemap reference. Never Disallow JS/CSS/API paths the page rendering needs. Production content must be structurally incapable of receiving staging's `Disallow: /` (separate files selected by build target — not an env-var-templated single file; see the war story in [`crawlability-indexability.md`](../principles/crawlability-indexability.md) §1).

### 1.3 XML sitemap from the routing source of truth

Generated (build- or runtime) from the same route data that renders links — never a manually maintained list. Include only: indexable (per 0.1), canonical-form, 200 URLs. Honest `lastmod` from real content timestamps or omit it. Index file + splits at 50K. ([`crawlability-indexability.md`](../principles/crawlability-indexability.md) §sitemaps.)

### 1.4 Structured data

From [`../principles/structured-data.md`](../principles/structured-data.md) §decision-guide: `Organization` + `WebSite` (home), `BreadcrumbList` (site-wide), plus the type matching your money pages (`Product`+`Offer`, `Article`, per vertical — read Google's feature page for the exact required properties, verify the rich result still exists). JSON-LD, server-rendered, one connected `@id` graph, every value from real data models — **no defaults, no fallbacks, omit what you don't have.**

### 1.5 Performance with the SEO thresholds in view

Build to pass mobile-p75 Good: LCP ≤2.5s / INP ≤200ms / CLS ≤0.1. At build-from-scratch time this is cheap: dimensions on all media, hero image eager + `fetchpriority="high"`, no render-blocking third-party scripts, reserved space for late-loading UI (CMP!). Implementation techniques belong to [`../../web-dev/principles/performance.md`](../../web-dev/principles/performance.md); the SEO framing (field data, p75, mobile) to [`../principles/core-web-vitals-seo.md`](../principles/core-web-vitals-seo.md).

---

## Phase 2 — The CI gates (build these before launch, they're an afternoon each)

Wire these as blocking checks; each is specified in its principles doc:

1. **Template indexability test** — render each page type in production config; assert: expected meta-robots state per the 0.1 table, self-canonical from the URL builder, title/H1 present. (Catches the accidental-noindex class.)
2. **No-JS render check** — fetch each indexable template with JS disabled; assert content marker + nav `<a href>` links present. (Catches rendering downgrades.)
3. **Structured-data validation** — parse rendered JSON-LD per template; assert required properties for its type. (Run [`../skills/structured-data-validator/SKILL.md`](../skills/structured-data-validator/SKILL.md) logic in CI-lite form.)
4. **hreflang closure test** (if 0.6) — graph symmetry + all targets 200/self-canonical.
5. **Lab CWV regression tripwire** — Lighthouse CI budget, *relative deltas only* (field data judges; lab only trips regressions).
6. **robots.txt & redirect assertions** — prod robots.txt matches the reviewed file; core host-level 301s (http→https, apex↔www, slash policy) are single-hop.

## Phase 3 — Launch

- GSC property verified; sitemap submitted; `curl -sI` spot-check of the P1 URLs (status, canonical, no stray `X-Robots-Tag`) from outside your network.
- **Synthetic indexability probe live on day one** — the hourly fetch-and-assert on ~20 critical URLs + robots.txt hash alert, per [`monitoring-diagnosis.md`](../principles/monitoring-diagnosis.md) §monitoring-stack item 1. Non-negotiable; it is the single highest-value monitoring artifact this playbook produces.
- RUM: `web-vitals` library → analytics, mobile-p75 dashboard with deploy annotations.
- Calendar the weekly GSC ritual with a named owner; schedule the quarterly [`site-crawl-auditor`](../agents/site-crawl-auditor.md) + [`log-file-analyzer`](../agents/log-file-analyzer.md) baselines (and set up edge-log retention *now* — [`../topics/log-file-analysis/production-patterns.md`](../topics/log-file-analysis/production-patterns.md) Pattern 1).

## Phase 4 — Steady state

New page templates go through 0.1's questions (intent? index? rendering? schema type?) as definition-of-done items. Diffs touching robots.txt, head rendering, redirects, middleware, or rendering flags get the [`indexability-regression-reviewer`](../skills/indexability-regression-reviewer/SKILL.md). Traffic anomalies go through the [`monitoring-diagnosis.md`](../principles/monitoring-diagnosis.md) triage, in order, every time.

---

## Launch checklist (the one-page version)

- [ ] Page-type table: intent, index?, rendering mode, schema type, priority
- [ ] URL scheme doc + single URL-builder function in code
- [ ] P1 pages ≤3 clicks deep; pagination = real self-canonical `<a href>` URLs
- [ ] Parameter/facet policy; internal search blocked
- [ ] Head tags from one server-side code path; client never mutates them
- [ ] robots.txt versioned+reviewed; staging state cannot ship
- [ ] Sitemap generated from routing truth, canonical 200s only
- [ ] Structured data: server-rendered JSON-LD, truthful, required props present
- [ ] CI gates 1–6 green
- [ ] GSC verified, sitemap submitted, P1 curl spot-check done
- [ ] Synthetic probe + robots.txt alert live; RUM live; GSC ritual owned & calendared
- [ ] Edge logs flowing to retention; quarterly baselines scheduled
