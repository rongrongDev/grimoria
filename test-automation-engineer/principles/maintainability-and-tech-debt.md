# Maintainability & Tech Debt

**Stamped:** 2026-07-06 · Tool-agnostic; upgrade examples reference Playwright/Selenium/Appium as of the versions in `CHANGELOG.md`.

Frameworks don't die of missing features; they die of maintenance cost exceeding maintenance budget. The signals arrive quarters before the collapse, and they're measurable. This doc is about reading them and acting at the right altitude — patch, refactor, or rebuild.

## The four metrics that predict collapse

Track these quarterly; they're cheap to compute from git + CI history:

1. **Selector churn rate** — selector-fix commits per week (`locator-strategy.md` has the tracking method). Rising churn with flat test count = coupling to app internals is growing.
2. **Time-to-first-test** — hours for a new contributor to land a correct, non-flaky test unaided. The framework-as-product metric (core law 1). > 1 day = your framework has a priesthood.
3. **Fix-to-feature ratio** — automation commits that repair existing tests vs add coverage. Sustained > 50% means you're bailing, not sailing.
4. **Flake-rate trend** — from CI telemetry (`ci-cd-integration.md`). Rising with stable app + stable tests = infrastructure/framework decay.

## Refactor triggers: when patching is the wrong move

Patching is right when failures are *local* (one page object, one wait, one fixture). It becomes wrong when you're paying the same cost repeatedly because the *structure* generates the failures. Concrete triggers, from my logs:

- **The same class of fix, three times in a month, in different places** — e.g., third time adding a wait-for-hydration workaround in a page object → the fix belongs in the framework layer (a shared navigation fixture), not a fourth copy. Rule of three, applied to infrastructure.
- **A UI redesign breaks >30% of the suite** — I lived this: a design-system migration broke 700 of 1,100 tests. The proximate cause was the redesign; the real cause was selectors below the component-object line (`framework-architecture.md`). We rebuilt the interaction layer (6 weeks) instead of patching 700 tests (estimated 9 weeks, and it would happen again at the next redesign). *Patching restores yesterday; refactoring cancels the recurrence.*
- **New tests copy-paste an existing test and mutate it** — contributors telling you the golden path is unfollowable. Fix the path (`suite-scaffolder` skill), don't review-nag the copies.
- **Nobody can explain a layer** — a wrapper/utility stratum whose author left and which every new fix tunnels around. Dead layer; schedule its removal.
- **Anti-trigger — don't refactor when:** the pain is in *tests* not framework (bad tests are deleted/rewritten one at a time); a tool migration is imminent anyway (fold the refactor into it); or you can't state the metric the refactor moves (that's aesthetics, and aesthetics doesn't get 6 weeks).

**Refactor execution rule:** never freeze test-writing during a refactor. Strangler pattern — new structure stands up beside old, migration proceeds file-by-file (mechanical migrations parallelize well across agents: `multi-agent-orchestration.md` §fan-out), old structure gets a deletion date. A migration without a deletion date becomes a permanent two-framework tax (`framework-architecture.md` failure table).

## Version-upgrade strategy for automation tooling

The suite is load-bearing infrastructure with hundreds of dependents; upgrade like it.

- **Stay within one minor of current on your core tool.** Playwright ships monthly; each hop is small and its auto-wait/locator behavior fixes often *reduce* flakes. Falling 8 versions behind converts twelve small safe hops into one big unsafe one — the "we're on Playwright 1.28 and can't move" trap comes from deferral, not from any single release.
- **Weekly canary job:** full suite (or a representative slice on a very large suite — the same slice every week, big enough to hit every framework feature) against `latest` of core deps, non-blocking. Upgrade PRs arrive pre-triaged: canary green = routine bump; canary red = you learned early, on a schedule, not during an incident. This job also serves as the cache-off honesty check (`ci-cd-integration.md`).
- **Read release notes for behavior changes, not features.** The dangerous entries are default changes (a timeout default, strict-mode behavior, headless mode switch). Playwright's headless-mode change and Cypress's `cy.session` defaults each caused suite-wide weirdness for teams who bumped blind.
- **Big-bang migrations (Selenium 3→4, Appium 1→2, tool replacement)** get the strangler treatment too: compatibility layer if available, one module migrated as the pathfinder (expect it to take 3× the estimate you'll be given; mine did — Appium 1→2 broke every driver install and half the capability names), then fan-out. Never "the whole suite this sprint."
- **Pin everything, upgrade deliberately.** Floating versions mean your suite changes without a commit. All flake-rate reasoning (`ci-cd-integration.md`) assumes the toolchain is constant between commits.

## Onboarding cost as a design constraint

Time-to-first-test > 1 day decomposes into fixable causes: undiscoverable patterns (fix: `suite-scaffolder` + a *worked example* directory — one exemplary spec per pattern, linked from README, kept green), unrunnable locally (fix: one-command local run against a docked environment; if contributors can't run tests locally they'll iterate via CI at 20 minutes per attempt and hate you), and tribal knowledge in review comments (fix: every third repeat review comment becomes a lint rule — reviewers enforce judgment, machines enforce mechanics).

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Slow structural decay | The four metrics, quarterly | Match remediation to metric (churn→locators; TTFT→golden path; fix-ratio→architecture) | Metrics reviewed in quarterly suite health review — calendarized, or it doesn't happen |
| Redesign breaks half the suite | Post-release red wave with selector signatures | Rebuild interaction layer, not test-by-test patching, past ~30% blast radius | Component objects + test-ID contract (`locator-strategy.md`) cap redesign blast radius |
| Frozen tool version | Dependency age > 2 minors (core tools) | Scheduled catch-up ladder, one minor at a time, canary-guarded | Weekly canary + monthly bump cadence |
| Permanent half-migration | Two patterns in tree > 1 quarter | Set deletion date; fan-out the remainder; or revert | Migrations chartered with end date + owner before starting |
| Priesthood framework | TTFT ≫ 1 day; all automation PRs by 2 people | Simplify golden path; scaffolder; worked examples | TTFT measured on every new team member, reported |
| Upgrade-blind default change | Suite-wide behavior shift right after a bump | Bisect the release notes; pin the old behavior explicitly if needed | Canary + release-note review checklist in the bump PR template |

## Cross-references

- Architecture patterns the refactors move toward: `framework-architecture.md`
- Suite audit that surfaces these signals in an unfamiliar codebase: `guides/analyze-existing-suite.md`
- Deleting low-value tests (the other half of maintenance): core law 10 + `@quality-dev/` `test-suite-auditor`
