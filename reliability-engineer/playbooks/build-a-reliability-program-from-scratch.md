# Playbook: Build a Reliability Program from Scratch

**Applies to:** a new system (or an org with no reliability practice) — tool-agnostic · **Last verified:** 2026-07-14
**You are:** the engineer told "make this reliable" with no SLOs, no paging discipline, no postmortems, and probably no mandate beyond a worried VP. **Time horizon:** a real program lands in ~a quarter; this playbook orders the work so each step pays for the next. Follow it start-to-finish; every step names its deliverable and its done-check.

**Deliberately not a skill:** this playbook is weeks of negotiation and organizational change; an agent "executing" it produces documents nobody agreed to (see `reliability-engineer/DESIGN.md`). Individual steps *do* have agent-invokable counterparts, named where they exist.

**Sequencing logic, so you can defend it:** journeys before SLIs (you can't measure what you haven't named), SLIs before SLOs (targets need data), SLOs before alerts (pages need a definition of bad), alerts before incident process (the process starts with a page), incidents before postmortems (learning needs material). Skipping ahead is the classic failure — orgs that start by buying an incident tool or writing 200 alerts do this in reverse and spend a year undoing it.

---

## Step 0 — Get the mandate in writing (week 1)

Reliability programs die of sponsorship failure more than technical failure, and they die at the first error-budget freeze. Before anything technical: one page, signed by whoever owns both engineering and product priorities, saying (a) the org is adopting SLOs, (b) the error-budget policy to be written in Step 3 will be *enforced*, (c) named time allocation for this work. If you can't get this signed, stop and understand why — you're about to build a program that shatters on first contact with a roadmap.

**Deliverable:** the signed page. **Done-check:** it names the person who will personally uphold a feature freeze.

## Step 1 — Name the user journeys (week 1)

With product, list the 3–7 things users *do* that the business dies without: "log in," "search and view," "checkout," "API consumers submit jobs." Journeys, not services (`reliability-engineer/principles/slos-and-error-budgets.md`, SLI rule 3). Rank them. Everything downstream keys off this list, and it's deliberately short — a program that starts with 40 SLOs maintains none of them.

**Deliverable:** ranked journey list with a one-line "what failure looks like to the user" each. **Done-check:** product agrees this list is complete enough that a SEV1 on anything *off* the list is acceptable to handle ad hoc.

## Step 2 — Stand up minimum honest measurement (weeks 1–3)

For each journey, get an SLI you can defend, measured at the outermost point you control (LB/edge — not the application; the app can't see itself being down), plus one full-journey synthetic probe from outside your network. Apply the SLI design rules — ratio form, threshold-latency not average, written event definitions, health checks excluded — from `reliability-engineer/principles/slos-and-error-budgets.md`, and validate each SLI against the vanity-SLI failure mode there (or run the `reliability-engineer/skills/slo-validity-reviewer/` skill on each). Where instrumentation doesn't exist, meet the minimum standard in `reliability-engineer/principles/observability.md` (golden signals + RED-per-dependency + trace/log correlation IDs + version labels) for the services on the top journeys *only* — resist instrumenting the world; you'll do it badly and late.

Let the SLIs run 2–4 weeks collecting baseline while you do Steps 3–5. Do not skip the soak: targets set on a week of data are guesses wearing decimals.

**Deliverable:** per-journey SLI definitions (in reviewed config, each with a written `measurement_point` and `blind_to:` note) + dashboards + probes. **Done-check:** you can answer "what was journey X's success rate last Tuesday 2–3pm?" in under five minutes, and the synthetic probe has caught at least its own test-failure.

## Step 3 — Set SLOs and write the error-budget policy (week 4±)

Targets from the four inputs, in order: user pain threshold, contractual SLA (SLO strictly tighter), the Step-2 baseline (first target slightly *below* current typical — achievable, honest, tightenable), dependency ceiling (you can't promise more nines than your hard dependencies compose to). Each SLO carries a written `rationale:`. Then the error-budget policy — thresholds and consequences table, escape-hatch clause, the works — per `reliability-engineer/principles/slos-and-error-budgets.md`, signed by the Step-0 sponsor *now, in the calm*, not when the budget first empties.

**Deliverable:** SLO catalog + signed budget policy. **Done-check:** the policy names what stops shipping at budget-zero, and the sponsor has read that sentence aloud in a leadership meeting. (I mean this literally. It's the cheapest enforcement-insurance that exists.)

## Step 4 — Alerting: burn rates and (almost) nothing else (week 5)

Wire the standard multi-window multi-burn-rate pair per journey SLO (14.4×/1h+5m → page; 6×/6h+30m → page; ~1×/3d → ticket) from `reliability-engineer/principles/alerting.md`. Add the short list of irreversible-imminent cause alerts (disk-full trajectory, cert expiry, backup failure, replication lag > RPO). Every page passes the actionability contract — runbook link, dashboard link, owner, severity, duration — enforce it with the `reliability-engineer/skills/alert-actionability-auditor/` skill as the review gate from day one, so the config never accumulates the debt everyone else's has. If migrating from an existing noisy config rather than greenfield: dispatch `reliability-engineer/agents/alert-noise-auditor.md` first and carry over only what survives it.

**Deliverable:** paging rules + runbook stubs + disposition tracking (the one-click `actionable/noise/duplicate` close — you'll want the data in Step 8). **Done-check:** a fire-drill (synthetic SLI degradation in staging or a controlled prod slice) pages the right person with working links, and zero alerts exist "for awareness."

## Step 5 — Incident process: rubric, roles, comms (weeks 5–6, parallel with 4)

Adopt the severity rubric, IC/ops/comms role split, anyone-can-declare rule, all-clear checklist, and update-cadence table from `reliability-engineer/principles/incident-management.md` — adapt the numbers, keep the shapes. Set up: one-command incident declaration, per-severity channel conventions, status-page templates pre-written per journey, and an on-call rotation meeting the health constraints (6–8 people, two tiers, auto-escalation on missed ack, synchronous handoffs). Then rehearse: one game day, fault injected, full machinery exercised — declaration, IC, comms, all-clear (`reliability-engineer/topics/chaos-engineering.md`, game-day pattern). The rehearsal converts the document into a process; skipping it means your first SEV1 is the rehearsal.

**Deliverable:** incident process doc + tooling + one completed game day with its findings filed. **Done-check:** a mid-level engineer who joined last month can declare an incident and knows who becomes IC.

## Step 6 — Postmortems with follow-through (weeks 6–8, i.e., after your first real incidents)

Adopt the template and blameless norms from `reliability-engineer/principles/postmortems.md`: contributing-factors-plural, five-stage sweep, counterfactual test. Wire the action-item mechanics *before* the first postmortem — owner + real-backlog ticket + due date at the review meeting, completion SLO (P0 ≤ 30 days), monthly open-items review with auto-escalation — because follow-through machinery retrofitted later never catches the backlog. Run the first two or three postmortem reviews yourself with maximal honesty about your own program's gaps; the org learns the culture from those meetings, not the policy doc.

**Deliverable:** template + tracked-AI pipeline + first postmortems done. **Done-check:** every AI from postmortem #1 has an owner and a date, and at least one names a *detection or mitigation* factor, not just the trigger.

## Step 7 — Capacity floor (weeks 8–10)

Per the operating rhythm in `reliability-engineer/principles/capacity-planning.md`: identify each top-journey service's constrained resource and its cliff (one load test each, open-model, production-shaped traffic — see the four-line result contract there); compute time-to-exhaustion from peak-demand trend; write per-service headroom targets with rationale; start the dependency ledger (peak usage vs. known limit per critical dependency); schedule the monthly review. Ticket-tier alerts on 30-day exhaustion forecasts.

**Deliverable:** capacity one-pager per top journey + dependency ledger + the recurring review on calendars. **Done-check:** for the #1 journey you can state, with sources: current peak, growth rate, the wall, and the lead time to move it.

## Step 8 — The operating rhythm (ongoing; instituted by week 12)

The program is the *rhythm*, not the artifacts — every artifact above rots in a quarter without its ritual:

| Cadence | Ritual | Inputs |
|---|---|---|
| Weekly | On-call review: pages triaged by disposition, top noise producer actioned | Step-4 disposition data |
| Monthly | Capacity review · open-action-items review | Steps 6–7 |
| Quarterly | SLO review (targets still honest? — the two condemning questions from `reliability-engineer/principles/slos-and-error-budgets.md`) · alert audit (dispatch `alert-noise-auditor`) · restore/game-day exercise · corpus patterns review (dispatch `reliability-engineer/agents/postmortem-quality-reviewer.md` in corpus mode) | everything |

**Done-check for the whole program** — four questions, answerable with evidence, by someone other than you: Is any journey's SLO burning right now? What happened the last time a budget emptied (did the policy execute)? What fraction of last quarter's pages were actionable? Are last quarter's P0 postmortem action items done? An org that can answer those four has a reliability program. An org that can't, has dashboards.

---

## If you only have two weeks

Steps 1, 2, and 4-for-the-top-journey-only, plus the severity rubric and declaration command from Step 5. That's: know what matters, measure it honestly, page on it sanely, and know who's in charge when it breaks. It's a floor, not a program — but it's the floor that catches the outage that would otherwise have funded your mandate the expensive way.

## Related

Assessing an *existing* system instead: `reliability-engineer/playbooks/assess-an-existing-systems-reliability.md` (or the `reliability-posture-assessor` skill) · every step's depth doc is linked inline above.
