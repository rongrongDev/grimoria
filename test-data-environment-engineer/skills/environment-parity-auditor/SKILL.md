---
name: environment-parity-auditor
description: Audit a test environment against production (or against its written parity declaration) across the five parity layers — infrastructure versions, configuration, topology, dependencies, data shape — and produce a classified drift report. Use when asked whether an environment still resembles production, after a "works in test, fails in prod" (or inverse) incident, as the scheduled drift-watch on release-gating environments, or as step 3 of an existing-setup assessment. Do NOT use to *build or fix* environments (principles/environment-provisioning.md and the build guide own that), for masking/data-sensitivity review (masking-coverage-reviewer), or for diagnosing a specific flaky test (that's state-leak-tracer or quality-dev's flaky-test-diagnoser — parity drift is one *possible* cause, and this audit is how you check that hypothesis, not how you triage the test).
---

# Environment Parity Auditor

You are executing the five-layer audit from `test-data-environment-engineer/principles/environment-provisioning.md`. The stance: **parity is a per-purpose measurement, not a slogan.** No test environment is production; the question is whether the axes that matter *for the tests this environment gates* still match — and whether anyone ever wrote down which axes those are.

## Inputs (ask for what's missing)

1. Target environment + its purpose (which suites does it gate?).
2. The parity **declaration** — which layers must match, which may diverge, why. **If none exists, that is finding #0** (undeclared parity = unmeasured parity); proceed by auditing against full-prod-parity and mark every divergence "undeclared" rather than "violation."
3. Read access to both sides: manifests/IaC for versions and topology, config dumps (`SHOW ALL`, config APIs, flag-system API), deployment manifests, and data-shape queries (or the latest shape-diff report). Prod access may be via its IaC/manifests rather than the live system — say which you used, since IaC-vs-actual drift on the *prod* side is itself possible and worth a note.

## Procedure — the five layers, in evidence order

**1. Infrastructure.** Engine/runtime versions from image tags and manifests (not from memory or docs). Major-version gaps on databases are automatic high-severity: a different query planner is a different system.

**2. Configuration** — where most incidents live; be exhaustive, not sampled. Dump both sides, diff, subtract the *reviewed allowlist* of expected differences (credentials, hostnames, capacity). Everything remaining is a finding. Pay named attention to the killers: timeouts (`statement_timeout` class — the war story in the principles doc), pool sizes, feature flags (flag-state diff via the flag system), locale/encoding/timezone, TLS/auth modes.

**3. Topology.** Services present, replica counts, what's between them (LB/proxy/mesh/queues). Single-replica-where-prod-has-N is a standing finding on any environment gating concurrency-sensitive behavior: it cannot reproduce sticky-session, cache-incoherence, or double-processing bugs, full stop.

**4. Dependencies.** Per external dependency: real / sandbox / virtualized, and for each stub or recording — its age and last verification against the real service (`test-data-environment-engineer/patterns/service-virtualization.md`: a stub unverified for months is drift wearing a green checkmark). Emulators (LocalStack-class) are declared parity gaps; check the declaration exists.

**5. Data shape.** Volume ratios per major table, enum/category coverage vs. prod, freshness (manifest date vs. the freshness contract in `test-data-environment-engineer/principles/data-refresh-and-versioning.md`). For perf-gating environments, add the plan check: query plans for the suite's top queries, test vs. prod — plan flips are distribution damage made visible.

## Severity model (classify every finding)

- **S1 — invalidates the environment's verdicts:** drift on a layer the declaration marks must-match, on an environment gating releases (wrong DB major on integration env; single-replica on the env gating concurrency; perf data 100× under-volume).
- **S2 — silent divergence, no declared position:** the "undeclared" pile — each needs a decision (converge, or add to declaration with reason), not necessarily convergence.
- **S3 — declared and acceptable:** on-allowlist; verify the reason still holds, list for completeness.

## Output contract (emit exactly this structure)

```markdown
# Parity audit — <env> vs <baseline> — <date>
**Purpose gated:** <suites> | **Declaration:** <path/version, or MISSING (finding #0)>
**Verdict:** SOUND / SOUND WITH GAPS / NOT SOUND for its declared purpose — <one sentence>

## Findings by layer
### 1 Infrastructure  [side-by-side, severity each]
### 2 Configuration   [diff minus allowlist; count suppressed-by-allowlist]
### 3 Topology        [service × replicas × path table]
### 4 Dependencies    [dep → real/sandbox/stub → last-verified date]
### 5 Data shape      [volume ratios, enum gaps, freshness vs contract]

## Convergence plan
[S1 first: converge which side, toward what, why · S2: decide-and-declare list · allowlist entries whose reasons expired]

## Declaration updates proposed
[the audit's lasting artifact: what the declaration should say so next run is a diff against intent]
```

**Verdict rules:** any S1 ⇒ NOT SOUND (the suites it gates are lying in some direction — say which direction). Only S2 ⇒ SOUND WITH GAPS. A missing declaration caps the verdict at SOUND WITH GAPS regardless of clean layers — you cannot certify parity against unstated intent.

## Self-test

Fixture: two config dumps differing in `statement_timeout`, a flag on-in-test-off-in-prod, prod postgres:17.2 vs test postgres:16.4, prod 3 replicas vs test 1, plus an allowlist covering hostnames only. Correct execution: four findings (S1/S1-or-S2/S1/S1 by declared purpose), zero findings on hostnames, and a proposed declaration. Missing the flag or the timeout means the config diff was sampled, not exhaustive — re-run.
