---
name: redirect-map-generator
description: >
  Generate and verify a redirect map for a URL migration (domain change,
  URL-structure redesign, replatform): build the old-URL inventory, map every
  URL to its one-hop 301 destination (or explicit 410), detect chains/loops
  against existing redirect config, and produce the verification test set.
  Use when planning or executing any change that alters URLs — "we're moving
  domains", "changing our URL structure", "replatforming", "make the redirect
  map". Also for auditing an existing redirect config for chains/loops. Do NOT
  use for: deciding WHETHER/WHEN to migrate (read
  topics/site-migrations/production-patterns.md first — this skill is its
  Phase 1–3 executor), single one-off redirects (just check the composed
  config for chains), or post-cutover traffic triage
  (principles/monitoring-diagnosis.md).
---

# Redirect Map Generator

**Date:** 2026-07-13. **Reflects:** Google site-move documentation as of mid-2026.

You are producing the artifact that decides whether a migration keeps its rankings: per [`../../topics/site-migrations/production-patterns.md`](../../topics/site-migrations/production-patterns.md) (read it first — this skill executes its Phases 1–3), **the redirect map is the migration**. A 90% map permanently loses ~10% of the site's equity, concentrated in the oldest, most-linked URLs. Your two quality bars: **completeness** (every URL that ever earned signal has a row) and **one-hop correctness** (every row lands on its mapped target, directly, as a 301).

## Inputs

Old site access (crawl/exports), the new URL scheme (or routing table/staging), and as many of the seven inventory sources as obtainable. If sources are missing, proceed — but the coverage statement must say which, because each absent source is a named class of URLs you may be losing (no logs = no forgotten-but-crawled legacy URLs; no backlink export = flying blind on where the equity actually is).

## Procedure

**Step 1 — Inventory (completeness is decided here).** Union, then dedupe/normalize (case, slash, protocol, host variants — but *keep* the variants as rows; the crawler will present them): live-site crawl (dispatch [`site-crawl-auditor`](../../agents/site-crawl-auditor.md) for large sites), XML sitemaps, server logs 90+ days, GSC indexed/performing URLs, analytics 12-month URLs, backlink-tool export (every externally-linked URL, with referring-domain counts — this is the value column), existing redirect config (all prior generations — their sources become rows too, so old equity collapses to final destinations). Rank rows by value (traffic × referring domains).

**Step 2 — Mapping.** Prefer **rules** where old→new structure is systematic (`^/blog/(.*)$ → /articles/$1`), explicit rows for everything the rules miss. Per-row rules of the migrations doc: equivalent page → 301; no equivalent → closest *relevant* category (never mass-map to homepage — soft-404; flag any target receiving >2% of rows) → else explicit 410. Decide the parameter policy (strip? carry? map?) and the case/slash normalization order. Every row: `old URL | disposition (301 target | 410 | unchanged) | value rank | mapping basis (rule N | manual | inherited)`.

**Step 3 — Static verification (before any config exists).** Run the *entire inventory* through the composed ruleset — new rules + all existing redirect config — and assert: every row resolves; resolution is **≤1 hop**; **no loops**; no unmapped inventory URL falls through to 404 silently; rule shadowing (a broad rule capturing rows meant for a specific one) surfaced. Rules are tested against the full inventory, never eyeballed — regex confidence is how migrations acquire surprise 404 classes.

**Step 4 — Live verification set.** Emit the test artifact for staging/cutover: for every row (or a value-weighted sample if truly enormous — but say so), `curl -sI` assertions: expected status (301, not the framework's 302 default — assert the code), `Location` = mapped target exactly, target returns 200 and is indexable + self-canonical (a redirect landing on a noindexed page is a mapped equity leak). Package as a runnable script/CI job — this same set reruns at cutover hour and in the post-cutover watch.

**Step 5 — The forgotten-emitters checklist.** The map covers inbound; flag what else emits old URLs and must be updated at cutover (not by redirect): internal links, canonicals, hreflang graph, sitemaps, structured-data URLs, RSS, paid landing pages. (Phase 3 of the migrations doc; you list, the migration owner assigns.)

## Output format

```
## Redirect Map: <migration name> — <date>
Inventory: <n> URLs from <sources used> | MISSING SOURCES: <list — named risk each>
Value coverage: top-100 linked URLs mapped: <n>/100
### Map: <attached file/table> (old | disposition | value rank | basis)
### Rules: <list, each with inventory-match count>
### Static verification: hops ≤1 ✓/✗ | loops: <n> | fall-through 404s: <n> | homepage-concentration: <n>%
### Live verification set: <script/job ref> — run at: staging, cutover hour, days 1–14
### Forgotten-emitters checklist: <items>
### Unresolved (needs human): <rows with no defensible target — never silently 410 a high-value row>
```

Discipline notes: a high-value URL you can't map well goes in "unresolved" for a human call, never silently disposed; and the map is **one exclusive writer's artifact** — if multiple agents/teams contribute, changes route through this skill's holder and re-run step 3, because composed redirect rules interact at runtime in ways no diff review sees ([`../../orchestration/README.md`](../../orchestration/README.md) failure mode 1).
