# Astro — Common Pitfalls (Extended Tier)

**Applies to:** Astro 5.x. **Date:** 2026-07-06.

## 1. Island creep
The war story (`astro/production-patterns.md`): islands wrapping ever-more page "for context," `client:load` as the default reflex. Directives are a reviewed budget; `client:visible` is the default; an island-count/JS-size CI budget makes creep visible.

## 2. Expecting Astro components to be reactive
`.astro` components run **at build/request time on the server, once** — they are templates, not components-with-lifecycle. State, handlers (`onclick={…}` silently does nothing in `.astro`), and effects belong in islands or `<script>` tags. The "my button doesn't work" first-week bug.

## 3. Frontmatter fetch without understanding when it runs
Top-of-file `await fetch(…)` in a prerendered page runs **at build** — data frozen until next deploy (the Next silent-static war story, `nextjs/production-patterns.md`, Astro spelling). Decide per route: prerendered (build-time data, fine for content) vs `prerender = false` (request-time). The build-output route list is the truth; review it.

## 4. Cross-island state through hope
Two islands "sharing" state via module import works in dev (one module instance) and then breaks understanding: each island bundle gets the module, but *server-rendered HTML* was built with initial values, and hydration timing differs per directive — flashes of desync. Nano stores with explicit subscription are the supported channel; anything more, wrong framework choice (production-patterns decision rule).

## 5. `<script>` tag scoping surprises
Astro inline `<script>` is bundled, deduped (runs once per page even if the component renders 5×), and module-scoped; `is:inline` opts out of processing. Looping components that each need behavior should use event delegation or custom elements — per-instance script assumptions produce "only the first card works."

## 6. View transitions breaking script lifecycles
With `<ClientRouter>` (view transitions), full-page loads stop happening: `DOMContentLoaded` listeners don't re-fire, module scripts don't re-run per navigation — analytics/init code silently stops after the first page. Use `astro:page-load`/`astro:after-swap` events; test key scripts across a client-side navigation, not just a hard load.

## 7. Module-scope state in SSR endpoints/actions
Per-user data in module scope of server-executed files = the cross-request leak (`node/concurrency.md` §1) — Astro is not exempt; `Astro.locals` is the request-scoped home.

## 8. `set:html` with CMS/markdown content
"It's our CMS, it's trusted" — until a compromised editor account or an embedded third-party widget string, the stored-XSS classic (`principles/security.md` §XSS). Sanitize at render regardless of source; one wrapper component, grep-expects-one.

## 9. Image pipeline bypass
Plain `<img>` tags (or CMS-emitted HTML images) skip `<Image>`'s dimension/format/priority handling — CLS and LCP regressions that the framework would have prevented (`principles/performance.md` §CLS). Lint for raw `<img>` in `.astro` files; transform CMS HTML through a rehype pass that adds dimensions.

## 10. Treating middleware as auth
Portable lesson, Astro spelling: middleware sets `locals`, per-route/action code authorizes (`nextjs/security.md` §3). Also mind: middleware doesn't run for prerendered pages at request time — "auth-gated" static pages are public artifacts; gate at the CDN/adapter or render them on demand.
