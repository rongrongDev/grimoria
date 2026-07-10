# Unreal: Assets, References, World Partition, and Cooking

**Applies to:** UE 5.4–5.6 (World Partition era; classic level streaming noted for inherited projects).
**Last reviewed:** 2026-07-06.
**Principles this implements:** [../../principles/asset-pipeline-and-memory.md](../../principles/asset-pipeline-and-memory.md) — budgets, residency, dedup, version-skew. This doc: UE reference semantics, WP, and the cook/pak pipeline.

---

## 1. Memory model: the reference graph IS the residency model

UE loads the **dependency closure of every hard reference**. A `UPROPERTY() UStaticMesh*`, a BP variable typed to a concrete BP class, a `Cast<ABP_Boss>` node, a DataTable row struct referencing textures — each pulls its entire subtree into memory when the referencer loads. This single fact explains most UE memory surprises, including the canonical one: *the main menu using 6GB because the player BP references the weapon BPs which reference every skin*. This is [asset doc §3](../../principles/asset-pipeline-and-memory.md)'s no-hard-refs-from-resident-to-streamed rule with a specific enforcement toolset:

- **Soft references** (`TSoftObjectPtr`/`TSoftClassPtr` and BP soft variables) — a path, not a pointer; loading is explicit (`FStreamableManager::RequestAsyncLoad`) and *your* residency decision. Menu → soft-ref to level content, always-loaded managers → soft-ref to spawnables, UI → soft-ref to preview assets: the standing pattern.
- **Detection:** Reference Viewer on any suspiciously-heavy asset (follow the chain to the root that pins it); Size Map (right-click asset) for closure size — the two tools that answer "why is this in memory"; `memreport -full` diffs per build in CI ([asset doc §1](../../principles/asset-pipeline-and-memory.md)).
- **Prevention:** interface/base-class BP function surfaces so gameplay code never `Cast<>`s to concrete content classes ([architecture doc §3](../../principles/architecture-ecs-vs-oop.md) — dependency direction: systems know interfaces, content knows systems); asset audit CI (`AssetRegistry` commandlet) flagging hard refs crossing residency-tier boundaries — the tiers come from your [asset doc §3](../../principles/asset-pipeline-and-memory.md) table.

Sync-load trap: `TSoftObjectPtr::LoadSynchronous()` in gameplay = the [streaming hitch](../../principles/asset-pipeline-and-memory.md) §3, one autocomplete away. Lint it in gameplay modules; allow at load screens.

## 2. World Partition / streaming (large worlds)

WP replaces hand-managed sublevels with grid-cell auto-partitioning + streaming sources. The judgment that transfers: **cell size and HLOD are your [pop-in vs. memory](../../principles/asset-pipeline-and-memory.md) §3 tradeoff** — small cells stream granularly but multiply IO ops and boundary crossings (hitch risk per crossing, [perf doc §5](performance-and-insights.md)); big cells load chunky but resident-heavy. Tune against worst traversal speed as per principles. HLOD setup is not optional in open worlds — unloaded cells with no HLOD = visible world holes; budget HLOD build time into CI (it's a cook-adjacent step teams forget until the build farm chokes). One Frame Placement / streaming hitches at boundaries: check `stat levelstreaming`, spread actor registration (engine has amortization settings per version). Data Layers handle runtime variants (quest states, seasonal) — the trap is layers multiplying resident memory when several are active; they're a *content* budget line. Classic level streaming (inherited projects): same principles, manual granularity — the audit question is always "what pins what."

## 3. Async loading discipline

`FStreamableManager` handles (engine-level refcount analog of [Addressables handles](../unity/assets-and-addressables.md) §2 — same leak taxonomy: scope-own the handles, release on teardown); preload sets for gameplay-critical assets before they're needed (weapon swap sets, ability VFX — the [asset doc §4](../../principles/asset-pipeline-and-memory.md) critical-set idea); `OnAssetsLoaded` callbacks capturing weak object ptrs ([cpp doc §2](cpp-blueprints-and-concurrency.md) lambda rule — async-load callbacks outliving their actor is a standard crash). PakFile/IoStore ordering: cook-time load-order optimization (UAT flags) matters for seek-bound platforms and cold boot.

## 4. Cooking, paks, chunks, and patches

The cook (editor formats → platform formats) is where [asset doc §1](../../principles/asset-pipeline-and-memory.md) build discipline gets enforced:

- **What ships = cook closure of primary assets** (game default map, `PrimaryAssetLabel`s, Asset Manager rules). The dual failure: content missing from builds (referenced only via soft refs nobody registered — soft refs are invisible to the cooker unless declared via Asset Manager/labels) vs. build bloat (test maps in the cook list shipping 2GB of greybox). Both are Asset Manager configuration findings; audit `DefaultGame.ini` chunk/label rules in [project analysis](../../guides/analyze-existing-project.md).
- **Chunking** (`PrimaryAssetLabel` chunk IDs → pak/IoStore chunks) is UE's [group-layout](../unity/assets-and-addressables.md) §3 equivalent: group by load-unit + update cadence per [asset doc §5](../../principles/asset-pipeline-and-memory.md); chunk 0 is "always installed" — keep it minimal on platforms with intelligent delivery.
- **Patch size:** binary patching diffs pak/IoStore data; nondeterministic cooks (unstable GUIDs, order-dependent serialization, timestamp contamination) make untouched assets diff — the "we changed one string, the patch is 8GB" incident. Deterministic-cook settings + a patch-size report per release candidate in CI ([asset doc §1](../../principles/asset-pipeline-and-memory.md) report, patch edition). Console cert cares about patch sizes too ([console doc](../console-certification/README.md)).
- **Cooked ≠ editor:** cook-stripped editor-only data, `WITH_EDITOR` code, and cook-time BP compilation mean nightly cooked-build boot tests are the floor ([README](README.md) editor-vs-cooked; [testing doc §8](../../principles/testing-and-determinism.md)).

## 5. DDC (Derived Data Cache) — the iteration-speed keystone

Shader compiles, texture conversion, Nanite/HLOD builds all cache in the DDC. A team without a **shared** DDC (network share, cloud DDC/Horde, or Zen server — current tech per version) pays first-open cost per asset *per machine*: hours per artist per week, quietly ([asset doc §6](../../principles/asset-pipeline-and-memory.md) — highest-ROI infra claim, UE edition). Symptoms of DDC trouble: "editor takes 40 minutes to open the map on new hires' machines," PIE shader-compile stalls. Ops notes: size/evict policy on the share, warm the DDC from CI cooks (the build farm has already derived everything — let humans benefit), and put DDC health on the pipeline owner's dashboard next to build time ([cpp doc §4](cpp-blueprints-and-concurrency.md)).

## 6. Failure → detection → fix → prevention

| Failure | Detection | Fix | Prevention |
|---|---|---|---|
| Menu resident-memory blowup | Size Map on menu assets; memreport diff | break hard-ref chain with soft refs + interfaces | residency-tier reference audit in CI |
| World hole / pop-in in open world | traversal test at max speed | HLOD build; cell/source tuning | HLOD in CI; worst-traversal flythrough gate |
| Content missing in cooked build | nightly cooked boot test + content smoke | register via Asset Manager labels | soft-ref registration rule in review |
| 8GB patch for tiny change | patch-size report per RC | deterministic cook settings; investigate unstable assets | patch report gate in release checklist |
| New-hire editor unusably slow | (ask them — nobody reports it) | shared DDC / cloud DDC | DDC health metric owned by pipeline owner |
| Crash in async-load callback | crash cluster post-level-unload | weak-ptr capture + validity check | [cpp doc §2](cpp-blueprints-and-concurrency.md) capture rule |
