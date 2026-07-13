# Orchestrating Agent Teams on Technical SEO Work

**Date:** 2026-07-13. This doc covers *when and how to split SEO work across multiple agents* — role splits, fan-out patterns, and the failure modes specific to multi-agent SEO. It assumes you know the domain content (the [`../principles/`](../principles/) docs); nothing here restates it.

## When multi-agent is worth it (and when it isn't)

Single agent + the right skill/doc handles: a diff review, a single-template schema check, a triage, a redirect-map row-set for one section. Split into multiple agents only when one of these is true:

1. **Context isolation** — the subtask's intermediate data would poison the coordinator (full-site crawls, log parsing). This is the common case; it's why [`../agents/`](../agents/) exists.
2. **Role separation with adversarial value** — the reviewer must not share the implementer's assumptions (deploy gating, migration verification).
3. **Fan-out over independent units** — many templates/locales/sections needing the same bounded procedure, where units genuinely don't interact.

SEO-specific caution before you split anything: most SEO artifacts are *global, shared state* — robots.txt, the redirect config, the sitemap, the hreflang graph, the canonical scheme. Parallel agents writing to shared global state is the primary source of multi-agent SEO failures (see failure modes). Partition by *page template or site section* (mostly-independent units), never by "each agent takes some URLs" within the same shared artifact.

## Pattern 1: The deploy gate (reviewer role, adversarial)

An implementation agent's change touching SEO-sensitive surfaces (head templates, robots.txt, redirects, middleware, rendering flags, structured data) is reviewed *by a separate agent running* [`../skills/indexability-regression-reviewer/SKILL.md`](../skills/indexability-regression-reviewer/SKILL.md) *before merge* — separate, because the implementer who introduced `ssr: false` to fix a build will confidently explain why it's fine; the reviewer's value is not sharing that motivation. Wiring: trigger on path patterns (`robots.txt`, `**/head*`, `**/middleware*`, redirect config, SEO components). Verdict is blocking; "no SEO-relevant change" is a normal, cheap outcome. This is the multi-agent version of the CI gates in [`monitoring-diagnosis.md`](../principles/monitoring-diagnosis.md) — CI catches the mechanical class, the reviewer catches the semantic class (a canonical that's *valid but wrong*).

## Pattern 2: The standing auditor (scheduled, isolated)

[`site-crawl-auditor`](../agents/site-crawl-auditor.md) quarterly (plus after redesigns/nav changes), diffing against the previous baseline: architecture drift — orphan accumulation, depth creep, new parameter spaces — is invisible per-deploy and obvious longitudinally. Same for [`log-file-analyzer`](../agents/log-file-analyzer.md). The coordinator's job on the returns: *diff review, not report reading* — what changed since last baseline, and which change maps to which shipped work.

## Pattern 3: Fan-out for per-template audits

Auditing structured data (or head-tag correctness, or parity) across 30 page templates: fan out one lightweight agent per template running [`structured-data-validator`](../skills/structured-data-validator/SKILL.md), each returning the skill's fixed output format; coordinator merges into one findings table. Rules that keep fan-out honest:

- **Partition by template/section**, the natural independence boundary. One agent per URL is waste (templates share one implementation); one agent per *issue type* across the whole site re-reads everything N times.
- **Fixed output schema per worker** (the skill defines it) — merging freeform prose from 30 workers is its own project.
- **Coordinator dedupes to root causes**: 30 workers reporting the same missing `offers` property = *one* finding in *one* shared component, not 30 findings. Root-causing is the coordinator's main post-merge job — a finding count that scales with worker count is a merge failure, not a bigger problem.

Same pattern for per-locale hreflang verification and per-section migration parity crawls.

## Pattern 4: Migration crews (the high-stakes case)

A migration ([`../topics/site-migrations/production-patterns.md`](../topics/site-migrations/production-patterns.md)) maps naturally onto planner / implementer(s) / verifier:

- **Planner** owns the inventory union and the redirect-map *spec* (the [`redirect-map-generator`](../skills/redirect-map-generator/SKILL.md) skill's phases 1–2).
- **Implementers** build redirects/templates per section — but see the exclusive-writer rule below.
- **Verifier** (separate agent, ideally separate from planner too) runs the full-inventory assertion: every row → one hop → mapped target → 200, plus the parity crawl. The verifier must consume the *inventory*, not the implementers' work logs — verifying against what was built instead of what was specified is how gaps survive.

## Failure modes of multi-agent SEO (each has burned a real team)

1. **Redirect-map conflicts from parallel writers.** Two agents each "fix" overlapping URL patterns in the shared redirect config; composition creates chains (`A→B` meets `B→C`) or loops. Redirect config is a merge conflict the VCS can't see — the rules interact at *runtime*. **Rule: one exclusive writer for any global artifact** (redirect config, robots.txt, sitemap generation, hreflang graph); everyone else files change requests to it. The chain/loop CI test from the migrations doc is the backstop.
2. **Lab-data sign-off.** An agent asked to "verify CWV" runs Lighthouse, sees 96, reports green — while field p75 is Poor. Smaller models do this *by default* because lab tools are the runnable ones. Every CWV-touching brief must name the data source: *field, mobile, p75* ([`core-web-vitals-seo.md`](../principles/core-web-vitals-seo.md) §1), and treat lab numbers as diagnosis-only.
3. **Fan-out double-fixing shared components.** Thirty template-workers each *edit* the shared head component to fix "their" finding — thirty conflicting patches to one file. Fan-out workers **report; the coordinator assigns fixes** after root-cause dedup. (Audit fan-out is read-only by construction.)
4. **The reviewer rubber-stamping renders.** A gate agent that only greps the diff misses what the change does to *rendered output* (a prop change that flips meta robots downstream). The reviewer skill requires rendering the affected templates when static analysis is inconclusive — hold gate agents to it.
5. **Unverified-bot conclusions at second hand.** A log-analysis worker skips IP verification (or the coordinator re-aggregates raw lines a worker already flagged as unverified) and crawl-budget conclusions inherit scraper noise. Verification status must travel *with* the numbers in every hand-off — the analyzer's output format carries it; don't strip it in the merge.
6. **Timeline confusion across agents.** Agent A ships a fix; agent B, monitoring, sees no GSC improvement in 48h and "re-fixes" or reverts — but recrawl lag means the fix couldn't have shown yet ([`monitoring-diagnosis.md`](../principles/monitoring-diagnosis.md)). Monitoring briefs must carry the expected-effect timeframe of in-flight fixes, and revert authority stays with the coordinator, never a monitor.

## Briefing template for any dispatched SEO agent

```
Task: <one procedure, one artifact>
Inputs: <URLs/paths/exports — exact>
Ground rules: field-not-lab (mobile p75); verify bots by IP; read-only unless
  named exclusive writer of <artifact>; expected-effect lag of in-flight fixes: <n weeks>
Docs: <the 1–2 principles/skill files that govern this task>
Return format: <the skill's output schema, or the agent file's format>
Do NOT: edit shared artifacts / re-derive strategy / expand scope to adjacent findings
```
