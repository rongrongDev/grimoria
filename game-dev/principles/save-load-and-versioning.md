# Save/Load & State Versioning

**Applies to:** engine-agnostic. Engine serializers: Unity (JsonUtility/Odin/MemoryPack notes in [../engines/unity/README.md](../engines/unity/README.md)), Unreal (`FArchive`/SaveGame in [../engines/unreal/README.md](../engines/unreal/README.md)).
**Last reviewed:** 2026-07-06.
**Related:** [architecture-ecs-vs-oop.md](architecture-ecs-vs-oop.md) §3.5 (sim/view separation is what makes saving possible), [security-and-anti-cheat.md](security-and-anti-cheat.md) §4 (save tampering). Subagent: `save-state-auditor` (scans serialization code for the failures below).

Save corruption is the bug class with the worst pain-to-line-of-code ratio in games. A dropped frame costs a player a flinch; a corrupted save costs them 60 hours and you a refund, a one-star review, and — on console — potentially a cert failure. Treat save code with database-engineer paranoia, because that's what it is: a tiny database with no DBA, written to disks you don't control, by a process that can die at any byte.

---

## 1. What state is, and what gets saved

Partition all game state explicitly (write the table down for your project):

| Class | Examples | Saved? |
|---|---|---|
| Persistent sim | player progress, inventory, world flags, economy | yes — the save file |
| Session sim | current HP mid-combat, projectiles in flight | genre decision: save-anywhere games must serialize it (hard); checkpoint games re-derive from checkpoint (easy). Pick deliberately — retrofitting save-anywhere is a rewrite. |
| Presentation | animation time, VFX, camera | never — re-derived on load. If loading "looks wrong," fix the derivation, don't start saving view state; that road ends with saving particle positions. |
| Settings/meta | options, keybinds | separate file, separate lifecycle — settings must survive save-slot deletion |

**The design rule that prevents most save bugs:** saveable state must be *closed under serialization* — a set of plain data (structs, IDs, enums) with no live object references, engine handles, or delegates. References to content (items, quests, abilities) are serialized as **stable string/GUID IDs resolved through a registry on load**, never as array indices (reorder = every save's sword becomes a boot) and never as engine object references. ECS-style flat state ([architecture-ecs-vs-oop.md](architecture-ecs-vs-oop.md) §1) makes this nearly automatic; object-graph state makes it a per-field discipline.

## 2. Atomic writes — failure → detection → fix → prevention

**Failure mode:** Process death (crash, power loss, console suspend-kill, mobile OS kill) mid-write leaves a truncated/garbage file. Frequency intuition: with autosave every 5 minutes and a million players, *daily* occurrences are guaranteed. Second-order version: overwriting the only copy, so the corrupted file is also the backup.

**Detection:** Load-time validation: magic bytes + format version + length + checksum (CRC32/xxHash of payload) verified before deserialization; telemetry event on every validation failure with failure stage. If you aren't measuring corruption rate, it's happening silently and players think they "lost their save somehow."

**Fix (the full ritual, no steps optional):** serialize to memory → write to `save.tmp` → **flush AND fsync** (`FileStream.Flush(true)`, not bare `Flush()` — OS-buffered data dies with power loss) → atomic rename over the target (POSIX rename is atomic; on Windows use `ReplaceFile`/`MoveFileEx(REPLACE_EXISTING)`) → keep N=2–3 rotated previous saves. Loader tries newest → falls back on validation failure → surfaces "restored older save" to the player rather than silently losing less progress than they think.

**Prevention:** kill-test in CI: a harness that SIGKILLs the game process at random points during thousands of save cycles, then asserts every resulting state loads to *some* valid save. This test finds the missing fsync every time a new platform port subtly changes file semantics. The `save-state-auditor` subagent checks the ritual is intact.

## 3. Versioning & migration — the part that kills live games

**Failure mode:** v1.2 changes a field's meaning/type; v1.2 loads a v1.1 save; silent misinterpretation. Best case: crash. Worst case: subtly wrong economy values that players notice three weeks later, unfixably, because the wrong values have been re-saved over the originals. The special hell variant: **forward compatibility** — a player on console v1.1 (cert lag) cloud-syncs a save from PC v1.3.

**Detection:** you can't detect what you didn't version. Format version integer in the header (§2) is the floor. Telemetry: histogram of save-version-at-load vs client version — this tells you how long migration paths must live (answer: essentially forever; players return after years).

**Fix/design — pick one deliberately:**
- **Explicit sequential migrations** (my default): save carries version N; loader applies `migrate_N_to_N+1` functions in sequence to a raw/dynamic representation (JSON tree, tag-value dict), then binds to current structs. Each migration is small, testable, and written *at the moment the format changes* while the author still remembers both formats.
- **Schema'd formats** (Protobuf/FlatBuffers/tagged fields): field-level add/remove tolerance for free (unknown fields skipped, missing fields defaulted), renames and *semantic* changes still need explicit handling. Good default for new projects; pair with an explicit version int anyway for semantic migrations.
- **Never:** raw language-native binary serialization of live types (BinaryFormatter-style, struct memcpy of non-versioned layouts, engine-default object serialization of gameplay types). Every one of these couples save compatibility to code layout, and refactoring becomes save-breaking. (Memcpy snapshots are fine for *in-memory* rollback netcode state — wrong for anything that touches disk.)

Semantics rules: never reuse a removed field's ID/slot; new fields get explicit defaults *with gameplay review* (defaulting `hasSeenTutorial=false` re-triggers the tutorial for every veteran); enum values are append-only.

**Prevention:** a **save-compatibility corpus in CI** — real save files from every shipped version (grab them at each release branch), loaded by every build, asserting load success + key invariants (progress level, inventory count, currency). This is the single highest-value test file-for-file in a live game. Add cross-direction tests if cloud sync spans platforms with version skew: newest save + oldest supported client must fail *gracefully* (clear message, no overwrite of the newer file).

## 4. The load path is gameplay code

Loading is re-entry into a live world, and it has its own bug taxonomy: **load-order dependencies** (system A's load assumes B already loaded — make load order explicit and identical to a fresh-boot init order); **derived-state reconstruction** (caches, spatial indices, quest-graph states must be rebuilt from saved canonical state — saving derived state instead invites contradiction bugs where the cache says X and the source says Y); **mid-load mutation** (gameplay systems ticking against a half-loaded world — freeze sim until load commits atomically); and **content-missing handling** (save references DLC/removed item ID → defined policy per content type: substitute, quarantine to a "lost items" mailbox, or refuse load with message — silent drop is item duping's evil twin and *will* be a support ticket titled "my legendary vanished").

## 5. Checklist (also the `save-state-auditor` core)

- [ ] Save state is plain data; all content refs are stable IDs via registry
- [ ] Header: magic + version + payload checksum, validated before parse
- [ ] Write ritual: temp file → fsync → atomic rename → rotated backups
- [ ] Loader falls back through backups; corruption telemetry exists
- [ ] Migration path per format change, sequential and individually tested
- [ ] CI: save corpus from all shipped versions loads green; kill-test passes
- [ ] Enum/ID slots append-only; defaults for new fields gameplay-reviewed
- [ ] Load order explicit; sim frozen during load; missing-content policy per type
- [ ] Settings separate from saves; cloud-sync version-skew policy defined
