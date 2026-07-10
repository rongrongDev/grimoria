# Security Testing — the quality engineer's lane, and its boundaries

**Applies to:** concept doc; pipeline examples assume GitHub-Actions-class CI, Semgrep/CodeQL-class SAST, ZAP-class DAST, Dependabot/Snyk-class SCA · **Last verified:** 2026-07-06
**Standalone:** yes. Definitions: *SAST* = static analysis of source for vulnerability patterns; *DAST* = probing a running app from outside; *SCA* = dependency/supply-chain scanning; *IDOR* = insecure direct object reference (user A reads object B by guessing its ID).
**Related:** `quality-dev/principles/ci-cd-integration.md` (gate placement), `quality-dev/tools/api-testing.md` (where authz tests live), `quality-dev/principles/test-strategy.md` (risk ranking).

## The division of labor — own it explicitly or own it accidentally

Security teams are outnumbered; at every company I've worked, the ratio was worse than 1 security engineer per 50 developers. The gap between "security's job" and "quality's job" is where breaches grow. Write the boundary down:

**The quality engineer OWNS (because it's deterministic, repeatable, and regression-shaped):**
- **Authorization matrix tests** — the highest-value security work QA can do, detailed below.
- **Input-boundary tests at unit/integration level:** injection attempts, oversized payloads, malformed encodings, path traversal strings — as *regular tests* against your validators and query layers.
- **Business-logic abuse cases:** negative quantities, price tampering via replayed requests, coupon stacking, state-machine skipping (paying for order A, confirming order B). Scanners cannot find these; they require product understanding, which is QA's home turf.
- **Security tooling as pipeline plumbing:** wiring SAST/DAST/SCA into CI, tuning noise, enforcing gates, keeping baselines honest.
- **Secrets hygiene in test code** — test suites are a chronic leak source (below).
- **Regression tests for every fixed vulnerability.** A vuln fixed without a pinning test recurs; I've seen the same IDOR reintroduced twice in 18 months by refactors, caught the second time only because we'd finally written the matrix test.

**HAND OFF to security (adversarial creativity, specialized depth, legal authority):**
- Penetration testing and red-teaming; threat-model *ownership* (QA participates, security drives); vulnerability triage/CVSS scoring and disclosure; incident response; cryptography review; infrastructure/cloud posture.

The interface between the two: QA converts every pentest finding into a permanent automated regression test. Pentests are expensive samples; tests make the sample permanent.

## The authz matrix — QA's single highest-leverage security artifact

Most real-world API breaches in my career traced to missing *object-level* authorization — IDOR — not exotic exploits. The defense is boring and systematic, which is exactly why it belongs to QA:

1. Enumerate resources × roles × operations in a table (users: owner/admin/other-tenant/anonymous; operations: CRUD each resource).
2. Generate an integration test per cell **including every "deny" cell**: user A creates order; user B (same role, different tenant) attempts GET/PUT/DELETE on it; expect 403/404 — and assert the *body leaks nothing* (no "order belongs to user A" messages).
3. The matrix lives as data (a table the tests iterate), so adding a resource forces the question "who may touch this?" at PR time.

This is ~200 cheap integration tests that would have prevented the majority of the incident reports I've read. Do the deny cells first; the allow cells are what developers test by existing.

## SAST / DAST / SCA integration — gates that don't get turned off

The universal failure arc: team turns on scanner → 400 findings → PRs blocked → scanner demoted to advisory → nobody reads advisory → breach → repeat. The fix is **baseline + ratchet**:

- **Baseline:** existing findings are recorded and *don't* block (they're a tracked debt list with owners); only **new** findings gate.
- **Ratchet:** the baseline may only shrink. A monthly burn-down of criticals/highs from the baseline, owned by teams, not by QA.

Placement (see `quality-dev/principles/ci-cd-integration.md` for the full pipeline):

| Tool | Where | Blocks merge? |
|---|---|---|
| Secrets scanning (gitleaks-class) | Pre-commit + PR | **Yes, absolutely** — a committed secret is an incident, not a finding |
| SAST (Semgrep/CodeQL) | PR, diff-aware | New critical/high: yes. Medium/low: advisory with weekly review |
| SCA (dependency scan) | PR + daily scheduled | New critical vuln with known exploit + fix available: yes. Otherwise: ticketed with SLA (7d high / 30d medium) |
| DAST (ZAP-class) | Nightly against a deployed test env, never per-PR (too slow, needs a running app) | Never blocks a merge; new high pages the owning team |

Tune SAST rulesets per-repo in the first two weeks or drown: a scanner crying wolf 50× per PR trains everyone to click through the 51st, real one. Alarm fatigue is a security vulnerability with a UI.

## Secrets in test code — the chronic leak

Test suites accumulate secrets because "it's just the test env": staging API keys in fixtures, prod-ish tokens in CI env dumps, `.env.test` committed "temporarily." Two incidents I've personally triaged started from a staging credential in a test fixture that also worked in prod (shared signing key). Rules: secrets scanner runs on test dirs with **zero** exemptions; test credentials are generated per-run or injected from the CI secret store; any literal that looks like entropy in a fixture fails review.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| IDOR / missing object-level authz | Authz matrix has empty deny cells; pentest finds it (late) | Implement + test the deny path per cell | Matrix-as-data iterated by tests; new resource ⇒ new rows required by PR template |
| Scanner turned off after noise flood | Advisory findings unread for 30+ days; gate disabled in CI config history | Re-enable with baseline+ratchet | Diff-aware gating only on *new* findings; monthly baseline burn-down with named owners |
| Committed secret | Secrets scan hit; or worse, external report | Rotate immediately (revoke, don't just delete the commit), audit usage | Pre-commit + CI secrets gate, no exemptions incl. test dirs |
| Vulnerable dependency lingering | SCA report aging; exploit published | Upgrade/patch/vendor-fix within SLA | SLA-tracked tickets auto-filed; deploy gate on critical-with-exploit |
| Fixed vuln recurs | Same class reappears in pentest N+1 | Write the pinning regression test | Policy: security fix PRs must include a test that fails on the vulnerable code |
| Business-logic abuse unexplored | No tests for negative/replay/state-skip on money flows | Abuse-case pass on each money flow | `test-strategy-planner` skill includes abuse-case checklist for money/auth features |

## Cross-references

- Gate placement and merge-blocking policy in full: `quality-dev/principles/ci-cd-integration.md`
- Writing the authz matrix tests concretely: `quality-dev/tools/api-testing.md`
- Risk-ranking which modules get security-test depth: `quality-dev/principles/test-strategy.md`
