# Design Note — Why This Knowledge Base Is Shaped This Way

> **Last reviewed:** 2026-07-06 · Maintainer: none (author retired — see CHANGELOG.md for revision protocol)

## The organizing decision

I organized the reference material by **technical area** (lifecycle, concurrency, memory, security, ...) rather than by library (Compose, Room, WorkManager, ...).

Reason: nobody debugging a production incident thinks in library names. The symptom is "the app froze," "the battery drained," "state vanished after backgrounding." A library-organized KB forces the reader to already know the answer ("it's a `viewModelScope` problem") before they can find the doc. An area-organized KB lets them enter through the symptom. Each core-tier stack element (Kotlin, Compose, the SDK lifecycle, Coroutines/Flow, Jetpack libraries, Gradle) is covered at full depth *inside* every area it touches — Compose appears in lifecycle, concurrency, memory, testing, and accessibility, because that is where Compose problems actually live.

The alternative — a library×area matrix — produces dozens of thin files that each say "see also" a dozen times. I've watched engineers bounce between such files until they give up and paste a stack trace into a search engine. Don't rebuild that.

## Primitive assignment

| Content | Primitive | Why |
|---|---|---|
| Judgment, tradeoffs, failure→detection→fix→prevention, war stories | `android-dev/principles/*.md` | Meant to be **read and reasoned about**. A model or human loads one file and can act. No tool access needed. |
| Extended-tier stacks (View/XML interop, Java interop, KMP, TV/Wear) | `android-dev/topics/*.md` | Same primitive as principles, but scoped to production-patterns + pitfalls only. Full depth here would be dishonest — I have less scar tissue in these areas and pretending otherwise would mislead. |
| Start-to-finish procedures (build an app from zero; audit an unknown codebase) | `android-dev/guides/*.md` | Procedures, not reference. Written to be followed top-to-bottom with checkpoints. |
| Bounded, repeatable reviews of a diff or single screen | `.claude/skills/<name>/SKILL.md` | A skill runs **in the caller's context** — cheap, fast, appropriate when the input is small (one PR, one composable file). `compose-recomposition-auditor`, `lifecycle-leak-reviewer`. |
| Whole-codebase scans producing a summary | `.claude/agents/<name>.md` | A subagent gets an **isolated context window** — required when the work reads hundreds of files whose contents must not flood the caller. `anr-root-cause-tracer`, `gradle-config-auditor`. |
| Commands | not used | Nothing here is trivial enough; Skills auto-invoke and carry supporting files. |

The bright line between skill and subagent: **if doing the work correctly requires reading more files than the conclusion is worth, isolate it.** A recomposition audit of one screen reads ~5 files and every line matters to the verdict — skill. Tracing an ANR reads build files, DI graphs, and every `synchronized` block in the app, and the caller only needs the culprit — subagent.

## Cross-referencing convention

- Skills and subagents name the principles docs they draw on, and load them at run time.
- Principles docs end with a "Callable capabilities" section pointing at the skills/subagents that operationalize them.
- Every doc carries a version stamp (`Applies to:` line) because API levels, Compose, and AGP move fast enough that unstamped advice is a liability. When a stamp is >18 months old, treat the doc as *hypotheses to verify*, not facts.

## Directory map

```
android-dev/
├── README.md                     ← start here; routing table
├── GLOSSARY.md                   ← single shared glossary
├── CHANGELOG.md                  ← revision log + protocol
├── DESIGN.md                     ← this file
├── principles/
│   ├── architecture.md
│   ├── lifecycle-and-state.md
│   ├── concurrency.md
│   ├── background-work.md
│   ├── memory-and-performance.md
│   ├── security.md
│   ├── testing.md
│   ├── build-and-release.md
│   ├── accessibility-and-ui-correctness.md
│   └── multi-agent-orchestration.md
├── guides/
│   ├── build-from-scratch.md
│   └── analyze-existing-app.md
└── topics/
    ├── legacy-views-and-compose-interop.md
    ├── java-interop.md
    ├── kotlin-multiplatform.md
    └── compose-tv-wear.md

.claude/
├── skills/
│   ├── compose-recomposition-auditor/SKILL.md
│   └── lifecycle-leak-reviewer/SKILL.md
└── agents/
    ├── anr-root-cause-tracer.md
    └── gradle-config-auditor.md
```
