# Auditing an Existing Site for Technical SEO Risk — The Bounded-Time Playbook

**Date:** 2026-07-13. **Reflects:** Google Search Central guidance as of mid-2026. This is capability B: take an unfamiliar site and produce four artifacts — **(1) crawlability/indexability audit, (2) structured-data validity review, (3) Core Web Vitals risk assessment, (4) prioritized remediation plan.** Time-boxed at each tier; an audit that never ships is worth less than a rough one that does.

**Division of labor:** you (or the coordinating agent) run this playbook and own judgment and the final report; the bulk data collection is dispatched — [`../agents/site-crawl-auditor.md`](../agents/site-crawl-auditor.md) for the crawl, [`../agents/log-file-analyzer.md`](../agents/log-file-analyzer.md) if logs are available. Orchestration patterns: [`../orchestration/README.md`](../orchestration/README.md).

**Access tiers — state yours in the report header, it bounds every claim:**
- **Tier 1 (public only):** crawl + public tools. You can find most crawlability, architecture, schema, and rendering issues.
- **Tier 2 (+ GSC):** adds index-state ground truth, manual actions, CWV field data, query data. Always ask for GSC access; it converts guesses to facts.
- **Tier 3 (+ logs + codebase):** adds crawler-behavior truth and root-cause-in-code. Required for crawl-budget claims.

---

## Hour 0–1: Reconnaissance (by hand, before any tooling)

The first hour is manual on purpose — tools inherit your assumptions; this hour forms them.

1. `curl -s https://site/robots.txt` — read the whole thing. Surprising Disallows? Sitemap line? (A shocking fraction of audits find a smoking gun here in minute one.)
2. `curl -sI` the homepage and 3–5 money pages: status, redirect hops, `X-Robots-Tag`, cache headers.
3. `curl -s` (no JS!) the same pages: is the content in the raw HTML? Title? canonical? meta robots? nav as `<a href>`? This classifies the site's rendering posture immediately ([`../principles/rendering-strategy.md`](../principles/rendering-strategy.md)).
4. `site:domain.com` in Google: indexed page count sanity, weird indexed URLs (parameters? staging subdomains? http duplicates?), and what titles/snippets look like in the wild.
5. Sitemap fetch: does it exist, parse, and do 5 sampled URLs return canonical 200s?
6. If Tier 2: **GSC Manual Actions + Security first** (one click, changes everything), then Page indexing report shape.

Write down your three biggest suspicions now. The rest of the audit confirms or kills them.

## Hour 1–2: Dispatch the heavy collection (runs while you work)

- **`site-crawl-auditor`** with the site root + sitemap URL: returns orphan set, depth distribution, canonical conflicts, noindex inventory, duplicate-URL clusters, crawl traps, internal-3xx/4xx edges, hreflang closure, JS-on/off content diff.
- **`log-file-analyzer`** (Tier 3): returns crawl-budget distribution, verified-bot coverage/freshness for priority pages, waste list, status mix, trend anomalies.
- Meanwhile, you do Hours 2–4.

## Hour 2–3: Artifact 2 — Structured-data validity review

Per [`../principles/structured-data.md`](../principles/structured-data.md), sampling one exemplar per page template (get the template list from the site's visible page types):

- Extract rendered JSON-LD (mobile UA — [`../topics/mobile-first-indexing/common-pitfalls.md`](../topics/mobile-first-indexing/common-pitfalls.md) #3); validate: parses, types recognized, Google required properties present ([`../skills/structured-data-validator/SKILL.md`](../skills/structured-data-validator/SKILL.md) is this procedure).
- **The accuracy pass** — markup vs visible content: ratings that exist on-page? prices matching? availability honest? This is the manual-action risk check no validator does; a "lying markup" finding outranks any validation error in the report.
- Gap pass: money-page types with no markup where a live rich result exists (verify current eligibility — types churn).
- Tier 2: GSC enhancement reports for error trends the sample missed.

## Hour 3–4: Artifact 3 — CWV risk assessment

Per [`../principles/core-web-vitals-seo.md`](../principles/core-web-vitals-seo.md) — field data only, mobile first:

- CrUX via PageSpeed Insights (or GSC CWV report, Tier 2) for home + top templates: p75 LCP/INP/CLS, mobile. Classify each page group: Good / Needs improvement / **Poor (this is the only SEO-urgent bucket)**.
- For Poor groups only: one PSI lab diagnosis each to name the likely mechanism (LCP element, blocking scripts, shift source) — diagnosis depth belongs to [`../../web-dev/principles/performance.md`](../../web-dev/principles/performance.md), not this audit.
- No CrUX data → say so and deprioritize CWV in the plan (low-traffic sites aren't meaningfully affected by the signal).
- Note whether the site has RUM at all; "no field-data pipeline" is itself a finding.

## Hour 4–6: Artifact 1 — Crawlability/indexability audit (synthesis)

Merge your recon, the crawl-auditor return, logs, and GSC into the core artifact, organized by the four gates ([`../principles/crawlability-indexability.md`](../principles/crawlability-indexability.md)):

- **Discovery:** orphan set; sitemap↔crawl set-difference; internal-link depth of priority pages; pagination reachability.
- **Crawl:** robots.txt review; trap/parameter waste (log-verified if Tier 3, crawl-inferred otherwise — label which); internal redirect/404 edges; blocked assets.
- **Render:** JS-on/off diff verdict per template; hydration red flags; links-that-aren't-links.
- **Index:** noindex inventory vs intent (anything noindexed that clearly shouldn't be — the highest-severity finding class); canonical conflicts and "Google chose different canonical" (Tier 2); duplicate clusters splitting signal; hreflang failures.

For each finding: **evidence (URL + observed value), affected scope (how many pages), severity, and the principles-doc reference for the fix.** Findings without evidence and scope are opinions; this discipline is what separates an audit from a blog post.

## Hour 6–7: Artifact 4 — Prioritized remediation plan

Order by `(ranking-signal impact × affected-page value) / engineering effort`, with one hard rule: **anything blocking the index gates (noindex-that-shouldn't-be, robots lockouts, canonical-to-wrong-page, CSR-invisible money content) outranks everything else including all CWV work** — a fast page that isn't indexed ranks nowhere. Then typically: signal consolidation (duplicates, redirects, orphans) → architecture (depth, hubs, pagination) → structured data (accuracy risks first, then gaps) → CWV Poor groups → hygiene. Each item: what, why (link the doc), effort estimate, expected-effect timeframe (be honest about recrawl lag — weeks, not days), and how to verify it worked. Cap the plan at ~10 items; a 40-item plan is a filing cabinet, and the site's team will do the top 5 anyway — make them the right 5.

**Also always include:** the prevention delta — which of the standard gates ([`monitoring-diagnosis.md`](../principles/monitoring-diagnosis.md) §stack: synthetic probe, CI gates, GSC ritual, baselines) the site is missing. An audit that fixes today's findings without installing the tripwires just schedules the next audit.

## Report skeleton

```
# Technical SEO Audit: <site> — <date>
Access tier: <1/2/3> | Guideline basis: <mid-2026> | Time spent: <n>h
Coverage: <what was examined / what was NOT>          ← honesty section, mandatory
## Top findings (≤5, one line each: finding — scope — severity)
## Artifact 1: Crawlability & indexability (by gate: discover/crawl/render/index)
## Artifact 2: Structured data (validity | accuracy/manual-action risk | gaps)
## Artifact 3: CWV risk (field p75 mobile per group; Poor groups + mechanism)
## Artifact 4: Remediation plan (≤10 items, ordered, verifiable)
## Prevention delta (missing gates & monitoring)
## Appendix: evidence tables from subagent runs
```
