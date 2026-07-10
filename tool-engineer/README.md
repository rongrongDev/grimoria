# tool-engineer — A Principal DevTools Engineer's Exit Brief

**What this is:** 20+ years of developer-tools judgment — CLIs, codegen, lint rules, IDE plugins, internal dashboards — encoded for humans (junior → staff DevEx engineers) and AI models (Haiku → Opus) to use without the author in the room. Every doc stands alone; every skill and subagent is invocable; every strong claim is backed by a tool that got abandoned, a build that broke silently, or a rule that got suppressed wholesale.

**Last full revision:** 2026-07-06 · verified against Click 8.x / Typer 0.1x, ESLint 9.x, Bazel 7–8 / Nx 20–21, VS Code ^1.9x (full table in `CHANGELOG.md`).

**The one-sentence philosophy:** developers judge a tool in its failure moments — the error path is the product, trust is the budget, and a breaking change without an enumerated blast radius is an incident with a scheduled start time.

## Find what you need in 30 seconds

| You are trying to... | Go to |
|---|---|
| Understand how this KB is organized (or extend it correctly) | `DESIGN.md` |
| Look up any term (codegen drift, blast radius, suppression cascade, trampoline...) | `GLOSSARY.md` |
| **Build a new internal CLI/tool from zero, start to shipped** | `guides/build-a-cli-from-scratch.md` |
| **Assess an unfamiliar/inherited tool in a bounded time budget** | `guides/analyze-an-existing-tool.md` |
| Write error messages, help text, exit codes; deprecate a flag safely | `principles/cli-ux.md` — review a real CLI: invoke the `cli-error-ux-reviewer` skill |
| Keep generated code deterministic; handle manual edits; version a generator | `principles/codegen.md` — check a real repo: invoke the `codegen-drift-auditor` skill |
| Author a lint rule that survives; roll a rule across a big codebase | `principles/static-analysis.md` |
| Version/package/auto-update an internal tool; survive version skew; roll back | `principles/distribution-and-versioning.md` |
| Get a tool actually adopted; migrate consumers; sunset the old one | `principles/adoption-and-rollout.md` |
| Build an internal dashboard people can trust (freshness, access, no-docs UX) | `principles/internal-dashboards.md` |
| Enumerate every consumer before a breaking change or sunset | dispatch the `change-impact-scanner` subagent |
| Find which tooling change broke the build | dispatch the `build-breakage-tracer` subagent |
| Run multiple AI agents on tooling work without org-blocking mistakes | `orchestration/README.md` |
| Click/Typer mechanics (skeleton, error handler, CliRunner, completion) | `reference/click-typer.md` |
| ESLint 9 custom-rule mechanics (anatomy, fixers, RuleTester, plugin shipping) | `reference/eslint-custom-rules.md` |
| VS Code/IntelliJ extensions · Bazel/Nx rules · docs generation · productivity metrics | `extended/<name>.md` (table below) |

## Coverage tiers

**Core tier** (full depth: failure mode → detection → fix → prevention in every doc): CLI design (`principles/cli-ux.md` + `reference/click-typer.md`) · codegen & scaffolding (`principles/codegen.md`) · static analysis / lint authoring (`principles/static-analysis.md` + `reference/eslint-custom-rules.md`) · packaging & distribution (`principles/distribution-and-versioning.md`) · adoption & rollout (`principles/adoption-and-rollout.md`) · internal dashboards (`principles/internal-dashboards.md`).

**Extended tier** (production patterns + common pitfalls only):

| Topic | Versions | Doc |
|---|---|---|
| IDE/editor extensions | VS Code ^1.9x, IntelliJ 2024–2025.x | `extended/ide-extensions.md` |
| Monorepo build tooling | Bazel 7–8, Nx 20–21 | `extended/monorepo-build-tooling.md` |
| Docs-generation tooling | TypeDoc 0.26+, Sphinx 7–8, MkDocs 1.6 | `extended/docs-generation.md` |
| Productivity metrics & telemetry | DORA-class, tool telemetry | `extended/productivity-metrics.md` |

## Skills & subagents (in `.claude/`)

| Callable | Kind | One-line trigger |
|---|---|---|
| `cli-error-ux-reviewer` | Skill | "Review this CLI's errors/help" → severity-rated findings + rewrites for every bad message |
| `codegen-drift-auditor` | Skill | "Regeneration makes weird diffs" → four-class drift diagnosis + fix per class |
| `change-impact-scanner` | Subagent (isolated, read-only) | Before any breaking change/sunset → blast-radius table by team; never run in main context |
| `build-breakage-tracer` | Subagent (isolated, read-only) | "Build broke, no local culprit" → which tooling change did it + the rollback lever |

Each carries explicit do-NOT-use guidance in its description — respect it; the boundaries encode where each one fails.

## Scope boundaries

This KB owns tools developers touch directly: CLIs, editor integrations, codegen, static analysis, internal dashboards. Infra-as-a-service (Kubernetes, deploy pipelines, golden-path infrastructure) belongs to a platform-engineering KB. Test-execution frameworks and test strategy belong to `quality-dev/` and `test-automation-engineer/` — a test-runner CLI gets its argument-parsing and distribution judgment here, its test-strategy judgment there.

## How to read this KB

- **Humans, new to the domain:** `principles/cli-ux.md` → `principles/distribution-and-versioning.md` → `principles/adoption-and-rollout.md`. Those three carry most of the judgment; then the guide matching your task.
- **Humans, experienced:** the routing table above; every doc is standalone.
- **AI agents:** invoke the skill matching the task; skills embed their procedure and link deeper only for rationale. Orchestrating multiple agents on tooling work? `orchestration/README.md` is mandatory first — it exists because an agent can ship a locally-perfect change that breaks sixty pipelines it never looked for.
- **Maintainers:** `DESIGN.md` for placement rules, `CHANGELOG.md` for the revision protocol. Date-stamp anything you touch; undated tooling advice is folklore.
