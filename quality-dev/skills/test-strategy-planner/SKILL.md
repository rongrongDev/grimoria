---
name: test-strategy-planner
description: Design a concrete test strategy for a feature, PR, or new service — risk inventory, layer allocation (unit/integration/contract/E2E), tooling, CI gating, and the specific test list. Use when asked "how should we test X", when a PR adds meaningful behavior without tests, or when starting a new service/feature. Do NOT use for diagnosing a failing/flaky test (use flaky-test-diagnoser), for auditing an existing suite's quality (use test-suite-auditor), or for trivial changes where the strategy is obviously "one unit test" — just write the test.
---

# Test Strategy Planner

You are executing the strategy playbook at `quality-dev/playbooks/build-a-test-strategy-from-scratch.md` in compressed form. Read it if available; this skill is self-sufficient if not. The judgment it encodes: **risk decides what to test; the lowest layer that can catch a failure is where its test lives; E2E is a scarce budget, not a default.**

## Inputs

Identify from the request (ask only if truly absent): the feature/PR/service description or diff; what already exists (search the repo for current tests covering the touched modules — mandatory step, see Output rule 4); whether other services consume or are consumed (contract surface).

## Procedure

**1. Risk inventory.** Interrogate the feature with the four questions: (a) where does money/credential/irreversible data change hands? (b) what computes (branching, math, thresholds, state)? (c) what crosses a boundary (services, third parties, DB, queues)? (d) what happens concurrently — list every "exactly once" or uniqueness claim explicitly. Produce a ranked table: risk | location | likelihood H/M/L | impact H/M/L.

**2. Layer allocation.** Assign each risk the *lowest* layer that catches it:

| Failure lives in | Layer |
|---|---|
| Computation/branching | Unit (boundary tables via `test.each` — include the exact-boundary value; `>=` vs `>` bugs live there) |
| SQL/serialization/middleware/authz | Integration, real DB (Testcontainers), fakes only for third parties |
| Agreement with another internal service | Contract (Pact) — only fields the consumer actually reads |
| Exactly-once/race claims | Concurrency test: N-way `Promise.all` on the operation, assert single effect |
| Money/credential user journey | E2E — this feature earns 0–2 journeys maximum |
| Appearance on brand/design-system surface | Visual regression |
| New hot path / changed traffic shape | k6 load profile (scheduled, never merge-gating) |

If money/auth is touched, add: authz-matrix rows (every deny cell, asserting non-leaky bodies) and abuse cases (negative values, replay, state-skipping).

**3. Sanity checks before emitting.** E2E count ≤ integration count (else re-allocate); every H/H risk has a named test; every uniqueness claim has a concurrency test; time-dependent logic uses fake clocks (no real waits); mutation scope named for the computation-heavy modules.

## Output contract (emit exactly this structure)

```markdown
## Test strategy: <feature>
### Risk inventory
[table]
### Test plan
[per risk: layer | specific test description incl. boundary values | file/location]
### Already covered (searched)
[existing tests found that cover listed risks — cite paths; gaps confirmed]
### CI gating
[what blocks PR merge vs merge-queue vs scheduled, per quality-dev/principles/ci-cd-integration.md defaults]
### Explicitly not testing
[L/L risks accepted, with one-line reasons]
```

Rules: (1) every test in the plan names the *failure it detects*, not just the code it touches; (2) no test may use sleeps — deterministic waits only (`quality-dev/principles/concurrency-and-async-testing.md`); (3) recommend tools per KB defaults (Vitest/Playwright/Pact/Stryker/k6 — `quality-dev/tools/`); (4) the "Already covered" section is mandatory — plans that skip the search step produce redundant tests (failure mode #1 in `quality-dev/orchestration/README.md`).

## References

Playbook (full rationale + worked example): `quality-dev/playbooks/build-a-test-strategy-from-scratch.md` · Layer judgment: `quality-dev/principles/test-strategy.md` · Concurrency tests: `quality-dev/principles/concurrency-and-async-testing.md` · Security/authz: `quality-dev/principles/security-testing.md`
