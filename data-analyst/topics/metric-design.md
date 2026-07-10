# Metric Design & Governance

**Version 1.0.0 · 2026-07-06 · Core tier — full depth.**
Applies to: metric definition and governance in any warehouse/BI stack; semantic-
layer specifics in `bi-tools.md` and `dashboard-reliability.md`. Standalone doc.
Callable procedure built on it: `metric-definition-auditor` skill; cross-dashboard
drift hunting: `dashboard-reconciliation-scanner` subagent.

A metric is a **contract**: two people applying the definition independently must
compute the same number. Most of what's called "data quality problems" in
organizations are actually contract failures — the pipeline was fine; the two
dashboards were computing different things with the same name.

---

## 1. The bar: two people, same number

**Failure mode.** A metric defined by its name and vibes ("weekly active users —
you know, users who were active in the week"). Ambiguities that each silently fork
the number: calendar week or trailing 7 days? Which timezone's week? Is "active" any
event, or qualifying events only? Do internal/test accounts count? Bots? Deleted
users? Is the denominator all signups or activated signups?

**War story — the drift that made two dashboards disagree.** Growth's "weekly
active" (trailing 7 days, any event, UTC) and Product's "weekly active" (calendar
week, core-action events only, US/Pacific) coexisted for **14 months**, differing
5–20% depending on the week. Each team quoted its own number upward; an exec
noticed the mismatch in a board-prep doc; three analyst-weeks went into the
reconciliation. Every element of the eventual explanation had been an unwritten
assumption in someone's head. Neither number was *wrong* — the name was.

**Detection.** For any metric quoted in two places: pull both SQL definitions and
diff population, numerator, denominator, grain, filters, timezone, freshness. No
SQL to pull (metric computed inside a BI workbook or a spreadsheet)? That is itself
the finding — see `../principles/core-principles.md` §10. At org scale, this is the
`dashboard-reconciliation-scanner` subagent's job.

**Fix.** One canonical definition in one place (semantic layer / dbt metric /
LookML measure — `dashboard-reliability.md` §1), with the losing variants either
deleted or renamed to say what they actually are (`wau_calendar_pacific_core`).
Renaming beats deleting when a team genuinely needs the variant — the sin is two
things sharing one name, not two things existing.

**Prevention.** No metric ships to a dashboard without a spec (§2). Names encode
the contested parameters (`wau_trailing_utc`), because names outlive documentation.

---

## 2. The metric spec template (the contract, written down)

Every governed metric gets this block, in version control, next to its SQL:

```yaml
metric: checkout_conversion_rate
version: 3          # bump on ANY definition change; see §4
owner: analytics-growth        # a person/team who answers questions
business_question: "Of sessions that reach checkout, what share complete purchase?"
population: sessions with a checkout_started event; excludes internal accounts
  (is_internal), bot-flagged sessions (is_bot), and test SKUs
numerator: sessions with purchase_completed within same session
denominator: sessions with checkout_started    # THE DENOMINATOR IS THE SPEC'S HEART
grain: session
time_basis: event time, UTC storage, reported in America/Los_Angeles;
  half-open ranges only
null_policy: sessions with NULL user_id (guests) ARE included
sources: analytics.fct_sessions (dbt model, tested)
freshness_sla: complete through T-1 by 06:00 PT
known_limits: excludes purchases completing after session timeout (~1.5% undercount,
  measured 2026-05)
```

The two fields people skip and then regret: **denominator** (Principle 2: most
metric fights are denominator fights) and **known_limits** (an undocumented 1.5%
undercount becomes a fire drill the first time someone reconciles against finance).

## 3. Vanity metrics vs. decision metrics

**Failure mode.** Optimizing numbers that can only go up and inform nothing:
cumulative signups, total page views, registered users "to date." A dashboard of
up-and-to-the-right cumulative charts feels great and cannot detect a product
getting worse. Teams have missed six months of decaying activation because the
cumulative user chart kept climbing.

**Detection.** Two tests, apply both: (1) *Can this number go down?* If
structurally no, it's vanity. (2) *Name the decision that changes if this moves
20%.* No decision → reporting theater.

**Fix.** Convert stocks to flows and totals to rates: cumulative signups → weekly
new-signup rate and activation rate; page views → task completion per session.

**Prevention.** Dashboard spec review (see `data-visualization.md` §5) requires the
"decision" line for every headline tile.

## 4. Metric drift (definitions changing silently over time)

**Failure mode.** Someone "fixes" the bot filter, or a source table swap changes
the population, and the metric moves — but the *chart doesn't say so*. The move gets
narrated as real ("the June campaign worked!"). Drift is worse than disagreement:
disagreement gets noticed; drift wears the old metric's trend line as a disguise.

**Detection.** For any suspicious level shift: `git log`/`git blame` on the metric's
SQL around the shift date (this is why definitions must live in version control —
you cannot blame a Tableau workbook formula edit). Backfill test: rerun the current
definition over the old period; if the recomputed history diverges from the recorded
history, the definition changed somewhere in between.

**Fix.** Bump the version (§2), backfill history under the new definition so the
trend is apples-to-apples, and annotate the dashboard at the change date ("v3:
bot-filter fix; ~-2% level effect").

**Prevention.** Definition changes go through the same review as code (they *are*
code); every version bump requires a backfill-or-annotate decision recorded in
CHANGELOG-style notes; dashboards display the metric version. See
`dashboard-reliability.md` §3.

## 5. Guardrail metrics (the counterweights)

**Failure mode.** A single optimized metric, pushed hard, cannibalizes what you
didn't measure: email opens up / unsubscribes up; short-run conversion up via dark
patterns / 90-day retention down; support "tickets closed per hour" up / reopens up.
Goodhart's law is not a curiosity; it is the default outcome of unguarded targets.

**Choosing guardrails — ask three questions:**
1. *What would a cynical optimizer sacrifice to move the target?* (quality, trust, latency) → guard it.
2. *What's the long-run version of this short-run metric?* (retention behind conversion) → guard it.
3. *What does another team own that this could break?* (support load, infra cost) → guard it.

**Prevention.** Every experiment declares guardrails pre-launch (enforced by the
`experiment-design-reviewer` skill, which fails any plan with an empty guardrail
list); every team-level target metric is chartered with at least one named
counterweight metric reviewed in the same meeting.

---

## Failure-mode summary table (for auditors)

| Failure | Detection | Fix | Prevention |
| --- | --- | --- | --- |
| Same name, different definitions | diff population/numerator/denominator/grain/tz across surfaces | one canonical def; rename honest variants | spec required before dashboard; parameters in the name |
| Ambiguous definition (no spec) | can two people write the same SQL from the doc? | write the §2 spec retroactively | spec as ship gate |
| Vanity metric steering a team | "can it go down?" + "what decision moves?" | stocks→flows, totals→rates | decision line required per headline tile |
| Silent definition drift | git-blame at level shifts; recompute-history test | version bump + backfill + chart annotation | definitions in VC; version shown on dashboard |
| Unguarded target metric | "what would a cynic sacrifice?" has an unmonitored answer | add counterweights retroactively; audit the damage window | guardrails required at experiment + charter level |

**Cross-references:** where the canonical definition should physically live —
`dashboard-reliability.md` §1; the SQL-level audit of one definition —
`metric-definition-auditor` skill; org-wide drift sweep —
`dashboard-reconciliation-scanner` subagent; experiment guardrails in practice —
`experiment-design.md` §6.
