# devops-engineer — A Principal DevOps Engineer's Exit Brief

**What this is:** 20+ years of judgment about getting code and infrastructure into production safely and repeatably — CI/CD pipelines, Infrastructure as Code, containers and orchestration, deployment strategies, secrets in the delivery path — encoded for humans (junior → staff) and AI models (Haiku → Opus) to use without the author in the room. Every doc stands alone; every skill and subagent is invokable once installed (see the install note below); every strong claim is backed by an incident that actually happened, not vibes.

**Last full revision:** 2026-07-14 (details in `CHANGELOG.md`). Concepts are tool-agnostic; worked examples cite GitHub Actions, Terraform 1.x, Docker/OCI, Kubernetes 1.31–1.33, Helm 3.16+, ArgoCD 3.x/Flux 2.x, Ansible Core 2.18 — each doc carries its own `Applies to:` stamp, and this domain rots fast, so trust the stamps over the memory.

**The one-sentence philosophy:** the delivery path's product is a trustworthy claim — "this exact artifact, built from this exact commit, is safe to run in production, and we can take it back" — and every practice in this KB exists to keep some part of that claim honest: the pipeline proves *safe*, IaC and artifacts prove *exact*, deployment strategy proves *take it back*.

**Scope boundaries:** keeping the running system healthy — SLOs, observability, alerting, incidents, capacity — belongs to the sibling `reliability-engineer/` KB (*how* to canary is ours; *whether the canary's metrics warrant a page* is theirs). Threat modeling, leak forensics, and security policy belong to `security-dev/` (secrets *as delivery mechanics* are ours). Docs link out at the seams rather than duplicating.

## Find what you need in 30 seconds

| You are trying to... | Go to |
|---|---|
| Understand how this KB is organized (or extend it correctly) | `DESIGN.md` |
| Look up any term (blue-green, drift, digest, parity budget, theater stage...) | `GLOSSARY.md` |
| **Build a delivery pipeline from zero, end to end** | `playbooks/build-a-delivery-pipeline-from-scratch.md` (human-led; agents assist at the marked gates) |
| **Judge an unfamiliar CI/CD + IaC estate in a bounded budget** | `playbooks/assess-an-existing-delivery-setup.md` — or invoke the `delivery-posture-assessor` skill |
| Design pipelines that can't lie: flakiness, reproducibility, theater stages, cache poisoning | `principles/cicd-pipelines.md` |
| Review one pipeline definition or change for non-determinism | invoke the `pipeline-flakiness-reviewer` skill |
| Terraform judgment: state, locking, blast radius, drift, module design | `principles/infrastructure-as-code.md` |
| Gate one Terraform plan before apply | invoke the `terraform-plan-auditor` skill |
| Measure drift across a whole estate against live cloud state | dispatch the `iac-drift-scanner` subagent |
| Images, manifests, resource limits, probes that don't lie | `principles/containers-and-orchestration.md` |
| Choose rolling vs. canary vs. blue-green; make rollback real; expand/contract | `principles/deployment-strategies.md` |
| Trace a failed or suspect deployment to its root cause | dispatch the `deployment-failure-tracer` subagent |
| Secrets in CI/CD: OIDC, sprawl, leaked-to-git, rotation that doesn't break prod | `principles/secrets-in-delivery.md` |
| GitOps: reconciliation, stuck syncs, manual-change fights | `topics/gitops.md` |
| Ansible/config management: idempotency, what it's still for in 2026 | `topics/configuration-management.md` |
| Pin/verify/sign everything the build consumes | `topics/supply-chain-integrity.md` |
| Multi-cloud: when it's legitimate, what the abstraction tax costs | `topics/multi-cloud.md` |
| Versioning, artifact immutability, monorepo build graphs | `topics/release-engineering.md` |
| Staging that predicts production; hunting works-in-staging failures | `topics/environment-parity.md` |
| Run AI agents on delivery work without one applying to prod mid-investigation | `orchestration/README.md` |

## Skills & subagents (in `devops-engineer/skills/` and `devops-engineer/agents/`)

| Callable | Kind | One-line trigger |
|---|---|---|
| `pipeline-flakiness-reviewer` | Skill | Any workflow change → seven-check review; verdict names every counterfeit-green path |
| `terraform-plan-auditor` | Skill | Any plan before apply → destroys/replaces/churn/wrong-target audit; DO-NOT-APPLY is an expected verdict |
| `delivery-posture-assessor` | Skill | Unfamiliar estate → graded scorecard + ≤10 ranked risks + three-horizon remediation; fan-out-ready contract |
| `iac-drift-scanner` | Subagent (isolated, read-only) | Whole repo × live cloud state → triaged drift inventory + out-of-band-writer attribution; never remediates |
| `deployment-failure-tracer` | Subagent (isolated, read-only) | Failed/suspect deploy → source-cited causal chain + earliest-knowable-point; never retries or rolls back |

Each carries explicit do-NOT-use guidance in its description — respect it; the boundaries encode where each one fails.

**To install:** these live in the KB so they version with the docs; they become invokable only once copied or symlinked into a consuming project's (or user's) `.claude/skills/` and `.claude/agents/` directories.

## How to read this KB

- **Humans, new to the domain:** `principles/cicd-pipelines.md` → `principles/infrastructure-as-code.md` → `principles/deployment-strategies.md`, then the playbook matching your task. Those three carry most of the judgment; everything else hangs off them.
- **Humans, experienced:** go straight to the routing table; every doc is standalone.
- **Standing up delivery for a new service right now:** `playbooks/build-a-delivery-pipeline-from-scratch.md`, top to bottom, doing every **Prove it**.
- **AI agents:** invoke the skill matching the task; skills embed their procedure and link deeper only for rationale. Before *any* action that writes to infrastructure or triggers a deploy, `orchestration/README.md` is mandatory reading — its prime directive (agents act only through the same gates humans use, and never hold a write credential and a judgment call at the same moment) is not optional.
- **Maintainers:** `DESIGN.md` for placement rules, `CHANGELOG.md` for the revision protocol. Date-stamp anything you touch; this domain's advice expires faster than most.
