# Site Migrations — Common Pitfalls

**Date:** 2026-07-13. **Reflects:** Google site-move documentation as of mid-2026. Companion to [`production-patterns.md`](production-patterns.md).

Each pitfall: failure mode → detection → fix → prevention.

## 1. Incomplete redirect map (the permanent-loss pitfall)

The inventory was "sitemap + nav crawl," missing legacy URLs that live only in server logs and backlink profiles — which are precisely the URLs with the oldest, strongest links. They 404 at cutover; their equity evaporates on Google's recrawl schedule; by the time the 404 report surfaces them, weeks of signal are gone and some never returns.

- **Detection:** post-cutover 404 log watch on the old host (daily, weeks 1–4); GSC "Not found (404)" report on the old property.
- **Fix:** patch map rows the moment 404s appear — redirect equity decays but late is far better than never.
- **Prevention:** the seven-source inventory union in production-patterns Phase 1; completeness asserted against that inventory in CI, not against "the pages we remembered."

## 2. Mass-redirecting everything to the homepage

Feels like "preserving" traffic; Google classifies irrelevant redirects as soft-404s and passes little or nothing. Users bounce, and the 404 report shows clean while equity quietly dies.

- **Detection:** GSC "Soft 404" bucket growth post-migration; redirect map review — any target receiving >2–3% of all rows is a red flag.
- **Fix/prevention:** relevance rule from Phase 2 — equivalent page, else closest category, else honest 410. The `redirect-map-generator` skill flags homepage-concentration mechanically.

## 3. 302s where 301s were meant

Platform defaults (many CDN and framework redirect helpers default to 302/307) ship temporary redirects for a permanent move. Google *eventually* treats persistent 302s as permanent, but "eventually" costs you weeks of consolidated signal during the exact window the migration is being judged.

- **Detection:** `curl -sI` the top-value rows; automated map verification asserts the status code, not just the destination.
- **Prevention:** status code is part of the map spec and the CI assertion.

## 4. Redirect chains and loops across migration generations

2019 moved `/old → /2019`, 2023 moved `/2019 → /2023`, today maps `/2023 → /new`: a visitor from a 2018 backlink now hops three times — or loops, when today's map accidentally reverses an old rule. Each hop wastes crawl, adds latency, and leaks signal; Google stops following long chains entirely (documented limit is ~10 hops per crawl attempt, but degradation starts immediately).

- **Detection:** run the *historical* URL inventory (all generations) through the new config; assert ≤1 hop, no loops.
- **Fix:** collapse — every historical URL points directly at its final destination in the new config.
- **Prevention:** redirect config is versioned data with the collapse test in CI; each migration's map generation includes all prior maps as input (Phase 1 inventory includes "existing redirect config").

## 5. Shipping staging's indexability state to production

Cutover day: new platform goes live with staging's `Disallow: /` robots.txt, or site-wide noindex, or HTTP auth still enabled for some paths. The migration looks fine in the browser; Google is locked out of the *destination* of every redirect. Double damage: old URLs redirect away, new URLs can't index.

- **Detection:** cutover-hour checklist: curl robots.txt, meta robots, X-Robots-Tag, and auth on the new host's top templates. The synthetic probe ([`monitoring-diagnosis.md`](../../principles/monitoring-diagnosis.md)) repointed at new URLs catches it within the hour.
- **Prevention:** Phase 3 staging-leak sweep; robots.txt/noindex state driven by config that cannot travel from staging to prod (see the env-var war story in [`crawlability-indexability.md`](../../principles/crawlability-indexability.md) §1 — same disease, worst possible day).

## 6. Internal references still pointing at old URLs

Redirects catch external links; but the new site's own nav, canonicals, hreflang, sitemaps, and structured data still emitting old URLs means every internal click and every signal routes through a redirect indefinitely — chronic crawl waste and mixed canonical signals ([`../international-seo/common-pitfalls.md`](../international-seo/common-pitfalls.md) #3 is this pitfall's hreflang face).

- **Detection:** post-cutover crawl: zero internal links/canonicals/sitemap entries should return 3xx. The `site-crawl-auditor` reports "internal 3xx edges" as a standing metric.
- **Prevention:** Phase 3 "update everything that emits URLs" checklist; the one-URL-builder pattern makes this a one-line change instead of a hunt.

## 7. Letting the old domain lapse

Renewal quietly not paid at month 9; every backlink ever earned now resolves to a parking page (or a squatter — old domains with link profiles get bought deliberately). The equity loss is total and, after the squatter, unrecoverable.

- **Prevention:** old domain on auto-renew under central ownership with a documented multi-year retention decision (minimum 1 year by Google guidance; realistically as long as meaningful links exist — check the backlink profile annually before even discussing lapse).

## 8. Migrating during peak season / stacking migrations

The turbulence window is real even in perfect migrations. Cutting over in November for a retailer, or bundling domain + structure + platform + redesign, converts a survivable dip into an unattributable crisis.

- **Prevention:** schedule cutover in the traffic trough; one variable per migration when the business allows (production-patterns law #2); when variables must stack, stack the verification too — full parity crawl, doubled monitoring window, and a named rollback decision point.
