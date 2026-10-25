# reliability-engineer — A Principal SRE's Exit Brief

**What this is:** 20+ years of judgment about keeping production systems trustworthy — SLOs and error budgets, observability, incident response, alerting, postmortems, capacity — encoded for humans (junior → staff SRE/production engineers) and AI models (Haiku → Opus) to use without the author in the room. Every doc stands alone; every skill and subagent is invokable once installed (see the install note below); every strong claim is backed by an incident that actually happened, not vibes.

**Last full revision:** 2026-07-14 (details in `CHANGELOG.md`). Principles are tool-agnostic; where examples cite tooling (Prometheus 3.x, OpenTelemetry 1.x, Grafana 12, PagerDuty-class pagers, k6), each doc carries its own `Applies to:` stamp.

**The one-sentence philosophy:** reliability is not uptime — it is knowing what "reliable enough" means (SLOs), knowing when you're not (observability + alerting), responding without heroics (incident management), and converting every failure into structural change (postmortems) before capacity or entropy schedules the next one.

**Scope boundary:** getting code and infrastructure *into* production correctly — pipelines, IaC, deployment strategy, rollback mechanics — belongs to the sibling `devops-engineer/` KB. This KB owns the system's health once it's there, and the judgment calls about whether instability breached an SLO and what to do about it. Docs link out rather than duplicating.

## Find what you need in 30 seconds

| You are trying to... | Go to |
|---|---|
| Understand how this KB is organized (or extend it correctly) | `DESIGN.md` |
| Look up any term (SLI, error budget, burn rate, toil, RTO/RPO, blameless...) | `GLOSSARY.md` |
| **Stand up a reliability program for a new system, end to end** | `playbooks/build-a-reliability-program-from-scratch.md` (deliberately human-led; no skill form) |
| **Judge an unfamiliar system's reliability posture in a bounded budget** | `playbooks/assess-an-existing-systems-reliability.md` — or invoke the `reliability-posture-assessor` skill |
| Design SLIs/SLOs, set honest targets, write a budget policy with teeth | `principles/slos-and-error-budgets.md` |
| Check one proposed SLO for green-while-broken risk | invoke the `slo-validity-reviewer` skill |
| Make metrics/logs/traces answer questions at 3am (and not blow up in cost) | `principles/observability.md` |
| Decide what may page, kill alert fatigue, wire burn-rate alerts | `principles/alerting.md` |
| Gate one alert before it's allowed to page someone | invoke the `alert-actionability-auditor` skill |
| Audit the whole alerting estate against paging history | dispatch the `alert-noise-auditor` subagent |
| Run incidents: severity rubric, IC/comms roles, all-clear criteria, on-call design | `principles/incident-management.md` |
| Reconstruct what actually happened, live or for the postmortem | dispatch the `incident-timeline-reconstructor` subagent |
| Run postmortems that change things: blameless, causal depth, AI follow-through | `principles/postmortems.md` |
| Review a postmortem draft against the whole corpus | dispatch the `postmortem-quality-reviewer` subagent |
| Forecast demand, find the wall before production does, plan for dependencies' limits | `principles/capacity-planning.md` |
| Inject failure safely / rehearse incidents (game days) | `topics/chaos-engineering.md` |
| RTO/RPO honesty, restore testing, plans that survive their authors' absence | `topics/disaster-recovery.md` |
| Measure and actually reduce toil | `topics/toil.md` |
| Decide whether multi-region is worth it, and make failover real | `topics/multi-region.md` |
| Run AI agents on reliability work without one restarting prod mid-incident | `orchestration/README.md` |

## Skills & subagents (in `reliability-engineer/skills/` and `reliability-engineer/agents/`)

| Callable | Kind | One-line trigger |
|---|---|---|
| `slo-validity-reviewer` | Skill | "Is this SLO real?" → six-check verdict: valid / vanity / arbitrary / paper-policy |
| `alert-actionability-auditor` | Skill | Pre-merge gate on any rule that wants to page → page-worthy / demote / reject, with the contract checked |
| `reliability-posture-assessor` | Skill | Unfamiliar system → graded scorecard + ≤3 P0 remediation plan; fan-out-ready output contract |
| `incident-timeline-reconstructor` | Subagent (isolated, read-only) | Mines logs/metrics/deploys/chat → source-cited timeline; the IC's analyst; never touches the system |
| `alert-noise-auditor` | Subagent (isolated, read-only) | Whole config × 90d page history → ranked noise + coverage gaps; never run in main context |
| `postmortem-quality-reviewer` | Subagent (isolated, read-only) | Draft vs. the whole corpus → repeat classes, causal depth, AI quality; also quarterly corpus mode |

Each carries explicit do-NOT-use guidance in its description — respect it; the boundaries encode where each one fails.

**To install:** these live in the KB so they version with the docs; they become invokable only once copied or symlinked into a consuming project's (or user's) `.claude/skills/` and `.claude/agents/` directories.

## How to read this KB

- **Humans, new to the domain:** `principles/slos-and-error-budgets.md` → `principles/alerting.md` → `principles/incident-management.md` → the playbook matching your task. Those carry most of the judgment; everything else hangs off them.
- **Humans, experienced:** go straight to the routing table; every doc is standalone.
- **On-call right now with a mess in front of you:** severity rubric and IC rules are in `principles/incident-management.md`; the all-clear checklist is near the end of it.
- **AI agents:** invoke the skill matching the task; skills embed their procedure and link deeper only for rationale. If operating anywhere near a live incident, `orchestration/README.md` is mandatory reading first — its prime directive (agents advise, humans act) is not optional.
- **Maintainers:** `DESIGN.md` for placement rules, `CHANGELOG.md` for the revision protocol. Date-stamp anything you touch.
