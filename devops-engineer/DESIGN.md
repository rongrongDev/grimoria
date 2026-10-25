# DESIGN.md — Why this KB is shaped the way it is

**Last verified:** 2026-07-14 · Applies to the whole `devops-engineer/` tree, including its `skills/` and `agents/` subdirectories.

This is the design note required before any content: what goes where, and why. If you are extending this KB, read this first so you put new material in the right primitive.

## The three primitives, and the test for each

**Principles teach. Skills do. Subagents isolate.** Concretely:

| Question to ask about new content | If yes → |
|---|---|
| Is it judgment a reader must *internalize* to make their own calls — pipeline-architecture tradeoffs, IaC blast-radius reasoning, deployment-strategy decision trees, war stories about why the rule exists? | `devops-engineer/principles/` (core tier) or `devops-engineer/topics/` (extended tier) — plain markdown |
| Is it a *repeatable procedure* an agent or human executes on demand, with defined inputs and a defined deliverable? | `devops-engineer/skills/<name>/SKILL.md` |
| Does the procedure ingest *large raw material* (a whole infra repo plus live cloud state, gigabytes of pipeline and orchestration logs) whose content is worthless after aggregation, while its useful result is a short report? | `devops-engineer/agents/<name>.md` (subagent) |
| Is it a trivial one-liner with no auto-invoke need? | a slash command — we deliberately have none; everything here earned Skill status or stayed a doc |

The subagent test is the one people get wrong. A subagent is not "a big skill." It is justified only when the *ratio of raw material read to conclusion returned* is extreme — and, for this domain specifically, when the raw material (thousands of `terraform show` resource blocks, megabytes of failed-job logs) would poison the working context in which someone is deciding whether to ship.

## The tree

```
devops-engineer/
├── README.md                        ← start here; 30-second routing table
├── DESIGN.md                        ← this file
├── GLOSSARY.md                      ← every term of art, one place
├── CHANGELOG.md                     ← dated revisions
├── principles/                      ← core tier: full-depth judgment
│   ├── cicd-pipelines.md
│   ├── infrastructure-as-code.md
│   ├── containers-and-orchestration.md
│   ├── deployment-strategies.md
│   └── secrets-in-delivery.md
├── topics/                          ← extended tier: production patterns + common pitfalls only
│   ├── gitops.md
│   ├── configuration-management.md
│   ├── supply-chain-integrity.md
│   ├── multi-cloud.md
│   ├── release-engineering.md
│   └── environment-parity.md
├── playbooks/                       ← end-to-end procedures, start-to-finish
│   ├── build-a-delivery-pipeline-from-scratch.md
│   └── assess-an-existing-delivery-setup.md
├── orchestration/
│   └── README.md                    ← multi-agent patterns for delivery work
├── skills/                          ← agent-invokable procedures
│   ├── pipeline-flakiness-reviewer/SKILL.md
│   ├── terraform-plan-auditor/SKILL.md
│   └── delivery-posture-assessor/SKILL.md
└── agents/                          ← isolated subagents
    ├── iac-drift-scanner.md
    └── deployment-failure-tracer.md
```

**Installation note.** Skills and subagents *live* in this KB so they version with the docs they reference. They are not auto-invokable from here: a consuming project or user must copy or symlink them into `.claude/skills/` and `.claude/agents/` for the harness to discover them. All cross-references in this KB use the source-of-truth `devops-engineer/...` paths.

## Specific placement decisions, with reasoning

**Core vs extended split is `principles/` vs `topics/`.** The five core areas (CI/CD pipelines, IaC, containers/orchestration, deployment strategies, secrets in the delivery path) get full failure-mode → detection → fix → prevention depth because they are the daily job and the highest-blast-radius mistakes. The extended areas (GitOps, config management, supply chain, multi-cloud, release engineering, environment parity) get production patterns and pitfalls only — enough to not hurt yourself, with pointers to where depth lives. Release engineering and environment parity sit in `topics/` but still carry full failure-mode chains, because their failure modes (mutable artifacts, staging/prod drift) are among the most expensive in the domain; they are "extended" only in that they need less tooling depth, not less judgment.

**Playbooks are docs, not skills — but the assessment playbook has a skill counterpart.** The two mandated capabilities (build a delivery pipeline from zero; assess an existing pipeline/infra setup) are long, ordered procedures with judgment at each step. A human follows the playbook. An agent invokes `delivery-posture-assessor`, a compressed executable rendering of the assessment playbook with an explicit output contract. The build-from-scratch playbook deliberately has *no* skill counterpart: standing up a delivery pipeline means choosing a cloud account structure, negotiating who holds the production credentials, and deciding what a deploy approval means in that org — an agent "executing" it unattended produces YAML nobody agreed to operate. An agent can *follow* the playbook interactively with a human; it should not be a fire-and-forget capability. That asymmetry is a design decision, not an omission.

**Why `pipeline-flakiness-reviewer` and `terraform-plan-auditor` are skills.** Both review one bounded artifact (a pipeline definition or diff; one plan file) and must return their verdict *into the conversation where the change is being made* — a flakiness review that lands anywhere other than the PR discussion, or a plan audit that lands anywhere other than the apply decision, is trivia. Bounded input, verdict where the decision is: skill.

**Why `iac-drift-scanner` is a subagent.** Comparing an entire infrastructure repo against live cloud state means running `terraform plan` across every root module, walking `terraform state list` output, and querying cloud APIs for unmanaged resources — thousands of resource-detail lines in, one drift inventory out. Run that in the main context and the conversation deciding what to do about the drift is buried under the evidence. It is also **read-only and forbidden from remediating**: a scanner that "helpfully" runs `terraform apply` to fix drift is the exact blast-radius failure this KB exists to prevent (see `devops-engineer/orchestration/README.md`).

**Why `deployment-failure-tracer` is a subagent.** Tracing a failed deployment to root cause means reading CI job logs, registry metadata, orchestrator events, and rollout history across the whole delivery path — megabytes in, one causal chain out. The person (or incident channel) waiting for the answer needs the chain, not the logs. Read-only by the same contract. Where the failure has become a production incident, the *system-health* side belongs to `reliability-engineer/agents/incident-timeline-reconstructor.md`; this tracer owns the delivery path up to and including the rollout mechanism.

**Subagent tool allowlists are minimal by design.** Both subagents get Read/Grep/Glob plus Bash restricted by instruction to read-only commands (`terraform plan`/`show`/`state list`, `kubectl get`/`describe`/`logs`, `gh run view`, cloud CLI describe/list calls). Neither may run `apply`, `delete`, `rollout`, `push`, or any state-changing verb. The highest-consequence failure mode in this domain is an automated actor mutating infrastructure or triggering a deploy as a side effect of "investigating."

**One GLOSSARY, at the root.** Smaller models resolve terms by exact link, and humans disagree about terms more than they think — I have watched a team argue for a sprint because half of them meant "blue-green" when they said "canary." Per-directory glossaries drift; one file at the root does not.

**Every doc standalone.** Each doc restates the two or three definitions it depends on rather than assuming the reader arrived via README. Cost: mild repetition. Benefit: a Haiku-class model given a single file can act correctly. Deliberate and non-negotiable; do not "DRY up" the docs.

**Scope boundary with `reliability-engineer/`.** That KB (sibling pack) owns keeping a running system healthy — SLOs, observability, incident response, alerting, capacity. This KB owns getting code and infrastructure *into* production correctly and repeatably. Concretely: *how* to structure a canary rollout, shift traffic, and wire automatic rollback is ours; *whether the canary's error rate constitutes an SLO-relevant regression and whether to page* is theirs. A deploy that succeeds but leaves the system unhealthy → hand off to `reliability-engineer/`. A reliability problem caused by *how* something was deployed (bad health check, stale artifact, partial rollout) → ours. Docs link out with `reliability-engineer/...` paths rather than duplicating.

**Scope boundary with `security-dev/`.** Secrets management *in the delivery path* (CI credentials, injection at deploy time, rotation that doesn't break rollouts) and supply-chain integrity *as a pipeline property* (pinning, signing, provenance verification gates) are ours, because they are delivery mechanics. Threat modeling, vulnerability triage, incident response to a leaked credential, and org-wide security policy are `security-dev/` territory; docs here link out at exactly those seams.

## Conventions

- Every doc header carries `Applies to:` (tool/version context — this domain rots fast; Terraform, Kubernetes APIs, and CI platform features all break advice within a year or two) and `Last verified:` (date). Undated advice is folklore.
- Failure-mode content follows the chain **failure mode → detection → fix → prevention**, where prevention names a mechanism (a pipeline gate, a required review, a policy check, a scheduled scan), not a resolution to be careful.
- Decision trees over "it depends." Where a judgment could not be turned into branches, the doc lists the *inputs* to the judgment instead.
- Cross-references are relative paths from repo root, e.g. `devops-engineer/principles/infrastructure-as-code.md`. Skills reference docs; docs reference skills. Both directions, always.
- Primary worked examples: GitHub Actions for CI/CD, Terraform for IaC, Kubernetes manifests + Helm for orchestration. Concepts are stated tool-agnostically first so they port to GitLab CI, OpenTofu, Pulumi, and Nomad without rewriting.
