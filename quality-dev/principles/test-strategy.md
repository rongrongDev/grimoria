# Test Strategy — what to test, at which layer, and why

**Applies to:** tool-agnostic (examples reference Playwright 1.5x, Vitest 3.x, Pact 12+) · **Last verified:** 2026-07-06
**Standalone:** yes. Terms: a *unit test* exercises one module in isolation; an *integration test* exercises real components together within one deployable; an *E2E test* drives the deployed system through its real interface; a *contract test* verifies two services agree on their API without deploying both.
**Related:** `quality-dev/playbooks/build-a-test-strategy-from-scratch.md` (procedure), `.claude/skills/test-strategy-planner/SKILL.md` (invokable version), `quality-dev/principles/ci-cd-integration.md` (where each layer runs).

## The one rule that outranks all shapes

**A test earns its place by its ability to fail for exactly the reason it claims to test — and by someone caring when it does.** Everything else — pyramid, trophy, coverage targets — is bookkeeping on top of that rule.

The war story that pays for this doc: a payments team I supported had genuine 100% line coverage. A currency-conversion bug still shipped and cost six figures in mispriced invoices before finance noticed. The suite *executed* the conversion function on every path; almost every assertion was `expect(result).toBeDefined()` or asserted the function didn't throw. Coverage measures that code *ran*, not that anything *checked* it. When we mutation-tested that module (see `quality-dev/principles/mutation-testing.md`), 61% of mutants survived. The suite was a very thorough smoke machine.

## Pyramid vs trophy — pick by where your risk lives

Both shapes agree on the top (few E2E) and disagree on the middle and bottom.

- **Test pyramid** (many unit → fewer integration → few E2E) wins when your risk lives in **logic**: pricing engines, parsers, schedulers, permission calculators, anything with real branching. Unit tests are fast, precise, and cheap to run thousands of times.
- **Testing trophy** (static analysis base → some unit → *bulk in integration* → thin E2E) wins when your risk lives in **wiring**: typical CRUD services and web apps where bugs are "the query is wrong," "the serializer drops a field," "the middleware runs in the wrong order." Unit-testing such code means mocking everything it touches, and then you're testing your mocks. I have reviewed hundreds of PRs where a mocked repository test passed while the real SQL had a broken join — that class of suite proves the mocks agree with themselves.

**Decision tree:**

1. Does the module compute (branching, math, transformation) more than it coordinates? → **unit-heavy** for that module.
2. Does it mostly coordinate I/O (HTTP ↔ DB ↔ queue)? → **integration-heavy**, with real DB via testcontainers or equivalent; mock only *external* third parties at the network boundary.
3. Is the risky behavior cross-*service*? → **contract test** (see below), not E2E.
4. Is the risky behavior cross-*system as experienced by a user*, and would its failure page an executive (checkout, login, signup, payout)? → **E2E**, sparingly.

A real codebase contains both shapes at once. Strategy is per-module, not per-repo.

## What to test at each layer

| Layer | Test here | Never test here |
|---|---|---|
| Static (types, lint) | Nullability, exhaustiveness, banned patterns (e.g. `waitForTimeout`) | — |
| Unit | Branching logic, edge/boundary values, error paths, pure transformations | Framework glue, trivial getters, anything requiring 4+ mocks |
| Integration | Query correctness, serialization, middleware order, transactions, authz decisions against a real enforcement point | Third-party SaaS behavior (fake it at the network boundary) |
| Contract | Every field/status code a consumer actually relies on | Provider internals; fields nobody consumes |
| E2E | 5–15 critical user journeys, happy path + one failure path each | Permutations, edge cases, anything reachable at a lower layer |

## When E2E is worth its cost vs when it's a maintenance trap

E2E tests are the most expensive artifact in your suite: slowest to run, flakiest by construction (they inherit the non-determinism of every layer under them), and costliest to debug. They are **worth it** when:

- The journey directly moves money or credentials (checkout, login, password reset, payout).
- The failure mode is *integration of everything* — no lower layer could catch it (e.g. CDN + auth cookie + redirect interplay).
- You need a deploy gate answering "is production alive?" (smoke subset).

They are a **maintenance trap** when:

- You write one per feature/story because "done means an E2E." I inherited a suite of 1,400 Selenium tests with a 6-hour runtime and ~11% flake rate; the team spent more engineer-hours re-running and triaging it than the bugs it caught would have cost. We deleted 1,100 of them after mapping each to a lower-layer equivalent, and escaped-defect rate *did not move*.
- The E2E asserts things a unit test already proves (validation messages, formatting).
- You test permutations through the browser (3 user roles × 4 plan types = 12 E2E). Test the *matrix* at the authz integration layer; keep one E2E that proves the wiring.

**Budget rule:** if your E2E suite can't run green in under 15 minutes on every merge, it's too big — cut journeys or move assertions down a layer. See `quality-dev/tools/playwright.md` for keeping the survivors stable.

## Risk-based prioritization — where to spend finite effort

Rank work by **likelihood × impact**, estimated from data you already have:

- **Likelihood inputs:** change frequency (`git log --since=6.months --format=%H -- <path> | wc -l`), cyclomatic complexity, past incident/bug density (bug tracker tags), team unfamiliarity (recent ownership change).
- **Impact inputs:** blast radius (what breaks downstream), money/credential proximity, recoverability (can you roll back, or is data corrupted?).

High-churn + high-impact code gets unit + integration + mutation testing (see `quality-dev/tools/stryker.md`). Low-churn + low-impact code gets a smoke-level check and your absence. Writing exhaustive tests for stable, low-impact code is how teams hit coverage targets while their payment path rots.

**Anti-signal:** prioritizing by what's *easiest to automate*. That's how you get 400 tests on form validation and 3 on the ledger.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Assertion-free / weak tests inflating coverage | Sample 10 random tests, ask "what change would this catch?"; run mutation testing on one core module | Rewrite assertions on observable outcomes (values, persisted state, emitted events) | Mutation-score gate on core modules; PR review checklist item: "what failure does each new test detect?" |
| Inverted shape (E2E-heavy) | Count tests per layer; measure suite wall time & flake rate per layer | Map each E2E to lowest layer that catches its failure; delete/demote | CI budget: E2E stage ≤15 min hard timeout; adding an E2E requires naming the journey it guards |
| Testing mocks, not behavior | Test breaks whenever implementation is refactored w/o behavior change | Replace mock-heavy units with integration tests over real components | Lint/review rule: >3 mocks in one test triggers "wrong layer?" question |
| Coverage target as goal | Coverage rises while escaped defects don't fall | Replace repo-wide % target with mutation score on risk-ranked modules | Dashboard tracks escaped defects per area alongside coverage; never pay teams in coverage points |
| Uniform effort regardless of risk | Test count uncorrelated with incident history | Re-allocate using churn × impact ranking | Quarterly risk review re-ranks modules; strategy doc lists top-10 risk modules explicitly |

## Choosing tools (2026 defaults, see tools/ docs for depth)

- Browser E2E: **Playwright** (`quality-dev/tools/playwright.md`). Cypress acceptable if already entrenched.
- Unit/integration JS/TS: **Vitest** (new) / Jest (existing) — `quality-dev/tools/jest-vitest.md`.
- Verification strength: **StrykerJS** — `quality-dev/tools/stryker.md`.
- API/HTTP: **supertest** in-process, Postman/Bruno for exploratory — `quality-dev/tools/api-testing.md`.
- Cross-service: **Pact** — `quality-dev/tools/pact.md`.
- Load: **k6** — `quality-dev/tools/k6.md`.

## Where this doc plugs into procedures

- Designing from zero: follow `quality-dev/playbooks/build-a-test-strategy-from-scratch.md` step by step.
- Judging an existing suite: `quality-dev/playbooks/analyze-an-existing-test-suite.md`.
- Per-PR "what should this change be tested with?": invoke the `test-strategy-planner` skill.
