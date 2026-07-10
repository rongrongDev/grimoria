# Astro — Production Patterns (Extended Tier)

**Applies to:** Astro 5.x. **Date:** 2026-07-06.

## What Astro is for — and the honesty to use something else

Astro's bet: **most of most sites is not interactive.** Server-render everything as zero-JS HTML; hydrate only explicit islands. This wins decisively for content-shaped sites (marketing, docs, blogs, catalogs, editorial) — the `principles/performance.md` hydration section's "the cheapest hydration is none" made into a framework. The flip side is a real decision rule: **if most of your page is stateful and interconnected (dashboards, editors, inboxes), islands fight you** — shared state across islands is manual plumbing; pick a full framework instead. Choosing Astro for an app, or Next for a blog, are the same mistake in opposite directions.

## Islands discipline

- **`client:*` directives are a budget, spent deliberately:** `client:visible` as the workhorse (hydrate on scroll-into-view), `client:idle` for above-fold-but-secondary, `client:load` only for immediately-interactive-critical, `client:only` when SSR of the component is impossible. Every directive is client JS shipped — review PRs for directive creep the way you review bundle budgets (same CI teeth: `principles/performance.md` §bundles).
- **Islands are independent apps.** Cross-island state does not flow through props — use nano stores (framework-agnostic atoms, the intended tool) or custom events; if you're building an elaborate cross-island state graph, re-read the decision rule above.
- **Mixed frameworks are possible; standardize anyway.** One island framework (or zero — Astro components + vanilla for light interactivity) per project; polyglot islands are a demo feature and a maintenance tax.

## Content architecture

- **Content collections** (content layer API in 5.x) with schemas: frontmatter validated by Zod at build — the validate-at-boundary rule applied to your own content; a typo'd date in a markdown file becomes a build error, not a rendered `Invalid Date`. Loaders pull remote content (CMS) into the same typed pipeline.
- Static by default, **per-route server rendering** where needed (`export const prerender = false` with an adapter) — the same declare-your-intent rule as every meta-framework (`nextjs/production-patterns.md` §caching): know which routes are which, review the build output.
- **View transitions** for the SPA feel without SPA JS — but remember scripts re-run/persist rules across transitions differ from full loads; test navigation-dependent scripts both ways.

## Server-side Astro (SSR mode, actions, endpoints)

Once an adapter is on: endpoints (`src/pages/api/*.ts`) and Astro Actions are a Node/edge backend — the entire `frameworks/node/security.md` + `node/concurrency.md` discipline applies (validate with the actions' built-in Zod input schemas — use them, they're the framework doing the right thing by default; authorize per action; no module-scope per-user state). Middleware = context resolution, not authorization (the portable CVE lesson, `nextjs/security.md` §3).

## Performance notes (mostly: don't break what you got for free)

Astro's defaults hand you the `principles/performance.md` checklist pre-passed: no JS, `<Image>` with dimensions (CLS), font optimization. The ways teams break it, ranked: (1) a `client:load` kitchen-sink island wrapping half the page ("we needed one modal"); (2) third-party scripts pasted into the base layout (each one a site-wide INP tax); (3) un-fontsourced webfonts re-introducing swap-CLS. Lighthouse-CI budgets catch all three regressions cheaply.

## Testing & security pointers

- Testing: content/util logic in Vitest; islands with their framework's testing doc (`react/testing.md` etc.); the *assembled page* is inherently e2e territory — Playwright against `astro build && astro preview` (the built-not-dev rule again), including one "no island hydrated that shouldn't be" check (`document.querySelectorAll('astro-island')` count as a budget assertion).
- Security: `set:html` is the raw hatch (universal policy: one sanitizing wrapper, grep-expects-one); markdown/MDX from untrusted sources needs the same DOMPurify treatment; endpoints per node/security.md.

## War story — the island that ate the ocean

A content site's team wanted one interactive pricing calculator. Someone wrapped the entire page section — nav, hero, calculator, testimonials — in a single React island with `client:load` "so the calculator has context." Six months later: 380KB of client JS on a marketing page, LCP regressed 1.9s, and the "Astro is fast" premise silently dead. The fix took an afternoon: island shrunk to the calculator alone, `client:visible`, props passed at build time. The pattern to police: **islands grow by convenience and never shrink by default** — the island boundary is an architectural line, review it like one (a `astro-island`-count budget in CI makes the growth visible).
