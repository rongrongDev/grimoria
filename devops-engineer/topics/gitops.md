# GitOps: The Repo Is the Cluster (Extended Tier — Patterns & Pitfalls)

**Applies to:** ArgoCD 3.x / Flux 2.x (verified 2026); the reconciliation model is tool-agnostic · **Last verified:** 2026-07-14

**Definition this doc assumes:** GitOps = desired state lives declaratively in git; an in-cluster controller continuously *reconciles* reality toward it. The pipeline stops *pushing* deploys; the cluster *pulls*. You gain: audit-by-git-log, rollback-by-revert, no cluster credentials in CI, and drift correction as a built-in loop instead of a scheduled scan (`devops-engineer/principles/infrastructure-as-code.md` gets drift *detection*; GitOps gets drift *correction*). You pay: the deploy pipeline's "done" signal becomes asynchronous, and every failure mode below is some form of that asynchrony being ignored.

## Production patterns

- **App repo ≠ deploy repo.** Application source and its CI live in one repo; the *rendered desired state* (manifests/Helm values with the image digest) lives in a deployment repo the controller watches. CI's last step is a commit/PR to the deploy repo bumping the digest. Mixing them means every code push is also a deploy trigger and every deploy needs a code-repo write — both wrong.
- **The merge is not the deploy.** Sync status (repo applied to cluster) and *health* status (workloads actually became ready) are different facts. Pipeline "success" must mean *healthy*, not *merged*: wait on the controller's health assessment (Argo hooks/notifications, `flux reconcile --wait`-class) before declaring the release done — otherwise you've rebuilt the theater-stage failure of `devops-engineer/principles/cicd-pipelines.md` with better branding.
- **Progressive delivery still applies.** GitOps replaces the *transport*, not the judgment: canary/analysis (Argo Rollouts, Flagger) rides on top — `devops-engineer/principles/deployment-strategies.md` unchanged.
- **Rollback = revert the deploy-repo commit.** Fast, audited, and it survives a red CI (the escape-hatch requirement from `devops-engineer/principles/deployment-strategies.md`). Data/schema still don't roll back; expand/contract discipline unchanged.

## Common pitfalls

- **Partial-applied stuck states.** A sync applies 30 of 40 manifests, then one fails validation/webhook/quota — the app sits half-old half-new, and the controller retries forever while the dashboard shows a yellow nobody triages. *Detection:* alert on sync-failed AND degraded-health conditions with a duration, not on the dashboard color; treat >15min unsynced as a delivery failure, not scenery. *Fix:* read the controller's per-resource events (first stop for `devops-engineer/agents/deployment-failure-tracer.md`); common causes are immutable-field changes (needs delete/recreate, which the controller won't do without `Replace=true`-class opt-in), webhook timeouts, and CRD-before-CR ordering (fix with sync waves/dependsOn). *Prevention:* server-side dry-run of rendered manifests in CI *before* the deploy-repo merge, so the cluster's validation runs while a human is still watching.
- **Drift-correction gaps.** Teams assume "GitOps means no drift," but: resources *not in the repo* are invisible to the controller (unmanaged workloads live happily beside GitOps ones — scope the controller to namespaces and alert on unmanaged objects in managed namespaces); some tools/configs only *detect* drift without auto-pruning deleted resources (prune must be explicitly on, with care); and fields ignored for diffing (`ignoreDifferences`, HPA-managed replicas) are deliberate drift-blindness that must be documented per-field or it silently widens.
- **Manual-change fights.** An engineer `kubectl edit`s a live deployment mid-incident; the controller reverts it 30 seconds later; the engineer re-edits; the loop eats the incident response. *The rule:* during an emergency, pause reconciliation for that app (documented one-liner in the runbook), fix, then *codify the fix in git and unpause* — the same break-glass-then-codify contract as `devops-engineer/principles/infrastructure-as-code.md` drift handling. A paused app older than 24h pages its owner.
- **The deploy-repo becomes the new snowflake.** Hand-edited YAML in the deploy repo with no rendering pipeline, divergent per-cluster copies, no review — congratulations, you've moved the console into git. The deploy repo needs the same rigor as any code: rendered from one source (Helm/Kustomize) by CI, human-edited only via PR, environment deltas explicit (`devops-engineer/topics/environment-parity.md`).
- **Controller blast radius.** The reconciler holds cluster-admin-adjacent power and its repo write-access is a deploy-everything credential. Scope controller RBAC per-project/namespace, protect deploy-repo branches like prod credentials (they are — `devops-engineer/principles/secrets-in-delivery.md`), and never let the controller manage its own namespace unguarded.

## When *not* to GitOps

Few clusters, small team, simple push deploys working fine → the controller, deploy-repo plumbing, and async-status complexity may cost more than the audit trail earns. GitOps earns its keep at many-clusters/many-teams scale, or when compliance demands the git audit trail.

## References

Drift concepts and break-glass contract: `devops-engineer/principles/infrastructure-as-code.md` · rollout judgment on top of GitOps: `devops-engineer/principles/deployment-strategies.md` · stuck-sync tracing: `devops-engineer/agents/deployment-failure-tracer.md` · deploy-repo as credential: `devops-engineer/principles/secrets-in-delivery.md`
