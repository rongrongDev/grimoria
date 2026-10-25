# Containers & Orchestration: The Manifest Is a Promise the Cluster Will Test

**Applies to:** Docker/OCI images (BuildKit-era Docker 27+), Kubernetes 1.31–1.33 APIs, Helm 3.16+; concepts port to Nomad/ECS with renamed fields · **Last verified:** 2026-07-14

**The one-sentence philosophy:** a container image is a frozen filesystem you'll be running long after you forgot how it was made, and a Kubernetes manifest is a set of promises — "this much memory," "healthy means this," "kill me if I stop answering" — that the scheduler *will* hold you to, usually at the worst time. Most orchestration incidents aren't the cluster misbehaving; they're the cluster faithfully executing a promise nobody realized they'd made.

**Vocabulary this doc assumes:** *requests/limits* — the resources a pod asks the scheduler to reserve vs. the ceiling it's killed/throttled at; *liveness/readiness/startup probes* — "restart me" / "route traffic to me" / "I'm still booting" checks; *digest* — the immutable content hash of an image, vs. a *tag*, which is a movable pointer.

## Image discipline

- **Multi-stage builds, minimal final stage.** Build stage holds compilers and dev deps; final stage holds the artifact and runtime only (distroless, alpine, or slim bases). Target: final images in the tens-to-hundreds of MB, not GB.
- **Pin bases by digest, rebuild on schedule.** `FROM node:20.19-bookworm@sha256:...` — a bare tag means Tuesday's build differs from Monday's with no diff to review (`devops-engineer/principles/cicd-pipelines.md`, reproducibility). Pinning without a rebuild cadence is the opposite trap: your base ages, CVEs accrue. Weekly scheduled rebuild + scan + redeploy of unchanged services is the pair that makes pinning safe.
- **Deploy by digest, not by tag — and never `:latest`, and never reused tags.** A tag that can move means "what is running?" has no reliable answer. The pipeline builds once, records the digest, and every environment's manifest references that digest (`devops-engineer/topics/release-engineering.md`).
- **Images are environment-free.** Same image for staging and prod; config and secrets arrive at runtime (env/mounted) — an image with a baked-in environment name is the "works in staging" generator, see `devops-engineer/topics/environment-parity.md`. Never bake secrets into layers: a secret COPY'd in and deleted in a later layer is still in the image history (`devops-engineer/principles/secrets-in-delivery.md`).
- **Run as non-root, read-only root filesystem where possible.** Cheap at day one, an archaeology project retrofitted at year three.

## Failure modes

### 1. Image bloat and unpatched base vulnerabilities

- **Failure mode:** the 2GB image with a full OS, compilers, and three package managers — slow to pull (which slows every scale-up and rollback), and a CVE surface that guarantees the scanner report is 400 findings nobody triages. Its twin: the *pinned-and-forgotten* base, patched-in-January, exploited-in-June.
- **Detection:** image size in the build output (fail the build over a per-service budget); CVE scan (Trivy/Grype-class) in the pipeline *and* on a schedule against what's *running* — scan-at-build-only means a clean-Monday image is still trusted in June. Vulnerability *triage policy* — what severity blocks, what gets exceptions — belongs to `security-dev/`; the pipeline gate mechanics are ours.
- **Fix:** multi-stage build; swap to distroless/slim; scheduled base-image bump PRs (Renovate/Dependabot-class) so patching is a reviewed diff, not a fire drill.
- **Prevention:** size budget as a pipeline gate; scan gate on critical/high CVEs with an expiring-exception process; the weekly rebuild cadence above (mechanism, not intention).

### 2. Missing or wrong resource requests/limits

- **Failure mode:** four distinct ways to hurt, all real: **no requests** → scheduler packs blind, node overcommits, and a neighbor's leak evicts *your* healthy pod (noisy neighbor); **requests way over actual use** → cluster "full" at 30% real utilization, capacity money burned; **memory limit below real peak** → OOMKill exactly at peak traffic, which reads as a mysterious crash-loop under load; **CPU limit too tight** → throttling that manifests as tail latency with no error anywhere (the nastiest to diagnose — nothing is "failing," everything is slow).
- **Detection:** OOMKill events (`kubectl get events`, `last state: OOMKilled` in describe); CPU throttling metrics (`container_cpu_cfs_throttled_periods_total`); requests-vs-actual dashboards (VPA in recommend-mode is the low-effort way to get real numbers).
- **Fix:** set requests from *observed* p95 usage plus headroom, not from copy-paste; memory limit comfortably above real peak (memory limit breach = death, not throttling); the widely-used default for latency-sensitive services: set CPU *requests* honestly and consider omitting CPU *limits* (throttling hurts more than contention on well-requested nodes) — but decide per-workload, not by cargo cult.
- **Prevention:** admission policy (Kyverno/ValidatingAdmissionPolicy-class) rejecting workloads without requests (gate); quarterly requests-vs-usage review per namespace (monitor); load tests that validate the limits before prod does (`quality-dev`'s territory for the test engineering; the manifest correctness is ours). Ongoing utilization/capacity strategy → `reliability-engineer/principles/capacity-planning.md`.

### 3. Works-in-one-environment manifests (unstated assumptions)

- **Failure mode:** the manifest deploys fine in staging, fails or silently misbehaves in prod because it assumed something environment-specific without declaring it: a StorageClass name that exists only in one cluster, a node label/taint present only in staging, an image pull secret configured in one namespace, hardcoded replicas=1 (fine in staging, an outage in prod), a NetworkPolicy present in prod but not staging so the connection refusal appears only after promotion, or a hostPath that exists on exactly one node pool.
- **Detection:** diff the *rendered* manifests per environment (`helm template` both, diff) — the differences list *is* the assumption list; keep it small and justified. `kubectl diff` / server-side dry-run against each target cluster in the pipeline catches "references a thing that doesn't exist there" before rollout does.
- **Fix:** make every environment difference an explicit, named value (Helm values files / Kustomize overlays) with a comment saying *why* it differs; delete differences that can't justify themselves — each one is staging-fidelity debt (`devops-engineer/topics/environment-parity.md`).
- **Prevention:** one chart/base for all environments, overlays only for declared deltas (structure); rendered-manifest diff posted in the PR for every change (gate); staging cluster runs the same admission policies, NetworkPolicy defaults, and StorageClasses as prod, so promotion doesn't change the laws of physics (parity).

### 4. Health-check misconfiguration making bad rollouts look healthy

- **Failure mode:** the rollout replaces good pods with broken ones and reports success, because the probes lied. The canonical forms: **no readiness probe** (pod gets traffic the moment the process starts, serves errors during boot); **readiness probe that doesn't check readiness** (TCP-connect or `/healthz` returning 200 unconditionally — the new version boots, "passes," and fails on the first real request; the rollout completes; now *all* pods are the broken version — this is the checkmark-was-counterfeit failure of `devops-engineer/principles/cicd-pipelines.md` reproduced at the orchestration layer); **liveness probe checking dependencies** (DB blips → liveness fails fleet-wide → Kubernetes restarts every pod at once → a blip becomes an outage; liveness must check *only* "is this process wedged," never "are my dependencies up"); **missing startup probe** on a slow-booting service (liveness kills it mid-boot, crash-loop that looks like a code bug).
- **Detection:** rollout completes but error rate steps up (the SLO burn alert — `reliability-engineer/principles/alerting.md` — is the backstop that pages); probe audit: any liveness probe whose handler touches the network beyond localhost is a finding; deliberately deploy a known-broken build to staging and confirm the rollout *fails* — if it completes, your probes are theater.
- **Fix:** readiness = "can I serve a real request correctly *right now*" (may consider critical deps); liveness = "am I wedged" (never deps); startup probe for anything booting >10s; `maxUnavailable`/`maxSurge` tuned so a rollout can't take out capacity even when probes are honest.
- **Prevention:** probe semantics in the service template/chart scaffold so every new service starts correct (mechanism); the broken-build rollout drill in staging, quarterly (gate); deployment verification beyond probes — post-rollout smoke asserting on real behavior — in the pipeline (`devops-engineer/principles/deployment-strategies.md` for gating rollouts on metrics, not just probe status).

## Helm-specific traps (extended)

`helm template`-rendered manifests reviewed in PRs, not just values diffs (values change × template logic = surprises); chart version pinned per environment; `helm rollback` restores *manifests*, not data — a migration that ran is not rolled back (`devops-engineer/principles/deployment-strategies.md`, schema-change ordering); hooks (`pre-upgrade` jobs) fail rollouts in ways that hide in hook logs — the first place `devops-engineer/agents/deployment-failure-tracer.md` looks.

## References

Rollout strategy and metric-gated promotion: `devops-engineer/principles/deployment-strategies.md` · image provenance/signing: `devops-engineer/topics/supply-chain-integrity.md` · env-parity discipline: `devops-engineer/topics/environment-parity.md` · runtime secret delivery: `devops-engineer/principles/secrets-in-delivery.md` · failed-rollout root-causing: `devops-engineer/agents/deployment-failure-tracer.md` · whether the post-rollout metrics warrant a page: `reliability-engineer/principles/alerting.md`
