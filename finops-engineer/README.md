# finops-engineer — A Principal FinOps Engineer's Exit Brief

**What this is:** 20+ years of judgment about making cloud spend visible, allocable, and optimized — tagging and allocation, showback/chargeback, optimization that doesn't cause outages, commitment strategy, unit economics, anomaly detection, and the cross-functional practice that connects engineering decisions to financial accountability — encoded for humans (junior → staff FinOps practitioners, and engineers who need cost judgment) and AI models (Haiku → Opus) to use without the author in the room. Every doc stands alone; every skill and subagent is invokable once installed (see the install note below); every strong claim is backed by a cost incident that actually happened, not vibes.

**Last full revision:** 2026-07-25 (details in `CHANGELOG.md`). Principles are provider-agnostic; where docs cite pricing constructs (RIs/Savings Plans/CUDs, CUR 2.0/BigQuery export/Cost Management, FOCUS 1.x, EDP/MACC), each carries its own `Applies to:` stamp — pricing models and discount structures change faster than judgment does.

**The one-sentence philosophy:** an opaque monthly bill becomes something engineering and finance can reason about together only in this order — see it (allocation), own it (showback + process), then optimize it — and any optimization that eats a reliability margin is a loan against the error budget, not a saving.

**Scope boundary:** provisioning infrastructure belongs to the sibling `devops-engineer/` KB; keeping it reliable belongs to `reliability-engineer/`. This KB owns the economics layer, and every optimization recommendation in it explicitly defers to `reliability-engineer/` judgment on safety margins — cheaper-and-less-reliable is not a win. Docs link out rather than duplicating.

## Find what you need in 30 seconds

| You are trying to... | Go to |
|---|---|
| Understand how this KB is organized (or extend it correctly) | `DESIGN.md` |
| Look up any term (showback, coverage vs. utilization, amortized cost, FOCUS, TTL...) | `GLOSSARY.md` |
| **Stand up a FinOps practice for a new cloud environment, end to end** | `playbooks/build-a-finops-practice-from-scratch.md` (deliberately human-led; no skill form) |
| **Assess an unfamiliar account/org's spend setup in a bounded budget** | `playbooks/assess-an-existing-cloud-spend-setup.md` — or invoke the `spend-posture-assessor` skill |
| Design tagging/allocation, shared-cost rules, showback vs. chargeback | `principles/cost-visibility-and-allocation.md` |
| Audit one account/module/PR's tagging right now | invoke the `tag-coverage-auditor` skill |
| Find every dollar nobody owns, org-wide | dispatch the `unallocated-spend-scanner` subagent |
| Rightsize / adopt spot / schedule / harvest waste — without causing an outage | `principles/cost-optimization.md` |
| Size, ladder, and manage RIs / Savings Plans / CUDs | `principles/commitments-and-discounts.md` |
| Gate one commitment purchase before money locks for 1–3 years | invoke the `commitment-proposal-reviewer` skill |
| Reconcile the whole commitment portfolio against actual usage | dispatch the `commitment-utilization-analyzer` subagent |
| Build cost-per-order/customer metrics that survive being challenged | `principles/unit-economics.md` |
| Catch cost spikes before the invoice does; design alerts people don't mute | `principles/cost-anomaly-detection.md` |
| Triage a flagged spike: growth, runaway, waste, or one-off? | invoke the `cost-anomaly-triager` skill |
| Run the practice: Crawl/Walk/Run, cadences, not becoming the cost police | `principles/operating-model-and-maturity.md` |
| Normalize spend across AWS/GCP/Azure honestly | `topics/multi-cloud-cost.md` |
| Negotiate (or survive) an enterprise agreement | `topics/vendor-negotiation.md` |
| Forecast, budget, and measure savings against a real counterfactual | `topics/budgeting-and-forecasting.md` |
| Carbon-aware computing where it meets the bill | `topics/sustainability-and-carbon.md` |
| Run AI agents on cost work without one deleting the DR standby | `orchestration/README.md` |

## Skills & subagents (in `finops-engineer/skills/` and `finops-engineer/agents/`)

| Callable | Kind | One-line trigger |
|---|---|---|
| `tag-coverage-auditor` | Skill | One bounded target → presence/vocabulary/enforcement/truth audit with per-resource fixes |
| `cost-anomaly-triager` | Skill | One flagged spike → GROWTH / RUNAWAY / WASTE / ONE-OFF, with $/day urgency and the prevention feedback |
| `commitment-proposal-reviewer` | Skill | One proposed purchase → APPROVE / REJECT / INSUFFICIENT-EVIDENCE before 1–3 years of money locks |
| `spend-posture-assessor` | Skill | Unfamiliar account → graded scorecard + ≤3-P0 plan; fan-out-ready output contract |
| `unallocated-spend-scanner` | Subagent (isolated, read-only) | Org-wide billing + inventory mining → ranked unowned-spend attribution; never run inline |
| `commitment-utilization-analyzer` | Subagent (isolated, read-only) | Portfolio × hourly usage → utilization AND coverage, stranded instruments, cliffs; never transacts |

Each carries explicit do-NOT-use guidance in its description — respect it; the boundaries encode where each one fails. None of them delete, purchase, or modify anything: agents analyze, humans transact (`orchestration/README.md`).

**To install:** these live in the KB so they version with the docs; they become invokable only once copied or symlinked into a consuming project's (or user's) `.claude/skills/` and `.claude/agents/` directories.

## How to read this KB

- **Humans, new to the domain:** `principles/cost-visibility-and-allocation.md` → `principles/cost-optimization.md` → `principles/operating-model-and-maturity.md` → the playbook matching your task. Those carry most of the judgment; everything else hangs off them.
- **Humans, experienced:** go straight to the routing table; every doc is standalone.
- **Staring at a scary invoice right now:** `skills/cost-anomaly-triager/SKILL.md` for a spike; `playbooks/assess-an-existing-cloud-spend-setup.md` for general dread.
- **Engineers who just need cost judgment for one decision:** the decision trees are inside — rightsizing and spot in `principles/cost-optimization.md`, commitment sizing in `principles/commitments-and-discounts.md`, showback/chargeback in `principles/cost-visibility-and-allocation.md`.
- **AI agents:** invoke the skill matching the task; skills embed their procedure and link deeper only for rationale. If operating with any write access near a cloud estate, `orchestration/README.md` is mandatory reading first — its prime directive (agents analyze, humans transact) is not optional.
- **Maintainers:** `DESIGN.md` for placement rules, `CHANGELOG.md` for the revision protocol. Date-stamp anything you touch; undated pricing advice is dangerous folklore.
