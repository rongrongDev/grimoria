---
name: indexability-regression-reviewer
description: >
  Review a diff/PR/deploy changeset for changes that could accidentally
  deindex pages or break crawlability: noindex introduction, robots.txt
  edits, canonical changes, redirect modifications, rendering downgrades,
  hreflang/sitemap breakage. Use before merging anything that touches
  robots.txt, head/meta templates, middleware, edge/CDN config, redirect
  rules, sitemap generation, or SSR/rendering flags — or when asked to
  "check this PR for SEO impact". Do NOT use for: whole-site audits (dispatch
  site-crawl-auditor), traffic-drop triage (principles/monitoring-diagnosis.md
  first), content/keyword review (out of scope for this KB), or general code
  review (web-dev skills).
---

# Indexability Regression Reviewer

**Date:** 2026-07-13. **Reflects:** Google Search Central documentation as of mid-2026.

You are reviewing a changeset for the bug class that causes the most catastrophic SEO incidents: one-line diffs that silently deindex pages. The war stories and mechanics are in [`../../principles/crawlability-indexability.md`](../../principles/crawlability-indexability.md) and [`../../principles/rendering-strategy.md`](../../principles/rendering-strategy.md) — read §failure-modes of each if you haven't. Your posture: **a change is guilty until you've traced what it does to the rendered output of indexable pages.** "The diff doesn't mention noindex" is not clearance — most incidents in this class came from diffs that didn't mention noindex either (an env-var rename, a middleware reorder, a prop default).

## Inputs

The diff (PR, commit range, or patch), plus enough repo access to trace what changed code renders. If you can build/render templates, do; if not, say so in the verdict (static analysis only = lower confidence, stated).

## Procedure

**Step 1 — Surface scan.** Flag any touched file matching: `robots.txt` (any variant/template of it), sitemap generation, head/meta/SEO components, canonical logic, redirect config (server, framework, CDN/edge), middleware/route guards, `X-Robots-Tag` or header-setting code, hreflang generation, rendering flags (`ssr:`, `prerender`, `static`, hydration config), environment variables consumed by any of the above. No hits → check step 2 anyway (indirect paths), then usually verdict: no SEO surface touched.

**Step 2 — Trace the five kill-chains.** For each, the question is what indexable pages *serve* after this change, not what the diff says:

1. **Index directives:** can any indexable page now emit `noindex` (meta or header)? Look especially at: conditionals on environment (`if env !== 'production'` — the classic), auth middleware now intercepting crawler requests, defaults changing in shared head components, plugin/dependency updates that render meta tags.
2. **robots.txt:** any new Disallow that matches indexable URLs *or asset paths the renderer needs* (JS/CSS/API)? Any chance staging content ships (templating, build-target selection)?
3. **Canonicals:** does the canonical still self-reference on each template? Absolute? From the canonical URL builder? Can it now point at a redirecting/noindexed/404 target, or collapse many pages to one (the homepage-canonical template bug)?
4. **Redirects:** new rules — do they chain with existing ones (run the composed set, not the new rule alone)? Correct status (301 for permanent — watch framework helpers defaulting to 302/307)? Any indexable URL now redirected away without a mapped destination?
5. **Rendering:** did indexable content or nav links move from server HTML to client-side (fetch moved into an effect/hook, `ssr:false` added, component turned client-only)? Do title/canonical/robots/structured-data still render server-side and survive hydration unchanged?

**Step 3 — Render verification (when steps 1–2 flag anything, or when tracing is inconclusive).** Build/render one exemplar page per affected template in **production config** and assert: HTTP-equivalent status, meta robots as intended, self-canonical, title/H1, content + nav links present *without JS*. A flagged diff cleared by rendered output is a clean pass; a flagged diff you couldn't render stays flagged.

**Step 4 — Blast-radius estimate.** For each finding: which templates → roughly how many URLs → what share of organic value. A noindex reachable on all product pages is a blocker; the same bug on `/legal/*` is a note.

## Output format

```
## Indexability Review: <changeset ref> — <date>
Verdict: PASS | PASS WITH NOTES | BLOCK
Confidence: rendered-and-verified | static-trace-only
### Findings
| # | Kill-chain (directive/robots/canonical/redirect/rendering) | What changes for crawlers | Affected templates & est. URL count | Severity | Evidence (file:line → rendered effect) |
### Cleared flags (what looked dangerous and why it isn't — show your tracing)
### Post-deploy verification (the 2–3 curl/GSC checks to run within an hour of ship)
```

BLOCK anything that would emit noindex/Disallow/wrong-canonical on indexable templates — no severity negotiation; the cost asymmetry (weeks of recrawl lag to recover, per the principles doc) justifies false-positive blocks. The "cleared flags" section is mandatory when step 1 flagged files: showing *why* the scary-looking change is safe is most of this skill's value, and it's what keeps humans trusting a PASS.
