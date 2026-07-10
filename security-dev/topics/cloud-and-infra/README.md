# Cloud & Infrastructure Security — IAM, Containers, Kubernetes

**Date:** 2026-07-06 · **Tier:** extended (production patterns + common pitfalls; not exhaustive cloud-security treatment) · **Standards:** CIS Benchmarks (cloud providers, Docker, Kubernetes); CWE-732 (permissions), CWE-284 · **Standalone:** yes · **Related:** [../secrets-and-keys/](../secrets-and-keys/README.md) §5 (workload identity — the load-bearing overlap), [../ssrf-xxe-deserialization/](../ssrf-xxe-deserialization/README.md) §1 (why metadata endpoints matter), [../../principles/security-mindset.md](../../principles/security-mindset.md) §4 (blast radius)

Scope note: this doc gives an AppSec engineer the infrastructure judgment that changes application-security outcomes — the blast-radius layer under every app vulnerability in this KB. Full cloud-security engineering (org design, landing zones, network architecture) is its own discipline; the CIS benchmark for your platform is the exhaustive checklist. Here: the patterns that pay and the pitfalls that recur.

## 1. IAM — production patterns

- **Workload identity over static keys, everywhere it exists** (IAM roles, GCP service accounts via metadata, k8s service-account federation). This is [secrets-and-keys](../secrets-and-keys/README.md) §5's top-of-gradient: nothing to leak, rotate, or offboard. Static cloud keys in CI or on servers are legacy debt with a migration path — treat them as findings with a deadline.
- **Permission boundaries by identity, scoped to the manifest.** Every service declares what it touches ("reads bucket X, writes queue Y"); the policy is that manifest, reviewed as code. Wildcards (`Action: *`, `Resource: *`) are lint-banned with the justification-tag exception ([the KB's auditable-exception pattern](../injection/README.md)).
- **Granted-vs-used reconciliation on a schedule.** Cloud providers ship the data (access advisor / last-accessed / policy analyzers); the pattern is quarterly diffs that *shrink* policies toward observed use. Permissions only ever grow without this ratchet.
- **Separate duties at the account/project boundary.** Prod and non-prod in separate accounts/projects; the CI identity that deploys is not the identity the app runs as; humans get read-mostly roles with break-glass escalation that pages someone and expires ([authorization](../authorization/README.md) §4's audit-on-privilege-mutation, infra edition).

**Common pitfalls (each a recurring breach shape):**
1. **Console-created, code-invisible.** Resources and grants made by hand in the console are config drift nobody reviews and nobody can rebuild — the infra sibling of [OAuth's console-registered clients](../oauth-oidc-jwt/README.md) §2. Pattern: infra-as-code with drift detection; console write access is break-glass.
2. **The public bucket / public snapshot.** Still, in 2026, a top breach cause — one ACL flag on a storage bucket or DB snapshot. Pattern: org-level public-access blocks (the account-wide "no matter what the bucket says" switch), plus periodic external-view scans of your own perimeter.
3. **Cross-account trust with no external-ID/conditions** — a role assumable by a partner's whole account (or, with a typo'd principal, by anyone) instead of a specific identity under conditions. Confused-deputy territory; review trust *policies* as carefully as permission policies.
4. **Metadata service unhardened.** IMDSv1-style metadata endpoints turn any [SSRF](../ssrf-xxe-deserialization/README.md) §1 into credential theft — the mechanism inside several famous breaches. Pattern: enforce IMDSv2 (session-token metadata access) / hop-limit 1 fleet-wide; it's one setting and it demotes a breach class to a log line.
5. **The audit log that isn't on.** CloudTrail-class logging partial, unaliased regions dark, or logs deletable by the identities they audit. Pattern: org-level, all-region, write-once storage, separate account — decided once, before the incident that needs it ([incident-response](../../principles/incident-response.md) §1: "no evidence" usually means "no logging").

## 2. Containers — production patterns

- **Minimal, pinned, rebuilt base images:** distroless/slim bases (less installed = less exploitable = smaller CVE queue — [mindset](../../principles/security-mindset.md) heuristic 6 in image form); pinned by digest; **rebuilt on schedule** because images are frozen dependency trees that rot ([supply-chain](../supply-chain/README.md) §2 applies to OS packages too, and the SBOM in §3 must include them).
- **Non-root by default, immutable at runtime:** `USER` directive set, read-only root filesystem, no privileged mode, capabilities dropped to the used set. Each is one line in the Dockerfile/pod spec and one severity level off every container-escape scenario.
- **Secrets stay out of images:** build args and `ENV` persist in layers ([secrets-and-keys](../secrets-and-keys/README.md) §1's burial grounds); inject at runtime instead. Image scanning in CI should include a secret-signature pass over layers, not just CVE matching.

**Common pitfalls:** the `:latest` deploy (unreproducible, unauditable — digest-pin, per [supply-chain](../supply-chain/README.md) §5); scanning images but never *rebasing* them (the scanner report as wallpaper — tie scan output to the [CVE-triage model](../supply-chain/README.md) §4, gate on KEV/critical-reachable); the Docker socket mounted into a container ("for the build" — that's host root, full stop); dev-compose files with `privileged: true` migrating verbatim to production manifests.

## 3. Kubernetes — production patterns

- **RBAC least-privilege with the same disciplines as cloud IAM:** per-workload service accounts (never `default`), no cluster-admin bindings to workloads, granted-vs-used review. Watch the escalation-equivalent verbs: create-pods (schedules arbitrary code), exec, and **read-secrets cluster-wide** — a Secret-reading grant is a credential grant ([secrets-and-keys](../secrets-and-keys/README.md) §2's inventory must include k8s Secrets).
- **Admission control as the default-enforcer:** policy engine (built-in Pod Security admission at `restricted`, or OPA/Kyverno-class for custom rules) rejecting privileged pods, host mounts, non-digest images, missing resource limits — [mindset](../../principles/security-mindset.md) §5's secure-by-default made cluster-wide: the unsafe pod *doesn't schedule*, instead of being found later.
- **NetworkPolicy deny-by-default,** then allow the declared flows. East-west traffic in a flat cluster is [zero trust](../../GLOSSARY.md)'s counterexample: one compromised pod can otherwise reach every service, which converts any app-layer RCE into cluster-wide lateral movement. Egress policies double as the [SSRF blast-radius control](../ssrf-xxe-deserialization/README.md) §1 and the exfil tripwire.
- **Namespace isolation as the tenancy/team boundary,** with quotas and RBAC scoped to it — and the honest acknowledgment that namespaces are a soft boundary; hostile-multitenant needs node pools/sandboxed runtimes, a design decision to make explicitly, not discover.

**Common pitfalls:** secrets-in-ConfigMaps (no RBAC distinction, no encryption-at-rest path — use Secrets + external secret managers); workloads reading the kubelet/API with the node's identity; dashboards/management UIs exposed with weak auth (the k8s dashboard breach class — [authorization](../authorization/README.md) §3's BFLA at cluster scale); `hostPath` mounts as slow-motion privileged mode; cluster upgrade procrastination leaving known-CVE control planes internet-visible.

## 4. The cross-cutting judgment

Infrastructure controls are **blast-radius multipliers or dividers** for every application finding in this KB: the same IDOR is a nuisance in a well-segmented deployment and a company-ending event in a flat one with god-mode service accounts. When triaging any app vulnerability ([incident-response](../../principles/incident-response.md) §1), the infra questions — what identity does the workload hold, what can it reach, what watches its egress — are half the severity call. Conversely, when you can't fix an app vulnerability today, these controls are the honest compensating layer you write down ([supply-chain](../supply-chain/README.md) §4's compensating-control note), and the *only* layers that keep working when the app-layer control fails ([mindset](../../principles/security-mindset.md) §4).

## 5. Review drill (any infra/manifest diff)

1. New identity/policy → manifest-scoped, no wildcards, workload identity over static keys?
2. New container/pod spec → non-root, no privileged/hostPath/socket mounts, digest-pinned, limits set — would admission control have caught it, and if not, why isn't that rule in admission control?
3. New network exposure → intended? In the perimeter inventory? NetworkPolicy updated both directions?
4. Anything touching audit logging or its storage → treat as touching the crown jewels; changes here precede cover-ups and accidents alike.
5. Secrets → runtime-injected, not in image/env/ConfigMap? ([secrets-and-keys](../secrets-and-keys/README.md) drill applies wholesale.)
