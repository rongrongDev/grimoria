# Incident Management: Structure Beats Heroics

**Applies to:** tool-agnostic; assumes a pager (PagerDuty/Opsgenie-class), a chat tool, and a status page exist · **Last verified:** 2026-07-14

**Working definitions** (full glossary: `reliability-engineer/GLOSSARY.md`): an **incident** is any unplanned event degrading user-experienced service that requires coordinated human response. The **Incident Commander (IC)** runs the response; **severity** classifies impact and selects the response machinery.

The core insight of two decades of incidents: **outcomes are determined less by how smart your responders are than by whether they know who's in charge, who's doing what, and who's telling the customers.** Every catastrophic response I've been part of — not incident, *response* — failed on coordination, not competence. Twelve brilliant engineers each restarting different things is worse than three organized ones.

## Severity classification: a rubric, or it's a mood

Severity must be assignable in under a minute, by the first responder, from a rubric — because everything else keys off it (who gets paged, how often you update stakeholders, whether execs are woken). If severity is negotiated per-incident, you get the two failure shapes I've seen everywhere: teams that under-classify to avoid paperwork ("it's just degraded, not down") and teams that over-classify everything until SEV1 means nothing.

**Rubric (adapt the numbers, keep the shape):**

| Severity | Definition (impact-based, checkable) | Response |
|---|---|---|
| **SEV1** | Critical user journey down or unusable for a large fraction of users; data loss/corruption in progress; security breach with active exposure | Page IC + service on-call + comms lead immediately, 24/7. Exec notification. Status page within 15 min. Updates every 30 min. Postmortem mandatory. |
| **SEV2** | Critical journey severely degraded (error rate/latency far past SLO burn threshold) or down for a meaningful subset (one region, one large tenant) | Page on-call 24/7; IC role activated. Status page if user-visible. Updates hourly. Postmortem mandatory. |
| **SEV3** | Non-critical functionality broken, or critical journey mildly degraded; SLO burning at a rate that exhausts budget in days, not hours | Business-hours response. Ticket + owner. Postmortem optional but default-on if novel. |
| **SEV4** | Minor defect, no meaningful user impact; near-miss caught before impact | Ticket. Near-misses feed the postmortem pipeline anyway — they're free lessons. |

Three rules that make the rubric survive contact with reality:

1. **Classify on observed impact, not presumed cause.** "It's probably just a cache blip" has preceded half the SEV1s of my career. You can always downgrade in 20 minutes; you cannot retroactively respond faster.
2. **When uncertain, round up.** The cost asymmetry is total: an over-paged SEV2 wastes an hour of a few people's time; an under-classified SEV1 costs hours of user impact and, worse, customers discovering the outage before you announce it.
3. **Anyone can declare.** If declaring an incident requires a manager's approval, your MTTD includes a manager's inbox latency. Declaring must be cheap, blameless, and one command (`/incident declare ...`). A declared incident that turns out to be nothing is a *successful test of the machinery*, and the postmortem culture (`reliability-engineer/principles/postmortems.md`) must say so out loud.

### Failure mode: inconsistent severity across teams/incidents

- **Failure mode:** the same impact is SEV1 on team A and SEV3 on team B; escalation and comms misfire; cross-team incidents stall while teams argue classification.
- **Detection:** quarterly, sample 10 incidents across teams and re-classify them against the rubric blind; disagreement > 20% means the rubric is being read as advisory.
- **Fix:** re-anchor the rubric to *user-journey* impact (not per-team service impact); walk recent contested incidents through it publicly.
- **Prevention:** severity definitions live in one org-wide doc keyed to named user journeys; the incident-declaration tool presents the rubric as the classification UI; postmortem template includes "was severity correct in hindsight?" as a standing question.

## Roles: the IC is not the person typing

Above trivial size, response needs three separated roles. Below ~4 responders one person may hold two hats — but they must *know* they're wearing two hats and hand one off as soon as bodies arrive.

- **Incident Commander (IC):** owns the response. Maintains the picture, sets priorities, assigns workstreams, makes the calls (rollback vs. fail forward, wake the DBA or wait), decides severity changes, decides when it's over. **The IC does not debug.** The moment the IC opens a terminal, nobody is running the incident — I've watched a SEV1 drift for 40 minutes because the IC was heads-down in a query and nobody felt authorized to redirect effort. If you're IC and you *are* the best debugger present, hand off command, not the keyboard.
- **Operations/tech lead:** runs the technical investigation and mitigation, coordinates the hands-on responders, reports state changes to the IC in plain language.
- **Communications lead:** owns all outward flow — status page, stakeholder channel, exec queries, support-team briefings. Exists so that responders never context-switch to answer "any update?" (Each such interruption costs the asker 30 seconds and the responder 15 minutes of rebuilt state.)

**Multi-team incidents: one IC, full stop.** The defining failure of multi-team incidents is ownership diffusion — team A is sure it's team B's queue, B is sure it's A's client, and both "monitor" while nothing happens. The IC need not know either system; they need the authority to say "A: prove it's not the queue by :40. B: prove it's not the client by :40. Back here at :40." Rotating a trained-IC bench across the org (any senior engineer can take command of any incident) beats per-team ICs precisely because the IC's tool is structure, not system knowledge.

### Failure mode: unclear ownership during a multi-team incident

- **Failure mode:** each team concludes the fault is elsewhere; investigation happens in parallel silos or not at all; mitigation waits on a turf resolution nobody is empowered to make.
- **Detection:** in the timeline (see `reliability-engineer/agents/incident-timeline-reconstructor.md`), look for gaps > 15 min with no assigned action, and for the phrase "we thought X team was looking at it" in the postmortem. Both are this failure's fingerprints.
- **Fix (live):** any responder noticing the drift escalates to get an IC named *now* — that is always the fix, never more investigation.
- **Prevention:** incident process requires a named IC for any SEV1/2 involving 2+ teams; IC training bench maintained (2-day course + shadowing, refreshed by game days — `reliability-engineer/topics/chaos-engineering.md` covers using chaos exercises as IC rehearsal).

## Communication: the second product of the incident

During an outage you are shipping two things: the fix, and the information. Customers and executives judge the second at least as much as the first — and unlike the fix, communication quality is fully within your control.

**Rules:**

1. **Status page before customers notice, or you've lost.** The first-mover advantage is trust: "we know, we're on it, next update by :30" turns angry ticket-writers into waiters. If customers or execs learn about the outage from Twitter/support tickets before your notice, the postmortem must record that as a failure of equal rank with the technical one, because that's how leadership experiences it.
2. **Cadence over content.** "Still investigating, next update 14:30" *on time* beats a detailed update 40 minutes late. Silence is read as either "they don't know" or "they've gone home." Commit to a cadence per severity and hit it even when there's nothing new; missing an update you promised is how stakeholders learn to interrupt responders directly.
3. **Separate channels:** a responder channel (technical, unfiltered, becomes the postmortem's raw material), a stakeholder channel (curated: impact, ETA-confidence, next update), and the public page (impact and progress in user language — never internal service names, never blame, never premature certainty about cause).
4. **Write updates for someone with no context**, because that's who reads them: "checkout errors for ~20% of EU users since 13:05; mitigation in progress; next update 14:00." Not "rolled back the flag but p99 is still weird."

### Failure mode: stakeholders learn about the outage from customers

- **Failure mode:** support gets ticket floods and exec-escalations while engineering is heads-down; the org's *story* about the incident forms without you, and it's worse than the truth.
- **Detection:** postmortem timeline check — timestamp of first customer report vs. first internal notice vs. status-page post. Any incident where customers led is a comms failure regardless of technical handling. Track this delta as a standing incident metric.
- **Fix:** comms-lead role staffed from the on-call rotation, activated automatically at SEV2+; status-page templates pre-written per scenario so posting takes 2 minutes, not 20 (nobody writes well during a SEV1).
- **Prevention:** auto-draft the status page from the incident declaration (severity + affected journey → template); include "first-external-mention vs. our-first-post" in the quarterly incident-metrics review so the gap stays visible.

## Ending the incident: the all-clear is a decision, not a feeling

The most reliably premature sentence in this profession is "looks like it's recovering." Metrics dip toward normal because traffic dropped after users gave up, because a cache refilled and will re-empty, because the retry storm paused — and the incident is declared over, responders disband, and it re-fires at 2am with a cold team and a re-woken pager.

**All-clear checklist (the IC's call, against written criteria):**

1. The *user-facing* SLI (not internal metrics) has been at normal for a defined soak — 30+ min for traffic-sensitive systems; through the next peak if the trigger was load-correlated.
2. The mitigation is understood: you can say *why* it's better, not just that it is. "It recovered on its own" means the trigger is still loose in the building — you may stand down the room, but the incident stays open at reduced severity with an explicit watch owner.
3. Any temporary mitigation (traffic block, feature flag off, oversized fleet) has a ticket, an owner, and a page-bearing alarm on its removal — temporary mitigations that quietly become permanent are how you find yourself, a year later, unable to say why checkout has been flagged off for 5% of users. (True story. Nobody could.)
4. Follow-the-sun/handoff: if response crossed a shift boundary, the closing IC briefs the incoming on-call *even though it's over* — the re-fire, if it comes, lands on them.

- **Failure mode:** premature all-clear; incident re-fires hours later, now with no warm context, often at higher severity.
- **Detection:** track re-opened incidents (same trigger within 24–72h) as a first-class metric; each one is an all-clear process failure, and the postmortem must treat the early close as a contributing factor, not a footnote.
- **Fix:** adopt the checklist; make "monitoring — mitigated, cause under investigation" a formal incident state distinct from "resolved," so status pages and pagers reflect reality.
- **Prevention:** the incident tool enforces the state machine (can't go active → resolved without passing through monitoring with a soak timer at SEV1/2); postmortem template asks "did we close too early?" every time.

## On-call: the system the incidents run on

Response quality is set before the page fires, by rotation design:

- **Rotation size 6–8 per pager.** Below 5, on-call frequency burns people out and they leave — I've watched a 3-person rotation lose all three inside a year, taking the system knowledge with them. Above ~10, each person is on-call too rarely to stay sharp.
- **Two tiers, always:** primary + secondary (or primary + IC escalation) with automatic escalation on missed ack (5 min at SEV1 rates). Escalation-on-no-ack is a safety net, not an accusation; the postmortem culture must keep it that way or people start acking pages they can't act on just to stop the timer.
- **The pager load budget:** if a rotation averages more than ~2 pages per shift, or *any* recurring sleep-hours page exists that doesn't demand immediate human action, you have an alerting-quality debt, and it is the on-call owner's job to spend engineering time paying it down — the full discipline lives in `reliability-engineer/principles/alerting.md`.
- **Handoffs are synchronous and content-bearing:** outgoing tells incoming about open weirdness, in-flight mitigations, and scheduled risky changes. A calendar flip is not a handoff; half the "slow first hour" incidents I've reviewed started with an on-call who didn't know the system was already limping.
- **What's paged must be actionable by the paged person.** Paging a generalist rotation for a database-internals problem produces a 20-minute human relay. Route alerts by ownership (see routing failure mode in `reliability-engineer/principles/alerting.md`).

## Where to go next

- What is allowed to page at all: `reliability-engineer/principles/alerting.md`
- Turning this incident into durable change: `reliability-engineer/principles/postmortems.md`
- Reconstructing what actually happened (isolated subagent): `reliability-engineer/agents/incident-timeline-reconstructor.md`
- Agents working alongside human responders — boundaries and failure modes: `reliability-engineer/orchestration/README.md`
- Rehearsing all of this before reality does it for you: `reliability-engineer/topics/chaos-engineering.md`, `reliability-engineer/topics/disaster-recovery.md`
