# Rendering Strategy for Crawlers — SSR, SSG, CSR, and How Indexing Actually Sees Your Pages

**Date:** 2026-07-13. **Reflects:** Googlebot evergreen-Chromium rendering as documented mid-2026; dynamic rendering officially deprecated as a recommendation since 2022. Core tier — full depth.
**Related:** this doc covers *search consequences* of rendering choices. For implementation mechanics — how SSR/SSG/hydration actually work in each framework — go to [`../../web-dev/frameworks/`](../../web-dev/frameworks/) (`nextjs/`, `react/`, `vue-nuxt/`, `svelte-sveltekit/`, `astro/`) and [`../../web-dev/principles/performance.md`](../../web-dev/principles/performance.md). CWV interaction: [`core-web-vitals-seo.md`](core-web-vitals-seo.md).

## The mental model

Googlebot processes pages in two phases: an immediate **HTML phase** (fetch, parse, extract links and metadata from the raw response) and a deferred **render phase** (execute JS in a headless evergreen Chromium, re-extract). Everything else in this doc follows from four facts about that pipeline:

1. **The render phase is deferred and not guaranteed.** It's minutes on strong sites and can be much longer elsewhere; render capacity is budgeted per site. Content that exists only after JS runs is indexed later, less reliably, and refreshed less often than content in the initial HTML.
2. **Other consumers may not render at all.** Bing renders inconsistently; most AI crawlers, social link unfurlers, and smaller engines read raw HTML only. CSR-only content is invisible to that entire tier.
3. **Rendering is stateless and impatient.** No clicks, no scrolling, no persistent storage between pages, aggressive timeouts, and (still) roughly a Chrome-on-a-slow-connection resource budget. Anything requiring interaction, login, or slow API waterfalls to appear will not be indexed.
4. **What matters is the DOM after render, IF render happens.** Meta robots, canonicals, and links injected by JS *can* work — but a `noindex` in the initial HTML stops the render phase entirely (the page is discarded before JS could remove it), and JS-injected critical directives are the flakiest possible place for them.

Practical law: **anything you need indexed — content, links, title, meta robots, canonical, structured data — should be in the server-rendered HTML.** JS enhancement on top is fine. JS *dependence* for indexable substance is a risk you accept knowingly or not at all.

## Decision tree

```
For each PAGE TYPE (not per-site — hybrids are normal and correct):

Does the page need to rank / be discovered in search?
├── NO (app-internal, authed dashboards, checkout) → CSR is fine. Move on.
└── YES
    ├── Content same for every visitor, changes rarely (marketing, docs, blog)
    │     → SSG (prerendered static). Fastest, cheapest, nothing to break at request time.
    ├── Content same for every visitor, changes often or huge catalog
    │     → SSG + incremental regeneration, or SSR with CDN caching.
    │       (Implementation tradeoffs: ../../web-dev/frameworks/nextjs/production-patterns.md)
    ├── Content varies per request but the INDEXABLE substance doesn't
    │   (e.g. product page with personalized recommendations)
    │     → SSR the substance; hydrate/CSR the personalized modules.
    └── Content is genuinely per-user → it can't rank anyway; CSR, and noindex it.

Never choose: dynamic rendering (serving bot-specific prerendered HTML by user-agent).
Deprecated by Google, a cloaking-adjacent maintenance trap, and always worse than SSR/SSG.
An exception you may inherit but shouldn't build.
```

## Failure modes

### 1. Client-side-rendered content invisible or badly delayed to crawlers

**The war story.** A content site migrated from a server-rendered CMS to a React SPA. The demo was beautiful. The raw HTML response was `<div id="root"></div>` and a bundle. Within a month, rankings slid across the board; within three, organic traffic was down 60%. Nothing was "broken" — Google *can* render React — but every page now needed the deferred render phase, refresh latency ballooned, some long-tail pages never got rendered at all, and every non-rendering consumer (including the AI-search crawlers that were becoming a real traffic source) saw an empty div. Recovery required retrofitting SSR (months of work under fire) and then waiting out recrawl. The migration plan had a rollback for everything except the thing that mattered.

The subtler variants that pass code review:

- **Content behind data fetching that the render phase times out on** — an API waterfall (auth token → user → content) that takes 8s cold. Users see a spinner then content; the crawler's snapshot may catch the spinner.
- **Links that aren't links.** `<div onClick={navigate}>` or `router.push` handlers produce zero crawlable edges. Googlebot follows `<a href>`, full stop. An SPA whose nav is click-handlers is an archipelago of orphans (see [`site-architecture.md`](site-architecture.md)).
- **Lazy-loading that requires viewport events.** Content mounted only on scroll/IntersectionObserver may never mount in the renderer. Lazy-load *images* with `loading="lazy"` (fine — it's native); don't lazy-mount *text content or links*.
- **Error boundaries eating the page.** A hydration error or failed fetch renders the "something went wrong" fallback — which is what gets indexed. Watched a site index 40K "Oops!" pages this way; GSC screamed soft-404s for weeks before anyone looked.

- **Detection:** the two-minute check that settles every "can Google see it?" argument: `curl` the URL (or View Source, *not* Inspect Element) and search for the money content and the nav links. Then GSC URL Inspection → Test Live URL → view rendered HTML and screenshot for the render-phase view. At scale: crawl with JS disabled vs enabled and diff ([`../agents/site-crawl-auditor.md`](../agents/site-crawl-auditor.md) does both passes).
- **Fix:** move indexable substance server-side per the decision tree. Framework-level how: [`../../web-dev/frameworks/`](../../web-dev/frameworks/). Interim mitigation if SSR retrofit is far off: at minimum SSG the top templates and fix `<a href>` nav — links and titles first, they gate discovery.
- **Prevention:** CI check that fetches key templates *without JS* and asserts presence of: title, meta robots state, canonical, H1, primary content marker, and nav links. This single gate would have prevented every CSR incident I've been called into.

### 2. Hydration mismatches causing wrong/stale indexed content

When server HTML and client render disagree, two bad things happen independently: (a) React/Vue may discard the server DOM and re-render client-side — so the crawler's HTML-phase snapshot (server version) and render-phase snapshot (client version) *differ*, and you don't control which gets indexed; (b) hydration errors trip error boundaries (see above). Classic sources: timestamps/locale formatting computed at render time, A/B test bucketing that differs server vs client, `window`-guarded content. Mechanics and fixes: [`../../web-dev/frameworks/react/common-pitfalls.md`](../../web-dev/frameworks/react/common-pitfalls.md).

**SEO-specific rule:** title, meta robots, canonical, and structured data must be identical server-side and post-hydration. If your A/B testing framework rewrites titles client-side, the indexed title is a coin flip.

- **Detection:** hydration warnings in console (treat as CI failures on indexable templates, not noise); GSC URL Inspection comparing rendered HTML to your server response; indexed titles/descriptions in SERPs not matching what the server sends.
- **Prevention:** hydration-error budget of zero on indexable templates; SEO-critical tags rendered by one server-authoritative mechanism that the client never mutates.

### 3. Framework migrations silently downgrading rendering

The pattern: a site works fine under server-rendered stack A; migrates to JS framework B "with SSR support"; but SSR is opt-in per route, someone flags a tricky page `ssr: false` to fix a build error, a data fetch moves from server loader to `useEffect` — each individually invisible, collectively a CSR migration nobody approved. Rankings erode over the following quarter and the migration retro never suspects rendering because "we used SSR."

- **Detection & prevention:** the no-JS CI gate from failure mode 1 catches every one of these mechanically. Add: rendering strategy is a *stated property of each route/template* in the architecture doc, and diffs that change `ssr` flags, move fetches client-side, or touch head/meta rendering get the [`indexability-regression-reviewer`](../skills/indexability-regression-reviewer/SKILL.md) treatment. During any migration, run [`../topics/site-migrations/production-patterns.md`](../topics/site-migrations/production-patterns.md)'s parallel-crawl comparison before cutover.

## Rendering-adjacent traps worth their lines

- **`#!` and fragment routing:** URL fragments are not sent to servers and not treated as distinct URLs. SPA routes must be real paths (History API), or they don't exist to search.
- **Geo/UA-conditional content:** Googlebot crawls mostly from US IPs. If US visitors get redirected or gated, Google indexes what a US visitor sees — or nothing. Serve crawlable defaults; never redirect the crawler ([`../topics/international-seo/common-pitfalls.md`](../topics/international-seo/common-pitfalls.md)).
- **Consent walls / interstitials:** an interstitial that replaces content in the rendered DOM gets indexed *as* the content. CMP must overlay, not replace.
- **robots.txt-blocked JS/CSS:** if bundles are disallowed, the render phase renders without them. Never block asset paths.

## Prevention stack (summary)

| Layer | Mechanism |
|---|---|
| Design | Rendering mode chosen per page type via the decision tree; recorded per route |
| CI | No-JS fetch of key templates asserting title/canonical/robots/H1/content/links |
| CI | Hydration warnings = failures on indexable templates |
| Code review | `indexability-regression-reviewer` on diffs touching ssr flags, head tags, data-fetch location |
| Post-deploy | GSC URL Inspection live-test on one URL per changed template |
| Migration | Parallel no-JS crawl diff, old vs new, before cutover |
