---
name: seed-dataset-designer
description: Design a seed-data specification for a named test scenario or a new suite/service — the four-layer breakdown (reference / scenario fixtures / generated filler / masked subset), named-fixture contract with stable IDs and documented intent, determinism requirements, size budget, and validation gates. Produces a spec (and optionally generator skeletons), not a strategy. Use when a team asks "what data do we need to test X?", when a new service needs its first seed dataset, or when an existing dataset is being restructured after failing the determinism/shape gates. Do NOT use to decide what to test or at which level (quality-dev/principles/test-strategy.md owns that — this skill starts from scenarios already chosen), to source production-derived data (that's patterns/production-scale-subsetting.md + the masking pipeline; this skill only *flags* when a layer genuinely needs it), or to write the test code consuming the data (test-automation-engineer/principles/test-data-management.md).
---

# Seed Dataset Designer

You are executing the design procedure from `test-data-environment-engineer/principles/seeding-and-synthetic-data.md`. The stance: **seed data is authored software with a compatibility contract** — named scenarios are an API that tests program against, and this skill's job is to design that API deliberately instead of letting it accrete.

## Inputs (ask for what's missing)

1. The scenarios/suites to serve — what behaviors will tests exercise? (If the answer is "we don't know yet," stop: that's test strategy, out of scope.)
2. The schema (DDL or catalog access) including FK graph and business invariants not expressed as constraints (ask explicitly: "what must be true across tables that the database doesn't enforce?" — order totals, state-machine legality, temporal orderings).
3. Constraints: environment size/load-time budget, existing datasets this must coexist with or replace, any compliance boundary (if prod-derived data is even on the table, note the gate — do not design it in without pointing at `test-data-environment-engineer/principles/compliance-and-governance.md`).

## Procedure

**1. Layer the need.** Route every requirement to a layer via the master tree in `test-data-environment-engineer/principles/core-principles.md`: reference (mirrors prod, ships with migrations) / scenario fixtures (authored, named) / generated filler (seeded bulk) / masked subset (flag-only — this skill designs the flag, not the pipeline). Refuse the classic stretch: filler doing scenario work ("just find any user with an order" — no; scenarios are named) or scenarios doing volume work.

**2. Design the scenario contract.** Per scenario: stable semantic ID (`customer-in-arrears`, never `user_47`), the *intent* in one sentence (what property tests rely on — intent is what future editors must not break), the entity aggregate it spans (a scenario is a consistent world-fragment: customer + subscription + failed payments, not a lone row), temporal expression as offsets from the anchor time ("always 5 days from expiry"). Include the hostile-values scenarios by default: unicode/apostrophe names, max-length strings, boundary dates — deterministic fixtures that trigger on *every* run are how you avoid the unseeded-Faker war story (principles doc, failure mode #1).

**3. Size the filler.** Volume per purpose: functional default 10²–10³ rows per major table (enough for pagination/plurality, cheap to load); flag anything needing 10⁶+ as a *separate dataset* with its own budget — never let the perf dataset become the default (failure mode #5). State the load-time budget the total must fit.

**4. Specify determinism.** Fixed RNG seed per dataset version; pinned generator versions; explicit IDs for anything a test references; anchored time; FK-topological generation order; transactionally-consistent aggregates for business invariants (an Order factory emitting order+lines+payment as one unit).

**5. Specify the gates** (they ship with the dataset, not after): double-build byte-diff (determinism), generated FK-orphan checks + one check per stated business invariant (validity), migration-PR coupling (`test-data-environment-engineer/principles/data-refresh-and-versioning.md` failure mode #2), and the freshness/review cadence per layer.

## Output contract (emit exactly this structure)

```markdown
# Seed dataset spec — <name> v1 — <date>
**Serves:** <suites/scenarios> | **Size budget:** <rows/MB, load ≤ Ns> | **Anchor time:** injected

## Layer plan
| layer | source | size | refresh rule |

## Scenario contract
| id | intent (one sentence) | aggregate span | temporal offsets | hostile-value? |

## Determinism spec
seed=<n> · generator versions pinned: […] · explicit-ID list · generation order (topo)

## Validation gates
determinism diff ▢ · FK-orphan (generated) ▢ · invariant checks: [list] ▢ · migration coupling ▢

## Flagged out-of-scope
[needs-prod-shape items → subsetting+masking pipeline · strategy questions → quality-dev]
```

## Self-test

Give the skill a toy schema (customers→orders→line_items, plans reference table, invariant `orders.total = Σ line_items`) and the request "test dunning emails for overdue accounts." A correct spec: plans as reference layer; a named `customer-overdue-<variant>` scenario aggregate with offset-based due dates; ~10² filler customers; the total-invariant check in the gates; no prod data anywhere. If the spec says "sample some overdue customers from prod," the execution failed step 1.
