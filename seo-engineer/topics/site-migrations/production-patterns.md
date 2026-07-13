# Site Migrations — Production Patterns

**Date:** 2026-07-13. **Reflects:** Google site-move documentation as of mid-2026. Extended tier: patterns + [`common-pitfalls.md`](common-pitfalls.md).
**Related:** the redirect map is generated/verified by [`../../skills/redirect-map-generator/SKILL.md`](../../skills/redirect-map-generator/SKILL.md); pre/post crawl comparison by [`../../agents/site-crawl-auditor.md`](../../agents/site-crawl-auditor.md); rendering-downgrade risk during replatforms by [`../../principles/rendering-strategy.md`](../../principles/rendering-strategy.md) §3.

## The mental model

"Migration" = any change that alters URLs or how content is served: domain change, https move, URL-structure redesign, replatforming, CMS swap, or several at once. Ranking signal is attached to *URLs*; a migration is an exercise in **transferring signal from every old URL to exactly one new URL without dropping any**. Done right, the traffic dip is small (expect some weeks of turbulence — Google must recrawl and re-evaluate everything) and recovers fully. Done wrong, the loss is permanent, because signal that 404s for months doesn't wait around.

Two governing laws:

1. **The redirect map is the migration.** Everything else is logistics. A migration with a complete, correct, tested, one-hop 301 map survives almost any other mistake; a migration with a 90% map loses ~10% of its equity forever, and the missing 10% is always disproportionately old URLs with the most accumulated links.
2. **Change one variable if you possibly can.** Domain + URL structure + platform + design in one cutover means a traffic drop is undiagnosable (which change caused it?). Sequence when the business allows; when it doesn't, triple the verification.

## The pattern, phase by phase

### Phase 1 — Inventory (weeks before; this is where migrations are won)

Build the **complete** old-URL inventory. No single source is complete; union all of them:

- Full crawl of the live site (`site-crawl-auditor`)
- XML sitemaps
- Server logs, 90+ days — catches URLs *only bots and deep links still visit* ([`../log-file-analysis/`](../log-file-analysis/production-patterns.md))
- GSC: all indexed URLs (Performance export + indexing report), and top-linked pages
- Analytics: every URL with a session in 12 months
- Backlink data (Ahrefs/Semrush/Majestic export): every URL with external links — these carry the equity; a URL with 500 referring domains missing from the map is a five-figure mistake
- Existing redirect config from previous migrations — **old redirects must keep working through the new system** (see pitfall #4: chains)

Deduplicate, canonicalize, and rank by value (traffic × links). This inventory is the denominator for every completeness claim you'll make.

### Phase 2 — The redirect map

One row per inventory URL: `old URL → new URL (301) | 410 | leave (unchanged)`. Rules, enforced by the [`redirect-map-generator`](../../skills/redirect-map-generator/SKILL.md) skill:

- **One hop.** old → final new URL directly, including through prior migrations' redirects (collapse chains now).
- **Relevance.** Redirect to the *equivalent* page. Mass-redirecting discontinued pages to the homepage is treated as soft-404 and passes ~nothing; no equivalent → closest category page, or an honest 410.
- **Rule-based where structure allows** (`/blog/(.*) → /articles/$1`), explicit rows for exceptions; rules get *tested against the full inventory*, not eyeballed.
- **Parameters and edge cases:** decide the fate of query strings, uppercase variants, trailing slashes — the crawler will present all of them.

### Phase 3 — Pre-cutover verification (on staging)

- Run the full inventory through the staging redirect config: assert every row lands on a 200, in one hop, at the mapped target.
- Parallel crawl old vs new (JS-disabled included): titles, canonicals, meta robots, structured data, hreflang, content parity per template. Replatforms sneak in rendering downgrades exactly here ([`rendering-strategy.md`](../../principles/rendering-strategy.md) §3).
- **The staging-leak sweep:** new site's robots.txt, noindex tags, and staging-auth remnants. Shipping staging's `Disallow: /` on cutover day is the single most classic migration wound (see [`../../principles/crawlability-indexability.md`](../../principles/crawlability-indexability.md) war story class).
- Update everything that emits URLs: sitemaps (new URLs), canonicals, hreflang graph, internal links (must point directly at new URLs — internal links through redirects bleed crawl), structured-data URLs, RSS, paid-landing pages.

### Phase 4 — Cutover

- Ship redirects + new site atomically as possible; verify the top-100-value URLs by hand (curl) within the hour.
- GSC: verify the new property (if domain change: Change of Address tool), submit new sitemaps. Keep a sitemap of *old* URLs temporarily submitted too — it accelerates Google's discovery of the redirects (counterintuitive but documented practice).
- Keep the old domain/certificates/hosting alive and redirecting for **years, not months** — Google's own guidance is at least 1 year; equity-carrying links persist for a decade. The day the old domain lapses, every remaining external link 404s.

### Phase 5 — Post-cutover monitoring (weeks 1–12)

- Synthetic probe repointed at new URLs day one ([`monitoring-diagnosis.md`](../../principles/monitoring-diagnosis.md)).
- Daily for two weeks: GSC crawl stats and Page indexing on both properties (old property's indexed count should drain as the new one fills — a stalled drain means redirects aren't being seen); log watch for 404 spikes on the old host = inventory gaps → patch the map *immediately* while equity is still warm.
- Expect turbulence for several weeks even in a perfect migration; escalate only if week-4 traffic hasn't begun converging or specific page groups cratered (then: triage per [`monitoring-diagnosis.md`](../../principles/monitoring-diagnosis.md), suspecting map gaps and template regressions first).

## The war story that justifies all of the above

Two migrations, same year, same vertical. Client A replatformed with the full inventory-union (logs surfaced 30K forgotten-but-linked legacy URLs), a tested one-hop map, and a staging parity crawl that caught a template-wide canonical bug before cutover. Traffic dipped 8% for three weeks and recovered to above baseline by week 8. Client B (came to me after) did "the sitemap plus the nav" as their inventory, redirected discontinued products to the homepage, and let the old domain lapse at month 7. They permanently lost roughly a third of organic revenue, and the post-mortem could name the mechanism for every lost cohort: unmapped legacy URLs (404), homepage soft-404s (equity dropped), and dead-domain link rot. Nothing about the outcome was luck in either direction.
