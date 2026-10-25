# CHANGELOG — finops-engineer

Revision protocol: every substantive edit gets a dated entry here naming the files touched and why. Update the touched file's `Last verified:` stamp in the same change. Principles are provider-agnostic and should rot slowly; anything citing pricing constructs, discount structures, or provider tooling gets re-verified when providers change terms or on the annual sweep, whichever comes first — pricing advice rots faster than any other content in this repo.

## 2026-07-25 — Initial release (v1.0.0)

Full KB authored as the retiring-principal exit brief. Contents:

- **Root:** `README.md` (routing table), `DESIGN.md` (primitive-placement rationale), `GLOSSARY.md`, this file.
- **Core-tier principles (full failure-mode → detection → fix → prevention depth):** `principles/cost-visibility-and-allocation.md`, `principles/cost-optimization.md`, `principles/commitments-and-discounts.md`, `principles/unit-economics.md`, `principles/cost-anomaly-detection.md`, `principles/operating-model-and-maturity.md`.
- **Extended-tier topics (production patterns + common pitfalls only):** `topics/multi-cloud-cost.md`, `topics/vendor-negotiation.md`, `topics/budgeting-and-forecasting.md`, `topics/sustainability-and-carbon.md`.
- **Playbooks:** `playbooks/build-a-finops-practice-from-scratch.md` (capability A — deliberately human-led, no skill counterpart; see `DESIGN.md`), `playbooks/assess-an-existing-cloud-spend-setup.md` (capability B).
- **Skills:** `tag-coverage-auditor`, `cost-anomaly-triager`, `commitment-proposal-reviewer`, `spend-posture-assessor` (compressed executable form of the assessment playbook, with fan-out-ready output contract).
- **Subagents (isolated, read-only by contract and allowlist; analyze-never-transact):** `unallocated-spend-scanner`, `commitment-utilization-analyzer`.
- **Orchestration:** `orchestration/README.md` — the prime directive (agents analyze, humans transact), fan-out audit and continuous-watcher patterns, the planner/reliability-reviewer/implementer split for optimization changes, and agent-specific failure modes (SLO-breaching optimizer, helpful cleaner, double-counted savings, stale-snapshot advice, context poisoning).

Pricing/tooling context verified at release: AWS CUR 2.0 / Data Exports, Cost Anomaly Detection, Standard/Convertible RIs, Compute/EC2-Instance Savings Plans, EDP/PPA; GCP BigQuery billing export, resource-based and flexible CUDs, committed-spend contracts; Azure Cost Management exports, Reservations, Savings Plan for Compute, MACC; FOCUS 1.x as the multi-cloud normalization schema. Principles do not depend on these; per-doc `Applies to:` stamps govern.

Cross-KB links at release: `reliability-engineer/` (capacity/margin judgment every optimization defers to; alerting and postmortem discipline the anomaly and forecasting docs inherit), `devops-engineer/` (IaC tag enforcement, pipeline cost-estimation, deployment mechanics for capacity changes, multi-cloud architecture). Forward references; packs may not be present in all installs.
