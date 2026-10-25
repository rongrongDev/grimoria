# CHANGELOG — devops-engineer

Revision protocol: every substantive edit gets a dated entry here naming the files touched and why. Update the touched file's `Last verified:` stamp in the same change. This domain rots faster than most — Terraform providers, Kubernetes APIs, and CI platform features break advice within a year or two — so anything citing tool versions gets re-verified when cited versions go EOL or on the annual sweep, whichever comes first. Concepts (build-once, expand/contract, two-key rotation, parity budgets) should rot slowly; if a *concept* here goes stale, that's a design-note-level revision, not a stamp update.

## 2026-07-14 — Initial release (v1.0.0)

Full KB authored as the retiring-principal exit brief. Contents:

- **Root:** `README.md` (routing table), `DESIGN.md` (primitive-placement rationale), `GLOSSARY.md`, this file.
- **Core-tier principles (full failure-mode → detection → fix → prevention depth):** `principles/cicd-pipelines.md` (flakiness, reproducibility, log leaks, theater stages, cache poisoning), `principles/infrastructure-as-code.md` (state/locking, blast radius, drift, module design), `principles/containers-and-orchestration.md` (image bloat/CVEs, resource limits, unstated env assumptions, probe honesty), `principles/deployment-strategies.md` (canary analysis, rollback reliability, cutover traffic bugs, deploy-order dependencies), `principles/secrets-in-delivery.md` (sprawl, over-privileged CI, committed secrets, rotation-breaks-prod).
- **Extended-tier topics (production patterns + common pitfalls):** `topics/gitops.md`, `topics/configuration-management.md`, `topics/supply-chain-integrity.md`, `topics/multi-cloud.md` — plus `topics/release-engineering.md` and `topics/environment-parity.md`, which carry full failure-mode chains despite the tier (see `DESIGN.md` for why).
- **Playbooks:** `playbooks/build-a-delivery-pipeline-from-scratch.md` (capability A — human-led with marked agent gates, deliberately no fire-and-forget skill form; every step ends in a Prove-it test), `playbooks/assess-an-existing-delivery-setup.md` (capability B).
- **Skills:** `pipeline-flakiness-reviewer`, `terraform-plan-auditor`, `delivery-posture-assessor` (compressed executable form of the assessment playbook, fan-out-ready output contract).
- **Subagents (isolated, read-only by contract and allowlist):** `iac-drift-scanner`, `deployment-failure-tracer`.
- **Orchestration:** `orchestration/README.md` — the delivery prime directive (agents act only through the gates humans use; never a write credential and a judgment call in the same moment), planner/implementer/reviewer split for IaC, scheduled auditors, fleet fan-out, and agent-specific failure modes (conflicting applies, unverified rollback paths, helpful investigators, gate erosion).

Tooling context verified at release: GitHub Actions (2026 feature set), Terraform 1.11 / OpenTofu 1.9, Docker 27+/BuildKit, Kubernetes 1.31–1.33, Helm 3.16+, ArgoCD 3.x / Flux 2.x, Ansible Core 2.17–2.18, cosign 2.x / SLSA v1.0, Renovate/Dependabot-class bots. Concepts do not depend on these; per-doc `Applies to:` stamps govern.

Cross-KB links at release: `reliability-engineer/` (system health, SLO/paging judgment, incident roles, DR rehearsal — bidirectional seam documented in both DESIGN files), `security-dev/` (threat modeling, leak forensics, vulnerability triage policy, org security policy — forward references), `quality-dev/` (load-test engineering), `test-data-environment-engineer/` (masked/synthetic staging data).
