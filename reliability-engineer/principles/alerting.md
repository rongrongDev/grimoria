# Alerting: Every Page Is a Withdrawal from a Trust Account

**Applies to:** tool-agnostic; rule syntax examples are Prometheus/Alertmanager-style, concepts port to Datadog/CloudWatch/Grafana-alerting unchanged · **Last verified:** 2026-07-14

**The one-sentence philosophy:** a page is a claim that a human must act *now* on something a machine couldn't handle — and every page that turns out to be noise teaches the on-call, a little more permanently each time, that pages are ignorable. Alert design is trust-account management. The tenth noisy 3am page this month doesn't just cost sleep; it buys the future incident where the real page gets slow-acked because pages have stopped meaning anything. I have watched that exact sequence — alert fatigue → casual ack → 40-minute delayed response to a genuine SEV1 — more times than any other failure pattern in this KB.

## The three-tier decision tree

Every alert must be sorted into exactly one tier at creation time. The sorting question is not "how important is the metric" but "what should a human do, and when":

- **Page (wake someone)** when: users are being hurt *now* or the error budget is burning fast enough that they will be within hours, AND a human action exists that a machine couldn't do, AND minutes matter. All three, or it's not a page.
- **Ticket (next business day)** when: something needs human action but hours/days of delay costs little — slow budget burn, capacity trending toward a wall in weeks (`reliability-engineer/principles/capacity-planning.md`), certificate expiring in 20 days, single instance of a redundant pair lost.
- **Dashboard/log only (no notification)** when: no defined human action exists. If your honest answer to "what will the on-call do?" is "look at it and see" — it's a dashboard panel, not an alert. Most cause-based signals (CPU, memory, queue depth) live here as *diagnostic context*, not notifications.

The empty fourth tier matters most: **alerts that exist "for awareness."** Awareness is what dashboards are for. A notification channel where FYIs land is a channel that gets muted, and whatever real alerts share it get muted too.

## Symptom-based pages, cause-based context

Page on what users experience (SLI error rate, SLI latency, journey down); use cause-based signals as diagnostics and, sparingly, as tickets. The reasoning, learned expensively:

- **Cause-based paging is unbounded.** There are infinitely many things that *might* cause user pain (CPU, disk, GC, queue depth, pool saturation, ...), and each fires often without user impact. Chasing coverage by enumerating causes is how you reach 400 alert rules and 30 pages a night, of which 28 are "CPU was briefly high while users noticed nothing."
- **Symptom-based paging is complete by construction.** If users hurt, the symptom alert fires, *whatever* the novel cause — including the cause you never imagined. My favorite incident of all time (DNS resolver in a sidecar, poisoned by an upstream deploy three teams away) was caught by a plain journey-latency page; no cause-based rule on Earth would have named it in advance.
- The exception: **cause-based pages earn their place only for imminent, irreversible harm with a known human action** — disk that will be full in 4h (data loss is irreversible), cert expiring tonight, replication stopped (RPO burning — `reliability-engineer/topics/disaster-recovery.md`). The test: irreversible + imminent + known action. "Might get slow later" fails it.

## SLO burn-rate alerting (the standard scheme)

Don't page on "SLO currently breached" (too late, and un-pageable — a 30-day SLO breach is history, not an emergency). Don't page on instantaneous error rate (too twitchy — a 30-second blip pages at 3am for something self-healed). Page on **burn rate**: budget consumption speed, over two windows so it's both fast and un-twitchy.

Standard multi-window multi-burn-rate for a 99.9% / 30-day SLO (adapt proportionally):

| Condition | Meaning | Action |
|---|---|---|
| 14.4× burn over 1h **and** over 5m | Whole month's budget gone in ~2 days; still happening this minute | **Page** |
| 6× burn over 6h **and** over 30m | Budget gone in ~5 days | **Page** (business hours severity) |
| 1–3× burn over 3d | Budget will exhaust before window ends | **Ticket** |

The short window in each pair is the *still-happening* check — it stops the long window from paging you an hour after a transient already ended. The pairing is what makes burn-rate alerting simultaneously more sensitive to disasters and quieter about blips than any static threshold; it's the single best alerting upgrade most teams can make, and it comes almost free once SLOs exist (`reliability-engineer/principles/slos-and-error-budgets.md`).

## The actionability contract

Before any rule may page, it must carry — enforced as schema, not etiquette:

1. **A runbook link** answering: what does this mean, how do I confirm real user impact, what do I do, when do I escalate. An alert without a runbook is a riddle with a pager attached. (Stale runbooks are worse than none — runbook review is part of the quarterly audit below.)
2. **A dashboard link** landing on the diagnosis view for this symptom (`reliability-engineer/principles/observability.md`, "question-shaped dashboards").
3. **An owner** (team, not person).
4. **Severity/tier** and the *why*: one sentence on what user impact this represents.
5. **Duration/hysteresis** (`for: 5m` or equivalent) unless the condition is irreversible-imminent — no page for a state that self-resolves faster than a human can open a laptop. This single field kills most flapping.

This contract is packaged as a pre-merge review procedure in `reliability-engineer/skills/alert-actionability-auditor/` — run it on every new or modified paging rule, the way code review runs on code.

## Failure modes

### Alert fatigue (noise drowning signal)

- **Failure mode:** high page volume, mostly non-actionable; on-call acks reflexively, sleeps through, or mutes; a real page gets the same treatment; detection advantage lost precisely when needed.
- **Detection:** measure, don't vibe: pages/shift (>2 average is debt), % of pages resulting in no action beyond "looked, fine" (>30% is critical), sleep-hours pages/week, ack-but-no-action rate per rule. Every page gets a one-click disposition (`actionable` / `noise` / `duplicate`) at close — 5 seconds of on-call time, and it's the dataset everything else here needs.
- **Fix:** weekly on-call review triages the top noise producers: delete (most common right answer — deleting an alert nobody would act on removes risk, it doesn't add it), demote to ticket/dashboard, add duration, fix threshold, or route elsewhere. The bulk version — scanning the whole config against weeks of history — is `reliability-engineer/agents/alert-noise-auditor.md` (isolated subagent; the raw history would drown a working context).
- **Prevention:** the actionability contract on every new rule; a standing pager budget (rotation exceeding 2 pages/shift for two consecutive weeks auto-creates a P1 cleanup item for the owning team — a *process gate*, so cleanup doesn't depend on whoever suffered complaining loudly enough).

### Missing alert (degradation surfaces as a customer complaint)

- **Failure mode:** real user pain, no page; support tickets are the detection mechanism; the org discovers its monitoring's shape from its customers.
- **Detection:** every incident postmortem asks two standing questions: *what alerted us, and what should have?* (`reliability-engineer/principles/postmortems.md`). Independently: any support-ticket cluster with no corresponding alert is a coverage gap by definition — wire a monthly support-vs-pager reconciliation.
- **Fix:** the gap is almost never "add a cause-based rule for that cause" — it's "which *symptom* SLI would have caught this whole class," usually meaning a missing journey SLI (checkout was monitored; the login redirect wasn't).
- **Prevention:** coverage derives from the SLO catalog: every user journey with an SLO gets the burn-rate pair, mechanically. New journeys enter the catalog at launch (production-readiness gate). Coverage review is part of the quarterly alert audit, driven by the journey list — not by imagining failure modes one at a time.

### Wrong-team pages

- **Failure mode:** the page lands on someone who can't act — generalist paged for a DB-internals issue, platform team paged for an app bug — adding a 20-minute human-relay hop to MTTR, and teaching the mis-paged team that pages aren't theirs to fix.
- **Detection:** track reassignment rate per rule (pages re-routed after ack). Any rule >20% reassignment is mis-routed. The disposition data from the fatigue section captures this for free.
- **Fix:** route by *ownership of the action*, not by topology or by who created the rule. If the runbook's action is "escalate to team X," the alert should have paged team X.
- **Prevention:** alert rules carry owner labels validated against the service catalog; routing changes when ownership changes (service handoffs include the pager, or they didn't happen).

### Duplicate/stampede alerts

- **Failure mode:** one incident, forty pages — every service in the dependency chain pages its own team about the same root failure; the channel floods; nobody can see whether anything *new* is failing.
- **Detection:** pages-per-incident ratio in postmortem review; >5 pages for one cause is a grouping failure.
- **Fix/prevention:** inhibition rules (suppress downstream symptom alerts when the upstream hard-dependency alert is firing), grouping by incident in the pager tool, and — better — paging on the *journey* SLI once rather than per-service. Per-service alerts become tickets/diagnostics. During a declared SEV1/2, additional related pages route to the incident channel, not to fresh humans.

## The quarterly alert audit

Alert configs only grow — every incident adds rules, none remove them — so rot is the default. Once a quarter, per rotation:

1. Pull 90 days of page history with dispositions. Rank rules by noise (pages × noise-fraction).
2. For each rule that paged: would we create this today? Kill or demote the "no"s. For each that *never* fired: is the condition impossible, the rule broken, or the threshold absurd? (A rule that can't fire is a coverage gap wearing a rule's name.)
3. Walk the SLO/journey catalog: does every journey have its burn-rate pair? Do new services from this quarter have owners and routes?
4. Spot-check 5 runbooks for staleness (do the commands still exist?).

This is exactly the procedure the `alert-noise-auditor` subagent automates; run it agent-first, then spend the humans' hour on its report instead of on the raw history.

## Where to go next

- SLOs that make burn-rate alerting possible: `reliability-engineer/principles/slos-and-error-budgets.md`
- What happens after the page: `reliability-engineer/principles/incident-management.md`
- Review one alert before it can page: `reliability-engineer/skills/alert-actionability-auditor/`
- Audit the whole config: `reliability-engineer/agents/alert-noise-auditor.md`
- Telemetry the alerts stand on: `reliability-engineer/principles/observability.md`
