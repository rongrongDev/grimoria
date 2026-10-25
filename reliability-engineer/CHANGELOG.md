# CHANGELOG — reliability-engineer

Revision protocol: every substantive edit gets a dated entry here naming the files touched and why. Update the touched file's `Last verified:` stamp in the same change. Principles docs are tool-agnostic and should rot slowly; anything citing tool versions or vendor behavior gets re-verified when cited versions go EOL or on the annual sweep, whichever comes first.

## 2026-07-14 — Initial release (v1.0.0)

Full KB authored as the retiring-principal exit brief. Contents:

- **Root:** `README.md` (routing table), `DESIGN.md` (primitive-placement rationale), `GLOSSARY.md`, this file.
- **Core-tier principles (full failure-mode → detection → fix → prevention depth):** `principles/slos-and-error-budgets.md`, `principles/observability.md`, `principles/incident-management.md`, `principles/alerting.md`, `principles/postmortems.md`, `principles/capacity-planning.md`.
- **Extended-tier topics (production patterns + common pitfalls only):** `topics/chaos-engineering.md`, `topics/disaster-recovery.md`, `topics/toil.md`, `topics/multi-region.md`.
- **Playbooks:** `playbooks/build-a-reliability-program-from-scratch.md` (capability A — deliberately human-led, no skill counterpart; see `DESIGN.md`), `playbooks/assess-an-existing-systems-reliability.md` (capability B).
- **Skills:** `slo-validity-reviewer`, `alert-actionability-auditor`, `reliability-posture-assessor` (compressed executable form of the assessment playbook, with fan-out-ready output contract).
- **Subagents (all isolated, all read-only by contract and allowlist):** `incident-timeline-reconstructor`, `alert-noise-auditor`, `postmortem-quality-reviewer`.
- **Orchestration:** `orchestration/README.md` — the live-incident prime directive (agents advise, humans act), scheduled-auditor and fleet fan-out patterns, planner/implementer/reviewer split criteria, domain-specific agent failure modes.

Tooling context verified at release: Prometheus 3.x / Alertmanager, OpenTelemetry SDK 1.x / Collector, Grafana 12, k6 (open-model executors), PagerDuty/Opsgenie-class paging, LitmusChaos/Gremlin/AWS FIS-class injection. Principles do not depend on these; per-doc `Applies to:` stamps govern.

Cross-KB links at release: `devops-engineer/` (deployment/pipeline/IaC mechanics — forward references; pack may not be present in all installs), `quality-dev/` (load-test engineering: `quality-dev/principles/performance-and-load-testing.md`, `quality-dev/tools/k6.md`).
