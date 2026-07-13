# Crawlability & Indexability

**Date:** 2026-07-13. **Reflects:** Google Search Central documentation as of mid-2026 (robots.txt RFC 9309 semantics, current `noindex` handling). Core tier — full depth.
**Related:** executable checks live in [`../skills/indexability-regression-reviewer/SKILL.md`](../skills/indexability-regression-reviewer/SKILL.md) (diff review) and [`../agents/site-crawl-auditor.md`](../agents/site-crawl-auditor.md) (whole-site survey). Diagnostic workflow: [`monitoring-diagnosis.md`](monitoring-diagnosis.md).

## The mental model

A page earns search traffic only after passing four gates, in order: **discovered → crawled → rendered → indexed**. Ranking is a fifth gate you don't fully control; the first four you control completely, and most technical SEO disasters are a silent failure at one of them. When traffic disappears, walk the gates in order — most engineers jump straight to "the algorithm changed" and waste a week, when `curl -I` on the affected URL would have shown the answer in ten seconds.

The two directives everyone confuses, and the confusion that causes real incidents:

- **`robots.txt Disallow`** controls *crawling*, not indexing. A disallowed URL can still be indexed (from external links) as a URL-only result — and critically, **Google cannot see a `noindex` on a page it's not allowed to crawl.**
- **`noindex`** (meta robots or `X-Robots-Tag` header) controls *indexing*. It only works if the page is crawlable.

So "Disallow + noindex" on the same URL is self-defeating: the Disallow prevents the noindex from ever being read. To remove a page from the index, allow crawling and serve `noindex` (or 404/410). To save crawl budget on pages that were never indexed, Disallow is fine. Choose one intent per URL.

## Failure modes

### 1. Accidental `noindex` shipped in a routine deploy

**The war story.** A retailer's traffic fell off a cliff over ten days — not instantly, because deindexing follows crawl frequency, so the homepage died first and the long tail bled out slowly. Root cause: their framework set `<meta name="robots" content="noindex">` whenever an environment variable wasn't exactly `"production"`. A CI refactor changed the value to `"prod"`. No test failed. Nothing looked wrong in the browser. Six weeks to full recovery *after* the fix, because reindexing is also crawl-frequency-bound. The bug was one line; the revenue impact had two commas.

Variants of the same class: staging `robots.txt` (blanket `Disallow: /`) deployed to production; an `X-Robots-Tag: noindex` header added at the CDN/edge layer where nobody looks; auth middleware starting to serve the login page (with its noindex) to unauthenticated crawlers; a canonical tag templated to point every page at the homepage.

- **Detection:** GSC Page indexing report ("Excluded by noindex tag" trending up); scheduled synthetic check that fetches N critical URLs and asserts on status, meta robots, `X-Robots-Tag`, and canonical (see Prevention); sudden drop pattern per `monitoring-diagnosis.md` §regression-vs-algorithm.
- **Fix:** revert; then use GSC URL Inspection → Request Indexing on the highest-value pages; resubmit sitemaps to accelerate recrawl. Expect recovery on the crawl-frequency curve — days for the homepage, weeks for the tail. Communicate that timeline to stakeholders *up front*.
- **Prevention (this is the one that matters):**
  - CI gate: an integration test that renders key page templates in a production-config build and asserts *no* `noindex` and correct canonicals. Assert the positive ("index,follow" or absence of the tag), not just the negative.
  - Deploy checklist item: `curl -sI https://example.com/ | grep -i x-robots-tag` after every infra/CDN change — headers bypass all app-level tests.
  - Run the `indexability-regression-reviewer` skill on any diff touching robots.txt, head templates, middleware, edge config, or SEO components.
  - robots.txt under version control with required review; production robots.txt must never be an environment-templated file that can silently receive staging content.

### 2. Crawl budget wasted on low-value / parameterized URLs

Crawl budget is real but *only matters at scale* — roughly, sites over ~500K URLs or sites generating unbounded URL spaces. On a 200-page marketing site, ignore it; on a faceted e-commerce catalog, it's existential. The failure: filters, sorts, session params, and tracking params mint infinite URL permutations; the crawler spends its allocation on `?color=red&sort=price&page=47` and takes days to discover your new product pages.

- **Detection:** [`../topics/log-file-analysis/`](../topics/log-file-analysis/production-patterns.md) — what share of Googlebot hits land on parameterized/duplicative URLs? GSC Crawl Stats (response distribution, discovered-not-indexed counts). The `site-crawl-auditor` subagent quantifies the URL-space explosion from the inside.
- **Fix:** decide each parameter's fate deliberately: valuable distinct content → crawlable, canonical to itself; duplicative → `rel=canonical` to the clean URL; infinite/worthless (session IDs, sorts) → `Disallow` in robots.txt *if never indexed*, or strip at the edge with 301s. Internal links should only ever emit the canonical form.
- **Prevention:** URL-parameter policy as a documented architecture decision (see [`site-architecture.md`](site-architecture.md) §faceted-navigation); new query parameters require the policy question answered at design review.

### 3. Canonical tags pointing at the wrong page, or fighting other signals

`rel=canonical` is a *hint*, not a directive — Google ignores canonicals that contradict stronger evidence, and when it ignores yours, it picks its own, and you find out from GSC's "Duplicate, Google chose different canonical than user." The dangerous configurations:

- Canonical → URL that 301s elsewhere (chain: signal dilution, and Google distrusts the canonical).
- Canonical → a `noindex` page or a 404 (contradiction; Google discards it and guesses).
- Canonical → homepage from every page (templating bug; effectively deindexes the site — I've seen this ship twice, both times from a "harmless" head-component refactor).
- Every localized page canonical → the English page (kills international rankings; see [`../topics/international-seo/common-pitfalls.md`](../topics/international-seo/common-pitfalls.md)).
- Canonical disagrees with the sitemap URL, internal link form, or hreflang target — mixed signals mean Google decides for you.

- **Detection:** GSC "Duplicate, Google chose different canonical"; `site-crawl-auditor` cross-checks canonical vs status vs sitemap vs internal-link form for every URL.
- **Fix:** make all signals agree — one canonical form per page, used consistently in the tag, internal links, sitemap, hreflang, and redirects.
- **Prevention:** the canonical is computed in exactly one place in the codebase (one function, absolute URL, self-referencing by default); template tests assert it per page type; `indexability-regression-reviewer` on any diff touching it.

### 4. Orphaned pages

Pages with zero internal links pointing at them. They may be indexed today (from sitemap or old links) but they're on borrowed time: without internal links they receive no PageRank flow, get crawled rarely, and rank poorly regardless of content quality. Common source: a redesign quietly drops a nav section or template that linked entire content categories.

- **Detection:** set-difference: (URLs in sitemap ∪ URLs in analytics ∪ URLs receiving Googlebot hits in logs) − (URLs reachable by crawling from the homepage). This is precisely what `site-crawl-auditor` computes.
- **Fix:** for pages that should live — restore internal links from relevant hub pages (see `site-architecture.md` §internal-linking). For pages that shouldn't — 301 to the closest relevant page or 410, and remove from the sitemap. Never leave the sitemap advertising pages the site itself doesn't link to; that's a documented signal-inconsistency.
- **Prevention:** run the orphan check quarterly and after every redesign/nav change; sitemap generated from the same routing source of truth as the site's links, not from a separate manually-maintained list.

## Sitemaps: contract, not decoration

A sitemap is a statement to the crawler: "these URLs are canonical, indexable, and return 200." Every violation (redirecting URL, noindexed URL, 404) burns trust in the whole file. Generate it from the routing source of truth, exclude anything non-indexable, keep `lastmod` honest (Google ignores it site-wide once it catches you lying), and split at 50K URLs/50MB into an index file. Submit via GSC and reference in robots.txt.

## Decision tree: keeping a URL out of search

```
Want the page out of the INDEX (it may already be indexed)?
├── Content must be inaccessible too (private/legal) → auth-gate or 404/410. Not robots.txt —
│   robots.txt is public and points attackers at what you're hiding.
├── Page should exist for users but not search → meta robots noindex (or X-Robots-Tag
│   for non-HTML). Ensure it's crawlable so the directive is seen.
└── Never indexed, never should be, and there are MANY (infinite params, internal search)
    → robots.txt Disallow (saves crawl budget). If some already got indexed, noindex first,
      wait until deindexed, THEN Disallow.
```

## Prevention stack (summary)

| Layer | Mechanism |
|---|---|
| Design review | URL-parameter policy; canonical strategy per template |
| CI | Template tests asserting index/canonical state in prod config |
| Code review | `indexability-regression-reviewer` skill on SEO-sensitive diffs |
| Post-deploy | Synthetic fetch of critical URLs: status, meta robots, X-Robots-Tag, canonical |
| Weekly | GSC Page indexing report review (trend, not snapshot) |
| Quarterly | `site-crawl-auditor` full survey; orphan-page set-difference |
