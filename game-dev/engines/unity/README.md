# Unity — Engine Guide (Core Tier)

**Applies to:** Unity 6.x (6000.x LTS line, incl. 6.1/6.2 updates); most judgment holds back to 2021/2022 LTS. Rendering: URP and HDRP (Built-in RP notes where behavior differs).
**Last reviewed:** 2026-07-06. Verify version-specific claims against release notes for anything newer.

This directory holds Unity-specific *mechanics and pitfalls*. The *why* behind every rule lives in [../../principles/](../../principles/) — each doc below links its principles doc; read that first if a rule seems arbitrary.

| Doc | Covers |
|---|---|
| [performance-and-gc.md](performance-and-gc.md) | Managed allocation/GC, profiler workflow, draw-call batching, URP/HDRP perf traps |
| [dots-jobs-and-burst.md](dots-jobs-and-burst.md) | C# Job System, Burst, DOTS/Entities adoption judgment, safety system |
| [netcode.md](netcode.md) | Netcode for GameObjects vs Netcode for Entities vs third-party; prediction realities |
| [assets-and-addressables.md](assets-and-addressables.md) | Addressables, bundles, import pipeline, build size |

## The Unity mental model (what makes it *Unity*)

- **C# on a managed runtime.** The GC is the single biggest per-frame performance difference from C++ engines — [performance-and-gc.md](performance-and-gc.md) is the most load-bearing doc here. Unity 6 still uses the Boehm–Demers–Weiser incremental GC; allocation discipline is not optional. (CoreCLR migration remains on Unity's public roadmap — recheck this claim on major version bumps, it changes GC guidance materially.)
- **Main-thread-bound scene API.** `GameObject`, `Transform`, `Component` APIs are main-thread-only. All parallelism goes through Jobs/Burst on data you copied out — [dots-jobs-and-burst.md](dots-jobs-and-burst.md).
- **UnityEngine.Object has two lives.** A destroyed `Object` keeps its managed shell; `obj == null` is *overloaded* to return true for destroyed-but-referenced objects, but `obj?.Foo()` and `ReferenceEquals(obj, null)` bypass the overload. This asymmetry is a top-5 Unity bug source: never use null-conditional/null-coalescing operators on `UnityEngine.Object` references.
- **Serialization drives everything** — scenes, prefabs, ScriptableObjects, inspector fields all go through Unity's serializer (no polymorphic plain-class fields without `[SerializeReference]`, no properties, no dictionaries natively). Consequences for save systems: **do not use the asset serializer for save games** — see [../../principles/save-load-and-versioning.md](../../principles/save-load-and-versioning.md); use a schema'd format (MemoryPack/protobuf/JSON+migrations). `JsonUtility` is fine for small tools, too rigid for versioned saves.
- **Script lifecycle order is architecture:** `Awake` (self-init only) → `OnEnable` → `Start` (cross-object refs safe) → `FixedUpdate`×N → `Update` → `LateUpdate` (camera follows here, after all movement). Cross-object initialization in `Awake` is order-dependent and breaks on scene re-arrangement — the "works in this scene, NREs in that one" bug. Script Execution Order settings exist; use sparingly, prefer explicit init phases ([../../principles/architecture-ecs-vs-oop.md](../../principles/architecture-ecs-vs-oop.md) §3.4).

## Unity-specific pitfalls that don't fit one doc

- **Editor vs. build divergence:** `#if UNITY_EDITOR` code paths, Resources vs Addressables timing, script stripping (IL2CPP + managed stripping removes reflection-only-referenced code — keep `link.xml` current), and platform-dependent compilation mean *the editor is not the game*. CI must run player builds and play-mode tests on target platforms, not just editor tests ([../../principles/testing-and-determinism.md](../../principles/testing-and-determinism.md) §8).
- **Coroutines and lifetime:** a coroutine dies with its MonoBehaviour's deactivation — silently. Long-running flows on objects that can be disabled = half-executed logic. Prefer async/await with explicit cancellation (`destroyCancellationToken`) or a dedicated runner object; audit `WaitForSeconds` allocations in loops (cache the object).
- **Physics:** default 50Hz `FixedUpdate`; input-in-FixedUpdate and transform-vs-Rigidbody movement traps are covered in [../../principles/game-loop-and-timing.md](../../principles/game-loop-and-timing.md) §5. PhysX is not cross-machine deterministic; lockstep titles need a deterministic physics replacement.
- **Time.timeScale = 0** does not stop `Update`; it stops `FixedUpdate` and scales `deltaTime` to 0 — per-frame code dividing by `deltaTime` now divides by zero. Pause via sim-tick freeze, not timeScale alone.
- **Domain reload / enter-play-mode settings:** disabling domain reload (for iteration speed) leaves `static` state alive between play sessions — the "works first run only" bug class. If you disable it, every static needs a `[RuntimeInitializeOnLoadMethod]` reset, enforced by convention + lint.

## Version stamping discipline

URP/HDRP, Netcode for GameObjects/Entities, Addressables, and Entities all version *independently* of the editor. When recording a decision or bug workaround, stamp the *package* version (e.g. "Entities 1.3.x"), not just "Unity 6." The CHANGELOG at [../../CHANGELOG.md](../../CHANGELOG.md) tracks which package versions this KB's claims were verified against.
