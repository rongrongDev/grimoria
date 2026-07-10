# Changelog — game-dev Knowledge Base

Tracks additions and revisions against **dated engine/package versions**, so future maintainers know what each claim was verified against and what to re-verify when engines move. Maintenance contract: see [DESIGN.md](DESIGN.md) — update the doc, stamp the entry here with the engine version that triggered it; unverifiable-but-still-reasoned claims get marked `[UNVERIFIED for <version>]` in place rather than deleted.

## 2026-07-06 — Initial release (v1.0)

**Verified against:** Unity 6.x (6000.x LTS; NGO 2.x, Entities 1.x, Addressables 2.x, Burst 1.8+, Unity Transport 2.x) · Unreal Engine 5.4–5.6 (classic replication + Iris-in-progress era; Chaos physics; World Partition; PSO precaching present) · Godot 4.3–4.5 (.NET builds; 3D physics interpolation from 4.3) · .NET 8 for the build-from-scratch reference code.

Added — everything:

- **Root:** README (router), GLOSSARY, DESIGN (structure rationale), this file.
- **Principles (10):** game-loop-and-timing, performance-and-frame-budgets, concurrency-and-race-conditions, networking-and-multiplayer, architecture-ecs-vs-oop, save-load-and-versioning, security-and-anti-cheat, testing-and-determinism, asset-pipeline-and-memory, multi-agent-orchestration.
- **Engines, core tier:** unity/ (README, performance-and-gc, dots-jobs-and-burst, netcode, assets-and-addressables), unreal/ (README, performance-and-insights, cpp-blueprints-and-concurrency, networking-and-replication, assets-and-streaming).
- **Engines, extended tier:** godot/README, custom-engine/README, console-certification/README (platform-agnostic by NDA-necessity and by design).
- **Guides:** build-from-scratch (deterministic loop + minimal ECS + prediction/reconciliation + test suite, C# reference implementation), analyze-existing-project (bounded 1–3 day audit protocol).
- **Skills** (`.claude/skills/`): gc-allocation-auditor, netcode-desync-reviewer, frame-budget-planner.
- **Subagents** (`.claude/agents/`): frame-profiler-analyzer, allocation-hotspot-scanner, save-state-auditor.

### Standing re-verification watchlist (check on each engine release)

| Claim | Where | Invalidated by |
|---|---|---|
| Unity uses Boehm GC; allocation discipline rationale | unity/README, unity/performance-and-gc §1 | CoreCLR runtime landing in a shipping Unity version — rewrite GC sections |
| MaterialPropertyBlock breaks SRP Batcher; material instances preferred | unity/performance-and-gc §3 | URP/HDRP batching changes |
| NGO lacks built-in client prediction for the GameObjects path | unity/netcode §1 | NGO feature releases |
| Burst deterministic float mode caveats | unity/dots-jobs-and-burst §3 | Burst releases (verify per version already noted in doc) |
| Iris maturity/adoption guidance | unreal/networking-and-replication §3 | each UE 5.x release |
| Nanite unsupported-content list (foliage/deforming/translucent caveats) | unreal/performance-and-insights §4 | each UE 5.x release |
| PSO precaching "on by default and improving" | unreal/performance-and-insights §5 | UE release notes |
| Godot 3D physics interpolation availability (4.3+) & large-world tooling status | godot/README §1/§3 | Godot 4.x releases |
| Third-party netcode landscape (Fish-Networking/Mirror/Photon Fusion/Quantum) | unity/netcode §1 | market movement — re-survey before any new commitment |
| Console cert category emphases | console-certification/README | platform requirement revisions (NDA'd — check portals) |

<!-- Template for future entries:
## YYYY-MM-DD — <summary> 
**Trigger:** <engine/package version or incident>
**Changed:** <doc §, what, why>
**Re-verified:** <claims from the watchlist checked against the new version>
-->
