# Changelog

All notable changes to the AI Model Red-Teamer KB. This field moves fast; every doc is version- and date-stamped, and every change is logged here. Dates are absolute (YYYY-MM-DD).

## [1.0] — 2026-07-06

Initial release. Complete core-tier and extended-tier coverage at the methodology/category level, with zero reproducible attack content by design.

### Added — root
- `README.md` — KB map, 30-second navigation, role-based entry points, design rationale.
- `GLOSSARY.md` — conceptual definitions (no working examples).
- `CHANGELOG.md` — this file.

### Added — principles (core tier, full depth)
- `core-principles.md` — the ten principles and the connective map.
- `harm-taxonomy.md` — harm categories as classification buckets; category/severity separation.
- `attack-taxonomy.md` — eight attack *classes*, described at the recognition level only.
- `program-design.md` — coverage matrix, human+automated sequencing, recruiting, tunnel vision.
- `severity-and-triage.md` — three-factor scoring, decision structure, escalation paths, cluster rule.
- `robustness-evaluation.md` — ASR limits, generalization testing, whack-a-mole, verification asymmetry.
- `automated-red-teaming.md` — scaling breadth without manufacturing harm; signal-not-payload controls.
- `reporting-and-disclosure.md` — layered reporting, internal norms, external disclosure decision tree.
- `feeding-findings-back.md` — three fix altitudes, verification loop, closing the coverage matrix.
- `cross-functional-coordination.md` — translation problem, standing structures, escalation-as-contract.
- `multi-agent-orchestration.md` — role splits, fan-out, and red-team-specific failure modes.

### Added — topics (extended tier, production-patterns + pitfalls)
- `differential-testing.md` — across-checkpoint safety comparison.
- `bias-fairness-red-teaming.md` — statistical/aggregate-harm methodology.
- `guardrail-classifier-robustness.md` — red-teaming the safety layer.
- `external-third-party-programs.md` — bug-bounty-style external programs.

### Added — guides
- `build-a-red-team-program.md` — Capability A: from-scratch, phase-by-phase, with end-to-end checklist.
- `analyze-an-existing-program.md` — Capability B: gap analysis + prioritized remediation plan.

### Added — skills
- `finding-severity-triager/SKILL.md` — single-finding severity + escalation classification.
- `coverage-gap-reviewer/SKILL.md` — coverage-matrix blind-spot audit.

### Added — subagents
- `finding-cluster-analyzer.md` — root-cause clustering of large finding batches (isolated context).
- `fix-verification-tracer.md` — mechanism-level reasoning on whether a fix generalizes.

### Safety review
- **2026-07-06 / 07:** Second-reviewer pass completed across all 24 documents (heuristic scan + manual read) specifically checking for accidental inclusion of working attack content, reproducible payloads, or step-by-step elicitation instructions. **Result: no reproducible attack content.** One borderline item — illustrative quoted assertion fragments in `attack-taxonomy.md`'s false-context section — was conservatively rewritten from quoted strings into described assertions, so no pasteable string remains anywhere in the KB. All attack references are class/mechanism-level only. Scope-discipline notes present in every doc that discusses attacks (attack-taxonomy, harm-taxonomy, automated-red-teaming, reporting-and-disclosure, both subagents, both skills). Internal link integrity verified (all resolve). See README "Safety posture."

## Maintenance notes
- When adding or revising any doc: bump its version/date header, log it here, and re-run the attack-content review. Record the review date in this file.
- Revisit the harm taxonomy every cycle and on every model-capability change (a new capability can create a new harm row).
- Treat an "unclassifiable finding" as a signal to update `harm-taxonomy.md`, not as a filing error.
