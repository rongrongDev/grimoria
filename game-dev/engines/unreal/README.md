# Unreal Engine — Engine Guide (Core Tier)

**Applies to:** Unreal Engine 5.4–5.6; most judgment holds for all UE5, much for UE4. Rendering: Nanite/Lumen era assumed where relevant.
**Last reviewed:** 2026-07-06. UE minor versions materially change perf/netcode defaults — verify version-specific claims against release notes.

Unreal-specific mechanics and pitfalls. The *why* lives in [../../principles/](../../principles/); each doc links its principles doc.

| Doc | Covers |
|---|---|
| [performance-and-insights.md](performance-and-insights.md) | Unreal Insights workflow, `stat` triage, Nanite/Lumen budgets, hitches |
| [cpp-blueprints-and-concurrency.md](cpp-blueprints-and-concurrency.md) | C++/BP split judgment, UObject lifetime, task graph & threading rules |
| [networking-and-replication.md](networking-and-replication.md) | Actor replication, RPCs, movement prediction, Iris, server perf |
| [assets-and-streaming.md](assets-and-streaming.md) | Soft refs, World Partition/level streaming, cooking, pak/chunks, DDC |

## The Unreal mental model

- **C++ with a garbage-collected object model on top.** `UObject`s are GC-managed (mark-and-sweep, incremental options); *only* `UPROPERTY()`-visible references keep objects alive and get nulled on destruction. A raw `UObject*` member without `UPROPERTY()` is a dangling pointer *and* invisible-to-GC — the two worst bugs in one line. Rules: `UPROPERTY()` for owning refs, `TWeakObjectPtr` for observers, `IsValid()` not `!= nullptr` (destroyed-but-not-collected actors pass null checks — same overloaded-null trap as Unity, different mechanism).
- **The frame is the pipeline** from [concurrency doc §1](../../principles/concurrency-and-race-conditions.md), explicitly: GameThread → RenderThread (proxy objects) → RHIThread → GPU. Game code touches render state only through the proxy/`MarkRenderStateDirty` machinery; the [§1 race class](../../principles/concurrency-and-race-conditions.md) is enforced by checks in debug — trust them.
- **Gameplay framework is opinionated:** Actor/Component + GameMode (server-only!) / GameState / PlayerController / PlayerState / Pawn. Fighting it costs more than learning it; the replication and possession flows assume it ([networking doc](networking-and-replication.md)). GameMode existing only on the server is the framework teaching you [server authority](../../principles/security-and-anti-cheat.md) §2 — put match rules there and they're unhackable by construction.
- **Two languages, one program:** C++ and Blueprints. The split is a *performance and diff-ability* decision, not a skill hierarchy — [cpp-blueprints doc §1](cpp-blueprints-and-concurrency.md).
- **Tick is variable-rate by default** — gameplay math in `Tick(DeltaSeconds)` must use DeltaSeconds correctly, and sim-critical logic wants fixed ticking you arrange deliberately ([game-loop doc §5](../../principles/game-loop-and-timing.md)). Also: ticking is opt-out per actor/component and tick *volume* is a classic UE server cost — `stat game`, tick aggregation, and "does this actually need to tick?" are standing questions.

## Cross-cutting Unreal pitfalls

- **Hot-reload/Live Coding lies occasionally** — serialized state + patched code drift; when behavior is impossible, full editor restart before debugging further. Budget zero trust for repro'd-only-after-hot-reload bugs.
- **`Cast<>` chains and hard class references in BP** pull dependency closures into memory (asset doc: [assets-and-streaming.md](assets-and-streaming.md) §2 — the #1 UE memory surprise: casting to `BP_Boss` in a shared HUD widget loads the boss's textures in the main menu).
- **CDO (Class Default Object) mutation:** editing defaults at runtime or in construction scripts mutates shared state — "why did all enemies change" bugs. Construction-script side effects are order-fragile; keep them idempotent and pure-ish.
- **`FMath::RandRange` in sim code** — global RNG stream, instant [desync root cause #2](../../principles/networking-and-multiplayer.md). Deterministic gameplay uses owned `FRandomStream`s, seeded and replicated deliberately.
- **Editor-vs-cooked divergence:** editor loads uncooked assets permissively; cooked builds strip and reorder aggressively. "Works in PIE, broken in package" is a *class* — test cooked builds in CI nightly ([testing doc §8](../../principles/testing-and-determinism.md)), and see [assets doc §4](assets-and-streaming.md) for cook determinism.
- **Physics:** Chaos is not cross-machine deterministic in general use; fixed-tick + determinism flags exist per version with caveats — lockstep titles: same judgment as [networking doc §5.6](../../principles/networking-and-multiplayer.md), verify per engine version before betting on it.

## Save games in Unreal

`USaveGame` + `SaveGameToSlot` gives you serialization mechanics, not a strategy: it versions poorly by default (property serialization tolerates add/remove but not semantic change), writes non-atomically on some platforms, and encourages saving live-object state. Apply [save-load-and-versioning.md](../../principles/save-load-and-versioning.md) wholesale: explicit version int in the save struct, migration chain, atomic write ritual (temp + rename via `IFileManager`), save-corpus CI. The `save-state-auditor` agent knows the UE-specific smells (`Serialize()` overrides without version guards, `BulkSerialize` of raw layouts).
