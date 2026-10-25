# DESIGN.md — Why this KB is shaped the way it is

**Last verified:** 2026-07-25 · Applies to the whole `finops-engineer/` tree, including its `skills/` and `agents/` subdirectories.

This is the design note required before any content: what goes where, and why. If you are extending this KB, read this first so you put new material in the right primitive.

## The three primitives, and the test for each

**Principles teach. Skills do. Subagents isolate.** Concretely:

| Question to ask about new content | If yes → |
|---|---|
| Is it judgment a reader must *internalize* to make their own calls — allocation-model tradeoffs, commitment-sizing decision trees, unit-economics design, war stories about optimization gone wrong? | `finops-engineer/principles/` (core tier) or `finops-engineer/topics/` (extended tier) — plain markdown |
| Is it a *repeatable procedure* an agent or human executes on demand, with defined inputs and a defined deliverable? | `finops-engineer/skills/<name>/SKILL.md` |
| Does the procedure ingest *large raw material* (a whole org's resource inventory, twelve months of line-item billing data, a commitment portfolio reconciled against per-service usage) whose content is worthless after aggregation, while its useful result is a short report? | `finops-engineer/agents/<name>.md` (subagent) |
| Is it a trivial one-liner with no auto-invoke need? | a slash command — we deliberately have none; everything here earned Skill status or stayed a doc |

The subagent test is the one people get wrong. A subagent is not "a big skill." It is justified only when the *ratio of raw material read to conclusion returned* is extreme. Billing data is the extreme case in this domain: a month of AWS Cost and Usage Report data for a mid-size org is millions of line items, and the useful output of any analysis over it is two pages. Doing that mining in the main conversation buries the very context where a human is trying to make a decision.

## The tree

```
finops-engineer/
├── README.md                          ← start here; 30-second routing table
├── DESIGN.md                          ← this file
├── GLOSSARY.md                        ← every term of art, one place
├── CHANGELOG.md                       ← dated revisions
├── principles/                        ← core tier: full-depth judgment
│   ├── cost-visibility-and-allocation.md
│   ├── cost-optimization.md
│   ├── commitments-and-discounts.md
│   ├── unit-economics.md
│   ├── cost-anomaly-detection.md
│   └── operating-model-and-maturity.md
├── topics/                            ← extended tier: production patterns + common pitfalls only
│   ├── multi-cloud-cost.md
│   ├── vendor-negotiation.md
│   ├── budgeting-and-forecasting.md
│   └── sustainability-and-carbon.md
├── playbooks/                         ← end-to-end procedures, start-to-finish
│   ├── build-a-finops-practice-from-scratch.md
│   └── assess-an-existing-cloud-spend-setup.md
├── orchestration/
│   └── README.md                      ← multi-agent patterns for FinOps work
├── skills/                            ← agent-invokable procedures
│   ├── tag-coverage-auditor/SKILL.md
│   ├── cost-anomaly-triager/SKILL.md
│   ├── commitment-proposal-reviewer/SKILL.md
│   └── spend-posture-assessor/SKILL.md
└── agents/                            ← isolated subagents
    ├── unallocated-spend-scanner.md
    └── commitment-utilization-analyzer.md
```

**Installation note.** Skills and subagents *live* in this KB so they version with the docs they reference. They are not auto-invokable from here: a consuming project or user must copy or symlink them into `.claude/skills/` and `.claude/agents/` for the harness to discover them. All cross-references in this KB use the source-of-truth `finops-engineer/...` paths.

## Specific placement decisions, with reasoning

**Core vs extended split is `principles/` vs `topics/`.** The six core areas (visibility/allocation, optimization, commitments, unit economics, anomaly detection, operating model) get full failure-mode → detection → fix → prevention depth because they are the daily job. The four extended areas (multi-cloud, vendor negotiation, budgeting/forecasting methodology, sustainability) get production patterns and pitfalls only — enough to not hurt yourself, with pointers to where depth lives. The directory boundary is the depth budget; mixing tiers in one directory is how extended docs bloat and core docs thin out.

**Anomaly detection is core; forecasting methodology is extended — deliberately.** Anomaly detection is the difference between catching a runaway resource in 4 hours and finding it on the invoice 5 weeks later; every org needs it from Crawl phase onward, so it gets a full principles doc. Forecasting *methodology* (driver-based models, seasonality decomposition, variance analysis cadence) matters most to orgs already at Walk/Run maturity and to the finance side of the house, so it lives in `topics/` with the anomaly doc carrying the baseline concepts both need.

**Playbooks are docs, and the assessment playbook has a skill counterpart.** The two mandated capabilities (build a FinOps practice from scratch; assess an existing cloud spend setup) are long, ordered procedures with judgment at each step. A human follows the playbook. An agent invokes `spend-posture-assessor`, a compressed executable rendering of the assessment playbook with an explicit output contract. The build-from-scratch playbook deliberately has *no* skill counterpart: standing up a FinOps practice is months of stakeholder negotiation — getting engineering to accept tagging enforcement, getting finance to accept engineering-legible reports, getting leadership to fund the boring visibility work before the exciting savings work. An agent "executing" it produces an allocation policy nobody agreed to, which is worse than nothing because it *looks* like governance. That asymmetry is a design decision, not an omission.

**Why `tag-coverage-auditor` is a skill and `unallocated-spend-scanner` is a subagent.** Same domain, opposite context profiles. The skill reviews a bounded target — one Terraform module, one team's account, one PR adding resources — and returns its verdict *into the conversation where the author is working*, because tag enforcement only works at resource-creation time and the review must land where the decision is being made. The subagent sweeps an entire org's billing data and resource inventory to find every dollar that can't be attributed to an owner — millions of line items in, a ranked two-page attribution report out. The skill keeps context; the agent shields it.

**Why `commitment-proposal-reviewer` is a skill and `commitment-utilization-analyzer` is a subagent.** Reviewing one proposed reservation purchase against the usage evidence is a decision-gate that belongs in the purchase conversation — it reads one proposal and a usage summary and returns a verdict before money is locked for 1–3 years. Reconciling an existing commitment *portfolio* (dozens of RIs, Savings Plans, CUDs across accounts) against actual hourly usage is a mining job: the caller needs the utilization/coverage numbers and the over/under-commitment flags, not the hourly usage matrix that produced them.

**Why `cost-anomaly-triager` is a skill, not a subagent.** Tempting to isolate, because triage reads billing data. But anomaly triage is a *conversation* — the triager needs to ask the humans in the room "did anyone launch a load test yesterday?", and its classification (legitimate growth / misconfiguration / waste / one-off) usually triggers an immediate follow-up decision in the same conversation. Bounded read (one anomaly's scope, days not months of data), decision returned to the decision-maker: skill. When triage requires org-wide mining, it dispatches the scanner subagent itself.

**Subagent tool allowlists are read-only by design.** Both subagents get Read/Grep/Glob plus Bash restricted *by instruction* to read-only billing and inventory queries (`aws ce`, `aws cur`, `gcloud billing`, `az consumption`, cloud CLIs' describe/list verbs). Neither can modify a resource, a tag, or a commitment. The highest-consequence failure mode for an automated actor in this domain is not a bad report — it is an agent "helpfully" deleting an idle-looking resource that was the DR standby, or purchasing a commitment. Purchases and deletions are human acts, always. See `finops-engineer/orchestration/README.md`.

**One GLOSSARY, at the root.** Smaller models resolve terms by exact link, and this domain is drowning in near-synonyms with real money attached to the differences (reservation vs. Savings Plan vs. CUD; coverage vs. utilization; showback vs. chargeback; amortized vs. blended vs. net-unblended cost). I watched a team report 94% "utilization" to leadership for two quarters when the number was actually *coverage* — the portfolio was 30% oversized and nobody caught it because the words got blurred. Per-directory glossaries drift; one glossary is the fix.

**Every doc standalone.** Each doc restates the two or three definitions it depends on rather than assuming the reader arrived via README. Cost: mild repetition. Benefit: a Haiku-class model given a single file can act correctly. Deliberate and non-negotiable; do not "DRY up" the docs.

**Scope boundary with `devops-engineer/` and `reliability-engineer/`.** Those KBs (sibling packs; may not be installed everywhere) own provisioning infrastructure correctly and keeping it reliable, respectively. This KB owns the economics layer: what it costs, who it belongs to, whether it's worth it, and the process connecting engineering decisions to financial accountability. Concretely: *how* to implement autoscaling is `devops-engineer/`'s; *whether the instance is oversized for its traffic* is ours; *whether shrinking it eats a safety margin the SLO depends on* is `reliability-engineer/`'s, and every optimization doc in this KB defers to that judgment explicitly — cheaper and less reliable is not a win, it is a loan against the error budget at a terrible interest rate. Docs here link out with `devops-engineer/...` and `reliability-engineer/...` paths rather than duplicating; if a pack is absent, the link still tells you what this KB deliberately does not cover.

## Conventions

- Every doc header carries `Applies to:` (the cloud-provider pricing constructs and versions the examples assume — pricing models and discount structures change faster than principles) and `Last verified:` (date). Undated cost advice is folklore; undated *pricing* advice is dangerous folklore.
- Failure-mode content follows the chain **failure mode → detection → fix → prevention**, where prevention names a mechanism (tag policy enforced at creation time, anomaly alert, governance gate in the purchase process), not a resolution to be careful.
- Decision trees over "it depends." Where a judgment could not be turned into branches, the doc lists the *inputs* to the judgment instead.
- Dollar figures in war stories are order-of-magnitude honest, not invoiced-precise — the lesson is the shape, not the number.
- Cross-references are relative paths from repo root, e.g. `finops-engineer/principles/commitments-and-discounts.md`. Skills reference docs; docs reference skills. Both directions, always.
