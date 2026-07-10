# DESIGN.md — Why this KB is shaped the way it is

**Last verified:** 2026-07-06 · Applies to the whole `tool-engineer/` tree and its `.claude/` counterparts. When other docs say `@tool-engineer/`, they mean this directory.

This is the design note required before any content existed: what goes where, and why. If you are extending this KB, read this first so new material lands in the right primitive.

## Who wrote this and what it optimizes for

Twenty-plus years of building CLIs, codegen, lint rules, IDE plugins, and internal dashboards — the tools thousands of engineers touch daily without a second thought, until one of them breaks the build at 9am. The KB encodes *judgment*, not just knowledge: every strong claim traces back to a tool that got abandoned, a build that broke silently, or a rule that got suppressed wholesale. It must work standalone for a junior human and for a Haiku-class model handed a single file.

## The three primitives, and the test for each

**Principles teach. Skills do. Subagents isolate.**

| Question to ask about new content | If yes → |
|---|---|
| Is it judgment the reader must *internalize* — tradeoffs, decision trees, failure taxonomies, war stories? | `tool-engineer/principles/` (core tier) or `tool-engineer/extended/` (extended tier) |
| Is it version-sensitive mechanics for one framework — code patterns that will rot when the framework majors? | `tool-engineer/reference/` (version-stamped, quarantined from the principles so rot stays local) |
| Is it an end-to-end procedure a human or agent follows start to finish, with judgment at each step? | `tool-engineer/guides/` |
| Is it a *repeatable capability* with defined inputs and a defined deliverable, invoked on demand? | `.claude/skills/<name>/SKILL.md` |
| Does the work read *far more raw material than it returns* — scanning every call site in an org, bisecting a build across dozens of tool changes — such that doing it in the calling context would poison that context? | `.claude/agents/<name>.md` (subagent) |
| Is it a trivial one-liner with no auto-invoke need? | `.claude/commands/` — we have none; everything here earned Skill status or stayed a doc |

The subagent test is the one people get wrong. A subagent is not "a big skill." It is justified only when the ratio of material read to conclusion returned is extreme *and* the conclusion is useful without the raw material. Reviewing one CLI's error messages reads a handful of files and the findings must land where the developer is working — skill. Enumerating every call site of a flag about to be removed reads thousands of files across repos and returns a one-page blast-radius table — subagent.

## The tree

```
tool-engineer/
├── README.md                        ← start here; 30-second routing table
├── DESIGN.md                        ← this file
├── GLOSSARY.md                      ← every term of art, one place
├── CHANGELOG.md                     ← dated revisions pinned to tool/framework versions
├── principles/                      ← core tier, tool-agnostic judgment (the part that won't rot)
│   ├── cli-ux.md                    ← error messages, flags, help, exit codes, deprecation
│   ├── codegen.md                   ← determinism, drift, generator versioning, manual edits
│   ├── static-analysis.md           ← lint-rule authoring, false-positive economics, rollout
│   ├── distribution-and-versioning.md ← packaging, auto-update, version skew, rollback
│   ├── adoption-and-rollout.md      ← dogfooding, migration tooling, measuring adoption, sunsetting
│   └── internal-dashboards.md       ← the no-docs audience, staleness, access control
├── reference/                       ← core tier, version-sensitive framework mechanics
│   ├── click-typer.md               ← the chosen CLI framework family (Python Click 8.x / Typer)
│   └── eslint-custom-rules.md       ← the chosen lint framework (ESLint 9 flat config)
├── extended/                        ← extended tier: production patterns + pitfalls only
│   ├── ide-extensions.md            ← VS Code / IntelliJ
│   ├── monorepo-build-tooling.md    ← Bazel / Nx custom rules
│   ├── docs-generation.md           ← docs-from-source tooling
│   └── productivity-metrics.md      ← DORA, tool telemetry, anti-gaming
├── guides/                          ← the two mandated end-to-end capabilities
│   ├── build-a-cli-from-scratch.md  ← capability A: zero → shipped, well-UX'd internal tool
│   └── analyze-an-existing-tool.md  ← capability B: unfamiliar tool → risk assessment + plan, time-boxed
└── orchestration/
    └── README.md                    ← multi-agent patterns for tooling work

.claude/
├── skills/
│   ├── cli-error-ux-reviewer/SKILL.md
│   └── codegen-drift-auditor/SKILL.md
└── agents/
    ├── change-impact-scanner.md
    └── build-breakage-tracer.md
```

## Specific placement decisions, with reasoning

**Principles vs reference split.** "An error message must say what failed, why, and what to do next" was true for getopt in 2004 and is true for Typer today. `click.ClickException` mechanics will be wrong within two majors. So principles docs are framework-agnostic and cite frameworks only as examples; reference docs carry everything version-sensitive and wear a version stamp. When Click 9 breaks the API, one reference doc gets revised and the principles stay sound. Docs that mix the two rot wholesale — I have watched a team distrust an entire wiki because one code sample was stale.

**One framework family per core area, chosen deliberately.** The spec allows one CLI framework family; this KB picks **Python Click/Typer** (most internal-tool teams I ran ended up Python-first; Typer's type-hint model is also the easiest for an AI agent to generate correctly) and **ESLint 9 custom rules** for lint authoring (the largest custom-rule ecosystem; the concepts port to Ruff plugins and analyzers elsewhere). Node commander/oclif gets a decision-tree mention in the build guide, not a doc — duplicated depth across two frameworks is how KBs go stale in stereo.

**Guides are docs, but each has a callable counterpart.** Capability A (build from scratch) is a guide a human follows; an agent building a tool reads the same guide — it's linear enough that no skill wrapper adds value. Capability B (analyze an existing tool) is a guide *plus* two skills (`cli-error-ux-reviewer`, `codegen-drift-auditor`) that execute its most repeatable phases with output contracts, so an agent can run just the phase it needs.

**Why `cli-error-ux-reviewer` and `codegen-drift-auditor` are skills, not subagents.** Both read a bounded set of files and their findings must land in the conversation where the tool's author is working. Isolating them would strand the review away from the person who needs to act on it.

**Why `change-impact-scanner` and `build-breakage-tracer` are subagents.** The impact scanner exists because the single worst tooling failure mode — shipping a breaking change to a widely-used tool without warning every consumer — is prevented by an exhaustive, boring enumeration of call sites across CI configs, scripts, Makefiles, and sibling repos. That enumeration is megabytes of grep output whose value is a one-page table. The breakage tracer reads build logs, recent generator/lint/tool-version changes, and lockfiles to answer "did the tool change under you, or did you break it?" — again, huge read, small verdict. Both are **read-only by contract**: a tracer with a pen eventually "fixes" what it was sent to measure.

**Subagent tool allowlists are minimal.** Both agents get `Read, Grep, Glob, Bash` — Bash because they must run `git log`, code-search CLIs, and build commands — and their instructions forbid writes. Neither gets `Edit`/`Write`.

**One GLOSSARY, at the root.** Smaller models resolve terms by exact link; per-directory glossaries drift. Two teams defining "breaking change" differently is how a "minor" release breaks forty builds.

**Every doc standalone.** Each doc restates the two or three definitions it depends on rather than assuming the reader came via README. Cost: mild repetition. Benefit: a Haiku-class model given one file can act correctly. Do not "DRY up" the docs — the repetition is load-bearing.

## Scope boundaries (respect these when extending)

- **`@platform-engineer/`** (if present in your set) owns infra-as-a-service: Kubernetes, deploy pipelines, golden-path infrastructure. This KB stops where the developer's direct interaction stops. A CLI that *wraps* the deploy pipeline: the CLI's UX, versioning, and rollout live here; the pipeline behind it does not.
- **`test-automation-engineer/` and `quality-dev/`** own test-execution frameworks and test strategy. A test-runner CLI sits on the boundary: its argument parsing, error UX, and distribution live here; what to test and how to keep suites honest live there (see `quality-dev/principles/test-strategy.md`, `quality-dev/principles/flakiness.md`).
- **Developer-productivity telemetry** is covered here only as it applies to *tool* adoption and friction; org-wide engineering-metrics programs are out of scope beyond `extended/productivity-metrics.md`.

## Conventions

- Every doc header carries `Applies to:` (framework + version range where relevant) and `Last verified:` (date). Undated advice about tooling is folklore.
- Failure-mode content follows the chain **failure mode → detection → fix → prevention**, where prevention names a *mechanism* (lint rule, CI gate, review checklist item), never a resolution to be careful.
- Decision trees over "it depends." Where a judgment resisted branching, the doc lists the *inputs* to the judgment instead.
- Cross-references are relative paths from repo root, e.g. `tool-engineer/principles/cli-ux.md`. Skills reference docs; docs reference skills. Both directions, always.
