# Android Development Knowledge Base

Twenty-plus years of shipping Android apps, encoded for the engineers and AI agents who come after. Every doc is standalone: version-stamped, readable without the rest of the KB, and written to explain *why* each rule exists — usually with the production scar that taught it.

> **Authored 2026-07-06** against Kotlin 2.2 / AGP 8.12 / Compose BOM 2026.06 / API 24–36. Check each doc's `Applies to:` header; see [CHANGELOG.md](CHANGELOG.md) for the staleness protocol.

## Find what you need (30-second router)

**"I'm seeing a symptom":**

| Symptom | Go to |
|---|---|
| App freezes / ANR in Vitals | [principles/memory-and-performance.md](principles/memory-and-performance.md) → agent `anr-root-cause-tracer` |
| State/input lost on rotation or after backgrounding | [principles/lifecycle-and-state.md](principles/lifecycle-and-state.md) |
| Battery drain, work running while backgrounded | [principles/lifecycle-and-state.md](principles/lifecycle-and-state.md) + [principles/concurrency.md](principles/concurrency.md) |
| Memory leak / OOM | [principles/memory-and-performance.md](principles/memory-and-performance.md) → skill `lifecycle-leak-reviewer` |
| Compose jank / high recomposition | [principles/memory-and-performance.md](principles/memory-and-performance.md) → skill `compose-recomposition-auditor` |
| Sync/upload never runs, or runs late | [principles/background-work.md](principles/background-work.md) |
| Release-only crash or nulls in non-null fields | [principles/build-and-release.md](principles/build-and-release.md) (R8 section) |
| Slow builds | [principles/build-and-release.md](principles/build-and-release.md) → agent `gradle-config-auditor` |
| Flaky tests / untestable code | [principles/testing.md](principles/testing.md) |
| Toolbar under status bar, layout broken on foldable/font-scale | [principles/accessibility-and-ui-correctness.md](principles/accessibility-and-ui-correctness.md) |
| "Previous user's data flashed" / random logout | [principles/architecture.md](principles/architecture.md) (singleton state) |

**"I'm doing a task":**

| Task | Go to |
|---|---|
| Start a new app | [guides/build-from-scratch.md](guides/build-from-scratch.md) |
| Audit an unfamiliar codebase | [guides/analyze-existing-app.md](guides/analyze-existing-app.md) |
| Review a PR touching UI/lifecycle/coroutines | skills `lifecycle-leak-reviewer`, `compose-recomposition-auditor` |
| Design a feature's architecture | [principles/architecture.md](principles/architecture.md) |
| Pick coroutine scope / design flows | [principles/concurrency.md](principles/concurrency.md) (decision trees) |
| Schedule background work | [principles/background-work.md](principles/background-work.md) (decision tree) |
| Store tokens, pin certs, review exported components | [principles/security.md](principles/security.md) |
| Plan tests / set mutation-score targets | [principles/testing.md](principles/testing.md) |
| Modularize, fix build health, plan a release | [principles/build-and-release.md](principles/build-and-release.md) |
| Coordinate multiple AI agents on Android work | [principles/multi-agent-orchestration.md](principles/multi-agent-orchestration.md) |
| Mixed Views/Compose codebase | [topics/legacy-views-and-compose-interop.md](topics/legacy-views-and-compose-interop.md) |
| Java in the repo | [topics/java-interop.md](topics/java-interop.md) |
| Considering/using KMP | [topics/kotlin-multiplatform.md](topics/kotlin-multiplatform.md) |
| TV or Wear target | [topics/compose-tv-wear.md](topics/compose-tv-wear.md) |

**Reference:** [GLOSSARY.md](GLOSSARY.md) (all terms: ANR, backpressure, process death, ...) · [DESIGN.md](DESIGN.md) (why the KB is shaped this way) · [CHANGELOG.md](CHANGELOG.md)

## Structure in one paragraph

`principles/` teach — full-depth judgment per technical area, each with failure → detection → fix → prevention. `guides/` do — start-to-finish procedures for the two core capabilities (build from zero; audit an unknown app). `topics/` cover the extended tier (production patterns + pitfalls only, honestly scoped). `.claude/skills/` are bounded reviews that run in your context; `.claude/agents/` are whole-repo investigations that run isolated and return a verdict. Principles link to the capabilities that operationalize them and vice versa.

## For AI agents using this KB

- Load the **one relevant principles doc** into context before acting on its area; each is self-contained by design. Don't load the whole KB.
- The skills/agents' frontmatter states when to use them **and when not to** — respect the "not" clauses; they encode real cost tradeoffs.
- Every doc's `Applies to:` header is part of its content: if the target repo's versions differ materially, treat version-specific claims as needing verification.
- Orchestrating multiple agents over a repo? Read [principles/multi-agent-orchestration.md](principles/multi-agent-orchestration.md) first — it exists because of failures, not theory.

## The five rules I'd tattoo on every Android engineer (if you read nothing else)

1. **Plan for the three deaths:** rotation recreates your Activity, process death erases your RAM, `onDestroy` is not guaranteed. Test with `adb shell am kill`.
2. **The main thread does no I/O and holds no contended locks.** Ever. StrictMode `penaltyDeath` in debug.
3. **Work must not outlive its reason to exist** — pick coroutine scopes by lifetime, rethrow `CancellationException`, and anything that must survive the screen goes to WorkManager.
4. **One source of truth per piece of state**, flowing down as immutable snapshots, events up as function calls.
5. **Test the build you ship:** minified release build, staged rollout, and business-metric dashboards per version — because the worst bugs don't crash.
