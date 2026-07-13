# Monitoring & Diagnosis — Triaging Traffic Drops and Catching Regressions Before Google Does

**Date:** 2026-07-13. **Reflects:** Google Search Console feature set and Google's confirmed-update communication practices as of mid-2026. Core tier — full depth.
**Related:** this is the shared diagnostic spine — every principles doc's "detection" column lands here. Heavy-data investigation dispatches to [`../agents/site-crawl-auditor.md`](../agents/site-crawl-auditor.md) and [`../agents/log-file-analyzer.md`](../agents/log-file-analyzer.md). Full-site assessment: [`../auditing-existing-sites/README.md`](../auditing-existing-sites/README.md).

## The mental model

When organic traffic drops, there are only five root-cause families, and they have different fingerprints:

1. **Technical regression you shipped** (noindex, robots, canonical, rendering, redirect bug) — *diagnosable and fixable; time-correlates with a deploy.*
2. **Algorithm update** — *not fixable by engineering tickets; time-correlates with industry-wide tremors.*
3. **Manual action or security flag** — *announced to you in GSC; zero detective work needed, check first because it's one click.*
4. **SERP-feature/competitive shift** — rankings held, clicks fell (AI overviews, new SERP features, a competitor overtaking) — *impressions/position data distinguishes it.*
5. **Demand shift** — seasonality, news cycle; *impressions fell with rankings intact.*

The cardinal diagnostic sin is anchoring on #2 because it's the explanation that assigns no blame. In twenty years of "the algorithm hit us" escalations, the majority were #1 wearing #2 as a costume. The triage below exists to make you *earn* the algorithm conclusion by eliminating the others.

## The traffic-drop triage (run in order; most drops resolve by step 4)

**Step 0 — Scope the drop (30 min).** In GSC Performance: which pages, which queries, which date, which device, which country? Cliff or slide? Clicks down with impressions steady (CTR/feature problem) or impressions down too (ranking/indexing problem)? Segment before theorizing — "traffic is down" is not a symptom, "product pages lost UK mobile impressions starting Tuesday" is. Cross-check analytics to confirm it's *organic search* traffic and not a tagging/analytics breakage (yes, check — I've triaged two "SEO emergencies" that were a GTM deploy breaking attribution).

**Step 1 — The one-click checks (5 min).** GSC Manual Actions and Security Issues. Empty? Move on.

**Step 2 — The ten-second technical checks on the worst-hit URLs (15 min).**
```
curl -sI <url>                    # status? redirect? X-Robots-Tag?
curl -s <url> | grep -iE 'noindex|canonical'   # meta robots, canonical target
curl -s https://site.com/robots.txt            # anything new disallowed?
```
Then GSC URL Inspection on 2–3 affected URLs: indexed? last crawl? Google-selected canonical = yours? Rendered HTML contains the content? This step catches the entire accidental-noindex/robots/canonical class from [`crawlability-indexability.md`](crawlability-indexability.md).

**Step 3 — Correlate with the deploy log (30 min).** Line up the drop date (minus a crawl-lag allowance of days-to-weeks — a regression shipped on the 1st can look like an "update" on the 12th; check GSC crawl stats for when Googlebot actually saw the change) against deploys, CDN/edge config changes, robots.txt history, CMS/plugin updates, and tag-manager publishes. Anything touching head templates, middleware, redirects, or rendering flags in the window is a prime suspect — diff it with [`../skills/indexability-regression-reviewer/SKILL.md`](../skills/indexability-regression-reviewer/SKILL.md) logic.

**Step 4 — Indexation trend (15 min).** GSC Page indexing report: is the indexed count falling? Which exclusion bucket is growing? ("Excluded by noindex" = you shipped it; "Crawled, currently not indexed" swelling = quality/duplication; "Discovered, not indexed" = crawl budget/architecture — see the respective principles docs.)

**Step 5 — Only now, the algorithm question (30 min).** Evidence *for* an update: drop date matches a Google-confirmed update (Search Status Dashboard) or industry tracker volatility (Semrush Sensor, similar); competitors in your vertical moved too; the drop is query-type-shaped (e.g., all informational queries) rather than template-shaped; steps 1–4 came up clean. An update conclusion **requires** that last clause. Response to a real update: it's a content/quality/relevance problem — reassess against the update's stated target (helpful content, spam, reviews); there is no technical hotfix, and shipping panicked technical churn during an update rollout adds noise you'll regret.

**Step 6 — If still unexplained: the heavy tools.** Dispatch `log-file-analyzer` (did crawler behavior change? when? which sections?) and `site-crawl-auditor` (current-state survey vs last baseline). SERP-feature shift check: eyeball the actual SERPs for your head terms — position 3 behind an AI overview is not the position 3 of 2023.

**Discipline for the whole exercise:** change one thing at a time and date-stamp everything you ship — recovery attribution is impossible if you fired five fixes in one week. Recovery from a fixed technical regression follows the recrawl curve (days for head pages, weeks for tail); set that expectation in the first status update.

## The monitoring stack (catch it before the traffic graph does)

A drop you find in the traffic graph is 1–4 weeks old (crawl lag + reporting lag). The stack below finds it in minutes to days. Ordered by value-per-effort:

1. **Synthetic indexability probe (build this first; it's an afternoon).** Every hour(ish), fetch ~20 representative critical URLs; assert: HTTP 200, no `noindex` (meta or header), canonical equals expected, title/H1 present, primary-content marker present in raw HTML, robots.txt hash unchanged (alert on *any* robots.txt change — it should be rare and deliberate). Alert to the on-call channel. This one probe catches the majority of career-limiting SEO incidents on day zero instead of week three.
2. **CI gates** — the per-area gates specified in each principles doc (template indexability tests, no-JS render check, structured-data validation, redirect-map tests). Prevention beats detection.
3. **GSC weekly review ritual (30 min, calendared, actually done):** Page indexing trend; Performance week-over-week by page group; Manual actions/Security (one click); CWV report (mobile); enhancement reports for your structured-data types. Trends, not snapshots — every GSC report is only meaningful against its own history, so export/API-archive the data monthly (GSC retains 16 months; migrations and lawsuits care about longer).
4. **Rank tracking on a fixed basket** of head + representative tail terms, daily, mobile — the earliest *external* signal, noisy day-to-day, meaningful over weeks.
5. **Quarterly baselines:** `site-crawl-auditor` full survey and `log-file-analyzer` run, diffed against the previous quarter — architecture drift, orphan accumulation, and crawl-budget shift are slow diseases visible only in longitudinal comparison.

## Failure modes of the monitoring itself

- **Snapshot blindness:** every number above is only meaningful as a trend. "Indexed: 48,231" is neither good nor bad until you know last month's.
- **Alert fatigue → dead probe:** the synthetic probe must be near-zero-false-positive (assert on stable invariants, not volatile content) or it gets muted, and a muted probe is worse than none because everyone believes coverage exists.
- **Monitoring the lab number:** dashboards showing Lighthouse scores instead of field p75 — see [`core-web-vitals-seo.md`](core-web-vitals-seo.md) §1.
- **Nobody owns the ritual:** GSC review without a named owner and calendar slot stops happening within a quarter. Name the owner in the runbook.

## Prevention stack (summary)

| Cadence | Mechanism |
|---|---|
| Continuous | Synthetic indexability probe + robots.txt change alert |
| Per deploy | CI gates from each principles doc; post-deploy curl of critical URLs |
| Daily | Rank tracker on fixed basket (mobile) |
| Weekly | GSC ritual: indexing trend, performance, manual actions, CWV, enhancements |
| Monthly | GSC data export/archive |
| Quarterly | Crawl + log baselines via subagents, diffed longitudinally |
