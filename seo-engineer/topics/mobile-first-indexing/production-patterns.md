# Mobile-First Indexing — Production Patterns

**Date:** 2026-07-13. **Reflects:** Google's completed mobile-first indexing rollout (universal since 2023-10) as documented mid-2026. Extended tier: patterns + [`common-pitfalls.md`](common-pitfalls.md).

## The mental model

Mobile-first indexing is fully rolled out and no longer optional, transitional, or per-site: **Google indexes and ranks from what smartphone Googlebot sees, for every site, period.** Desktop Googlebot still exists for auxiliary purposes, but the mobile rendering of your page *is* your page as far as the index is concerned. Consequences:

- Content visible only on desktop effectively doesn't exist for ranking.
- Structured data, meta tags, canonicals, and hreflang must be present in the mobile rendering.
- The mobile experience's CWV numbers are the ranking-relevant ones ([`../../principles/core-web-vitals-seo.md`](../../principles/core-web-vitals-seo.md) §4).

## Pattern 1: Responsive design closes the topic

One URL, one HTML payload, CSS-adapted layout. Every parity risk in this doc exists only when mobile and desktop are *different documents*. Responsive design makes parity structural rather than procedural — which is why it's Google's recommended pattern and should be yours. If you're on responsive design, your remaining obligations are: don't hide indexable content on mobile breakpoints via *content removal* (CSS hiding is fine — see pitfall #2 nuance), and verify with smartphone-UA testing (Pattern 3). Done.

## Pattern 2: If you're stuck with separate mobile serving (legacy `m.` sites or dynamic serving)

These architectures are legacy and every audit should carry a line item to retire them, but while they live:

- **`m.` subdomain:** bidirectional annotations — desktop page: `rel=alternate media=...` → m-page; m-page: `rel=canonical` → desktop page. Every pair, both directions (structurally the same reciprocity discipline as hreflang — [`../international-seo/production-patterns.md`](../international-seo/production-patterns.md) Pattern 2). Redirect mobile UAs to the *equivalent* m-URL, never m-homepage.
- **Dynamic serving (UA-varied HTML on one URL):** send `Vary: User-Agent`; keep the UA-detection list current — an outdated detector serving smartphone Googlebot the desktop page means Google indexes the desktop version while your users see mobile, and any divergence between them becomes invisible-to-you reality.
- **Parity obligation:** content, structured data, meta robots, canonicals, hreflang, internal links, and image alt text identical across variants. Internal-link parity matters at architecture scale: an m-site with a slimmed nav gives smartphone Googlebot — the indexer — a *shallower link graph* than you designed ([`../../principles/site-architecture.md`](../../principles/site-architecture.md)).

## Pattern 3: Verify with the smartphone crawler's eyes

- `curl -A "<current smartphone Googlebot UA>" <url>` (check Google's crawler docs for the current string) plus GSC URL Inspection — the crawled-as agent and the rendered mobile screenshot are the authoritative view.
- Crawl audits and CI fetches run with a smartphone UA and mobile viewport *by default* — a desktop-UA audit of a mobile-first index audits the wrong document ([`../../agents/site-crawl-auditor.md`](../../agents/site-crawl-auditor.md) defaults accordingly).
- Log analysis: smartphone Googlebot should dominate verified crawl volume; a desktop-heavy mix on a site with separate serving is a misconfiguration signal ([`../log-file-analysis/production-patterns.md`](../log-file-analysis/production-patterns.md) Pattern 2).

## Pattern 4: Mobile resource and robots parity

The mobile rendering must be *renderable*: don't block mobile-specific JS/CSS/API paths in robots.txt; keep images/video on crawlable URLs referenced from the mobile DOM (a desktop-only image gallery = images gone from image search); interstitials and CMPs must not replace mobile content in the rendered DOM ([`../../principles/rendering-strategy.md`](../../principles/rendering-strategy.md) §traps — the mobile viewport makes full-screen interstitials likelier to swallow the page).
