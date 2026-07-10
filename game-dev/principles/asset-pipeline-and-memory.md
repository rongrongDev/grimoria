# Asset Pipeline, Streaming & Memory Budgets

**Applies to:** engine-agnostic; Unity Addressables specifics in [../engines/unity/assets-and-addressables.md](../engines/unity/assets-and-addressables.md), Unreal streaming/pak in [../engines/unreal/assets-and-streaming.md](../engines/unreal/assets-and-streaming.md).
**Last reviewed:** 2026-07-06.
**Related:** [performance-and-frame-budgets.md](performance-and-frame-budgets.md) §6 (load hitches), [../engines/console-certification/README.md](../engines/console-certification/README.md) (memory/patch-size cert realities).

Assets are where games actually live: 95%+ of a shipped game's bytes, most of its memory footprint, and — this is the part engineering teams under-own — most of its *production risk*. Code problems have stack traces. Asset problems have "the game is 40GB, takes 6 minutes to load, OOMs on Series S, and no one can say why" at beta, when every fix requires re-touching a thousand files. The pipeline is engineering's problem even though the content is not.

---

## 1. Budgets first: memory and size are designed, not discovered

Write these tables before production content exists, per min-spec platform:

**Memory budget** (example, 10GB usable console tier): textures 3.5GB, meshes 1.2GB, audio 600MB, animation 400MB, code+engine 1GB, gameplay heap 500MB, render targets 800MB, streaming buffers 500MB, OS/reserve per platform docs, **headroom 10–15%** (same 85% rule as frame budgets — the headroom absorbs the interaction effects and the DLC you haven't planned). Per-asset-class *unit* budgets fall out: hero character ≤ X MB, environment tile ≤ Y — which artists can actually work against.

**Build size budget:** mobile has store-driven cliffs (cellular download thresholds, install-size abandonment — every 100MB costs conversion); console/PC has patch-size and cert realities. Assign per-category caps and track per-build.

**Failure mode of skipping this:** every asset is individually reasonable; the sum OOMs. Detection at beta = re-authoring content under deadline. **Prevention:** per-commit build report (sizes by category, diff vs last build, top-20 largest assets) posted where the whole team sees it, plus hard CI failure on category cap breach. The report costs a day to build and pays for itself the first time it catches a 900MB accidentally-uncompressed cinematic — which it will; my record find via exactly this report was a 1.4GB WAV imported as "raw" by a sound designer's misclick, three weeks before it would have shipped.

## 2. Import discipline — failure → detection → fix → prevention

**Failure mode:** per-asset import settings left at defaults or hand-set inconsistently: uncompressed 4K textures on props, meshes with read/write enabled (doubles memory — CPU copy retained), audio decompress-on-load for 5-minute music tracks (entire decompressed PCM resident), missing mip chains on 3D-used textures (shimmer + bandwidth), full-precision vertex formats where half works.
**Detection:** asset audit script iterating import metadata against per-class rules (in Unity: AssetPostprocessor + editor script over importers; Unreal: asset registry audit commandlet / editor utility). The `analyze-existing-project` guide runs this as a standard step; findings are usually in the *hundreds* on first run of any project older than a year.
**Fix:** rules as code — importer presets/postprocessors that *enforce* per-folder/per-class settings (naming or folder convention → settings), so a stray manual override gets reverted by the machine.
**Prevention:** the enforcement runs in CI, not just on artist machines; new asset classes get a rules entry as part of "definition of done" for the feature that introduces them.

## 3. Streaming & LOD strategy

Decide the **residency model** per content type up front: always-resident (player character, UI, core audio), level-scoped (loaded on level transition), and streamed (open-world tiles, cinematics, high-mip textures). The architecture consequence: streamed content must be *referenced weakly* (by ID/soft reference) — one hard reference from an always-resident object into a streamed bundle pins the whole bundle resident and silently breaks the budget; this reference-graph hygiene is the #1 practical skill of asset-pipeline work (engine specifics: [Addressables doc](../engines/unity/assets-and-addressables.md) §3, [Unreal soft refs](../engines/unreal/assets-and-streaming.md) §2).

LOD: budget-driven, not vibes-driven — set screen-size thresholds from the memory/perf budget, generate LODs in the pipeline (never hand-model unless hero), and audit with the engine's LOD visualization on real gameplay paths. Streaming distance/priority tuning happens against the *worst traversal* (fastest vehicle through densest area, camera spinning); if the pop-in is visible there, either the read budget is wrong (measure actual disk throughput on min-spec — an HDD-era assumption on an NVMe title wastes latency headroom; an NVMe assumption on a mobile title stutters) or the content density is.

**Failure mode:** streaming hitches — the frame drops when a tile loads. Root causes in practice: synchronous load calls on the main thread hiding inside "async" flows (a sync fallback path taken under pressure), decompression on the main thread, or GPU upload bursts. **Detection:** hitch-correlated-with-IO in the profiler timeline ([performance doc §6](performance-and-frame-budgets.md)). **Fix:** genuinely async IO + time-sliced upload budgets (N MB per frame). **Prevention:** the perf CI flythrough crosses streaming boundaries on purpose.

## 4. Load time as a feature

Budget it like frame time: cold boot to menu ≤ Xs, level load ≤ Ys (write the numbers down; some platforms have cert-relevant expectations — [console doc](../engines/console-certification/README.md)). The standard sins: single-threaded deserialization, shader/PSO compilation at first use instead of during load ([performance doc §6](performance-and-frame-budgets.md)), loading the *whole* level before showing anything rather than critical-set-first + stream-the-rest, and redundant loads of shared dependencies bundle-by-bundle (dependency dedup is the core knob in both Addressables group layout and pak/chunk layout). Measure with a load-time breakdown timer (per-phase) in every dev build; load time regresses in silent 200ms increments and nobody notices until it's 90 seconds.

## 5. Bundles/addressables/paks — the shared pitfalls (engine-agnostic core)

Whatever the container tech: (1) **duplication** — an asset referenced by two bundles gets copied into both unless dependency layout prevents it; audit tooling exists in every engine, run it in CI (build-size diff catches it too: "why did adding one prop cost 300MB" = a shared material atlas duplicated into 40 bundles). (2) **Granularity tradeoff** — bundle-per-asset maximizes patch efficiency but explodes IO/overhead; monolithic bundles load fast but any change patches gigabytes; the answer is grouping by *update cadence and load unit* (things loaded together and updated together, bundle together). (3) **Version skew** — a live game's client code and downloaded content version independently; every content format change needs the same discipline as save migration ([save doc §3](save-load-and-versioning.md)): content carries format version, client declares supported range, CDN keeps old versions until the fleet moves. Skipping this is how "we shipped a banner update and the game crashes on boot for 12% of players" happens.

## 6. Source control & pipeline operations for content

Binary assets don't merge — the workflow must prevent conflicts, not resolve them: LFS/Perforce-style locking for unmergeable types, scene/prefab decomposition so parallel work doesn't collide ([architecture doc §5](architecture-ecs-vs-oop.md)), and import-cache sharing (Unity Accelerator, UE DDC — a shared derived-data cache turns hour-long first imports into minutes; it's the highest-ROI infra a content team gets). Keep *generated* data out of source history (derived data rebuilds; committing it bloats the repo unboundedly). One person owns the pipeline as a product — build times, import times, and build size get a dashboard and an SLO, because content-team iteration speed is the studio's actual velocity.

## 7. Checklist

- [ ] Memory + build-size budget tables exist per min-spec platform, with headroom
- [ ] Per-build size report + category caps enforced in CI
- [ ] Import rules enforced by code (presets/postprocessors), audited in CI
- [ ] Residency model per content type; no hard refs from resident → streamed
- [ ] Bundle/pak duplication audit in CI; grouping by load-unit + update cadence
- [ ] Load-time phase breakdown measured every build; budgets set
- [ ] Streaming boundaries covered by perf flythrough (hitch gate)
- [ ] Content/client version-skew policy for live updates
- [ ] Locking + shared derived-data cache operational; pipeline has an owner
