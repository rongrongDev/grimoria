# Playbook: Build a Delivery Pipeline from Scratch

**Applies to:** a team with a service to ship and nothing but a git repo; worked example uses GitHub Actions + Terraform + Kubernetes/Helm (verified 2026), every step names its tool-agnostic intent so you can substitute · **Last verified:** 2026-07-14

**What you get if you follow this end-to-end:** IaC-provisioned infrastructure with a locked-state apply gate; a CI pipeline that builds one immutable artifact and proves it; a deploy path with progressive rollout and a *tested* rollback; secrets that never live in the repo or the CI store. Each step ends with a **Prove it** — do not skip these; an unproven safety mechanism is decoration. Steps are ordered so the system is safe at every intermediate point; you can stop after any step and have something honest.

**Deliberately human-led.** An agent can follow this playbook *with* you (and should — the review skills are built to be invoked at the marked gates), but there is no fire-and-forget skill form: steps 0, 4, and 6 encode organizational decisions (who approves prod, what "verified" means) that an agent must not default on your behalf. See `devops-engineer/DESIGN.md` for the reasoning.

## Step 0 — Decisions before tools (30 minutes, in writing)

Answer in one page, because every later step consumes these answers: (1) **environments** — start with staging + prod, add preview environments later, resist a third standing env (`devops-engineer/topics/environment-parity.md`); (2) **who may approve a prod deploy and a prod apply** — names or roles, not "the team"; (3) **deployment strategy per the decision tree** in `devops-engineer/principles/deployment-strategies.md` — default: rolling for the first month (you need deploy *reps* before canary sophistication pays), canary once traffic justifies it; (4) **cloud account structure** — staging and prod in **separate accounts/projects** from day one; this is the single cheapest blast-radius decision you will ever make and the most painful retrofit.

## Step 1 — Foundation IaC (before any pipeline exists)

1. Terraform repo (or `infra/` dir), remote state backend with locking and bucket versioning *first commit* — even solo (`devops-engineer/principles/infrastructure-as-code.md`, state section). One root module per environment (`envs/staging/`, `envs/prod/`) sharing versioned modules; **no environment-selecting variable with a default**.
2. Pin `required_version` and providers; commit the lockfile.
3. Provision per environment: network, cluster (or compute), registry, secret manager, and the OIDC identity provider + roles for CI (next step needs them). Enable `deletion_protection` / `prevent_destroy` on anything stateful *as you create it*.
4. Bootstrap applies run from your laptop exactly until step 3's pipeline exists, then never again.

**Prove it:** `terraform plan` in both envs is a no-op; a second `plan` while one holds the lock *fails*; `plan` with a deliberately-destroyed test resource shows exactly that destroy and nothing else.

## Step 2 — CI: one artifact, proven (no deploys yet)

1. Workflow on PR + main: lint/typecheck → unit tests → build image → push to registry **by digest**, tagged with commit SHA. Multi-stage Dockerfile, base pinned by digest, lockfile-enforced installs (`npm ci`-class) — the reproducibility rules of `devops-engineer/principles/cicd-pipelines.md` cost nothing now and an archaeology project later.
2. CI → registry auth via **OIDC federation**; zero stored cloud keys (`devops-engineer/principles/secrets-in-delivery.md`). Third-party actions pinned by commit SHA (`devops-engineer/topics/supply-chain-integrity.md`).
3. Stage-asserts-its-preconditions from day one: test step fails on zero-tests-discovered; no `continue-on-error` without a ticket link.
4. Cache dependencies only — key on lockfile hash + toolchain version; the shipped artifact is never assembled from cache (`devops-engineer/principles/cicd-pipelines.md`, failure mode 5).

**Prove it:** a PR with a failing test goes red at the test stage; the same commit built twice yields the same image digest; grep the logs of a full run for any secret-shaped string.

## Step 3 — The IaC apply gate (retire your laptop's credentials)

1. Pipeline for the infra repo: PR → `terraform plan -out=tfplan` → plan posted to the PR as the review artifact → human review (run `devops-engineer/skills/terraform-plan-auditor/` — this is a marked agent gate) → merge → apply of **that saved plan**, serialized per state.
2. Plan job gets a read-only role; apply job gets the write role and runs only from the protected main branch with environment protection. Destroy-count hard-stop: plans destroying > 0 stateful resources require second approval.
3. Remove infra write permissions from all human credentials; document the break-glass path (who, how, and the codify-within-24h rule).

**Prove it:** an apply from a laptop fails on permissions; a PR whose plan destroys a test database is blocked pending the second approver; break-glass access works and pages.

## Step 4 — Deploy to staging, automatically

1. Helm chart (or Kustomize base): one chart for all environments, per-env values files, every env difference justified in a comment (`devops-engineer/topics/environment-parity.md`). Resource requests/limits set from first load test, not guessed; readiness/liveness probes per the semantics in `devops-engineer/principles/containers-and-orchestration.md` — readiness checks "can I serve," liveness never checks dependencies.
2. On merge to main: CI updates the staging values with the new digest and deploys (direct `helm upgrade --wait` from CI is fine to start; adopt GitOps pull later if/when cluster count grows — `devops-engineer/topics/gitops.md` for that trade).
3. Post-deploy smoke: hits real endpoints, asserts on *content*, runs against staging on every deploy. Runtime secrets arrive via secret-manager references (ESO-class), never CI-injected values.

**Prove it:** deploy a deliberately broken build to staging — the rollout must *fail* (probe honesty) and the pipeline must go red (smoke honesty). This drill is the whole point of staging; schedule it quarterly forever.

## Step 5 — Promote to prod, progressively, with rollback

1. Prod deploy = *promotion of the staging-verified digest* — no rebuild — behind the human approval from step 0 (environment protection rule).
2. Rolling update tuned so capacity survives (`maxUnavailable: 0` to start); post-deploy verification: the same smoke suite plus a metrics check (error rate/latency vs. pre-deploy baseline, even a crude one) before the pipeline declares success. Upgrade to real canary analysis when traffic supports statistics (`devops-engineer/principles/deployment-strategies.md`, failure mode 1 for what "real" means).
3. **Rollback before the first real deploy:** one command/button redeploying the previous digest, not depending on a full CI run; last 5 releases pinned against registry GC; write the runbook line.
4. Schema changes ship expand/contract from the very first migration (`devops-engineer/principles/deployment-strategies.md`, failure mode 4) — retrofitting this discipline after a rollback-into-a-wall incident is how most teams learn it; skip the incident.

**Prove it:** deploy to prod, then *roll back on purpose* while watching metrics. Time it. That number is your real safety margin, and doing this once before you need it is the difference between a rollback and a prayer.

## Step 6 — Close the loop

1. Wire deploy events into whatever observability exists — deploy markers turn "what changed at 14:32?" from investigation into lookup. Ownership of what the metrics *mean*, SLOs, and paging: hand off to `reliability-engineer/` (`reliability-engineer/principles/slos-and-error-budgets.md` to start it right).
2. Turn on the standing monitors this KB mandates: weekly reproducibility rebuild (step 2's prove-it, scheduled), weekly drift scan (`devops-engineer/agents/iac-drift-scanner.md`), secret-scan push protection, dependency-update bot with a weekly merge budget.
3. Write the one-pager: pipeline diagram, who approves what, rollback command, break-glass path, parity budget. If it doesn't fit on one page, the pipeline is already too clever.

**Prove it:** a new team member (or an agent given only this page and the repo) can ship a one-line change to prod, and roll it back, without asking anyone anything.

## What to deliberately not build yet

GitOps controllers, multi-cluster, canary analysis before traffic justifies it, preview environments, monorepo build graphs, service mesh. Each earns its complexity at a scale you'll recognize when you reach it; this playbook's output is the honest substrate they all assume. Assess-before-extend when inheriting someone else's version of this: `devops-engineer/playbooks/assess-an-existing-delivery-setup.md`.
