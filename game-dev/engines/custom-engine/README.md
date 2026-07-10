# Custom / From-Scratch Engines — Production Patterns & Common Pitfalls (Extended Tier)

**Applies to:** engine-agnostic by definition; assumes C/C++/Rust/Zig-class systems language.
**Last reviewed:** 2026-07-06.
**Scope note:** extended tier. The [principles docs](../../principles/) were largely written from custom-engine scars and apply with *no* translation layer here — this doc covers only the judgment specific to *owning the whole stack*. The [build-from-scratch guide](../../guides/build-from-scratch.md) is the practical companion: it builds the minimal sound core this doc describes.

---

## 1. Should this engine exist? (the question that saves years)

Legitimate reasons, in descending frequency of being *actually true*: the game's core mechanic needs something commercial engines are bad at (massive deterministic sims, voxel worlds, unusual renderers, 10k-entity rollback netcode); the team already owns a proven engine and the delta to reuse is small; platform/licensing constraints. Illegitimate but common: "engines are bloated" (you will rebuild the bloat, feature by feature, in the order your designers block on it), résumé-driven development, and underestimating that **the engine is the minority of the cost — the *tooling* is the majority** (§3). A custom engine without a level editor, asset pipeline, and profiler is a tech demo with opinions. Decision hygiene: write the one-page "why not Unity/UE/Godot" memo and revisit it at each milestone; the honest ones get shorter, the doomed ones get longer.

## 2. Architecture: the spine to get right in month one

Order of construction (mirrors the [build guide](../../guides/build-from-scratch.md)):

1. **Platform layer behind a seam** (window/input/audio/file/net — SDL3 is the sane default; hand-rolled Win32/Metal/etc. layers are justified late, not early), so the sim/testing story never depends on a real window ([testing doc §2](../../principles/testing-and-determinism.md) headless rule).
2. **The loop**: fixed-timestep accumulator with clamp, interpolation seam, integer tick — [game-loop doc](../../principles/game-loop-and-timing.md) implemented literally, week one, because *everything* else attaches to it.
3. **Memory strategy before features**: arenas/frame allocators (per-frame scratch reset each tick — makes the [zero-steady-state-allocation rule](../../principles/performance-and-frame-budgets.md) §3 structural instead of disciplinary), pools for entities, explicit budgets per system ([asset doc §1](../../principles/asset-pipeline-and-memory.md) table, engine edition). Retrofitting allocation discipline into a `new`-everywhere codebase is the custom-engine version of retrofitting determinism.
4. **Data-driven from day 2**: hot-reloadable config/content (even just JSON + file-watch) — the difference between designers iterating and designers filing tickets. This is the first 10% of the tooling mountain (§3) and the highest-value part.
5. **Determinism as a property, not a feature** ([testing doc §3](../../principles/testing-and-determinism.md)): seeded RNG streams, integer ticks, stable iteration orders from the start. Cheap on day one, near-impossible at year two — and it gives you replay-based debugging, the single best debugging tool a custom engine can have (record every input, replay to any tick, bisect to the divergence — you'll fix in hours what printf-archaeology fixes in weeks).

## 3. The pitfalls that actually kill custom-engine projects

| Pitfall | What it looks like | Countermeasure |
|---|---|---|
| Tooling debt | engine great, content authored in text editors, iteration measured in rebuilds | budget tooling ≥ engine time; hot reload first; steal editors (Tiled, Blender-as-level-editor with an exporter, TrenchBroom) before writing them |
| Renderer rabbit hole | 18 months on a PBR renderer, no game | ugly-but-shipped rendering first (forward, one shadow map, done); the [performance doc](../../principles/performance-and-frame-budgets.md) budget table tells you when the renderer is actually the problem |
| NIH cascade | custom math lib, custom containers, custom format parsers, custom compressor | default to boring proven deps (stb, Jolt/Box2D, miniaudio, zstd, flatbuffers); custom only where the engine's reason-to-exist lives |
| No profiler | perf work by vibes ([principles §2](../../principles/performance-and-frame-budgets.md) failure mode, no engine safety net) | Tracy integration in week one — it's a day of work and it's superb |
| Single-platform assumptions | UB "works" on dev machines: uninitialized reads, alignment, x86-only memory-order habits ([concurrency doc §3](../../principles/concurrency-and-race-conditions.md)) | CI on a second platform/compiler + ASan/UBSan/TSan from the start; sanitizers are the custom engine's substitute for engine safety checks |
| Save/net formats coupled to struct layout | memcpy serialization → every refactor breaks saves ([save doc §3](../../principles/save-load-and-versioning.md) "never" list) | schema'd serialization at the boundaries from the first save file |
| Bus factor = 1 | the one engine person leaves; project ends | the engine is a product with docs and tests, or it's a liability; this KB's structure (principles + failure tables) is the template |

## 4. What you owe your team (the engine-owner's SLOs)

Build time (fast, always — a custom engine's one unfair advantage is sub-10s iteration; guard it like frame budget), crash triage (symbolicated crash dumps + the [telemetry](../../principles/testing-and-determinism.md) to cluster them — you have no engine vendor to file bugs against; you *are* the vendor), the CI matrix ([testing doc §8](../../principles/testing-and-determinism.md)) including sanitizer and determinism-trace jobs, and honest platform scoping: every target platform is a permanent tax (input quirks, GPU driver bugs, cert — [console doc](../console-certification/README.md), where custom engines pay full freight with no engine-vendor precertified middleware to lean on).
