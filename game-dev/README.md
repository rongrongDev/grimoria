# game-dev — Principal Game Engineer Knowledge Base

**What this is:** 20+ years of shipped-game engineering judgment — Unity, Unreal, custom engines; PC/console/mobile; single-player and live-service — encoded to be usable without its author, by human engineers at any level and by AI models invoking the Skills/Subagents. Every strong claim is backed by a failure that actually happened; every rule states *why* it exists.
**Versions & dating:** each doc carries `Applies to:` + `Last reviewed:`; the KB baseline is **2026-07-06** against Unity 6.x, Unreal 5.4–5.6, Godot 4.3–4.5. [CHANGELOG.md](CHANGELOG.md) tracks revisions. Judgment ages slowly; API names age fast — when in doubt, trust the why, verify the how.
**Structure rationale:** [DESIGN.md](DESIGN.md). Terms: [GLOSSARY.md](GLOSSARY.md).

## Find what you need (30-second router)

**"I'm starting a new game / new system"**
→ [guides/build-from-scratch.md](guides/build-from-scratch.md) — deterministic loop + minimal ECS + predicted netcode + tests, buildable in a weekend
→ [principles/game-loop-and-timing.md](principles/game-loop-and-timing.md) — the week-one decisions you can't retrofit
→ `frame-budget-planner` skill — budget a new system before building it

**"I inherited / must assess an existing game codebase"**
→ [guides/analyze-existing-project.md](guides/analyze-existing-project.md) — bounded 1–3 day audit producing architecture summary, perf/allocation risks, netcode/desync risks, remediation plan

**"Something is slow / hitching / dropping frames"**
→ [principles/performance-and-frame-budgets.md](principles/performance-and-frame-budgets.md) — budgets, profile-first, hitch taxonomy
→ Engine how-to: [Unity](engines/unity/performance-and-gc.md) · [Unreal](engines/unreal/performance-and-insights.md)
→ Have a capture? dispatch `frame-profiler-analyzer` agent. Reviewing a diff? `gc-allocation-auditor` skill. Whole-repo sweep? `allocation-hotspot-scanner` agent.

**"Multiplayer / netcode / desync / cheating"**
→ [principles/networking-and-multiplayer.md](principles/networking-and-multiplayer.md) — model choice, prediction, desync root causes & the checksum discipline
→ [principles/security-and-anti-cheat.md](principles/security-and-anti-cheat.md) — authority, validation, what the client can never own
→ Engine how-to: [Unity netcode](engines/unity/netcode.md) · [Unreal replication](engines/unreal/networking-and-replication.md)
→ Reviewing a networked feature? `netcode-desync-reviewer` skill.

**"Threading, jobs, race conditions"** → [principles/concurrency-and-race-conditions.md](principles/concurrency-and-race-conditions.md); engine: [Unity Jobs/Burst/DOTS](engines/unity/dots-jobs-and-burst.md) · [Unreal task graph](engines/unreal/cpp-blueprints-and-concurrency.md)

**"Architecture: ECS? components? refactor?"** → [principles/architecture-ecs-vs-oop.md](principles/architecture-ecs-vs-oop.md) — when data-oriented design pays and when it doesn't

**"Saves, corruption, versioning"** → [principles/save-load-and-versioning.md](principles/save-load-and-versioning.md); auditing a whole save surface? `save-state-auditor` agent

**"Testing, replays, determinism, CI"** → [principles/testing-and-determinism.md](principles/testing-and-determinism.md)

**"Assets, memory budgets, streaming, build size"** → [principles/asset-pipeline-and-memory.md](principles/asset-pipeline-and-memory.md); engine: [Unity Addressables](engines/unity/assets-and-addressables.md) · [Unreal WP/cooking](engines/unreal/assets-and-streaming.md)

**"Running AI agents on game code"** → [principles/multi-agent-orchestration.md](principles/multi-agent-orchestration.md) — role splits, fan-out, and the game-specific agent failure modes (nondeterminism injection, scene-file conflicts)

**Engine landing pages:** [Unity](engines/unity/README.md) · [Unreal](engines/unreal/README.md) — core tier, full depth
**Extended tier** (production patterns + pitfalls): [Godot](engines/godot/README.md) · [Custom engines](engines/custom-engine/README.md) · [Console certification](engines/console-certification/README.md)

## Skills & Subagents (callable capabilities)

| Name | Kind | Invoke when |
|---|---|---|
| `gc-allocation-auditor` | Skill | reviewing a diff/PR for per-frame allocation & GC pressure |
| `netcode-desync-reviewer` | Skill | reviewing a networked feature for nondeterminism + unvalidated client state |
| `frame-budget-planner` | Skill | budgeting a new system's frame/memory cost before implementation |
| `frame-profiler-analyzer` | Subagent | a profiler capture needs deep attribution (absorbs megabytes, returns a page) |
| `allocation-hotspot-scanner` | Subagent | whole-codebase per-frame allocation sweep |
| `save-state-auditor` | Subagent | full save/serialization surface audit for versioning/atomicity/migration safety |

Each carries explicit *do-not-use* guidance in its description — respect it; the wrong primitive wastes context or misses the finding. Skills live in `.claude/skills/`, agents in `.claude/agents/` (repo root).

## Reading order for newcomers

Junior engineer: [game-loop-and-timing](principles/game-loop-and-timing.md) → [performance-and-frame-budgets](principles/performance-and-frame-budgets.md) → your engine's README → [build-from-scratch](guides/build-from-scratch.md) (actually build it).
Senior/staff joining a project: [analyze-existing-project](guides/analyze-existing-project.md) and run it for real — the audit teaches the KB faster than reading it.
AI model with one task: the router above → read *one* doc plus its direct links; every doc is written to stand alone.
