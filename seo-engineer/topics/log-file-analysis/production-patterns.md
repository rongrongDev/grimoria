# Log-File Analysis for Crawler Behavior — Production Patterns

**Date:** 2026-07-13. **Reflects:** Googlebot user-agent strings and published IP-range verification method as of mid-2026. Extended tier: patterns + [`common-pitfalls.md`](common-pitfalls.md).
**Related:** the heavy execution of this doc is [`../../agents/log-file-analyzer.md`](../../agents/log-file-analyzer.md) — dispatch it rather than pasting a million log lines into a working context. Findings feed [`../../principles/crawlability-indexability.md`](../../principles/crawlability-indexability.md) §crawl-budget and [`../../principles/site-architecture.md`](../../principles/site-architecture.md).

## The mental model

Server logs are the only *ground truth* about crawler behavior. GSC crawl stats are sampled and aggregated; crawling tools show what a crawler *could* do; logs show what Googlebot *actually did* — every URL, every timestamp, every response code. Every other data source is a model; the log is the reality. The recurring audit surprise for twenty years: the gap between where teams *think* crawl budget goes and where the logs say it goes is never small.

Use logs to answer four questions: (1) *Where does crawl budget actually go?* (2) *Are my important pages crawled, and how fresh?* (3) *What is the crawler wasting time on?* (4) *Did crawler behavior change, and when?* — that last one dates regressions more precisely than any other source.

## Pattern 1: Getting logs you can actually use

- You need the **edge** logs — CDN/load-balancer level — not the origin's. Cached responses never reach origin; origin-only logs can miss most of Googlebot.
- Required fields: timestamp, method, full URL+query, status, user-agent, client IP, response bytes, and ideally response time. Query strings intact — parameter waste is a primary finding and truncated URLs hide it.
- Retention ≥ 90 days (a quarter of trend; migrations want more — see [`../site-migrations/production-patterns.md`](../site-migrations/production-patterns.md) Phase 1, which consumes these logs).
- Getting them is usually the hard part: CDN log exports (CloudFront → S3, Cloudflare Logpush, etc.) into cheap object storage. Solve this *before* you need it; the week you need logs is the week after the incident.

## Pattern 2: Verify the bot before you trust the line

Anyone can send `User-Agent: Googlebot` — scrapers do, constantly, and unverified analysis inflates every number. Verification: filter candidate lines by UA, then confirm the client IP against Google's published crawler IP ranges (`googlebot.json` from Google's documented endpoint; equivalents exist for Bingbot). Reverse-DNS→forward-DNS is the older method; the published ranges are faster at scale. The [`log-file-analyzer`](../../agents/log-file-analyzer.md) does this as step one, always. Segment verified Googlebot by variant (smartphone vs desktop vs image/ads) — smartphone Googlebot should dominate ([`../mobile-first-indexing/`](../mobile-first-indexing/production-patterns.md)).

## Pattern 3: The standard aggregations (the report that answers the four questions)

Over a fixed window (30/90 days), all URLs bucketed by **page type** (product / category / article / parameterized / assets / other — a regex classification you write once per site):

1. **Crawl distribution:** verified-Googlebot hits per page-type bucket, as share of total. The headline finding is always here — e.g. "41% of crawl goes to faceted parameter URLs that are Disallowed-in-intent but not in fact."
2. **Status-code mix per bucket:** 200s good; persistent 404s (map gaps, dead internal links), 301s (internal links through redirects — [`../site-migrations/common-pitfalls.md`](../site-migrations/common-pitfalls.md) #6), 5xx (crawl-rate suppressor: sustained 5xx makes Google *slow down site-wide*), and 304 share if you serve conditional responses.
3. **Coverage & freshness:** join against the sitemap — what % of sitemap URLs got ≥1 crawl in the window (coverage), and days-since-last-crawl distribution for priority pages (freshness). Priority pages uncrawled in 30+ days = architecture or budget problem.
4. **Trend/anomaly:** daily verified-crawl volume plotted over the window; step changes align with deploys, robots.txt edits, or Google-side events — this is the regression-dating tool ([`monitoring-diagnosis.md`](../../principles/monitoring-diagnosis.md) step 6).
5. **Waste list:** top-N crawled URLs that are non-canonical, parameterized, redirecting, or erroring — the direct input to crawl-budget fixes.

Tooling: `awk`/`grep`/`sort` handles tens of millions of lines fine (patterns in the analyzer agent); above that, a DuckDB/ClickHouse one-liner over the object-storage export. You do not need a commercial log-analysis SaaS to get the report above, though they're pleasant.

## Pattern 4: When to run it

- **Quarterly baseline** diffed against last quarter (slow diseases: budget drift, section decay) — part of the standing monitoring stack.
- **Migration bracket:** 90 days pre (inventory input) and daily watch 4 weeks post (404/redirect verification).
- **Incident forensics:** any unexplained traffic drop that survives triage steps 0–5 ([`monitoring-diagnosis.md`](../../principles/monitoring-diagnosis.md)) — the log answers "did Google's behavior change, and precisely when?"
- **Before crawl-budget work:** never optimize crawl budget from assumptions; the logs decide whether you even have a budget problem (most sites under ~500K URLs don't).
