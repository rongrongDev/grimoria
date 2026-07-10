# Performance — Core Web Vitals, Bundles, Hydration, and Where the Time Actually Goes

**Scope:** framework-agnostic. Framework deltas live in each `frameworks/<x>/production-patterns.md`. **Date:** 2026-07-06 (CWV thresholds as of 2026: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1, at p75 field data).

## The mental model

Performance work fails when it's vibes-driven ("the app feels slow, let's memoize things"). It succeeds when it's **budget-driven and field-measured**: pick the metric, get field data (real users, p75 — not your M3 MacBook on office wifi), find the biggest contributor, fix that, re-measure. Lab tools (Lighthouse, WebPageTest) are for *diagnosis*; field data (CrUM/CrUX, your RUM via `web-vitals` npm package) is for *truth*. I've seen a team spend a quarter optimizing a Lighthouse score while field INP — what users actually felt — got worse, because the lab run didn't execute the third-party chat widget that was the real problem.

**The budget that matters:** roughly 100–170KB of *compressed JS* is where mid-tier Android devices (your p75 user) start missing interaction deadlines on parse/execute alone. Desktop Chrome on fiber tells you nothing.

## The three vitals: failure → detection → fix → prevention

### LCP (loading, ≤ 2.5s)
- **Failure modes, in observed frequency order:** (1) LCP image not discoverable early (CSS background, or `src` set by JS after hydration); (2) render-blocking chain — CSS/fonts/sync scripts before first paint; (3) slow server TTFB (cold serverless starts, uncached SSR, chatty backend); (4) lazy-loading the LCP image itself (`loading="lazy"` on the hero — actively harmful, and I see it in every second audit).
- **Detection:** Lighthouse LCP breakdown (TTFB / load delay / load time / render delay tells you *which* of the four); WebPageTest waterfall; `PerformanceObserver` LCP entry in RUM.
- **Fix:** Hero image as early-discoverable `<img>` with `fetchpriority="high"` (or `<link rel="preload">` if unavoidable in CSS); `loading="lazy"` only below the fold; fonts `font-display: swap` + preload the one or two that matter; TTFB → cache/CDN the HTML where personalization allows, stream the shell (framework docs).
- **Prevention:** CI Lighthouse budget (lighthouse-ci) failing on LCP regression against the *previous* build; image handling through the framework's image component so priority/lazy defaults are correct by construction.

### INP (responsiveness, ≤ 200ms)
- **Failure modes:** long main-thread tasks — hydration of a huge tree, a render cascade after one click, third-party scripts, synchronous layout thrash (`read style → write style` in a loop), 5,000-row lists re-rendering per keystroke.
- **Detection:** Field first: `web-vitals` INP attribution tells you *which element* and *which script*. Lab: Performance panel → Long Tasks; React DevTools profiler / framework equivalents for render cascades.
- **Fix:** Break up long tasks (`scheduler.yield()`); virtualize long lists (TanStack Virtual); debounce keystroke-driven work and move filtering off hot paths; code-split so the click handler doesn't first parse 400KB; audit third-party tags ruthlessly (each marketing tag is a standing INP tax — make the org own that tradeoff explicitly, don't absorb it silently).
- **Prevention:** RUM INP dashboard by page + alert on regression; bundle budget (below) since JS mass is upstream of most INP.

### CLS (stability, ≤ 0.1)
- **Failure modes:** images/embeds/ads without reserved dimensions; content injected above existing content (cookie banners, "app banner" bars); web-font swap reflow.
- **Detection:** Layout Shift regions in DevTools; CLS attribution in RUM (worst-shift element).
- **Fix:** `width`/`height` (or `aspect-ratio`) on every image/iframe/ad slot; reserve space for late-arriving UI; `size-adjust`/fallback-font metric matching for fonts (or `font-display: optional` for non-brand text).
- **Prevention:** Lint/review rule: no `<img>` without dimensions; ad/banner slots have fixed containers by design (this is a *design-time* decision — see the accessibility doc for the same argument shape).

## Bundle analysis — the recurring hygiene loop

**Failure:** bundles grow monotonically because nothing pushes back. Typical findings, in the order I always find them: a charting/date/utility library imported whole for one function (`import _ from 'lodash'`, moment with all locales); the same dependency duplicated at two versions; dev-only code shipped; a "shared utils" barrel file that drags the world into every entry point via re-exports.

- **Detection:** `vite-bundle-visualizer` / `webpack-bundle-analyzer` / `next build` output / `sonda`. Read the treemap: the biggest rectangle is the assignment. `npx knip` for dead exports; `npm ls <dep>` for duplicates.
- **Fix:** per-route code splitting (dynamic `import()` at route boundaries — frameworks do this by default; verify you haven't defeated it with a top-level import of everything); replace heavyweights (moment → date-fns or Temporal; lodash → lodash-es per-function imports or native); kill barrel files on hot paths.
- **Prevention:** **size-limit** (or bundlesize) in CI with per-entry budgets — the PR that adds 80KB gets a red check *with the number in it*, which converts an invisible cost into a review conversation. This single CI gate has paid for itself on every team I've installed it on.

## Hydration cost — the tax SSR quietly charges

**Failure:** Server-rendered page paints fast (great LCP), then the client re-executes the entire component tree to attach handlers. On mid-tier mobile this is seconds of main-thread block: the page *looks* ready but ignores taps — terrible INP and user trust ("I tapped and nothing happened, so I tapped five more times" — which then queues five handlers).

- **Detection:** Performance panel: the long task(s) right after the framework bundle evaluates; INP attribution pointing at first interactions; "TBT dominated by one script" in Lighthouse.
- **Fix, in escalating order:** (1) ship less JS to hydrate (server-only components where the framework supports them — RSC, Astro islands, or plain non-hydrated SSR regions); (2) lazy-hydrate below-the-fold islands (on-visible/on-interaction); (3) streaming SSR so hydration starts before full HTML; (4) reconsider the rendering strategy per route — a content page may need *zero* client JS.
- **Prevention:** treat "client JS per route" as a budget with the same CI teeth as bundle size. Ask of every component: *does this need to run on the client at all?* The cheapest hydration is none.
- **Hydration mismatch** (server HTML ≠ first client render — dates, locales, `Math.random`, user-agent branching) forces frameworks to re-render or patch, costing both correctness and time. Fix: render deterministic content on both sides; move client-only values behind an effect/mounted flag. Framework docs list the local idioms.

## Render-blocking resources — the checklist

1. CSS: one critical bundle, small; non-critical (below-fold, print, themes) loaded async. Beware `@import` chains in CSS (serial fetches).
2. Fonts: preload ≤ 2 critical fonts; `font-display: swap`; subset (unicode-range) aggressively.
3. Scripts: `type="module"` defers by default; anything third-party gets `defer`/`async` or, better, loads post-interaction (Partytown for the desperate).
4. Preconnect to the 1–3 origins on the critical path (`<link rel="preconnect">`); don't spray 12 preconnects — they compete.

## Waterfalls — the server-side one too

Client waterfalls are covered in `principles/async-patterns.md` (sequential awaits). The server flavor: an SSR page whose loader awaits four backend calls serially adds their latencies into TTFB. Detection: server tracing (OpenTelemetry spans stair-stepping). Fix: `Promise.all` independent calls; move non-critical data out of the blocking path and stream it in (deferred data — framework docs). **War story:** a product page's TTFB dropped from 2.1s to 600ms with zero infrastructure change — four sequential awaits (user, cart, recommendations, flags) became one `Promise.all` plus deferring recommendations. The waterfall had been added one innocent `await` at a time across six PRs; no single diff looked slow. That's why the prevention is a *trace dashboard*, not review vigilance.

## Decision tree — "the page is slow"

1. Field data says which vital → that section above.
2. Slow before first paint? → TTFB (server waterfall, cold starts, no cache) or render-blocking chain.
3. Paints fast, responds slow? → hydration cost or long tasks (INP section).
4. Fast on your machine? → you're testing on the wrong machine. Throttle to 4x CPU / Slow 4G or believe the field data.
5. Everything is a bit slow and the JS is 900KB? → bundle work first; JS mass is upstream of INP, hydration, *and* memory.
