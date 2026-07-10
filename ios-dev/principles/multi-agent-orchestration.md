# Multi-Agent Orchestration for iOS Work

> **Applies to:** Claude Code-style agent harnesses (skills + subagents, parallel sessions) · Xcode 26 projects · **Last reviewed:** 2026-07-06
> This doc is about *orchestrating agents on iOS codebases* — the constraints are iOS-toolchain-specific, not restated iOS content. KB callables it orchestrates: `retain-cycle-reviewer`, `concurrency-migration-auditor` (skills); `actor-isolation-scanner`, `crash-log-tracer` (subagents).

## When to split roles at all

Default to **one agent, inline** — a single context that reads, edits, and verifies beats a committee for any change that fits in one context window. Split when one of three pressures forces it:

1. **Context pollution** — the work requires reading volumes that would drown the main conversation (whole-codebase scans, crash logs, build transcripts). → *Subagent* returning a distilled result. This is why `actor-isolation-scanner` and `crash-log-tracer` exist as subagents rather than skills ([../DESIGN-NOTE.md](../DESIGN-NOTE.md)).
2. **Independence you can actually cash** — audits with no write overlap can run parallel to implementation (a concurrency audit of module A while a feature lands in module B).
3. **Adversarial separation** — a reviewer that shares the implementer's context inherits the implementer's blind spots. A fresh-context reviewer re-derives assumptions; that's the value, *not* parallelism. Reviewing your own diff in the same session is proofreading; a spawned reviewer is review.

**Planner/implementer/reviewer for iOS specifically:** the split pays on (a) Swift 6 migrations — planner defines isolation domains per [concurrency-judgment.md](concurrency-judgment.md) and module order; implementers execute per-module; reviewer runs `concurrency-migration-auditor` per diff — because the *design* must stay coherent across many mechanical diffs; and (b) risk-concentrated PRs (payment, sync) where a `retain-cycle-reviewer` + fresh-context review pass is cheap insurance. It does *not* pay for routine feature work; the coordination overhead exceeds the work.

## Fan-out patterns that work on iOS codebases

- **Per-module/per-target audit fan-out.** Partition by SPM package or Xcode target — these have *declared* dependency edges, so findings don't overlap and each agent's context is naturally bounded. Give every auditor the same rubric (point them at the relevant `ios-dev/topics/` doc — that's what the KB's standalone-doc rule is for) and a fixed output schema (path:line, severity, evidence, suggested fix) so results merge mechanically. Cap and deduplicate at merge: two auditors flagging one shared file must not produce two fixes.
- **Read/write partition.** Any number of *read-only* scanners can overlap anything; at most one agent *writes* to a given module at a time. Enforce with tool allowlists (scanners get no Edit/Write — see the agent definitions) rather than instructions; instructions drift, allowlists don't.
- **Fan-out ceiling.** Beyond ~4–6 parallel auditors, merge/dedup work exceeds scan savings and simulator/build contention (below) dominates. Batch modules per agent instead of one agent per module.

## iOS-specific failure modes (the section that earns this doc its place)

1. **Concurrent `project.pbxproj` edits.** The Xcode project file is a global, order-sensitive, opaque-ID-dense plist; two agents each adding one file produce merge conflicts no tool auto-resolves, and a *silently mis-merged* pbxproj produces phantom build failures hours later. Mitigations, strongest first: (a) generate the project (Tuist/XcodeGen) or use SPM package targets so the contended artifact is human-readable and per-module; (b) failing that, **serialize all target-membership/build-setting changes through one agent** — parallel agents may edit Swift files freely, but project-structure changes queue; (c) never let two worktrees both touch shared `.xcodeproj`/`xcshareddata` and merge without a build check.
2. **Simulator and DerivedData contention.** Parallel agents each triggering `xcodebuild` on the same machine collide on simulator boot state and DerivedData caches (flaky "device is busy," corrupted module caches presenting as spurious type errors). Give each parallel build lane its own `-derivedDataPath` and its own named simulator clone (`xcrun simctl clone`); or funnel all building/testing through one verifier agent while others stay read-only.
3. **Redundant Instruments/profiling runs.** Profiling is minutes-long, device-bound, and *noisy under parallel load* — two agents profiling simultaneously on one machine corrupt each other's numbers (CPU/thermal contention), and each re-run of a 40-minute soak ([../topics/memory-management.md](../topics/memory-management.md)) costs real wall-clock. Rule: performance evidence is gathered **once, serially, by one agent**, written to a shared artifact (trace file + summarized findings); other agents consume the artifact. An orchestrator that lets each subagent independently "verify performance" has scheduled a thermal-noise generator.
4. **Signing/keychain state is machine-global.** Two agents fiddling certificates or provisioning ([../topics/release-and-platform.md](../topics/release-and-platform.md) §2) on one keychain corrupt each other non-obviously. Signing changes are always single-agent, and never parallel with archive builds.
5. **Findings-vs-fixes races.** A scanner reports `file.swift:214` while an implementer rewrites that file; line-pinned findings go stale mid-flight. Merge order: land writes, re-run the (cheap, read-only) scan, *then* triage — never fix from a stale scan on a moving tree.

## Contract templates (what to actually put in the spawn prompt)

- **Auditor:** scope (modules/paths), rubric doc (`ios-dev/topics/<x>.md`), output schema, explicit "read-only — report, do not fix," and a budget ("stop after N findings or M minutes; report coverage achieved"). Unbounded auditors return when their context fills, not when the job is done.
- **Implementer:** the plan slice it owns, files it must not touch (the write-partition), the verify command it must run before reporting done.
- **Reviewer:** the diff, the relevant checklist skill to invoke, and *nothing else from the implementer's session* — the fresh context is the point.

**Related:** the subagent definitions themselves → `.claude/agents/actor-isolation-scanner.md`, `.claude/agents/crash-log-tracer.md` · bounded-time codebase analysis one agent can run → [../guides/analyze-existing-app.md](../guides/analyze-existing-app.md)
