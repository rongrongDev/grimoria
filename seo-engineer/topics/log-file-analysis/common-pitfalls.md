# Log-File Analysis — Common Pitfalls

**Date:** 2026-07-13. Companion to [`production-patterns.md`](production-patterns.md).

Each pitfall: failure mode → detection → fix → prevention.

## 1. Trusting user-agent strings

Half the "Googlebot" in a raw log can be scrapers wearing the costume — every conclusion drawn from unverified lines (crawl volume, budget distribution, "Google hammered us Tuesday") is inflated or outright wrong.

- **Detection/fix:** IP-verify against Google's published ranges before any aggregation (Pattern 2). If verified volume is much lower than UA-filtered volume, you also just found a scraping problem — separate report.
- **Prevention:** verification is step one of the analyzer agent, not an optional flag.

## 2. Analyzing origin logs behind a CDN

The CDN answers most requests; origin logs show the cache-miss minority, skewed toward dynamic/uncacheable URLs. Conclusion drawn: "Googlebot barely crawls our static pages" — false; the CDN served them.

- **Detection:** compare origin log volume against CDN request metrics; a large gap means you're looking at the wrong layer.
- **Fix/prevention:** edge logs only (Pattern 1). If edge logging is off, turning it on is the first deliverable of any log project.

## 3. Sampled, truncated, or short-window data treated as complete

CDN log sampling (some products sample by default), query strings stripped by the logging config, or a 7-day window used for trend claims. Parameter waste disappears when queries are stripped; weekly crawl cycles alias into fake "drops" on short windows.

- **Detection:** check the logging product's sampling config; grep for `?` in the log — near-zero on a faceted site means truncation.
- **Prevention:** Pattern 1 field/retention requirements verified once, in writing, before the first analysis is believed.

## 4. Averages hiding the story

"Googlebot crawls 40K URLs/day, average response 220ms" — and meanwhile the entire crawl is 90% one parameter pattern, or p95 response for product pages is 4s (crawl-rate suppressor). Averages across page types are how logs are made to say nothing.

- **Fix/prevention:** always segment by page-type bucket and look at distributions (the Pattern 3 report shape). An unsegmented log report should not pass review.

## 5. Timezone and window misalignment when correlating

Log timestamps in UTC, deploys logged in local time, GSC dates in Pacific: the "regression the day after the deploy" is actually the same day, or the correlation you're proud of is off by one and false.

- **Prevention:** normalize everything to UTC before correlation; state the timezone in the report header (the analyzer agent's output format requires it).

## 6. Confusing crawl-rate changes with site health changes

Googlebot volume dropped 40% — panic. But crawl rate falls for benign reasons too: fewer new/changed pages (nothing to recrawl), efficient 304 responses, or Google-side capacity shifts. Conversely a crawl *spike* often just means you shipped a sitemap or a URL-space explosion — the spike into parameter URLs is the alarming version.

- **Detection:** never read volume alone; read volume × destination × status. Volume down but priority-page freshness stable = benign. Volume down after sustained 5xx/timeouts = you suppressed it. Volume up into junk buckets = crawl trap.
- **Prevention:** the quarterly baseline gives every number a longitudinal denominator — single-window numbers get misread; diffs rarely do.

## 7. Drawing ranking conclusions from crawl data

"Googlebot crawls this page daily, why doesn't it rank?" — crawl frequency reflects change-detection economics, not ranking favor. Logs diagnose *crawlability and budget*; they say nothing about quality or relevance. Presenting crawl stats as ranking evidence erodes the report's credibility with anyone who knows better.

- **Prevention:** scope statement in every log report: what logs can and cannot conclude (the analyzer agent's template includes it).
