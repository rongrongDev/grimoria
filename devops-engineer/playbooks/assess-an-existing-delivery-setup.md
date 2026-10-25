# Playbook: Assess an Existing Delivery Setup

**Applies to:** any unfamiliar CI/CD + IaC estate; tool-agnostic procedure with tool-specific probes noted · **Last verified:** 2026-07-14

**The job:** walk into a delivery setup you didn't build and produce four deliverables in a bounded budget (2–5 days depending on estate size): a **pipeline reliability/flakiness risk assessment**, an **IaC drift and blast-radius review**, a **secrets-exposure risk list**, and a **prioritized remediation plan**. The agent-executable form of this playbook is `devops-engineer/skills/delivery-posture-assessor/` — same phases, compressed, with an output contract; use the skill when an agent runs the assessment, this playbook when a human leads it or needs the reasoning.

**Stance:** you are assessing, not fixing. Every finding cites evidence (a config line, a log, a plan output) — "I couldn't determine X" is a finding (undeterminable = undocumented = risk), and the temptation to quietly fix things as you go must be resisted: an assessment that mutates its subject measures nothing (the same reason the subagents in this KB are read-only). Ask for read access only.

## Phase 0 — Inventory (half a day; refuse to skip it)

Enumerate before judging: repos (app, infra, deploy/config); CI systems and every workflow in them (including the forgotten nightly ones — they hold the stalest credentials); environments and their cloud accounts; registries; clusters/compute; the secret stores *claimed* to be in use. Two questions to the team that calibrate everything else: **"how do you deploy a one-line fix to prod, start to finish?"** (the answer's length and hedging measure pipeline health better than any config read) and **"when did you last roll back, and how did it go?"** (silence here reorders your whole priority list). Record what runs *outside* the pipeline — the deploy script on someone's laptop is always material.

## Phase 1 — Pipeline reliability & flakiness (day 1)

Evidence: the workflow definitions, plus 60–90 days of run history if the platform exposes it.

- **Trust measurement:** re-run-to-green rate; same-SHA pass-and-fail jobs (proven flakes); mean time-to-green on main. Ask any engineer: "when CI fails, what's your first reaction?" — "re-run it" is the trust account already overdrawn (`devops-engineer/principles/cicd-pipelines.md`, failure mode 1).
- **Theater audit:** grep workflows for `|| true`, `continue-on-error`, ignored exit codes; check test stages assert nonzero tests ran; check smoke tests assert content, not reachability (failure mode 4). Each hit = a gate that can't fail = not a gate.
- **Reproducibility:** lockfiles enforced? Bases and third-party actions pinned (digest/SHA)? Does any deploy path *rebuild* rather than promote? A rebuild between test and prod is a headline finding, always (failure modes 2, 5; `devops-engineer/topics/release-engineering.md`).
- **Structure:** stage order vs. cost-of-failure; what runs on fork PRs and with what credentials (hostile-input check); cache keys — do they hash all inputs, and can a cache ever feed a shipped artifact?
- Run `devops-engineer/skills/pipeline-flakiness-reviewer/` per suspicious workflow for depth.

## Phase 2 — IaC drift & blast radius (day 2)

Evidence: infra repos, state backends, plan runs, cloud audit logs.

- **State hygiene:** remote + locked + versioned backend? Who can read state (it holds secrets)? Any state local, hand-edited, or in git — each is a headline finding (`devops-engineer/principles/infrastructure-as-code.md`).
- **Drift measurement, not estimation:** `terraform plan -detailed-exitcode` per root module — for a large estate dispatch `devops-engineer/agents/iac-drift-scanner.md` and consume its inventory. Separately: cloud audit logs, 30 days, write-calls by non-CI principals — the drift *rate* tells you whether the repo is the system of record or a suggestion.
- **Blast-radius review:** state split (env separation? prod own account?); environment-selecting variables with defaults; `prevent_destroy`/`deletion_protection` on stateful resources; is apply gated on a reviewed *saved* plan or does CI run plan-and-apply in one breath (a one-breath apply means nobody ever reviews consequences, only intent); destroy-count guardrails; module version pinning; provider lockfile.
- **The apply-path question:** "who or what can run `terraform apply` against prod, from where?" Every answer beyond "the pipeline role, after plan review" widens the risk section.

## Phase 3 — Secrets exposure (day 3, morning)

Evidence: CI variable stores, workflows, repos + full git history, state files, image layers, manifests.

- **The enumeration test** per critical credential: where does it live, who/what can read it, when did it last rotate, what breaks if it rotates now? "Don't know" on the last question predicts everything (`devops-engineer/principles/secrets-in-delivery.md`, failure mode 4).
- **Mechanical sweeps:** history-inclusive secret scan (gitleaks/trufflehog-class) on all repos — *history*, not HEAD; scan CI logs samples and image layers; check state-backend read ACLs. Any hit is a live compromise until rotated, and goes in the report as such — a secret's "removal" commit is evidence of exposure, not remediation.
- **Identity audit:** long-lived cloud keys in CI stores (vs. OIDC federation)? One shared deploy identity across environments or purposes? Runner pools shared between fork-PR jobs and privileged jobs? IAM permissions granted-vs-used gap on the CI roles (failure mode 2).
- Findings that indicate *active* compromise or need org-level policy response hand off to `security-dev/` — your deliverable is the exposure list and delivery-path fixes, not the forensics.

## Phase 4 — Deploy & rollback reality (day 3, afternoon)

- Deployment strategy vs. the decision tree (`devops-engineer/principles/deployment-strategies.md`); probe honesty (any liveness probe touching dependencies?); canary that has never failed = canary that judges nothing; **the rollback question in three parts:** is there a documented path, does it depend on a green CI, when was it last *exercised*? An untested rollback path gets written up as "no rollback capability" — because operationally, that's what it is.
- Environment parity spot-check: rendered-manifest diff staging vs. prod; is there a parity budget or do differences accrete silently (`devops-engineer/topics/environment-parity.md`)?

## Phase 5 — The report (day 4–5)

Structure (same contract the skill emits):

1. **Scorecard** — one grade + one sentence per area: pipeline trust, reproducibility, IaC state/blast-radius, drift, secrets, deploy/rollback, parity.
2. **Top risks, ranked by (likelihood × blast radius), max ten** — each with evidence, the failure it predicts, and the principle doc that owns it. A 60-finding list is a data dump, not an assessment; the discipline of cutting to ten *is* the assessment.
3. **Remediation plan in three horizons:** *this week* (rotate exposed secrets, turn on state locking, pin the unpinned — cheap, huge blast-radius reduction), *this quarter* (OIDC migration, plan-review gate, rollback drill, parity budget), *ongoing* (the standing monitors: drift scan, reproducibility rebuild, dependency bot, flake budget). Every item names an owner-shaped role and its prove-it test — remediation without a verification step recreates the theater this playbook exists to catch.
4. **The two calibration answers** from Phase 0, quoted verbatim. They contextualize everything and they're what the team's leadership will actually remember.

## Traps for the assessor

Don't grade sophistication — grade *honesty* (a plain rolling deploy with a tested rollback outranks an untested canary pipeline every time); don't let green dashboards substitute for evidence (the theater audit exists because dashboards lie by construction); don't report drift/flake *counts* without the trend (30 drifted resources shrinking beats 5 growing); and if the team fears any prove-it test in this playbook ("we can't roll back a healthy service just to test it"), write the fear down — it is the most honest finding you will collect.
