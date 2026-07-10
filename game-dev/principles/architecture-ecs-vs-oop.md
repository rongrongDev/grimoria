# Architecture: ECS, Components, and When Data-Oriented Design Pays

**Applies to:** engine-agnostic; Unity DOTS specifics in [../engines/unity/dots-jobs-and-burst.md](../engines/unity/dots-jobs-and-burst.md); Unreal's actor/component model in [../engines/unreal/cpp-blueprints-and-concurrency.md](../engines/unreal/cpp-blueprints-and-concurrency.md).
**Last reviewed:** 2026-07-06.
**Related:** [performance-and-frame-budgets.md](performance-and-frame-budgets.md), [save-load-and-versioning.md](save-load-and-versioning.md), [../guides/build-from-scratch.md](../guides/build-from-scratch.md) (a minimal ECS built from nothing).

Architecture debates in games are usually performance debates wearing a costume. Strip the costume: there are two questions — *how do you compose behavior?* and *how does data lay out in memory?* — and they have different answers at different scales. The expensive mistake is answering the second question when you were only asked the first.

---

## 1. The three models, honestly

**Deep inheritance (legacy OOP):** `Entity → Character → NPC → Enemy → FlyingEnemy → FlyingBossEnemy`. Dies at scale because behavior doesn't compose down a tree — you eventually need a flying enemy that swims, and the diamond you draw that day is the beginning of the end. Every 20-year codebase I've excavated had a `Character.cpp` over 20k lines for exactly this reason. Verdict: fine for jams, never for teams.

**Component composition (Unity GameObject/MonoBehaviour, Unreal Actor/ActorComponent, Godot nodes):** entities are bags of component objects; behavior lives in components; composition replaces inheritance. This is the shipped-game default of the last 15 years and it is *good*. Its real weaknesses: (a) component-to-component references become an invisible dependency web (who nulls whom on destroy?), (b) per-object virtual dispatch and scattered heap objects — cache misses — when entity counts get large, (c) update order between components is engine-scheduled and fragile ("it broke when we renamed the file" = alphabetical update order dependency; pin explicit orders).

**ECS / data-oriented (Unity DOTS, Flecs, EnTT, Bevy, custom):** entities are IDs; components are plain data in contiguous arrays (archetype/chunk or sparse-set storage); systems are functions over queries (`for each (Position, Velocity)`). Behavior lives *only* in systems. What you actually buy: cache-coherent iteration (the 10–50× number is real for tight loops over thousands of entities — it comes from memory bandwidth, not magic), trivially safe parallelism (systems declare read/write sets → scheduler derives what runs concurrently), and — underrated — **serialization and determinism for free-ish**: state is flat arrays with no object graphs, so snapshotting for rollback netcode or save games is a memcpy-shaped problem ([save-load-and-versioning.md](save-load-and-versioning.md), [networking-and-multiplayer.md](networking-and-multiplayer.md) §1 rollback).

## 2. When data-oriented design actually pays — the decision tree

Use full ECS for a simulation layer when **any** of:
- Steady-state entity counts in the thousands+ with per-tick logic on most of them (RTS, sims, bullet-hell, crowd systems)
- Rollback netcode (snapshot/restore every tick makes object-graph state a non-starter)
- Profiler-proven cache-miss-bound entity update as a top frame cost
- You need system-level parallelism and the read/write-set model to keep it safe

Stay with engine component composition when:
- Entity counts in the hundreds, logic is branchy and entity-specific (narrative games, most action-adventures)
- The team is majority mid-level or heavy on designer-scripting — ECS's indirection (can't click an object and see its behavior) has a real onboarding and iteration cost; I've watched a team's content velocity halve for six months after an ideology-driven DOTS migration that the profiler never asked for
- The hot path is rendering/physics (engine-internal) and gameplay is 2ms of a 16ms frame — restructuring it buys you nothing a pool and a tighter loop wouldn't

**The hybrid that ships:** engine objects for the presentation/interaction layer, ECS for the hot simulation core (projectiles, crowds, boids, economy), with a thin sync layer copying sim → presentation once per frame. This is where most successful "we use ECS" games actually land, including Unity's own guidance for DOTS adoption. Design the sync layer as one-directional (sim → view) — the moment view code writes back into sim arrays mid-frame you've recreated the race and determinism problems ECS was hired to solve.

**Anti-signal:** adopting ECS because a conference talk said OOP is dead. Data-oriented design is a response to a *measured* memory-access problem. No measurement, no migration.

## 3. Rules that make component architectures survive (the 80% case)

1. **Composition over inheritance, one level of behavior inheritance max.** A base `Interactable` is fine; a hierarchy of them is the old disease returning.
2. **Explicit lifetimes:** every cross-component/cross-entity reference must have an owner and a null-on-destroy policy. The alternative is the `NullReferenceException`/dangling-`AActor*` crash cluster at position #1 in your telemetry. Prefer handles/IDs + lookup over raw references for anything that outlives a frame; validate on use.
3. **Events for decoupling, with discipline:** UI and audio listen to gameplay events, never poll gameplay state. But: unsubscription must be paired with subscription (leak class #1 in Unity — a destroyed object leaving a delegate in a static event keeps it "alive" and throws on invoke), and event *cascades* (event handler raises event raises event) are re-entrancy bugs — queue and drain at a defined point in the frame instead of firing synchronously mid-mutation.
4. **Update order is architecture:** define an explicit phase list (input → sim → post-sim → camera → UI) and register systems/components into phases. Implicit engine-default ordering is a landmine with a two-year fuse.
5. **Separate sim state from view state** even in OOP-land: a `PlayerState` struct the `PlayerController` renders is refactorable toward save games, netcode, and ECS later; logic marbled through view objects is not. This single habit is the cheapest option-preserver in game architecture.

## 4. Failure → detection → fix → prevention summary

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| God object / 20k-line class | file size + "everything imports it" | extract per-concern components/systems incrementally, strangler-style | review gate on class size growth; ownership map in docs |
| Dangling cross-entity references | crash telemetry cluster on destroy-adjacent code | handles + validity check; destroy events | lifetime rules in review checklist |
| Update-order dependency | bug appears on rename/reorder; "works in editor, not build" | explicit phase registration | phases from day one; forbid same-phase order assumptions |
| Event leak / cascade | objects alive after destroy (memory profiler); reentrant state corruption | paired unsubscribe (or weak refs); queued events | subscription audit in `analyze-existing-project` guide; lint for `+=` without `-=` |
| Cache-miss-bound update | profiler: high CPI/stalled cycles, time scales superlinearly with entity count | hot-path ECS or SoA restructure of the *measured* system only | frame budget per system; perf test at 2× design entities |
| Premature ECS | content velocity collapse, designers blocked | re-scope ECS to hot sim core; return presentation to engine objects | require profiler evidence in the migration proposal |

## 5. Scene/world organization at team scale

The architecture problem nobody assigns an owner: **merge conflicts in scenes/prefabs.** Two designers editing one scene file = a broken binary/YAML merge and a lost afternoon, weekly. Mitigations that work: additive scene loading with per-discipline scenes (art / lighting / gameplay volumes / audio) composed at load; prefab-per-thing rather than scene-embedded objects; text serialization + semantic merge tooling (Unity SmartMerge, UE diff tooling) configured in the VCS, not on each dev's machine; and a locking convention for the files that remain unmergeable. This belongs in architecture docs because retrofitting scene decomposition at month 18 is a production-stopping event — and it's also the fan-out unit for multi-agent work on content ([multi-agent-orchestration.md](multi-agent-orchestration.md) §4).
