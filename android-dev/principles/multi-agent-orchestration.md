# Multi-Agent Orchestration for Android Work — When to Split, How to Fan Out, Where It Fails

> **Applies to:** Claude Code skills/subagents (2026), any agent harness with isolated-context subagents · **Last reviewed:** 2026-07-06
> **Related:** [DESIGN.md](../DESIGN.md) (skill-vs-subagent line) · agents: `anr-root-cause-tracer`, `gradle-config-auditor` · skills: `compose-recomposition-auditor`, `lifecycle-leak-reviewer`

This doc is about *orchestrating agents on Android codebases* — the Android specifics that generic agent advice misses. It assumes you know what a subagent is (isolated context window, tool allowlist, returns a summary).

## The core economics

An agent's context window is its working memory; Android repos are hostile to it in a specific way: **the signal is diffuse.** An ANR's cause spans a Gradle file (which module is on which dispatcher lib version), a DI module (which scope was injected), and a repository (where the `runBlocking` hides). Any *one* investigation reads 50–200 files. The orchestration question is always: *does the caller need the evidence, or only the verdict?*

- Caller needs the **evidence in-context** (it will edit those exact lines next) → do it inline or as a **skill**.
- Caller needs the **verdict** (a culprit, a ranked list, an audit table) → **subagent**; let the file dumps die with its context.

## Role splits that earn their overhead

### Planner / implementer / reviewer — when it's real

Worth it when the task has **verifiable acceptance criteria and a large blast radius**: a modularization refactor, a targetSdk bump, migrating kapt→KSP across 30 modules. The planner produces a *file-level* plan (module list, ordering constraints from the Gradle dependency graph); implementers execute; the reviewer runs the verification (assemble all variants, run affected tests, diff merged manifests — see [build-and-release.md](build-and-release.md)).

Not worth it for feature work in one module — the coordination cost exceeds a single agent just doing it. The tell: if the "plan" would be three bullet points, don't split.

### The reviewer role that actually pays: **the build gate**

Android's slow feedback (a full assemble + instrumented tests can be 10–30 min) means agents are tempted to declare victory on `compileDebugKotlin`. A dedicated reviewer/verifier agent whose *only* job is "run the real gates and report" — lint, unit tests, one minified assemble ([build-and-release.md](build-and-release.md) R8 section), screenshot tests — catches the class of agent failure where each parallel worker's diff compiles but the *merge* doesn't, or release-only breakage nobody built.

### Parallel audit + feature work

Running `anr-root-cause-tracer` or a leak scan *in parallel* with an implementing agent is safe **because auditors are read-only**. Enforce that with tool allowlists (no Edit/Write on audit agents), not convention. A read-only agent can never conflict; every relaxation of that rule buys you the failure modes below.

## Fan-out patterns for many-module repos

- **Shard by module, not by file count.** The module is Android's natural isolation boundary — its build file declares its dependencies, so a per-module auditor can reason locally. Give each worker: the module path, the convention-plugin sources (shared context!), and the *same* checklist. Collect structured results (one table row per module).
- **Fan out the leaves, serialize the root.** Auditing `feature:*` modules is embarrassingly parallel; `build-logic/`, version catalogs, and the root build files are *shared state* — exactly one agent touches those, ever, per wave.
- **Cap concurrency by verification cost, not by patience.** Ten parallel edit-agents whose merges you can only verify with one 20-minute CI pipeline = a verification queue, not a speedup. Match worker count to how many independent verifications you can actually run.
- **Two-wave audits beat one-wave.** Wave 1: cheap structural scan per module (grep-level: `runBlocking`, `GlobalScope`, `kapt`, `api(` overuse) → produces a suspicion-ranked shortlist. Wave 2: deep read of only the top N. This mirrors how a human principal audits and is 5–10× cheaper than deep-reading everything.

## Failure modes (all observed, none hypothetical)

| Failure | Mechanism | Prevention |
|---|---|---|
| **Conflicting Gradle edits from parallel agents** | two workers both add a dependency → both edit `libs.versions.toml` (single shared file) → textual merge conflict, or worse, a *clean* merge with duplicate/contradictory versions that fails at configuration time | version catalog + root build files are single-writer resources; workers *request* catalog additions in their result payload, orchestrator applies them once |
| **Redundant profiling runs** | two agents each launch an emulator + Macrobenchmark for overlapping questions; 2× 15 min device time, and worse — *different devices/emulator images* → numbers that disagree → a fake investigation into the discrepancy | profiling is a serialized, cached resource: one agent owns trace collection, artifacts (perfetto traces, benchmark JSON) written to a shared path all analysts read |
| **Merged-manifest blindness** | each worker's module manifest is fine; the *merge* has a conflict (duplicate provider authority, permission clash) that no per-module view can see | the verifier agent always diffs the merged manifest of `app` — merge-level artifacts are checked only at merge level |
| **Agents "fixing" each other's in-progress state** | worker B sees worker A's half-done migration, pattern-matches it as a bug, "fixes" it backwards | disjoint file ownership per worker, stated in each prompt; workers report anomalies instead of fixing outside their shard |
| **Verdict laundering** | subagent returns a confident summary; caller can't see the evidence; the summary is wrong (e.g., blames the visible `synchronized` block, not the lock *holder* — the classic ANR misread, see [memory-and-performance.md](memory-and-performance.md)) | require subagents to return *falsifiable* claims: file:line citations + the reproduction/verification command; orchestrator spot-checks one citation before acting |
| **Context self-pollution** | orchestrator "just quickly" reads 40 build files itself, then has no room left to orchestrate | the orchestrator's discipline: it reads plans and verdicts, never trees |

## Prompting Android agents — the three lines that matter

Every Android subagent prompt should carry: (1) **version pins** — "this repo: AGP 8.12, Kotlin 2.2, compose BOM 2026.06; advice for other versions is wrong here"; (2) **the relevant principles doc(s)** from this KB by path — a smaller model with [concurrency.md](concurrency.md) in context outperforms a larger one recalling folklore; (3) **the output contract** — table schema or file:line citation requirement. Smaller models (Haiku-class) do wave-1 structural scans excellently; reserve larger models for wave-2 judgment and for anything that edits.

## When NOT to orchestrate

One module, one screen, one bug with a stack trace pointing at a file — a single agent with the right principles doc loaded beats any ensemble. Orchestration is for *diffuse* signal and *parallel* structure. If you can name the file, just open the file.
