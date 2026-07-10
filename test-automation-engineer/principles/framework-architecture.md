# Framework Architecture

**Stamped:** 2026-07-06 · Applies to: pattern-level, tool-agnostic; code sketches in Playwright 1.50 TypeScript.

Architecture is what determines whether the suite at 10× its current size is an asset or a rewrite. Every framework I've seen collapse — and I've rebuilt three — collapsed for one of two reasons: selectors and waits smeared across test bodies (no layering), or an abstraction tower nobody could add to (wrong layering). Both are architecture failures, and both are visible in the first hour of an audit (`guides/analyze-existing-suite.md`).

## The three layers (non-negotiable, regardless of pattern)

```
┌─ Test layer ────────── intent + assertions, in domain language.
│                        NO selectors, NO waits, NO driver calls.
├─ Interaction layer ─── page objects / components / tasks.
│                        Owns selectors and app-specific synchronization.
│                        NO assertions about business outcomes (see below).
└─ Driver/infra layer ── framework config, fixtures, auth, data factories,
                         API clients, reporting hooks. Owns browser lifecycle.
```

A test reads like a bug report a PM could confirm: *log in as a pro user, add the annual plan, apply code SAVE20, assert the total is $86.40.* Everything about *how* is one layer down; everything about *the machinery* is two layers down.

**Where assertions live** — the classic argument, settled: business-outcome assertions belong in tests (a page object asserting "checkout succeeded" hides the test's purpose and forces every caller to want the same check). Structural micro-waits/checks that make interactions reliable ("the modal is open before I fill it") belong in the interaction layer — they're synchronization, not verification. If a page-object method name contains `verify`/`assert`/`should`, it's usually layer leakage; the exception is a deliberately-shared compound assertion helper, named as such, living with the tests.

## Choosing the pattern

```
Suite size / team shape                          → Pattern
──────────────────────────────────────────────────────────
< ~50 tests, small app                           → plain page objects, no cleverness
50–1000+ tests, page-oriented app, mixed-        → POM + component objects   ← default;
  seniority contributors incl. product engineers    be suspicious of anything else
Heavily component-based UI (design system,       → component objects first; pages become
  same widgets everywhere)                          thin compositions of components
Deep multi-actor workflow domains (trading,      → Screenplay — only if the team is
  logistics), senior dedicated SDET team            stable and senior; see warning
Playwright specifically                          → the same layering, but composition
                                                    via fixtures, not class inheritance
```

**POM + component objects (the default).** Page objects for page-level flows; component objects for reusable widgets (date picker, data grid, toast) that compose into pages. The component layer is what keeps 10× growth linear: when the design system's dropdown changes, you fix `Dropdown.select()` once, not forty page objects. Rule: the moment two page objects contain the same widget-handling code, extract the component object.

**Screenplay** (actors attempt Tasks, ask Questions) composes beautifully — tasks nest, cross-cutting concerns (which actor, which device) thread cleanly. I ran one for three years on a trading platform and it was genuinely better *for that senior, stable team*. But its onboarding cost is brutal: new contributors take weeks, product engineers never contribute (violating core law 1), and under deadline pressure people bypass it, giving you two frameworks. Choose it only when: dedicated SDET team ≥ senior-heavy, low churn, and workflows genuinely multi-actor. Never adopt it because a conference talk was compelling.

**Playwright fixtures change the composition story.** Idiomatic Playwright injects page objects, authenticated contexts, and data via `test.extend()` fixtures rather than constructing in `beforeEach` or inheriting `BasePage`. Fixtures compose, are lazy (unused = unpaid), tear down in reverse order, and can be worker-scoped for expensive setup. The layering above still holds — fixtures *are* the driver/infra layer. Concretely: `frameworks/playwright/README.md` §fixtures and the `suite-scaffolder` skill's templates.

## Abstraction that clarifies vs abstraction that hides

The test from law 4 of `core-principles.md`, made concrete. Signals your abstraction went bad:

- **God flow methods:** `completeOrderE2E(user, product, payment, shipping, opts)` — a test calling it verifies... something. Failure in step 14 of a hidden 20-step flow is undiagnosable from the report. Fix: page objects expose *steps at user granularity*; tests compose them. Setup that's genuinely not under test collapses into *data/API setup*, not UI-flow helpers (see below).
- **Config-object programming:** behavior driven by a 15-field options bag. Every field is a hidden if-branch in the "abstraction."
- **Inheritance towers:** `SmokeCheckoutTest extends CheckoutTest extends AuthenticatedTest extends BaseTest`, state initialized at four levels. Understanding any test requires archaeology; changing `BaseTest` is Russian roulette. Fix: composition (fixtures/helpers) over inheritance. One base at most, and it should be nearly empty.
- **The wrapper layer:** `SafeClick(el)` wrapping `el.click()` with retries and logging around the whole driver API. This was defensible in Selenium-2010 (and a properly built Selenium suite still centralizes waits — see `frameworks/selenium/README.md`); in Playwright it re-implements actionability, worse, and doubles what a newcomer must learn. Delete on sight.

**Setup through the API, not the UI.** The single biggest architectural speed lever: only the behavior under test goes through the browser. Login = API call + storage-state injection (Playwright) or cookie/session seeding, not the login form 400 times — that alone cut 11 minutes off the 90-minute suite I profiled in `parallelization-and-sharding.md`. Cart preloading, user provisioning: API/data-factory layer. The UI flow for login is *one test*, not a tax on every test.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Selectors/waits in test bodies | Grep specs for `locator(`/`getBy`/`By.`/`waitFor` outside interaction layer; audit does this in hour 1 | Extract to page/component objects, mechanically | Lint boundary rule (restrict imports/APIs per directory); `suite-scaffolder` stamps correct structure |
| God page object (LoginPage = 900 lines, 40 methods) | Line count + method count ranking across page objects | Split by page section into components; check for flow-methods that belong in tests | Review trigger: page object > ~200 lines gets an architecture look |
| Inheritance tower | `extends` depth > 1 in test/PO code | Flatten to fixtures/composition; migrate leaf-first | Framework README states the rule; scaffolder templates have no base classes |
| Business assertions inside page objects | Grep interaction layer for `expect(`/`assert` | Move outcome assertions to tests; keep structural sync | Same lint boundary; code review checklist |
| Two frameworks in one repo (old pattern + new pattern, half-migrated) | Audit finds both `pages/` and `screens/`, or POM and raw-driver tests coexisting | Pick survivor, migrate mechanically (fan-out pattern: `multi-agent-orchestration.md`), delete loser | Migrations get finished or reverted — a WIP migration older than a quarter is the worst of both |

## Scalability checkpoints (what 10× breaks)

- **10× tests:** selector count must grow with UI surfaces, not tests (`locator-strategy.md`); runtime must be solved by parallelism (`parallelization-and-sharding.md`), which the architecture enables via hermeticity, or blocks via shared state.
- **10× contributors:** the golden path must be machine-enforced (lint boundaries, scaffolder) — convention docs don't survive contributor growth.
- **10× pages:** component objects are mandatory by here; page-object-only suites go quadratic on widget changes.

## Cross-references

- From-zero implementation of this architecture: `guides/build-framework-from-scratch.md`
- Judging an existing codebase against it: `guides/analyze-existing-suite.md`
- Refactor-vs-patch triggers: `maintainability-and-tech-debt.md`
- What belongs at the E2E layer at all (fewer E2E tests = smaller framework): `@quality-dev/` test-strategy material
