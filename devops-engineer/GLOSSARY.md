# GLOSSARY — devops-engineer

**Last verified:** 2026-07-14 · One glossary, at the root, so every doc and every model resolves terms identically. Terms link to the doc that owns the depth.

- **Apply gate** — the enforced sequence PR → saved plan → human/skill review → apply of *that saved plan*; the control that makes IaC consequences reviewed, not just intentions. Owner: `principles/infrastructure-as-code.md`.
- **Artifact immutability** — a released artifact (image, package) is never overwritten or re-pushed under the same identity; versions are facts, not pointers. Owner: `topics/release-engineering.md`.
- **Bake time** — how long a canary must soak under real traffic before judgment; must exceed the cycle of the defect classes feared (leaks, TTLs, batch jobs). Owner: `principles/deployment-strategies.md`.
- **Blast radius** — everything a single action (an apply, a deploy, a leaked credential) *can* touch, as opposed to what it was intended to touch. Recurring organizing concept; IaC framing in `principles/infrastructure-as-code.md`.
- **Blue-green deployment** — full parallel environment ("green") receives the new version; traffic switches at once; the old ("blue") is kept intact as the rollback until green survives real load. Owner: `principles/deployment-strategies.md`.
- **Break-glass** — the documented emergency path around normal gates (console access, manual apply); legitimate only when logged, paged, and codified back into code within 24h. Owner: `principles/infrastructure-as-code.md`.
- **Build once, promote** — the discipline that one artifact digest, built once per commit, moves through all environments by reference; any rebuild "for prod" ships an untested object. Owner: `principles/cicd-pipelines.md`.
- **Canary release** — a small slice of real traffic served by the new version and judged against the concurrently-serving stable version (the *control*) before full rollout. Owner: `principles/deployment-strategies.md`.
- **Counterfeit green** — a passing pipeline result that doesn't correspond to a validated build: theater stages, poisoned caches, probe dishonesty. This KB's central failure class. Owner: `principles/cicd-pipelines.md`.
- **Digest (vs. tag)** — the immutable content hash identifying an image (`sha256:...`) vs. a movable human-friendly pointer; the delivery path resolves digests, humans read tags. Owner: `principles/containers-and-orchestration.md`.
- **Drift (IaC)** — reality diverging from declared state via out-of-band change; distinct from *unapplied code* (merged but not yet applied), which looks similar in a plan and has the opposite fix. Owner: `principles/infrastructure-as-code.md`, measured by `agents/iac-drift-scanner.md`.
- **Expand/contract** — the schema/API migration discipline: additive change first, consumers migrate, old shape removed releases later — so every mixed-version combination a rollout produces keeps working. Owner: `principles/deployment-strategies.md`.
- **Flaky (test/pipeline)** — passes and fails at the same commit without code change; proven by same-SHA pass/fail pairs. Owner: `principles/cicd-pipelines.md`, reviewed by `skills/pipeline-flakiness-reviewer/`.
- **GitOps reconciliation** — an in-cluster controller continuously converging live state toward declarative state in git; the repo becomes the deploy interface and the audit log. Owner: `topics/gitops.md`.
- **Hermetic build** — a build that can only see declared inputs (sandboxed), so undeclared dependencies fail loudly instead of working accidentally; what makes monorepo build graphs trustworthy. Owner: `topics/release-engineering.md`.
- **Liveness / readiness / startup probes** — orchestrator health checks meaning "restart me if wedged" / "route traffic to me" / "I'm still booting"; liveness must never check dependencies. Owner: `principles/containers-and-orchestration.md`.
- **Noisy neighbor** — one workload's resource consumption degrading co-located workloads, enabled by missing/dishonest resource requests. Owner: `principles/containers-and-orchestration.md`.
- **OIDC federation (CI)** — CI jobs exchanging their runner identity token for short-lived cloud credentials; the no-stored-secret default for pipeline auth. Owner: `principles/secrets-in-delivery.md`.
- **Parity budget** — the reviewed, justified list of every difference between environments and what each makes staging blind to; unlisted differences are process failures. Owner: `topics/environment-parity.md`.
- **Plan (Terraform)** — the computed diff between code, state, and reality; the *consequence* artifact that gets reviewed, as opposed to the HCL, which is only intent. Owner: `principles/infrastructure-as-code.md`, audited by `skills/terraform-plan-auditor/`.
- **Promotion** — moving an already-built, already-verified artifact to the next environment by reference, gathering approvals as metadata. Owner: `topics/release-engineering.md`.
- **Provenance (build)** — verifiable metadata on which repo/workflow/commit produced an artifact (SLSA-style); what deploy-time verification checks. Owner: `topics/supply-chain-integrity.md`.
- **Replace (`-/+`)** — a Terraform plan action that destroys and recreates a resource; reads like a change, is a data-loss event for stateful resources. Owner: `principles/infrastructure-as-code.md`.
- **Rolling update** — replacing instances gradually in place; the default strategy; guarantees a mixed-version window. Owner: `principles/deployment-strategies.md`.
- **Roll forward** — fixing by shipping a new version instead of reverting; the required written plan for irreversible migrations. Owner: `principles/deployment-strategies.md`.
- **State (Terraform)** — the record mapping declared resources to real cloud objects; holds secrets in plaintext; corrupting it orphans the infrastructure from its code. Owner: `principles/infrastructure-as-code.md`.
- **Theater stage** — a pipeline stage that passes without validating what it claims (zero tests run, `|| true`, reachability-only smoke). Owner: `principles/cicd-pipelines.md`.
- **Two-key rotation** — credential rotation as overlap, not replacement: new issued, consumers migrate, old-use confirmed zero from logs, old revoked. Owner: `principles/secrets-in-delivery.md`.
- **Trunk-based delivery context note** — this KB assumes short-lived branches merging to a protected main that is always releasable; long-lived release branches change some mechanics (backports, hotfix paths) but no principles.
