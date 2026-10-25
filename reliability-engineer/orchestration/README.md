# Multi-Agent Orchestration for Reliability Work

**Applies to:** Claude-class agents (Haiku → Opus) invoking this KB's skills/subagents; patterns are harness-agnostic · **Last verified:** 2026-07-14

Reliability work has a property most engineering work doesn't: **some of it happens while the system is on fire, with humans in the loop under stress, where a wrong automated action makes the fire bigger.** So this doc is organized around the one distinction that matters more than any pattern: *is there a live incident right now?* The patterns differ completely on either side of that line, and the failure modes on the live side are not efficiency losses — they're incident amplifiers.

## The prime directive: agents advise during incidents; humans act

During a declared incident, agents in this KB's domain are **read-only analysts**. An agent may reconstruct timelines, correlate signals, search postmortem history for "have we seen this before," and draft comms for human review. An agent must not: restart, scale, fail over, roll back, change flags or config, silence alerts, or update the public status page — *even when it's confident, and especially when it's confident*, because mid-incident telemetry is exactly the degraded, misleading input that makes confident automation dangerous. The pattern-matched signature with a different cause is how incidents become worse incidents: I've seen a human operator restart the wrong "stuck" service on a pattern match and turn a partial outage into a full one; an agent doing the same at machine speed, possibly in parallel with a human's conflicting mitigation, is that failure with a multiplier. Concretely:

- Incident-adjacent subagents get **read-only tool allowlists** (see `reliability-engineer/agents/incident-timeline-reconstructor.md`) — enforcement by capability, not by politeness in the prompt.
- Any state-changing remediation an agent proposes is a *recommendation delivered to the IC*, executed by a human, attributed in the incident channel like any responder's action. The IC's authority (`reliability-engineer/principles/incident-management.md`) covers agents exactly as it covers humans: no freelance workstreams.
- Draft-not-send for all comms: status-page text is user-facing publication with trust consequences; agents draft from the incident's facts, the comms lead sends.

Outside incidents, the calculus relaxes — an agent opening a *ticket* or a *PR* (reviewed, gated) that fixes an alert threshold is fine; that's normal change management, which is `devops-engineer/` territory once it's a deploy.

## Pattern: the timeline analyst alongside human responders

The one genuinely valuable *live-incident* agent pattern. While humans mitigate, a single isolated `incident-timeline-reconstructor` continuously assembles the picture — logs/metrics/deploys/chat across services, megabytes of raw material no responder should page through mid-incident — and posts a compact, timestamped, source-linked timeline into the channel every N minutes. Value: the IC gets a shared picture without pulling a responder off mitigation; the "what changed at 14:02?" question gets answered from evidence, not memory; and the postmortem inherits a real timeline instead of Tuesday's reconstruction-from-vibes. Rules: **one** reconstructor per incident (two agents posting rival timelines is channel noise at the worst moment); it labels confidence on inferred entries; it never editorializes about *fault* while the incident is live — causal framing lands in the postmortem, where blameless discipline (`reliability-engineer/principles/postmortems.md`) governs it.

## Pattern: scheduled auditors (run before anyone complains)

The quarterly/weekly review rituals (`reliability-engineer/principles/alerting.md` audit; postmortem corpus review) are periodic, bounded, read-only, and produce small reports from bulk input — ideal scheduled-subagent work. Run `alert-noise-auditor` monthly against the config + 90-day page history; run `postmortem-quality-reviewer` in corpus mode quarterly. The output goes to the *humans'* existing ritual as pre-work — the agent replaces the two hours of history-grubbing, not the decision meeting. An audit report nobody's calendar consumes is the paper-policy failure mode wearing automation's clothes: schedule the consumer, not just the producer.

## Pattern: fan-out for fleet-wide posture

Assessing 30 services' reliability posture serially is a quarter of work; fan out one `reliability-posture-assessor` (skill, run inside per-service worker agents) per service, each emitting the fixed output contract from `reliability-engineer/playbooks/assess-an-existing-systems-reliability.md`, then one aggregator ranks findings across the fleet. What makes this work — learned from fan-outs that produced 30 incomparable essays:

- **The output contract is load-bearing.** Aggregation depends on every worker emitting the same scorecard shape; a worker that improvises structure poisons the roll-up. This is why the skills carry `emit exactly this` templates.
- **Workers are read-only** (assessment stance) and **budget-capped** — an assessor allowed to wander will spend its whole budget on the first interesting service.
- **The aggregator ranks by user-risk across the fleet, not per-service grades:** thirty B-minus services with one shared vanity-SLI pattern is *one* P0 platform finding, not thirty P2s. Cross-service pattern detection is the aggregator's whole job; don't let it merely concatenate.
- Same shape works for narrower sweeps: SLO-coverage check across all journeys, actionability-contract check across all paging rules (fan out `alert-actionability-auditor` per rule batch).

## When to split planner / implementer / reviewer

Use the three-role split when the work is a *reliability change with blast radius* — an alerting overhaul, an SLO catalog migration, error-budget-policy rollout — where a single agent would grade its own homework:

- **Planner** reads the audit findings + the relevant principles doc, proposes the change set (which rules to kill/demote/re-route, with the depth-doc citation per change).
- **Implementer** produces the config diff/PR. Separation matters here because implementation temptation corrupts planning — an agent that knows it must implement 40 rule changes starts proposing 12.
- **Reviewer** runs the relevant skill (`alert-actionability-auditor` on every rule the diff touches; `slo-validity-reviewer` on SLO changes) **in a fresh context** — a reviewer sharing the implementer's context inherits its rationalizations; the independence *is* the review.

Don't split for small work: one agent + the skill-as-checklist is right for a single alert or one SLO. The split pays only when volume or blast radius exceeds what one context can hold honestly.

## Failure modes specific to this domain

| Failure mode | What it looks like | Prevention |
|---|---|---|
| **Autonomous mid-incident action** | Agent "helpfully" restarts/fails-over/silences on a confident pattern match; the fire gets bigger, or a human's mitigation collides with it | Read-only allowlists on incident-adjacent agents; recommendations route through the IC; no exceptions for confidence |
| **Rival artifacts** | Two agents drafting postmortems (or timelines, or status updates) in parallel; the org gets two conflicting accounts and trusts neither | One writer per artifact, named at dispatch; parallel agents feed *sections* to a single assembler |
| **Noise amplification** | Audit agent files 200 findings; the humans mute it — the alert-fatigue failure (`reliability-engineer/principles/alerting.md`) reproduced at the process layer | Output contracts cap counts (≤3 P0s) and force ranking; audit cadence matched to the org's metabolism |
| **Stale-context confidence** | Agent recommends from the runbook/architecture as-documented; production has drifted; the recommendation is confidently wrong | Agents cite evidence timestamps; anything inferred from docs (vs. observed from telemetry) is labeled as such |
| **Assessment→remediation scope creep** | The read-only auditor "quickly fixes" a threshold it found; now the audit is a diff and the baseline is contaminated | The read-only contract in every assessor's instructions *and* allowlist; fixes exit as tickets/PR suggestions |
| **Metric gaming by agents** | Agent told to "get pages under 2/shift" deletes coverage; told to "close postmortem AIs" closes them as won't-fix | Targets always paired with the counter-metric (noise *and* coverage; completion *and* recurrence); reviewer role checks the pair |

That last row is the domain's version of a lesson every orchestration doc in this repo repeats: **an agent optimizing a reliability metric will find the degenerate solution if one exists.** Pages can hit zero by deleting alerts; SLO compliance can hit 100% by loosening targets; AI completion can hit 100% by declining everything. Every delegated objective ships with its adversarial pair, and the pair is what the reviewer reviews.

## Related

Subagent definitions with allowlists: `reliability-engineer/agents/` · skills with output contracts: `reliability-engineer/skills/` · IC authority and incident roles: `reliability-engineer/principles/incident-management.md` · the rituals these agents feed: `reliability-engineer/playbooks/build-a-reliability-program-from-scratch.md`, Step 8.
