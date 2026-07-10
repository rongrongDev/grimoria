# Unity: Asset Pipeline & Addressables

**Applies to:** Unity 6.x, Addressables 2.x. Addressables API surface churns — verify method-level claims per package version.
**Last reviewed:** 2026-07-06.
**Principles this implements:** [../../principles/asset-pipeline-and-memory.md](../../principles/asset-pipeline-and-memory.md) — budgets, residency models, and version-skew reasoning live there. This doc is Unity mechanics + the traps specific to Addressables.

---

## 1. The loading-tech decision (settled, but stated for inherited projects)

- **Resources/**: legacy; everything in it ships in every build, loads block, no dedup. In audits, a populated `Resources/` folder on a project >1GB is an automatic finding. Migrate to Addressables; keep only trivial always-resident bits if anything.
- **Direct scene/prefab references**: fine for small games; every hard reference is build-included and load-coupled — the granularity is "the whole scene's dependency closure."
- **Addressables** (over AssetBundles — never hand-roll bundles anymore): the default for anything with memory budgets, DLC/live content, or platform size limits. You are buying: async handle-based loading, ref-counted memory management, dependency analysis, remote content delivery. You are paying: a handle-discipline tax and a group-layout design problem — both below.

## 2. Handle discipline — the leak model

Addressables memory is **reference-counted per handle**: `LoadAssetAsync` increments; `Release` decrements; the *bundle* unloads only when all assets in it hit zero. The three real-world failure shapes:

1. **Leaked handles** — load-without-release (often in fire-and-forget async flows or on objects destroyed before their release path runs). Symptom: memory climbs across scene transitions; Memory Profiler shows bundles alive with no scene references. Fix pattern: tie handle lifetime to an owner (a per-scene/per-feature `AddressableScope` that releases all on teardown); never a bare `LoadAssetAsync` whose handle isn't stored.
2. **Double-release / use-after-release** — released handle's asset still referenced by a live object → destroyed-object weirdness or invalid-handle exceptions. The [pooling reset contract](../../principles/performance-and-frame-budgets.md) §4 interacts here: pooled objects holding addressable-loaded sprites must not release on pool-return if another instance shares the asset — centralize ownership in the scope, not the instance.
3. **The bundle-granularity surprise** — releasing your last handle to asset A does nothing if asset B in the same bundle is held; one persistent UI sprite pins a 200MB environment bundle. Detection: Addressables Profiler module (2.x) shows bundle residency + what's pinning; this is the [asset doc §3](../../principles/asset-pipeline-and-memory.md) weak-reference hygiene rule made concrete.

`InstantiateAsync` couples instance and handle (released on destroy if configured) — convenient, but per-instance handles at scale carry overhead; for high-churn spawns, load once + pool instances yourself.

## 3. Group layout = your residency model, compiled

Groups are where the [asset doc §3](../../principles/asset-pipeline-and-memory.md) residency table becomes real: bundle mode (pack-together vs pack-separately), compression (LZ4 local — fast random access; LZMA remote-download only — decompress-to-cache, never for frequently-loaded local content), and local vs remote path per group. Layout rules that survive production:

- Group by **load unit + update cadence** ([asset doc §5](../../principles/asset-pipeline-and-memory.md)): things loaded together and patched together live together. A "misc" group is a residency bug generator.
- **Duplication is the default failure**: an asset referenced from two groups without being addressable itself gets *copied into both bundles* — silently. Run the Addressables Analyze rules ("Check Duplicate Bundle Dependencies") in CI; first run on a mature project routinely finds hundreds of MB. Fix by making shared dependencies explicitly addressable in a shared group.
- **Scenes + Addressables**: an addressable scene's dependency closure goes in its bundle; a hard reference from an always-loaded scene into that content duplicates or pins it. The `AssetReference` types (soft refs) are the tool — [asset doc §3](../../principles/asset-pipeline-and-memory.md)'s "no hard refs from resident to streamed," in Unity syntax: resident code holds `AssetReferenceT<GameObject>`, not `GameObject`.
- **Sync loads (`WaitForCompletion`)** exist and hitch exactly like you'd expect ([asset doc §3](../../principles/asset-pipeline-and-memory.md) streaming-hitch failure mode); allowed at load screens, banned in gameplay — grep-able, so lint it.

## 4. Remote content & the catalog (live-ops edition)

Remote groups + content catalogs give CDN-delivered content and post-ship updates. The traps: **catalog/client version skew** — a new catalog referencing content built against newer code = [asset doc §5.3](../../principles/asset-pipeline-and-memory.md) version-skew crashes; implement the client-declares-supported-range policy there, and *test the update path* (old client + new catalog) in CI before every content drop. **Content update builds** (the "update a shipped game" flow) depend on the previous build's state file (`addressables_content_state.bin`) — losing it or rebuilding-fresh instead of update-building changes bundle hashes and re-downloads the world to every player; archive state files per release, automate the update-build in CI so no human picks the wrong menu item. **`CheckForCatalogUpdates` timing**: catalog swap mid-session invalidates assumptions about what's loadable — gate catalog updates to boot/safe points.

## 5. Import pipeline mechanics (enforcing [asset doc §2](../../principles/asset-pipeline-and-memory.md))

`AssetPostprocessor` presets-by-folder-convention enforce texture/audio/mesh import rules as code; pair with a CI audit script (editor batch mode) that fails on violations — artist-machine enforcement alone drifts. The specific Unity defaults worth overriding globally: texture max size per platform tier, `Read/Write Enabled` off (silent 2× memory when on), audio `DecompressOnLoad` only for short SFX (`Streaming` for music), mesh compression on, `mipmaps` on for 3D / off for UI. Unity Accelerator (shared import cache) is the [asset doc §6](../../principles/asset-pipeline-and-memory.md) DDC equivalent — non-optional for teams >3; import time is iteration speed.

## 6. Failure → detection → fix → prevention

| Failure | Detection | Fix | Prevention |
|---|---|---|---|
| Memory climbs across transitions | Memory Profiler snapshot diff; Addressables Profiler residency | leaked handles → scope-owned lifetime | no bare loads (review rule); soak test w/ snapshot diff |
| One asset pins huge bundle | Addressables Profiler "what's pinning" | split group; separate shared deps | group-by-load-unit layout review |
| Build size jumps 300MB on small change | per-build size report diff ([asset doc §1](../../principles/asset-pipeline-and-memory.md)) | dedupe via Analyze rules | Analyze in CI, fail on new duplicates |
| Players re-download everything on patch | content-update build diff report | update-build against archived state file | archive state per release; CI owns update builds |
| Gameplay hitch at spawn | Profiler: IO + `WaitForCompletion` on main thread | preload critical set; async + pool | lint `WaitForCompletion` in gameplay assemblies |
| Boot crash after content drop | staging test: old client + new catalog | version-range gate in catalog metadata | skew test in release checklist ([asset doc §5](../../principles/asset-pipeline-and-memory.md)) |
