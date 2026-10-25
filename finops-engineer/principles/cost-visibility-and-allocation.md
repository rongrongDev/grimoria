# Cost Visibility & Allocation — tagging, showback/chargeback, and the fight against the "unallocated" bucket

**Applies to:** AWS (cost allocation tags, CUR 2.0 / Data Exports, Cost Categories), GCP (labels, BigQuery billing export), Azure (tags, Cost Management exports) as of mid-2026. The principles are provider-agnostic; the enforcement mechanisms named are provider-specific and dated.
**Last verified:** 2026-07-25

**Definitions this doc depends on:** *Allocation* = attributing every dollar of cloud spend to an owner (team, service, product, environment). *Showback* = reporting each owner's costs to them with no money moving. *Chargeback* = actually transferring those costs to the owner's budget. *Unallocated spend* = the bucket of cost that cannot be attributed to any owner. Full glossary: `finops-engineer/GLOSSARY.md`.

## The one thing to internalize

**You cannot optimize, forecast, or hold anyone accountable for spend nobody owns.** Every other capability in this KB — optimization (`finops-engineer/principles/cost-optimization.md`), unit economics (`finops-engineer/principles/unit-economics.md`), anomaly detection (`finops-engineer/principles/cost-anomaly-detection.md`) — sits on top of allocation. This is why the maturity model (`finops-engineer/principles/operating-model-and-maturity.md`) puts visibility in Crawl: an org that jumps straight to optimization with 40% unallocated spend is optimizing the visible 60% while the invisible 40% grows unwatched. I have seen exactly that: a company ran a celebrated rightsizing program that saved $30k/month while an untagged data-transfer pattern in a "shared" account grew $50k/month over the same two quarters. Net position: worse, and nobody's fault, because it was nobody's spend.

## Designing the tagging/allocation strategy

### The tag schema: small, mandatory, enforced

The failure pattern is a 25-tag "standard" where 3 tags matter and none are enforced. Design the other way:

- **Mandatory tier (3–5 tags, enforced at creation):** `owner` (a team that exists in your org chart, not a person — people leave), `service` (maps to your service catalog), `env` (prod/staging/dev/test from a closed vocabulary), and usually `cost-center` (finance's dimension; get the value list *from* finance, don't invent one). Everything else is optional tier.
- **Closed vocabularies, machine-validated.** `env: Production`, `env: prod`, and `env: PROD` are three buckets in every billing tool. Publish the allowed values; reject others. Case sensitivity is real: AWS cost allocation tags are case-sensitive in the CUR.
- **Derive, don't duplicate.** If `service` reliably maps to `owner` via the service catalog, enforce `service` and derive `owner` at reporting time. Every tag humans must set by hand is a tag that will drift.

### Enforcement at creation time is the entire game

A tagging policy that is checked monthly is a tag-cleanup treadmill; a policy checked at resource-creation time is a solved problem. Enforcement points, in order of leverage:

1. **IaC pipeline (best).** Default tags at the provider/stack level (Terraform `default_tags`, CDK Tags.of, Pulumi transformations) so the happy path is compliant with zero per-resource effort, plus a policy check in CI (OPA/Sentinel/CloudFormation Guard) that fails the plan when mandatory tags are missing or off-vocabulary. The pipeline mechanics belong to `devops-engineer/principles/infrastructure-as-code.md`; what to enforce is this doc.
2. **Provider-native creation-time enforcement.** AWS Organizations tag policies plus SCPs denying creation without mandatory tags (test SCPs in a sandbox OU first — a bad deny rule breaks everyone's morning); Azure Policy `deny`/`modify` effects; GCP org policy is weaker here, so lean on IaC.
3. **Post-hoc scanning (necessary, insufficient).** A scheduled sweep for noncompliant resources — the backstop for console-created resources and services that dodge creation-time hooks. This finds drift; only 1 and 2 prevent it.

**Also activate the tags in billing.** On AWS, a tag does nothing for cost reporting until activated as a cost allocation tag — and activation is **not retroactive**: spend before activation is unattributable forever via tags. Activate the mandatory schema on day one, before the data exists to regret.

### What tags cannot reach — and what to do instead

A real allocation model is **tags + account/project structure + shared-cost rules**, because 15–30% of a typical bill is not cleanly taggable: untaggable line items (some data transfer, some support fees, marketplace charges), shared platform infrastructure (the EKS cluster, the shared VPC/NAT, the observability stack, the CI fleet), and enterprise support/credits.

- **Account/project boundaries are the coarse allocation layer.** An account that belongs wholly to one team allocates everything in it by default, including the untaggable residue. This is a strong reason to prefer many small accounts/projects over few big ones (the landing-zone mechanics are `devops-engineer/` territory).
- **Shared costs need an explicit, written split rule per shared service.** Options, in order of preference: **direct metering** (split by measured consumption — pods' CPU/memory requests for a shared Kubernetes cluster via Kubecost/OpenCost-class tooling, per-team query bytes for a shared warehouse); **proportional** (split in proportion to each team's directly-allocated spend — defensible default when metering is impractical); **even split** (acceptable only for true overhead like the security tooling everyone benefits from equally). Write down which rule applies to which shared service and get the affected teams to agree *before* the first report ships — the same split rule that is boring in a design review is a war in a budget review.

**The misattribution trap:** the lazy default is that a shared resource is billed entirely to whichever team provisioned it. I watched a platform team "own" $80k/month of shared RDS that eleven product teams actually consumed; their VP got beaten up over a number they had zero control over, and the platform team's rational response was to stop provisioning shared infrastructure — pushing every team to run their own worse, *more expensive* copies. Bad allocation doesn't just misreport; it creates incentives that raise total cost.

## Showback vs. chargeback — decision tree

- **Always start with showback.** Every team sees its own spend, trend, and unit costs monthly at minimum. Do this even at Crawl maturity with imperfect allocation — visibility with stated caveats beats silence.
- **Move to chargeback when, and only when:** allocation covers ≥ ~90% of spend with agreed shared-cost rules; finance actually wants cloud in team P&Ls; and teams have real authority over the drivers of their allocated costs. Charging a team for costs it cannot influence produces politics, not efficiency.
- **Stay on showback indefinitely if** the org is small enough that a central budget with visible per-team numbers already changes behavior. Chargeback is an accountability mechanism, not a maturity badge.
- **Never lead with chargeback on bad data.** The first time a team is billed for spend that turns out to be misallocated, you lose the credibility that every future report depends on. Showback is where allocation bugs get found cheaply.

## Failure modes → detection → fix → prevention

### 1. Large unallocated bucket ("other/untagged" is your biggest cost center)
- **Failure mode:** unattributable spend grows past ~10–15%; reports lose credibility ("these numbers are wrong anyway"); anomalies hide inside the bucket because no one owns watching it.
- **Detection:** track **allocation coverage** (% of spend attributable to an owner) as a first-class metric on the FinOps dashboard, trended monthly. Dispatch the `unallocated-spend-scanner` subagent (`finops-engineer/agents/unallocated-spend-scanner.md`) for the ranked breakdown of what's in the bucket and its probable owners.
- **Fix:** attribute by largest-dollar-first, not by resource count — 20 resources are usually half the bucket. Use account boundaries, resource naming, and provisioning history (CloudTrail/deploy logs) to find owners; a resource nobody claims after two rounds of asking is a deletion candidate (see orphaned-resource handling in `finops-engineer/principles/cost-optimization.md`).
- **Prevention:** creation-time enforcement (above); allocation-coverage threshold alert (drops below target → FinOps investigates *that month*, not at quarter-end).

### 2. Tag governance drift (compliant at launch, decaying ever after)
- **Failure mode:** the schema was enforced once, then new services, new teams, an acquisition, or a new provider service (serverless, managed AI endpoints — every new service family starts under-governed) erode coverage a point a month. Nobody notices, because nobody re-measures.
- **Detection:** coverage trend, segmented by account and by service family. A flat org-wide number can hide one new account at 20% coverage.
- **Fix:** targeted remediation on the segments driving the decline; add the missed resource types to the policy checks.
- **Prevention:** governance checks live in the pipeline, not in a wiki; a quarterly `tag-coverage-auditor` run (`finops-engineer/skills/tag-coverage-auditor/SKILL.md`) as the scheduled backstop; every new account/project inherits enforcement from the landing-zone template by default.

### 3. Shared-service misattribution (the whole cost lands on the provisioning team)
- **Failure mode:** as in the RDS story above — one team eats a shared bill, gets punished for other teams' consumption, and rationally stops sharing infrastructure, raising total cost.
- **Detection:** any single "platform"/"infra" team allocated a suspiciously large share of spend; any line item over ~$10k/month with exactly one owner but many consumers (check connection/query/namespace metadata).
- **Fix:** move the service onto an explicit split rule (metered > proportional > even, per above).
- **Prevention:** a standing rule that no shared service ships without a written split rule agreed by its consumers; review the shared-cost ruleset whenever a new shared platform launches.

### 4. Tags exist but are wrong (the quiet one)
- **Failure mode:** worse than missing tags, because wrong tags produce *confidently wrong* reports. Classic causes: copy-pasted IaC modules carrying the source team's tags; `env: dev` on what became a prod dependency; team renames/reorgs leaving stale `owner` values pointing at teams that no longer exist.
- **Detection:** validate tag values against live sources of truth (org chart / service catalog), not against the schema alone — a syntactically valid tag can still name a dead team. Cross-check a sample: does the `owner` team's on-call actually respond for this resource?
- **Fix:** bulk-correct from the service catalog; treat every reorg as a mandatory tag-migration event with a deadline.
- **Prevention:** derive owner-ish tags from the service catalog rather than hand-setting them; make tag migration a checklist item in the reorg/rename runbook.

## What good looks like

≥90% allocation coverage with the residue explained, not ignored; mandatory tags enforced at creation so compliance is the path of least resistance; every shared service on a written split rule its consumers agreed to; showback reports teams actually open — and the test for that is concrete: **a team lead can answer "what did we spend last month, on what, and is it trending the right way" in under a minute, from a report they trust.** When that's true, optimization (`finops-engineer/principles/cost-optimization.md`) and unit economics (`finops-engineer/principles/unit-economics.md`) have ground to stand on.

## Related

- Audit a bounded target's tagging now: `finops-engineer/skills/tag-coverage-auditor/SKILL.md`
- Sweep the whole org for unallocated spend: `finops-engineer/agents/unallocated-spend-scanner.md`
- Where allocation fits the maturity arc: `finops-engineer/principles/operating-model-and-maturity.md`
- Stand up allocation from nothing: `finops-engineer/playbooks/build-a-finops-practice-from-scratch.md` (Steps 2–4)
- Multi-cloud tag normalization: `finops-engineer/topics/multi-cloud-cost.md`
