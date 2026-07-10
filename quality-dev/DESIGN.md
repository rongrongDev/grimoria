# DESIGN.md — Why this KB is shaped the way it is

**Last verified:** 2026-07-06 · Applies to the whole `quality-dev/` tree and its `.claude/` counterparts.

This is the design note required before any content: what goes where, and why. If you are extending this KB, read this first so you put new material in the right primitive.

## The three primitives, and the test for each

**Principles teach. Skills do. Subagents isolate.** Concretely:

| Question to ask about new content | If yes → |
|---|---|
| Is it judgment a reader must *internalize* to make their own calls — tradeoffs, decision trees, war stories, failure taxonomies? | `quality-dev/principles/` or `quality-dev/tools/` (plain markdown) |
| Is it a *repeatable procedure* an agent or human executes on demand, with defined inputs and a defined deliverable? | `.claude/skills/<name>/SKILL.md` |
| Does the procedure produce *large intermediate output* (thousands of CI log lines, full mutation reports) that would poison the calling context, while its useful result is a short ranked summary? | `.claude/agents/<name>.md` (subagent) |
| Is it a trivial one-liner with no auto-invoke need? | `.claude/commands/` — we deliberately have none; everything here earned Skill status or stayed a doc |

The subagent test is the one people get wrong. A subagent is not "a big skill." It is justified only when the *ratio of raw material read to conclusion returned* is extreme. Scanning 500 CI runs to rank the 10 flakiest tests reads megabytes and returns a page — subagent. Diagnosing one flaky test reads one test file and one stack trace — skill. Getting this wrong wastes money and, worse, strands the diagnosis away from the context that needed it.

## The tree

```
quality-dev/
├── README.md                  ← start here; 30-second routing table
├── DESIGN.md                  ← this file
├── GLOSSARY.md                ← every term of art, one place
├── CHANGELOG.md               ← dated revisions pinned to tool versions
├── principles/                ← tool-agnostic judgment (the part that won't rot)
│   ├── test-strategy.md
│   ├── flakiness.md
│   ├── mutation-testing.md
│   ├── contract-and-integration-testing.md
│   ├── concurrency-and-async-testing.md
│   ├── security-testing.md
│   ├── performance-and-load-testing.md
│   ├── accessibility-testing.md
│   └── ci-cd-integration.md
├── tools/                     ← tool-specific patterns (the part that will rot; version-stamped)
│   ├── playwright.md          ← core tier: full depth
│   ├── jest-vitest.md         ← core tier
│   ├── stryker.md             ← core tier
│   ├── api-testing.md         ← core tier (supertest/Postman-class HTTP testing)
│   ├── pact.md                ← core tier
│   ├── k6.md                  ← core tier
│   ├── appium.md              ← extended tier: production patterns + pitfalls only
│   ├── selenium.md            ← extended tier
│   ├── axe-core.md            ← extended tier
│   └── visual-regression.md   ← extended tier (Percy/Chromatic)
├── playbooks/                 ← end-to-end procedures a human or agent follows start-to-finish
│   ├── build-a-test-strategy-from-scratch.md
│   └── analyze-an-existing-test-suite.md
└── orchestration/
    └── README.md              ← multi-agent patterns for quality work

.claude/
├── skills/
│   ├── test-strategy-planner/SKILL.md
│   ├── flaky-test-diagnoser/SKILL.md
│   └── test-suite-auditor/SKILL.md
└── agents/
    ├── ci-flake-history-scanner.md
    └── mutation-gap-analyzer.md
```

## Specific placement decisions, with reasoning

**Principles vs tools split.** Twenty years taught me that judgment outlives syntax. "Wait on observable state, never on time" was true in Selenium 1 and is true in Playwright 1.5x. So principles docs are tool-agnostic and cite tools only as examples; tools docs carry everything version-sensitive and wear a version stamp. When Playwright 2.0 breaks an API, you revise one tools doc and the principles stay sound. Docs that mix the two rot wholesale.

**Playbooks are docs, not skills — but each has a skill counterpart.** The two mandated capabilities (build a strategy from scratch; audit an existing suite) are long, ordered procedures with judgment at each step. A human follows the playbook; an agent invokes the corresponding skill (`test-strategy-planner`, `test-suite-auditor`), which is a compressed, executable rendering of the same playbook with explicit output contracts. Both cross-reference each other so neither drifts alone.

**Why `flaky-test-diagnoser` is a skill and `ci-flake-history-scanner` is a subagent.** Same domain, opposite context profiles. Diagnosing one test is surgical: small inputs, and the result must land *in* the conversation where the developer is working. Mining CI history is bulk: it reads hundreds of run logs whose content is worthless after aggregation. The skill keeps context; the agent shields it.

**Why `mutation-gap-analyzer` is a subagent.** Stryker output for a real module is thousands of mutant records. The caller needs ~20 lines: which survived mutants indicate real coverage gaps, ranked. Also, running mutation testing takes minutes-to-hours — a background-capable, isolated worker fits.

**Subagent tool allowlists are minimal by design.** The flake scanner gets read/search/CI-CLI access, no file writes — an analysis agent that can edit tests will eventually "fix" one (see `orchestration/README.md`, failure mode #2). The mutation analyzer gets Bash (it must run Stryker) but its instructions forbid modifying source, and its allowlist excludes nothing else it doesn't need.

**One GLOSSARY, at the root.** Smaller models resolve terms by exact link. Per-directory glossaries drift; I've watched two teams define "integration test" oppositely in the same repo and argue in PR comments for a month.

**Every doc standalone.** Each doc restates the two or three definitions it depends on rather than assuming the reader arrived via README. Cost: mild repetition. Benefit: a Haiku-class model given a single file can act correctly. That tradeoff is deliberate and non-negotiable; do not "DRY up" the docs.

## Conventions

- Every doc header carries `Applies to:` (tool + version range) and `Last verified:` (date). Undated advice about tooling is folklore.
- Failure-mode content follows the chain **failure mode → detection → fix → prevention**, where prevention names a mechanism (lint rule, CI gate, dashboard), not a resolution to be careful.
- Decision trees over "it depends." If I couldn't turn a judgment into branches, I wrote down the *inputs* to the judgment instead.
- Cross-references are relative paths from repo root, e.g. `quality-dev/principles/flakiness.md`. Skills reference docs; docs reference skills. Both directions, always.
