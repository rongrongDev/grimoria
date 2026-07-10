# Guide: Analyze an Unfamiliar Game Codebase (Bounded Time Budget)

**Applies to:** any game codebase; engine-specific probe commands referenced per step.
**Last reviewed:** 2026-07-06.
**Deliverables (the contract):** ① architecture summary, ② performance/allocation risk list, ③ networking/desync risk assessment, ④ prioritized remediation plan. Time budget: **1 day solo** for a small/mid project; **2–3 days** with subagent fan-out for a large one. The budget is a feature — an unbounded audit produces a wiki nobody reads; a bounded one produces a decision document.
**Orchestration:** phases 2–4 can dispatch `allocation-hotspot-scanner`, `save-state-auditor`, and (given a capture) `frame-profiler-analyzer` in parallel — read [../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) §4 first (workers read-only, findings in the standard schema: `file:line — failure class — evidence — severity`).

The through-line: you are not reading code to understand everything; you are **interrogating the codebase against the known failure catalog** in this KB's principles docs. Every phase below is "which doc's failure modes are present, with evidence."

---

## Phase 0 — Orientation (30–45 min, do not exceed)

1. Identify: engine + **exact versions** (Unity: `ProjectSettings/ProjectVersion.txt` + `Packages/manifest.json`; Unreal: `.uproject` EngineAssociation + `*.uplugin`s; Godot: `project.godot`) — version tells you which era's defaults and bugs apply.
2. Scale: LOC by language, asset GB by type, scene/map count, contributor count from VCS. Time-box: `cloc`, `du`, `git shortlog -sn` — 10 minutes.
3. Read, in order: README/docs folder (note *staleness* — doc dates vs commit dates), CI config (what's actually gated — the single most honest document in any repo), and the last ~50 commit messages (what hurts *now*: revert-storms, "fix fix fix" chains, hot files).
4. Does it build and run? If no within 30 min, that's finding #1 (severity: critical, remediation: onboarding path) — note it and continue with static analysis only.

Write the one-paragraph "what is this" now, while you still have beginner's eyes; it becomes the architecture summary's opening.

## Phase 1 — Architecture summary (2–3 hours)

Answer these specific questions with `file:line` evidence, against [architecture-ecs-vs-oop.md](../principles/architecture-ecs-vs-oop.md) and [game-loop-and-timing.md](../principles/game-loop-and-timing.md):

- **Loop & timestep:** fixed sim step or variable? (Grep the engine's fixed/variable entry points: `FixedUpdate` vs `Update` gameplay ratio, `_physics_process` vs `_process`, custom accumulator.) Is sim/view separated, or does gameplay logic read render state? Accumulator clamped? *This one answer predicts half the remaining findings.*
- **Composition model:** component-based, ECS, inheritance-heavy, or mud? Find the 5 biggest classes (`wc -l`, sort) — god objects announce themselves. Update-order handling: explicit phases or engine-default alphabet soup ([arch §3.4](../principles/architecture-ecs-vs-oop.md))?
- **State & lifetime:** how do objects reference each other (raw refs / handles / IDs)? Event subscription hygiene — sample 10 `+=`/`Connect`/`AddDynamic` sites for paired removal ([arch §3.3](../principles/architecture-ecs-vs-oop.md)). Unreal: sample headers for raw `UObject*` without `UPROPERTY` ([unreal cpp doc §2](../engines/unreal/cpp-blueprints-and-concurrency.md)).
- **Save system:** find it (grep `Save`, `Serialize`, `PlayerPrefs`, `SaveGameToSlot`, file writes); check against the [save doc checklist](../principles/save-load-and-versioning.md) §5 — version int? atomic write? migrations? **Dispatch `save-state-auditor` here** and move on; it returns while you do Phase 2.
- **Dependency shape:** which module/assembly/folder does everything import? Draw the 6-box diagram (input → sim → presentation → UI; save; net). If you can't draw it in 6 boxes, that *is* the architecture summary.

Deliverable ①: one page — what it is, the 6-box diagram, timestep verdict, composition verdict, the 3 biggest structural risks, each with evidence.

## Phase 2 — Performance & allocation risk list (2–3 hours)

Against [performance-and-frame-budgets.md](../principles/performance-and-frame-budgets.md) + engine perf doc ([Unity](../engines/unity/performance-and-gc.md) / [Unreal](../engines/unreal/performance-and-insights.md)):

1. **If it runs: capture first, read second.** 15-minute profile of the heaviest available scene on whatever hardware exists (note the delta from min-spec). Frame time, GC/alloc column or `stat gc`, draw calls, worst-frame hitches. A capture converts the rest of this phase from speculation to confirmation. Big capture → `frame-profiler-analyzer`.
2. **Static sweep — dispatch `allocation-hotspot-scanner`** (whole-repo per-frame allocation + per-frame-sin catalog) or, solo, grep its top patterns in per-frame entry points: allocations/LINQ/string-concat in `Update`-class methods, `GetComponent`/`FindObject` per frame, non-`NonAlloc` physics queries, BP Tick math ([unreal perf §2](../engines/unreal/performance-and-insights.md)), `get_node` per frame (Godot).
3. **Budget existence check:** any frame/memory budget doc? Perf tests in CI? Pool infrastructure and is it used? (Their absence is itself a top-3 finding — [perf §1](../principles/performance-and-frame-budgets.md).)
4. **Asset pass** (30 min, against [asset doc](../principles/asset-pipeline-and-memory.md)): build size by category; `Resources/` folder population (Unity); import-settings sample of 10 large textures/audio; hard-ref residency smells (Unreal: Size Map the main menu — [unreal assets §1](../engines/unreal/assets-and-streaming.md); Unity: Addressables Analyze duplication).

Deliverable ②: ranked table — `finding | evidence (file:line or capture ref) | frame/memory cost class | fix class | effort S/M/L`. Rank by *player-visible cost × certainty*, not by how interesting the fix is.

## Phase 3 — Networking/desync risk assessment (1–3 hours; skip only if provably single-player-forever)

Against [networking-and-multiplayer.md](../principles/networking-and-multiplayer.md) + [security-and-anti-cheat.md](../principles/security-and-anti-cheat.md) + engine netcode doc:

1. **Model identification:** which topology/stack, and is it the right one for the genre ([net §1](../principles/networking-and-multiplayer.md) tree)? A mismatch here is a program-level risk, not a bug.
2. **Authority audit (the security half):** enumerate client→server surfaces (`ServerRpc`/`Server` RPCs/`@rpc("any_peer")`/message handlers); sample 10 for intent-vs-outcome and real validation (`_Validate` bodies, bounds checks) — [security §2](../principles/security-and-anti-cheat.md). Count owner-authoritative state (`NetworkTransform` owner mode, CMC trust widening — [unreal net §2](../engines/unreal/networking-and-replication.md), [unity netcode §2](../engines/unity/netcode.md)).
3. **Determinism hygiene (the desync half)**, even for server-auth games (it predicts misprediction rate): run the `netcode-desync-reviewer` skill's static checks over sim code — unseeded RNG, wall-clock reads, dict-iteration in sim, `Update`-time gameplay, float accumulation ([net §5 catalog](../principles/networking-and-multiplayer.md)).
4. **Infrastructure existence:** prediction-miss telemetry? state checksums? latency-injection rig? bot clients? JIP test? ([net §5/§7](../principles/networking-and-multiplayer.md)) Each absence is a finding with a known remediation.

Deliverable ③: half page — model verdict, top-5 desync/exploit risks with evidence, infrastructure gaps.

## Phase 4 — Synthesis: the prioritized remediation plan (1 hour — the actual product)

Merge all findings into one list, ordered by this rule: **(player-visible or ship-blocking impact) × (confidence in the finding) ÷ (effort)**, with two overrides: anything *architecturally time-sensitive* (wrong timestep model, client authority, save format without versions — things whose fix cost grows with every feature built on them) floats to the top regardless of current symptom visibility; anything purely aesthetic sinks regardless of ease. For each of the top ~10: what/evidence/fix-direction (link the KB doc §) /effort/owner-shaped-hole ("needs someone who knows Addressables"). Then three tiers: *now* (this sprint — bleeding or time-sensitive), *next* (this quarter — structural), *someday* (recorded so it stops being re-discovered by every new auditor).

**Calibration notes from doing this ~30 times:** the four most common top findings, in order — no fixed timestep with gameplay in variable update; per-frame allocation with no CI gate; unvalidated client RPCs; save system with no versioning. Expect to find all four in a typical inherited project; be *suspicious of your own audit* if you found none. And the report's tone rule: every finding paired with its evidence and its doc link — the audit's job is to transfer judgment, not to demonstrate it.
