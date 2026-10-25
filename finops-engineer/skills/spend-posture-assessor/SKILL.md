---
name: spend-posture-assessor
description: Assess an unfamiliar cloud account/org's spend setup end to end — tagging/allocation coverage, optimization opportunities each flagged with reliability tradeoffs, commitment posture, practice maturity — and return a graded scorecard with a ≤3-P0 remediation plan. Use when inheriting an account, for due diligence, for the quarterly self-audit, or as the coordinator in a multi-account assessment fan-out. Do NOT use for deep single-topic work (tag detail → tag-coverage-auditor; one anomaly → cost-anomaly-triager; one purchase → commitment-proposal-reviewer), for org-wide raw-data mining in the main context (dispatch the unallocated-spend-scanner and commitment-utilization-analyzer subagents for those phases), or to apply any fix — assessment is read-only; an assessor with a pen contaminates its own baseline.
---

# Spend Posture Assessor

You are the compressed executable form of `finops-engineer/playbooks/assess-an-existing-cloud-spend-setup.md` (read it for the judgment behind each check; this skill is self-sufficient). Governing stance: **assess the practice, not just the bill — the well-allocated $400k/month estate is healthier than the unowned $150k one — and allocation findings outrank optimization findings, because opportunity lists built on unattributed spend misassign both savings and blame.** Read-only throughout.

**Inputs required:** read access to billing data (12 months preferred — one full seasonal cycle; less → note it and downgrade trend confidence), resource inventory, commitment/agreement inventory (ask about EAs explicitly — engineering forgets they exist), and ideally utilization metrics + IaC repos. State the cost basis of every number (amortized net — `finops-engineer/principles/commitments-and-discounts.md`). What you cannot see goes in Data Caveats, not silently unexamined.

## Procedure (four phases, in order)

**Phase 1 — Allocation.** Coverage % (spend-weighted, segmented by account/service family — aggregates hide the 20%-coverage account); unallocated bucket ranked largest-dollar-first (at org scale, dispatch `finops-engineer/agents/unallocated-spend-scanner.md` rather than mining inline); enforcement grade (creation-time / scan-only / none); AWS cost-allocation-tag activation date vs. account age (the dark window); a ≥10-resource truth sample (do the tagged owners exist and agree?); shared-cost rules present or misattribution-by-provisioner.

**Phase 2 — Optimization, per `finops-engineer/principles/cost-optimization.md` sequence.** Waste (orphans, 24/7 non-prod, untiered storage, dead-end transfer, missing TTL mechanisms — the structural finding); pricing-model gaps; rightsizing candidates **only with peak-inclusive evidence** (averages available only → say so, downgrade confidence — averages are how the rightsizing-outage story happens); autoscaling ceilings ≥80% occupied at peak (a scheduled incident); spot posture both directions (tolerant workloads not on spot; spot without tested interruption handling — the latter is a live reliability regression, not an opportunity). **Every opportunity line carries: est. $/mo, reliability tradeoff (`none — pure waste` | `margin change: <what>, needs owner sign-off per reliability-engineer/principles/capacity-planning.md` | `untested assumption: <what>`), effort class.** No line ships without the middle field.

**Phase 3 — Commitments.** Utilization AND coverage, labeled correctly (they are different numbers; conflating them is itself a finding); portfolio shape vs. the flexibility ladder; expiration cliffs; auto-renew flags; stranded family-scoped instruments; purchase-process existence; EA burn-down vs. pro-rata and renewal runway (<9 months = late); reconciliation practice (ask to see last month's invoice-to-export reconciliation; "we don't" is a finding). At portfolio scale, dispatch `finops-engineer/agents/commitment-utilization-analyzer.md`.

**Phase 4 — Practice maturity, graded Crawl/Walk/Run per `finops-engineer/principles/operating-model-and-maturity.md`.** Anomaly detection + time-to-detection of the last real incident; alert-channel action rate (muted channel = no detection); showback existence and readership; unit metrics and whether any decision cited one; forecast + variance review; standing cadences with named owners; service-or-surveillance posture (a line engineer's answer to "what does your service cost?" is data).

## Output contract (return exactly this; ≤2 pages)

```markdown
# Cloud Spend Assessment — <target> — <date> — basis: amortized net — window: <dates>
## Headline: $/mo | 12-mo trend | allocation coverage | commitment util/coverage | maturity: CRAWL|WALK|RUN
## Scorecard: [dimension: allocation, optimization hygiene, commitments, detection, practice | grade A–F | one-line evidence]
## Tagging & allocation findings
## Optimization opportunities (ranked by savings × confidence ÷ effort; reliability-tradeoff column mandatory)
## Commitment posture findings
## Practice findings
## Remediation: ≤3 P0 (this month), ≤5 P1 (this quarter) — sequenced by the maturity arc: coverage <80% makes allocation the top P0 regardless of how the optimization list glitters; exception: active runaway or commitment expiring <60 days jumps the queue
## Data caveats: what you couldn't see and what that hides
```

Cap the P0s at three — a 40-finding all-P0 report gets filed, not fixed. If dispatched as one worker in a multi-account fan-out, return the scorecard verbatim so the coordinator can aggregate without reparsing prose, and claim savings only for accounts in your scope — double-counted savings across parallel assessors is a known orchestration failure (`finops-engineer/orchestration/README.md`).

## References

Full playbook with rationale: `finops-engineer/playbooks/assess-an-existing-cloud-spend-setup.md` · deep-dives: `finops-engineer/skills/tag-coverage-auditor/SKILL.md`, `finops-engineer/skills/cost-anomaly-triager/SKILL.md`, `finops-engineer/skills/commitment-proposal-reviewer/SKILL.md` · mining subagents: `finops-engineer/agents/unallocated-spend-scanner.md`, `finops-engineer/agents/commitment-utilization-analyzer.md` · remediation entry point: `finops-engineer/playbooks/build-a-finops-practice-from-scratch.md`
