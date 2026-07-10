# Internal Dashboards & Tooling Web Apps — designed for people who will never read the docs

**Applies to:** internal web tools — build/deploy dashboards, service catalogs, codegen status pages, flake trackers, cost explorers. **Last verified:** 2026-07-06.

**The stance:** an internal dashboard's audience arrives mid-incident, mid-review, or mid-standup, with a specific question and zero patience. They will not read documentation, they will not attend your training, and they will not remember the walkthrough from onboarding. Design for the visitor who has never seen this page and has ninety seconds. And hold one more rule above all the UX rules: **a dashboard that is confidently wrong is worse than no dashboard** — people act on what screens tell them, and a stale "all green" has caused more bad deploys in my career than any missing feature.

## 1. The no-docs audience: every screen self-explains

- **Lead with the question the page answers.** A page is good when a first-time visitor can state, within seconds, what question it answers and what the answer currently is. If the page answers six questions, it answers none — split it.
- **Every number carries its unit, its definition, and its freshness.** A bare `47` is a support question. `47 failed builds (main branch, last 24h) — as of 12:03` is an answer. Definitions go in hover/expand *on the element itself*, not in a wiki — the wiki is where definitions go to diverge from the query (if your org has a metric-definition discipline, reuse it; the failure class is the same one `data-analyst` KBs exist for).
- **Every aggregate drills down.** The user's next question after any summary number is "which ones?" A count that can't be clicked to the list behind it generates a Slack thread instead of a click. Deep-linkable, too: the URL encodes the filter state, because the primary way internal dashboards are actually used is *pasting a link into a thread* to make a point.
- **Empty and error states are written, not defaulted.** "No deploys yet for this service — deploys appear here once you ship via mytool" beats a blank panel; a blank panel reads as "broken dashboard," and each such impression costs return visits.
- **Jargon audit.** Your team's internal codenames leak into column headers and mystify everyone else. The `GLOSSARY.md` discipline applies to screens, not just docs.

## 2. Staleness: the neglected killer

Cache invalidation for internal tools is chronically neglected because nobody's paged for it — until the dashboard shows week-old data during an incident and someone declares the wrong all-clear. I have watched a deploy proceed because the quota dashboard said "headroom: plenty" from a cache that hadn't refreshed since the *previous* team's launch consumed it.

- **Show data age on every screen, always.** "As of 12:03" next to the data it describes. Not in a footer, not on hover. If different panels have different pipelines, each panel gets its own timestamp — one page-level stamp lies about whichever panel is slowest.
- **Stale beyond threshold = visible warning, not quiet decay.** Each data source declares its expected freshness (30s, 5min, daily). Past 2× that: the affected panel gets an unmissable "data may be stale (last update 3h ago)" banner and, for decision-critical panels, greys out. **The dashboard must know when it doesn't know.**
- **Alert the *owner* on pipeline stall, don't wait for a viewer to notice.** The feeding pipeline gets the same monitoring as a production service: freshness SLO, alert on breach. A dashboard silently showing old data is *worse than a dashboard that is down* — down sends people to the source of truth; stale sends them away confident and wrong.
- **Cache-bust on the mutation path you own.** When the dashboard itself performs actions (trigger deploy, quarantine test), the post-action view must reflect the action immediately — read-your-own-writes, even if it means bypassing the cache for that session. Users who click "retry" and see the old state click it again; now you've built a duplicate-actions generator.

## 3. Access control: internal ≠ safe

"It's behind the VPN" is not an access model. Internal tooling routinely touches exactly the data that hurts most when it leaks internally: compensation-adjacent headcount data in a capacity planner, customer PII in a debugging console, security-vulnerability lists in a patch tracker.

- **SSO in front of everything, from day one.** Retrofitting auth onto a tool the org already uses means breaking everyone's bookmarks and scripts; bolting it on later is 10× the cost of the boilerplate on day one. No shared passwords, no "secret" URLs — URLs get pasted into threads (that's their job, §1), so a URL *is* a broadcast.
- **Authorize by data sensitivity, not tool audience.** The question isn't "who is this dashboard for," it's "what's the worst row this dashboard can render." Sensitive panels get group-gated even inside a broadly-open tool.
- **Audit-log the sensitive reads and all writes.** Any tool that can *do* things (deploy, delete, grant) logs who did what when, immutably. The first time you need this log, you need it badly and retroactively.
- **No secrets or PII in URLs or page titles** — they end up in browser history, proxy logs, and screenshots pasted to Slack.
- **Actions need a second factor of intent**: destructive operations get type-to-confirm or a `--dry-run`-equivalent preview. The same silent-failure and confirmation discipline as CLIs (`tool-engineer/principles/cli-ux.md` §2, §5) — a web form is just a CLI with more pixels.

## 4. A dashboard is a product with an SLO, or it's a liability

Internal web tools accrete: someone builds a page for one incident, it never gets an owner, and three years later "the old flake dashboard" shows numbers nobody can explain but everyone screenshots into decision docs. Rules:

- **Every dashboard has a named owner and a stated question.** Annual review: does the question still matter, is the data still correct, does the owner still exist? Kill unowned dashboards — an unowned dashboard is unowned *wrong data with authority*.
- **Uptime/freshness expectations stated on the tool itself.** If it's best-effort, say so on the page; people calibrate trust accordingly. If it's incident-critical, it needs real on-call ownership.
- **Prefer fewer, owned surfaces over many orphans.** The tenth dashboard nobody can find is negative value — it splits the audience of the one that's right (discoverability is an adoption problem: `tool-engineer/principles/adoption-and-rollout.md` §4 — measure *visits*, not existence).

## 5. Failure modes → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Stale data presented as current | Compare dashboard vs source-of-truth during any incident review; no timestamps on screen is itself the finding | Per-panel data-age stamps; stale banners; grey-out past 2× freshness SLO (§2) | Freshness SLO + owner-paging alert on every feeding pipeline |
| Confidently-wrong number drives a decision | Users cite the dashboard in a decision that went wrong; number can't be traced to a query | Add definition-on-element + drill-down to raw; fix or kill the metric | Every number ships with unit/definition/drill-down as a review-checklist item (§1) |
| Nobody can use it without a walkthrough | New-visitor test (watch, don't guide) fails; usage concentrated in the authoring team | Rewrite headers around the question answered; written empty states; jargon audit | 90-second first-time-visitor test before launch (§1) |
| Sensitive data open to the whole org | Access review: "what's the worst row this can render" vs who can render it | Gate sensitive panels; rotate anything already exposed | SSO-by-default template; data-sensitivity classification at design time (§3) |
| Action buttons without audit or confirm | Duplicate/destructive actions with no trail; "who deployed this?" unanswerable | Add audit log + type-to-confirm + read-your-own-writes | Write-capable tools require audit logging to pass review (§3) |
| Orphaned dashboard with authority | Screenshot of it appears in a decision doc; owner field empty or departed | Assign or kill; tombstone with a pointer to the replacement | Annual owner-and-question review; unowned = scheduled for deletion (§4) |
| Broken bookmarks after auth/URL changes | Support pings "my link stopped working" | Redirects from old URLs; announce with the change | SSO and stable URL scheme from day one (§3) |

## Cross-references

- The same audience-won't-read-docs law drives CLI help design: `tool-engineer/principles/cli-ux.md` §4.
- Deciding *what* to measure on tool-usage dashboards, and gaming risks: `tool-engineer/extended/productivity-metrics.md`.
- Keeping the dashboard's own frontend honest is ordinary web engineering — this KB owns the *tooling judgment*; for web implementation quality, use the org's web KB (e.g. `web-dev/`) and its review skills.
- Auditing an inherited dashboard as part of a tool estate: `tool-engineer/guides/analyze-an-existing-tool.md` (the checklists there include §1–§4 as scored items).
