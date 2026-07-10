# Design Note — Why This KB Is Shaped the Way It Is

**Date:** 2026-07-06 · **Author:** Principal Test Automation Engineer (final handoff)

This document explains the structural decisions. Read it once; you never need it again to *use* the KB.

## The three primitives and how content was assigned

**Principles teach. Skills do. Subagents isolate.** Every piece of content was placed by asking three questions in order:

1. **Does this require reading a lot of code/logs that would pollute the caller's context, and return only a verdict?** → Subagent (`agents/`). Only two things qualified: scanning an entire suite for anti-patterns (hundreds of files read, one report returned) and profiling a full CI run (megabytes of timing logs, one critical-path analysis returned). Everything else fails the isolation test — if the output *is* the useful part and the input is small (a diff, a template), isolation just adds a cold start and loses the caller's context.

2. **Is this a repeatable procedure with a defined input and output that gets invoked mid-conversation?** → Skill (`skills/`). Reviewing a diff for selector fragility and hard waits needs the diff *in context* (the developer iterates on the findings), so it's a skill, not a subagent. Scaffolding a new module is a template-driven procedure — skill. Skills carry their own decision tables so a smaller model (Haiku/Sonnet) can execute them without loading the principles docs.

3. **Everything else** — tradeoffs, decision trees, war stories, failure-mode catalogs — is a principles or framework doc, meant to be read and reasoned about. These are the durable part; tools change, judgment doesn't.

**Commands:** none. Nothing here is trivial enough that a command beats a skill, and commands don't auto-invoke.

## The tree

```
test-automation-engineer/
├── README.md                     ← start here; 30-second routing table
├── DESIGN.md                     ← this file
├── GLOSSARY.md                   ← single shared vocabulary
├── CHANGELOG.md                  ← dated revisions against tool versions
├── principles/                   ← judgment, tool-agnostic where possible
│   ├── core-principles.md        ← the ten laws; read first
│   ├── framework-architecture.md
│   ├── locator-strategy.md
│   ├── waiting-and-synchronization.md
│   ├── parallelization-and-sharding.md
│   ├── test-data-management.md
│   ├── ci-cd-integration.md
│   ├── cross-platform-and-browser.md
│   ├── maintainability-and-tech-debt.md
│   ├── reporting-and-observability.md
│   └── multi-agent-orchestration.md
├── frameworks/                   ← tool-specific depth, version-stamped
│   ├── playwright/README.md      ← core tier: full depth
│   ├── selenium/README.md        ← core tier: full depth
│   ├── appium/README.md          ← core tier: full depth
│   ├── github-actions/README.md  ← core tier: CI/orchestration layer
│   ├── allure/README.md          ← core tier: reporting layer
│   ├── cypress.md                ← extended: patterns + pitfalls
│   ├── visual-regression.md      ← extended: patterns + pitfalls
│   ├── device-farms.md           ← extended: patterns + pitfalls
│   └── codeless-tools.md         ← extended: tradeoffs discussion
├── guides/
│   ├── build-framework-from-scratch.md   ← Capability A, start-to-finish
│   └── analyze-existing-suite.md         ← Capability B, time-boxed audit
├── skills/
│   ├── selector-fragility-reviewer/SKILL.md
│   └── suite-scaffolder/SKILL.md
└── agents/
    ├── suite-wide-antipattern-scanner.md
    └── ci-runtime-profiler.md
```

## Deliberate choices that need defending

**Principles are organized by technical area, not by tool.** The nine areas in `principles/` map 1:1 to the depth requirements this KB was chartered with. A Playwright engineer and a Selenium engineer share 80% of the judgment; only the syntax differs. Framework docs then say "here is how this principle lands in *this* tool" and link back. This means a reader never learns the same lesson twice, and when a new tool wins (they always do — I've migrated suites off QTP, Watir, Protractor, and half of Selenium), the principles survive.

**Each framework doc covers all nine technical areas internally** rather than scattering Playwright content across nine principles docs. When you're working in Playwright, you want one file. Duplication is avoided by keeping the framework docs at the "how it lands here" level and linking up to principles for the "why."

**Two skills, not five.** I resisted the temptation to make everything a skill. A skill that just restates a doc is worse than the doc — it burns invocation overhead and rots faster. The two skills chosen (`selector-fragility-reviewer`, `suite-scaffolder`) are the two procedures I actually ran weekly as a human: gating PRs and stamping out new modules. Both have crisp inputs, crisp outputs, and decision tables that work standalone.

**Two subagents, both read-only.** Both scanners report; neither fixes. That's deliberate — see `principles/multi-agent-orchestration.md` for why letting a scanning agent also edit is how you get an agent "fixing" flakiness by deleting assertions.

**Boundary with `@quality-dev/`.** That KB owns *what to test and why* — test strategy, layer allocation, flakiness root-cause taxonomy, mutation testing. This KB owns *the machine that runs the tests*. Concretely:

| Question | Owner |
|---|---|
| "Should this be a unit or E2E test?" | `@quality-dev/` (test-strategy-planner skill) |
| "Why is this one test flaky?" — root-cause taxonomy | `@quality-dev/` (flaky-test-diagnoser skill) |
| "Which tests across CI history are flakiest?" | `@quality-dev/` (ci-flake-history-scanner agent) |
| "How do I make my waits not cause flakiness?" | **here** (waiting-and-synchronization.md) |
| "How do I quarantine flaky tests automatically in CI?" | **here** (ci-cd-integration.md) |
| "How good is our test suite's verification strength?" | `@quality-dev/` (test-suite-auditor) |
| "Is our automation framework maintainable / how do we scale it?" | **here** |

Where the line is genuinely blurry (flakiness has a strategy half and an engineering half), the doc says so explicitly and links out rather than re-deriving.

**Version stamping.** Every doc carries an `Applies to:` line with the tool versions it was verified against and the stamp date. Automation APIs churn — Playwright ships monthly, Appium 2 broke every 1.x driver install — so a reader in 2028 must be able to tell instantly what to re-verify.
