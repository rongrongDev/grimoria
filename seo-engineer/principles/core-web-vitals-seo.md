# Core Web Vitals as a Ranking Factor — The SEO-Specific Slice

**Date:** 2026-07-13. **Reflects:** CWV metric set as of mid-2026 — LCP / INP / CLS (INP replaced FID in March 2024; any doc or tool still talking about FID is stale). Thresholds verified against web.dev current guidance. Core tier — full depth.
**Related:** this doc covers *how CWV interacts with search*: which numbers Google uses, how much they matter, and how to avoid being lied to by your own dashboards. For *making the numbers better* — optimization techniques, rendering internals, profiling — go to [`../../web-dev/principles/performance.md`](../../web-dev/principles/performance.md) and your framework's docs there. Do not duplicate that material here.

## The mental model

Google's page-experience signal uses **field data** — real-Chrome-user measurements aggregated in CrUX (Chrome UX Report) — evaluated at the **75th percentile** over a **trailing 28 days**, segmented by mobile/desktop, and grouped per-URL where traffic allows, falling back to origin-level. Every word of that sentence is a place engineers get burned:

| Metric | Good | Needs improvement | Poor |
|---|---|---|---|
| LCP (Largest Contentful Paint) | ≤ 2.5s | 2.5–4s | > 4s |
| INP (Interaction to Next Paint) | ≤ 200ms | 200–500ms | > 500ms |
| CLS (Cumulative Layout Shift) | ≤ 0.1 | 0.1–0.25 | > 0.25 |

**How much does it matter for rankings? Be the calm person in the room.** CWV is a real but *modest* ranking input — closer to a tie-breaker among comparable results than a lever that moves a page from position 8 to position 2. Two calibration points from experience: (1) I have never seen a site rank *because* of great CWV; (2) I have several times seen measurable ranking/traffic loss when a site fell from Good into Poor — the signal behaves asymmetrically, more penalty-shaped than reward-shaped, and "Good vs slightly-better-than-Good" is worth approximately nothing to search. The business case for speed is mostly conversion and UX; the *SEO* case is: **get out of Poor, get into Good at p75 on mobile, then stop optimizing for SEO reasons.** Anyone selling CWV work as a major rankings lever is selling.

Priority rule when someone must choose: an indexability bug outranks any CWV work, always. A fast page that isn't indexed ranks exactly nowhere. (Gate order: [`crawlability-indexability.md`](crawlability-indexability.md).)

## Failure modes

### 1. Optimizing lab data while field data — the number Google uses — stays Poor

**The war story.** A retailer spent a quarter chasing Lighthouse 90+. They got it — in Lighthouse. GSC's Core Web Vitals report stayed red, because Lighthouse runs an unthrottled-cold-load-no-interaction robot, and their real users were on mid-range Android over cellular, and their INP disaster only fired when a human tapped the size-selector, which triggered a 600ms main-thread cart recalculation. **Lab tools cannot measure INP meaningfully at all** — INP requires real interactions. Meanwhile the p75 was dominated by their slowest large user segment, which the team's office-wifi-MacBook testing never resembled. The fix took two weeks once they looked at field data (RUM traces pointed straight at the cart script); the quarter of Lighthouse-chasing had been directionally useless for search.

The general law: **lab data (Lighthouse, local DevTools) is for debugging; field data (CrUX, your RUM) is for judging.** Google ranks on field. A Lighthouse score appears in zero ranking calculations.

- **Detection:** compare GSC Core Web Vitals report / CrUX (via PageSpeed Insights' "field data" panel or the CrUX API) against your lab numbers. Big divergence = your lab conditions don't resemble your users. Segment RUM by device/geo/page-type to find *which* users drag the p75.
- **Fix:** debug the field-identified metric on field-representative conditions (throttled mid-tier device profile); for INP, instrument real interactions with RUM (`web-vitals` JS library → your analytics) because no lab tool will find it for you. Techniques: [`../../web-dev/principles/performance.md`](../../web-dev/principles/performance.md).
- **Prevention:** RUM wired to the `web-vitals` library from day one (CrUX alone is 28-days-lagged and URL-coverage-limited); dashboards show p75 field numbers, never lab scores; performance budgets in CI are a *regression tripwire* (lab data is fine for catching relative regressions — its one legitimate CI role), while the exit criterion for any CWV project is field.

### 2. The 28-day lag masking regressions and faking recoveries

Field data is a trailing 28-day window. Ship an LCP regression today: CrUX/GSC won't fully show it for four weeks, and after you fix it, dashboards stay red for another four — during which someone concludes the fix "didn't work" and reverts it, or keeps "fixing" what's already fixed. I've watched both.

- **Detection/prevention:** your own RUM (real-time) is the leading indicator; CrUX is the lagging official record. Annotate deploy dates on the RUM dashboard so regressions map to changes. Judge fixes by RUM deltas, not by GSC turning green — tell stakeholders the green lags by up to a month *when you ship the fix, not when they ask*.

### 3. Render-blocking and layout-shift patterns that specifically hit the ranked metrics

The SEO-relevant subset (implementation detail for all of these: web-dev performance doc):

- **LCP:** render-blocking CSS/JS in `<head>` delaying first render; the LCP image lazy-loaded (`loading="lazy"` on the hero is a self-inflicted wound — eager-load it, `fetchpriority="high"`), or discovered late because it's a CSS background or JS-inserted; slow server TTFB putting a floor under everything (SSR with no caching — see [`rendering-strategy.md`](rendering-strategy.md) for the strategy interaction: SSG beats SSR beats CSR for LCP, all else equal, and CSR pages structurally struggle because content paints only after bundle+fetch).
- **INP:** long main-thread tasks from hydration, third-party scripts (tag managers, chat widgets — audit them; they're the top INP offender in most real sites), and heavy synchronous handlers.
- **CLS:** images/embeds/ads without reserved dimensions, late-injected banners (cookie consent is the classic), and web-font swaps. Fix pattern: explicit `width`/`height` or `aspect-ratio` on everything that loads late, reserve ad/CMP space.

- **Detection:** field metric attribution (the `web-vitals` library reports the LCP element and INP interaction target); PageSpeed Insights connects field numbers to lab diagnosis.
- **Prevention:** dimension attributes enforced by lint on `<img>`; third-party script additions require a performance review (they arrive via tag manager, bypassing code review — close that hole with a tag-manager change policy).

### 4. Treating desktop-green as done

Rankings for most sites are driven by the mobile signal (mobile-first indexing: [`../topics/mobile-first-indexing/`](../topics/mobile-first-indexing/production-patterns.md)), and mobile field numbers are almost always worse — slower devices, worse networks. Teams demo on desktop, GSC desktop report is green, mobile is red, and mobile is the one that counts.

- **Prevention:** every CWV dashboard and every conversation defaults to **mobile p75**; desktop is the footnote.

## Decision tree: should we spend engineering time on CWV for SEO?

```
Check GSC CWV report / CrUX, mobile, per page group:
├── Any money-page group in Poor → yes, prioritized work; penalty-shaped risk is live.
│     Fix order: the failing metric with the worst p75, on the highest-traffic group first.
├── Needs-improvement on money pages → moderate priority; batch with UX/conversion case.
├── All Good → stop. Further CWV work is not SEO work; justify it on conversion or don't do it.
└── No CrUX data (low traffic) → the ranking signal barely applies to you; build the RUM
      pipeline anyway, spend the freed time on content and architecture.
```

## Prevention stack (summary)

| Layer | Mechanism |
|---|---|
| Day one | `web-vitals` RUM → analytics; mobile-p75 dashboard with deploy annotations |
| CI | Lab-based budget as regression tripwire (Lighthouse CI) — relative deltas only |
| Code review | Dimension attrs on media; no lazy-loading the LCP element |
| Governance | Tag-manager/third-party-script change policy |
| Weekly | GSC CWV report in the monitoring review ([`monitoring-diagnosis.md`](monitoring-diagnosis.md)) |
