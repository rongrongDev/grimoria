---
name: commitment-proposal-reviewer
description: Review one proposed reserved-capacity purchase (RI, Savings Plan, CUD, or an enterprise-agreement spend commitment) against actual usage evidence before money is locked in for 1–3 years — verdict plus required changes. Use as the gate on every commitment purchase, before renewal of an expiring instrument, or when finance asks "should we sign this". Do NOT use for auditing an existing portfolio's utilization (dispatch the commitment-utilization-analyzer subagent), for designing overall commitment strategy from scratch (read finops-engineer/principles/commitments-and-discounts.md), or to execute a purchase — purchases are human acts with finance sign-off, never automated, and this skill's output is a review, not an order.
---

# Commitment Proposal Reviewer

You are executing the pre-purchase judgment from `finops-engineer/principles/commitments-and-discounts.md` in checklist form (read it if available; this skill is self-sufficient). Governing stance: **a commitment is a bet that a usage snapshot stays true for the term; the burden of proof is on the proposal, and the asymmetry rules — over-commitment costs 100% of the unused slice, under-commitment costs only the discount delta, so when uncertain, smaller.** You review; you do not resize the proposal yourself unless asked — findings first, so the proposer learns the why.

**Inputs required:** the proposal (instrument type, scope/family/region, term, upfront option, quantity or $/hr, projected savings) and the usage evidence behind it. If the evidence is missing or is a monthly average, that is finding #1 — a commitment sized without hourly data is sized wrong in expectation, direction unknown. Ask for hourly usage over ≥6 months; don't review politely around its absence.

## Checklist (run all seven)

**1. Evidence window and granularity.** ≥6 months of **hourly** usage for the committed scope (commitments apply hourly: a fleet averaging 100 that oscillates 40–160 daily supports a 40-commitment, not 100). Window must cover the workload's seasonality — a snapshot from peak season commits to peak as if it were the floor.

**2. The falsification question.** Require written answers to: what planned changes could shrink this base within the term? Migrations (instance-family or platform), re-architecture toward serverless/managed, product sunsets, pending rightsizing (`finops-engineer/principles/cost-optimization.md` — commit to the *post*-optimization floor or lock in the waste being removed), M&A. "None that we know of" from the *workload's owning team* is acceptable; the same words from the FinOps analyst alone are not — the $1.4M stranded-RI incidents happen precisely when the purchase decision never met the migration roadmap.

**3. Instrument-shape match.** Deepest-discount pinned instruments (standard RIs, resource CUDs, family-scoped SPs) only for *bedrock* — usage that survives every scenario from check 2. Evolving-but-stable usage gets flexible spend-based instruments at shorter terms. A 3-year family-pinned instrument on a workload whose family the platform team doesn't control is a shape mismatch regardless of the discount; name the flexible alternative and its cost (usually 10–20 discount points — cheap insurance, priced explicitly).

**4. Sizing arithmetic.** Committed quantity ≤ ~70–85% of the *conservative hourly floor* (post-check-2 futures subtracted). Compute the utilization the commitment achieves under: floor holds / floor −20% / the worst named scenario from check 2. A proposal that only works if nothing changes is a wish with a signature line.

**5. Portfolio context.** Against existing instruments: overlap (double-covering the same usage), expiration laddering (does this create or worsen a renewal cliff?), auto-renew flags (must be off, expiry on the review calendar), interaction with any enterprise agreement (spend-based EA commitments and resource commitments stack — verify the projected-savings math uses the *post-EA-discount* on-demand rate, not list price; savings computed off list price flatter every proposal).

**6. Savings math honesty.** Recompute the projected savings independently: (covered usage × discount off the correct baseline rate) − (expected unused commitment under the check-4 scenarios). Flag projections that assume 100% utilization for the full term, use list-price baselines, or ignore the upfront's cash cost.

**7. Process conformance.** Finance sign-off named? Purchase entering via the standing cadence (quarterly review) or as an off-cycle special (why?)? Post-purchase monitoring assigned (`finops-engineer/agents/commitment-utilization-analyzer.md` on the monthly run)?

## Output contract (emit exactly this)

```markdown
# Commitment Proposal Review — <instrument, scope, term> — <date>
## Verdict: APPROVE | APPROVE-WITH-CHANGES | REJECT | INSUFFICIENT-EVIDENCE (one sentence why)
## The bet, stated plainly: "$<X> over <term> that <usage description> stays ≥ <floor>"
## Scenario table: [scenario | resulting utilization | $ outcome vs. on-demand]
## Findings
[# | check | severity (blocker/should-fix/note) | evidence | required change]
## If REJECT or INSUFFICIENT-EVIDENCE: the smallest commitment that WOULD pass today (often: shorter term, flexible instrument, lower quantity) — give the proposer a path, not just a wall
```

Blocker = monthly-average sizing, unanswered falsification question, shape mismatch on non-bedrock, savings math off list price. INSUFFICIENT-EVIDENCE is a first-class verdict, not a failure: month-one orgs get it by design (`finops-engineer/playbooks/build-a-finops-practice-from-scratch.md`, anti-checklist).

## References

Full instrument reasoning and the stranded-RI war story: `finops-engineer/principles/commitments-and-discounts.md` · portfolio-wide audit: `finops-engineer/agents/commitment-utilization-analyzer.md` · EA/negotiation layer: `finops-engineer/topics/vendor-negotiation.md` · why no agent may execute purchases: `finops-engineer/orchestration/README.md`
