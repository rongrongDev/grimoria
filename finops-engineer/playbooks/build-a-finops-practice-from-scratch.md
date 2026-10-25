# Playbook — Build a FinOps Practice from Scratch

**Use when:** a new cloud environment, a company that has never had FinOps, or a "cost initiative" mandate landing on your desk with no existing practice underneath it.
**Deliberately human-led; no skill counterpart.** Steps 2, 4, and 6 are stakeholder negotiations — an agent "executing" them produces policy nobody agreed to, which is worse than nothing because it looks like governance (`finops-engineer/DESIGN.md`). Agents *assist* individual steps where noted.
**Applies to:** AWS / GCP / Azure as of mid-2026; provider-specific mechanisms named per step.
**Last verified:** 2026-07-25

Sequencing is the whole playbook: it is the Crawl→Walk→Run arc from `finops-engineer/principles/operating-model-and-maturity.md` made concrete, and the ordering exists because every step consumes the previous step's output. The classic failure is starting at Step 8 (optimization) because that's where the visible money is — with no allocation, no baselines, and no trust, which is how the outage story and the $1.4M stranded-RI story in this KB's principles docs happened. Resist the pressure; buy patience with Step 5's waste harvest.

## Phase 1 — Crawl: see it (target: weeks 1–6 focused)

**Step 1 — Land the billing data somewhere queryable. (Day one; not retroactive-proof.)**
AWS: enable CUR 2.0 / Data Exports to S3 + Athena, **and activate your cost-allocation tags now** — activation is not retroactive, and every pre-activation month is unattributable forever. GCP: BigQuery billing export (detailed usage). Azure: Cost Management exports to storage + a workspace. Multi-provider: normalize into FOCUS per `finops-engineer/topics/multi-cloud-cost.md`, but do not block Phase 1 on the warehouse — provider consoles suffice for the first month's questions.
*Exit test:* you can answer "what did we spend last month, by service, by account" with a query, not a screenshot.

**Step 2 — Negotiate the tag schema and allocation rules. (The political step; do it early while goodwill is fresh.)**
Per `finops-engineer/principles/cost-visibility-and-allocation.md`: 3–5 mandatory tags (`owner`, `service`, `env`, `cost-center`) with closed vocabularies; `cost-center` values *from* finance; account/project boundaries as the coarse layer; a written split rule for each shared service (metered > proportional > even), **agreed by the consuming teams before the first report ships**. Get engineering leadership to co-sign the mandatory tier — a schema FinOps decreed alone will be treated as FinOps's problem to maintain alone.
*Exit test:* the schema fits on one page and the three most-affected team leads have said yes to it, in writing.

**Step 3 — Enforce at creation time.**
Default tags in the IaC layer (Terraform `default_tags` / CDK / Pulumi) so compliance is the zero-effort path; a CI policy check (OPA/Sentinel/Guard) failing plans with missing/off-vocabulary mandatory tags; provider-native backstops (AWS Organizations tag policies + SCPs — sandbox-OU test first; Azure Policy deny/modify with tag inheritance; GCP: lean on IaC). Pipeline mechanics: `devops-engineer/principles/infrastructure-as-code.md`. Post-hoc scanning is the backstop, never the strategy.
*Exit test:* an untagged resource cannot reach prod through the pipeline; new accounts inherit enforcement from the landing-zone template.

**Step 4 — Baseline allocation coverage and attribute the backlog.**
Measure % of spend attributable to an owner — publish the number even if it's 55%; the embarrassing baseline is the before-picture every later win is measured against. Attribute the existing unallocated bucket largest-dollar-first. *Agent assist:* dispatch `finops-engineer/agents/unallocated-spend-scanner.md` for the ranked breakdown and probable owners; humans confirm ownership. Resources nobody claims after two rounds → Step 5's deletion list.
*Exit test:* coverage ≥ ~80% and trending up, with a named plan for the top 10 remaining unallocated items.

**Step 5 — Turn on anomaly detection and harvest the free waste. (The credibility step.)**
Detection per `finops-engineer/principles/cost-anomaly-detection.md`: provider-native anomaly detection segmented by account × service, budget alerts at forecast-to-exceed, service quotas on non-prod accounts, an expected-change annotation channel, a weekly 15-minute triage cadence with mandatory dispositions. Waste per `finops-engineer/principles/cost-optimization.md` stage 1: orphaned volumes/IPs/snapshots, idle non-prod (add schedules + TTLs), lifecycle rules on cold storage. Human confirms every deletion; snapshot before delete. Announce the savings *crediting the owning teams*, not FinOps — this purchase of goodwill is the step's real output.
*Exit test:* a runaway would surface in days, not on the invoice; a visible waste win has been published; ephemeral environments get TTLs at creation.

## Phase 2 — Walk: own it (target: months 2–5)

**Step 6 — Stand up showback and the operating cadences.**
Monthly per-team showback on **one labeled cost basis — amortized net** (`finops-engineer/principles/commitments-and-discounts.md`): spend, trend, allocation coverage, top movers, open anomalies. Delivered where teams live (Slack/dashboard), not a PDF attachment. Establish the standing calendar with named owners: weekly anomaly review, monthly showback + invoice reconciliation, quarterly commitment/metric/forecast review. Name a cost owner per team. Do **not** start chargeback yet — showback is where allocation bugs get found cheaply (`finops-engineer/principles/cost-visibility-and-allocation.md`, decision tree).
*Exit test:* a team lead answers "what did we spend and is it trending right" in under a minute, from a report they trust.

**Step 7 — First unit metrics.**
Per `finops-engineer/principles/unit-economics.md`: one or two business-level metrics with denominators taken *from the business plan* and co-signed by finance; driver-layer metrics per major service underneath; definitions in version control with owners; reconcile per-unit × volume back to the bill. Resist the executive request for one blended org-wide number — layer instead.
*Exit test:* the metric appears in a real decision conversation (pricing, capacity, build-vs-buy) within a quarter, and survives being challenged.

**Step 8 — Commitments: cover the floor.**
Only now — you finally have allocation, six months of hourly usage becoming visible, and an optimization pipeline whose effect on the floor you can estimate. Per `finops-engineer/principles/commitments-and-discounts.md`: hourly-usage floor, subtract known futures, ladder instruments (pinned-deep for bedrock, flexible for the evolving layer), target ~70–85% coverage of the conservative floor, buy incrementally on the quarterly cadence, auto-renew off. Every purchase through `finops-engineer/skills/commitment-proposal-reviewer/SKILL.md` with finance sign-off; purchases are human acts, never automated (`finops-engineer/orchestration/README.md`).
*Exit test:* utilization ≥95% and coverage reported monthly, labeled correctly, with laddered expirations on the review calendar.

**Step 9 — The optimization loop, with the reliability gate.**
Formalize the proposal template from `finops-engineer/principles/cost-optimization.md`: every proposal carries load evidence (peak-inclusive), the **reliability-impact line** (what margin changes; owner + `reliability-engineer/`-informed sign-off; rollback plan), commitment-portfolio impact, and cross-team effects. Sequence waste → pricing-model → rightsizing/scheduling → architecture. Measure results against forecast baseline, and enter every funded saving into the forecast as a dated step-down (`finops-engineer/topics/budgeting-and-forecasting.md`) so claims stay falsifiable.
*Exit test:* the last three optimizations each have a filled-in reliability-impact line and a forecast entry; none caused an SLO regression.

## Phase 3 — Run: decide with it (target: month 6+)

**Step 10 — Cost at decision time.**
Infra-cost estimates on IaC PRs (Infracost-class tooling; `devops-engineer/principles/cicd-pipelines.md`), cost sections in design-review templates above a threshold, one-click team dashboards. Information, not gates — a mandatory cost-approval on every PR is bureaucracy that gets routed around (`finops-engineer/principles/operating-model-and-maturity.md`, failure mode 1).

**Step 11 — Driver-based forecasting; chargeback only if it earns it.**
Forecasts decomposed into driver × unit cost + fixed floor, monthly variance review with classified misses, scenario models feeding any enterprise-agreement negotiation (`finops-engineer/topics/budgeting-and-forecasting.md`, `finops-engineer/topics/vendor-negotiation.md`). Revisit chargeback against the decision tree in `finops-engineer/principles/cost-visibility-and-allocation.md` — coverage ≥90%, agreed shared-cost rules, finance wants it, teams control their drivers. If any leg is missing, showback is still the right answer.

**Step 12 — Keep it alive.**
FinOps is an operating function, not a project (`finops-engineer/principles/operating-model-and-maturity.md`, failure mode 4). The practice's health metrics — allocation coverage, time-to-detection, forecast accuracy, commitment utilization *and* coverage — are what the FinOps function itself is measured on; savings live in the teams' ledgers. Quarterly, re-run a light version of `finops-engineer/playbooks/assess-an-existing-cloud-spend-setup.md` against your own shop — the assessor's checklist is the drift detector.

## Anti-checklist — signs this playbook is being executed wrong

- A savings target exists but allocation coverage can't be stated → you're at Step 8-pressure with Step 4 unfinished; stop and say so.
- The tag schema has 20 tags → renegotiate to 5 enforced ones; a big unenforced schema is worse than a small enforced one.
- FinOps announced the waste savings as FinOps's win → you spent goodwill you needed for Step 9.
- Chargeback proposed before the first showback cycle has survived contact → decision tree, Step 6.
- A commitment purchase is on the table in month one → `finops-engineer/skills/commitment-proposal-reviewer/SKILL.md` will reject it for evidence-window reasons; let it.
