# Site Architecture — URL Structure, Internal Linking, Pagination

**Date:** 2026-07-13. **Reflects:** Google Search Central documentation as of mid-2026 (note: `rel=prev/next` has been ignored by Google since 2019 — see §pagination). Core tier — full depth.
**Related:** [`crawlability-indexability.md`](crawlability-indexability.md) for the directives these structures interact with; [`../building-from-scratch/README.md`](../building-from-scratch/README.md) applies this doc start-to-finish; [`../agents/site-crawl-auditor.md`](../agents/site-crawl-auditor.md) measures an existing site against it.

## The mental model

Architecture is how you spend two finite currencies: **crawl attention** (which URLs the crawler visits and how often) and **ranking signal** (PageRank-like equity flowing through internal links, plus the relevance signal of which pages link to which). Every structural decision — URL scheme, nav design, pagination, facets — either concentrates those currencies on the pages you need to rank, or sprays them across duplicates and junk. Content quality decides your ceiling; architecture decides how close to it you get.

Rule of thumb that survives every algorithm update: **one indexable URL per distinct user intent; every page that matters reachable in ≤3 link-hops from the homepage; every internal link pointing at the canonical form.**

## Failure modes

### 1. URL structures that fragment ranking signal across near-duplicates

The same content reachable at `/shoes/nike-air`, `/nike/air`, `/products/12345`, `/shoes/nike-air?ref=nav`, plus http/https, www/apex, and trailing-slash variants. Each variant accumulates its own links and its own crawl history; the signal that should make one strong page makes five weak ones.

**The war story.** A B2B catalog ranked page 3 for its money terms despite better content than every competitor. The crawl showed each product had 4–6 live URL variants — category-path routing meant every product in three categories had three URLs, each self-canonicalizing. Consolidating to one canonical URL per product (301s from the variants, canonicals aligned, internal links rewritten) moved the money pages to page 1 in about two months, with **zero content changes**. The signal was always there; it was just split five ways.

- **Detection:** crawl the site and group pages by content similarity vs URL; GSC "Duplicate without user-selected canonical"; the `site-crawl-auditor` reports variant clusters.
- **Fix:** pick one canonical form per page. Enforce with 301s at the edge (protocol, host, case, trailing slash — one redirect, no chains), `rel=canonical`, and — most forgotten — rewrite internal links to emit only the canonical form. Redirecting your own internal links wastes crawl and leaks signal on every click.
- **Prevention:** URL scheme as a written architecture decision *before* routes are built (see decision list below); a lint/CI check that internal link helpers can only produce canonical forms (one URL-builder function, everything routes through it).

**URL scheme decisions to make once, in writing:** lowercase only; hyphens between words; trailing slash policy (either, but one); no session/tracking params in canonical forms; content IDs stable across renames (slug changes 301); flat product URLs (`/p/slug`) vs category paths — prefer flat when items live in multiple categories, it eliminates the whole duplicate class above.

### 2. Faceted navigation and other crawl traps

A crawl trap is any URL space that grows combinatorially: filters × sorts × pagination, calendars with infinite next-month links, search-results pages that link to more search-results pages. The crawler doesn't know the space is worthless until it's spent your crawl budget exploring it — and on large sites this directly delays indexing of real content (see [`crawlability-indexability.md`](crawlability-indexability.md) §crawl-budget).

- **Detection:** log-file analysis showing Googlebot hitting deep parameter permutations ([`../topics/log-file-analysis/`](../topics/log-file-analysis/production-patterns.md)); crawl the site yourself with a URL cap and watch what the frontier fills with.
- **Fix & policy — decide per facet, deliberately:**

```
Does this facet page target a real search intent with its own demand
("red running shoes", "hotels in lisbon with pool")?
├── YES → make it a real page: crawlable static-form URL, self-canonical,
│         internally linked from relevant hubs, in the sitemap. It's a landing page now.
└── NO (sorts, price sliders, view toggles, 3+ combined facets)
    ├── Already indexed in volume → canonical to the unfiltered category, wait, then block
    └── Not indexed → robots.txt Disallow the parameter patterns, AND render facet
        controls in ways that don't mint crawlable <a href> permutations.
```

- **Prevention:** every new query parameter answers the facet question at design review; cap combinable facets in crawlable links; internal search results always `Disallow` + `noindex` (Google's own guidance — they're the canonical crawl trap).

### 3. Important pages buried too deep

Click depth — hops from the homepage — is a strong crawl-priority and perceived-importance signal. Pages at depth 5+ get crawled rarely and rank as afterthoughts. The classic version: paginated category archives as the *only* path to older products, so product #400 sits at depth 20 behind "next page" links. Second classic: the redesign that trims the nav "for cleanliness" and silently pushes entire sections from depth 2 to depth 6 — traffic sags over the following weeks and nobody connects it to the redesign.

- **Detection:** `site-crawl-auditor` computes the depth distribution; sort your revenue/priority pages by depth and look for anything important at ≥4.
- **Fix:** hub pages (category and sub-category pages that link generously downward), related-item cross-links, curated "featured/popular" modules on high-depth-0/1 pages, HTML sitemap for the long tail. To surface a specific buried winner: link it from the closest depth-1/2 hub.
- **Prevention:** depth budget in the architecture doc ("no priority-1 page deeper than 3"); re-run the depth check after any nav or template change (it's part of the `site-crawl-auditor` standing brief).

Internal-link quality rules while you're at it: descriptive anchor text (the anchor is a relevance signal — "view product" teaches Google nothing), links in HTML `<a href>` (not JS click handlers — see [`rendering-strategy.md`](rendering-strategy.md) §links), and no site-wide footer link dumps to 200 URLs (dilutes rather than concentrates).

### 4. Pagination that isn't crawlable or creates traps

Current reality (post-2019): **`rel=prev/next` does nothing for Google.** What works:

- Every page in the sequence is a real URL (`?page=2` or `/page/2`), self-canonical. **Never canonical page 2+ to page 1** — that tells Google to ignore everything only reachable from page 2 onward, orphaning the deep items. This is one of the most common serious mistakes I've audited.
- Page links are plain `<a href>` anchors. "Load more" buttons and infinite scroll driven by `fetch()` are invisible paths — Googlebot does not click buttons or scroll-trigger your IntersectionObserver reliably. Pattern: infinite scroll for users, paginated `<a href>` links (in the DOM, even if visually de-emphasized) for crawlers.
- Don't rely on pagination as the only path to items (see depth, above). Items should also be reachable via sub-category hubs or cross-links.
- Optionally `noindex` pages 2+ *only if* items are reachable another way; default is to leave them indexable and thin.

- **Detection:** crawl with JS disabled — can you reach page 2 and every item? GSC "Discovered – currently not indexed" swelling with deep-catalog items.
- **Prevention:** pagination pattern chosen from this doc at design time; the JS-disabled reachability check in the release checklist for any listing-page rework.

## Decision summary for a new site

Covered end-to-end in [`../building-from-scratch/README.md`](../building-from-scratch/README.md), but the order of operations: (1) enumerate the page types and the search intent each serves; (2) design the URL scheme (write it down); (3) design the hub hierarchy so every priority page is ≤3 deep; (4) set the facet/parameter policy; (5) pick the pagination pattern; (6) only then let anyone build routes.

## Prevention stack (summary)

| Layer | Mechanism |
|---|---|
| Design review | Written URL scheme; facet policy per parameter; depth budget |
| CI | Single URL-builder function; internal links emit canonical forms only |
| Release checklist | JS-disabled reachability check for listing/nav changes |
| Quarterly | `site-crawl-auditor`: depth distribution, variant clusters, trap detection, orphan diff |
