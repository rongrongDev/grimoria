# Test Data & Environment Engineering KB

> Last reviewed: 2026-07-09 · Tool versions per `CHANGELOG.md` · Structure rationale in `DESIGN.md` · Terms in `GLOSSARY.md`

The distilled judgment of a principal test data & environment engineer: how to make test data and environments **realistic, compliant, and disposable on demand**. This KB owns the *substrate* — seeding, masking, provisioning, refresh, cleanup, governance. Test **strategy** lives in `../quality-dev/`; automation **frameworks and execution** live in `../test-automation-engineer/`. Not a DBA manual: DBAs keep production data alive; this role makes test data safe to kill.

## I need to... (start here)

| I need to... | Go to |
|---|---|
| Understand the field's ten rules + master "where does test data come from?" tree | `principles/core-principles.md` |
| **Build** test data/environments for a new system, end to end | `guides/build-a-platform-from-scratch.md` |
| **Assess** an unfamiliar/messy existing setup (bounded time, 4 deliverables) | `guides/assess-an-existing-setup.md` |
| Review a masking pipeline before prod data enters test | skill `skills/masking-coverage-reviewer/` |
| Find sensitive fields a masking config missed (big schema) | subagent `agents/pii-field-scanner.md` |
| Check whether staging still resembles production | skill `skills/environment-parity-auditor/` |
| Design seed data for a new scenario/suite | skill `skills/seed-dataset-designer/` |
| Trace a flaky suite suspected of shared-state contamination | subagent `agents/state-leak-tracer.md` (after `../quality-dev/` flake triage points at shared state) |
| Decide if we may legally use prod data in test | `principles/compliance-and-governance.md` |
| Coordinate agents doing this work (gates, fan-out, sentinels) | `orchestration/README.md` |

## Principles — core tier, full depth

Each: stance → failure modes (detection/fix/prevention) → decision tree → war story.

| Doc | Owns |
|---|---|
| `principles/core-principles.md` | The judgment layer: ten rules, master decision tree, war-story index |
| `principles/seeding-and-synthetic-data.md` | Four data layers, determinism, referential integrity, volume-vs-purpose |
| `principles/masking-and-anonymization.md` | Technique selection, coverage, re-identification/k-measurement, algorithm strength, masking at scale |
| `principles/environment-provisioning.md` | Environment-as-code, five parity layers, drift, snowflakes, spin-up speed |
| `principles/environment-lifecycle-and-contention.md` | Shared-environment collisions, TTL/owner/reaper, cost, leases |
| `principles/data-refresh-and-versioning.md` | Freshness contracts, seed-vs-migration coupling, blue/green refresh, data manifests |
| `principles/cleanup-and-isolation.md` | The isolation ladder, teardown ordering, state leakage, flake-vs-data discrimination |
| `principles/compliance-and-governance.md` | GDPR/HIPAA/PCI judgment, retention, access scoping, DSAR readiness |

## Patterns — extended tier (production patterns + pitfalls)

`patterns/service-virtualization.md` (stub-vs-real judgment, contract drift) · `patterns/environment-scheduling.md` (reservations for genuinely constrained environments) · `patterns/test-data-platforms.md` (self-service catalogs/vending) · `patterns/production-scale-subsetting.md` (referentially-closed, statistically honest slices).

## Skills & subagents

**Skills** (in-context, bounded input, output contract, self-test included): `masking-coverage-reviewer`, `environment-parity-auditor`, `seed-dataset-designer`. **Subagents** (isolated context — high-volume scans; read-only tool allowlists): `pii-field-scanner`, `state-leak-tracer`. Each file's frontmatter states when to use and when *not* to — read it before dispatching.

## Reading paths by role

- **Junior engineer:** `GLOSSARY.md` → `principles/core-principles.md` → the principles doc for your current task → its linked skill.
- **Senior/staff walking into a new org:** `guides/assess-an-existing-setup.md`, following its links as findings surface.
- **Building greenfield:** `guides/build-a-platform-from-scratch.md`, phases in order — the sequencing is load-bearing.
- **AI agent / smaller model:** invoke the matching skill or subagent (frontmatter decides which); each is standalone with its principles doc as backup context. Multi-agent work: `orchestration/README.md` first — especially its failure mode #3 ("masked" is a claim, not a property).
