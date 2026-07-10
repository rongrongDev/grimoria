---
name: netcode-desync-reviewer
description: Review a networked gameplay feature (diff, PR, or named files) for desync risk and unvalidated client state — nondeterminism in simulation code (unseeded RNG, wall clock, iteration order, float accumulation, frame-rate coupling), missing prediction/reconciliation structure, and client→server messages trusted without validation. Use on any PR touching simulation, replication, RPCs, or predicted movement in a multiplayer game, or when asked to "review this for desync/netcode/cheating risk". Do NOT use for diagnosing a live desync report (that needs the checksum-bisect workflow in game-dev/principles/networking-and-multiplayer.md §5, driven from logs, not code review), for netcode architecture selection (read §1 of that doc directly), or for single-player-only code with no replication surface.
---

# Netcode Desync Reviewer

You are reviewing a **bounded diff or file set** for the two failure families that share one root — client and server (or peer and peer) disagreeing about the truth:
**A. Desync risk:** nondeterminism introduced into simulation code.
**B. Trust risk:** client-supplied claims accepted without server validation.
A desync bug costs a nine-day hunt; a trust bug costs the economy. Both are cheapest to catch in the diff.

**Read first if available:** `game-dev/principles/networking-and-multiplayer.md` (§3 prediction, §5 desync root causes — the catalog this skill operationalizes) and `game-dev/principles/security-and-anti-cheat.md` §2–§3. Engine dialect: `game-dev/engines/unity/netcode.md` or `game-dev/engines/unreal/networking-and-replication.md`. Cite doc sections in findings.

## Procedure

1. **Classify each changed region:** simulation code (deterministic zone — anything that computes gameplay outcomes: movement, combat, economy, spawning), presentation code (free zone), or boundary code (message handlers, replication config, prediction plumbing). The project's determinism *requirements* set the bar: lockstep/rollback → bit-determinism, checklist A applies in full; server-authoritative with prediction → client/server sim equivalence, A still applies to shared/predicted sim paths (divergence = rubber-banding). If you can't tell which model the project uses, determine it first (grep for rollback/lockstep/prediction machinery) — it changes severity of every A finding.
2. Walk checklist A over simulation-zone changes, checklist B over every boundary-zone change. Open callers/callees as needed; determinism is a whole-path property.
3. For each finding: `file:line` — failure class — the concrete divergence or exploit it enables — the fix — severity.
4. Severity: **P0** = definite desync source in deterministic zone, or client-authoritative state mutation with economy/competitive impact; **P1** = probable divergence (misprediction/rubber-band), missing validation on bounded-impact message, presentation logic inside a re-simulated prediction path; **P2** = fragile pattern (works now, breaks under the next refactor).
5. Close with infrastructure deltas: does the feature add state that per-tick checksums (§5) don't cover? Does it need a new determinism-trace test or latency-tier test before merge? Name them concretely.

## Checklist A — nondeterminism in simulation code (§5 catalog, review form)

- RNG: any `Random`/`FMath::Rand`/`randi()`/`UnityEngine.Random` in sim that isn't the owned, seeded, serialized sim stream; sim RNG stream consumed by presentation code (couples VFX count to gameplay state).
- Time: wall clock (`DateTime`, `realtimeSinceStartup`, `FPlatformTime`), `Time.deltaTime`/variable `DeltaSeconds` feeding gameplay math, float-accumulated sim time instead of integer ticks.
- Order: iteration over `Dictionary`/`HashSet`/`TMap`/unordered containers where results affect state; pointer/handle-keyed sorts; event/callback firing order assumptions; parallel results appended in completion order instead of indexed slots (cite `game-dev/principles/concurrency-and-race-conditions.md` §6).
- Float hazards (bit-determinism projects): new float math in sim (should be fixed-point or pinned-mode), `Mathf`/`std::sin`-class library calls, parallel float reductions, fast-math-compiled code (Burst FloatMode, compiler flags).
- Frame coupling: sim reading render state (camera, LOD, animation time, screen size), logic in variable-rate update that belongs in fixed tick, input consumed per-render-frame inside fixed tick (double/missed input class).
- State escape: pooled objects entering sim without reset-on-acquire; uninitialized fields; static/global mutable state touched by sim; sim state mutated from presentation callbacks (UI writing back — the rounded-cooldown war story).
- Prediction structure (predicted features): does the predicted path share sim code with the server path, or reimplement it (permanent micro-mispredict)? Reconciliation replays buffered inputs after rewind (rewind-without-replay = rubber-banding)? Presentation effects inside the re-simulated loop guarded to fire once?

## Checklist B — unvalidated client state (security §2, review form)

- Message semantics: does the client send an *intent* (input, "use slot 3") or an *outcome* (position, damage dealt, currency earned, item granted)? Every outcome-shaped message is a finding unless the server recomputes or bounds-checks it.
- Validation bodies: `_Validate`/handler checks that are `return true`/absent; bounds checks missing tolerance justification (too tight = lag punishes innocents; absent = exploit).
- Authority config: owner-writable replicated vars (`NetworkVariable` owner-write, owner-auth `NetworkTransform`, widened CMC trust thresholds, `@rpc("any_peer")` mutating state) — each needs written justification.
- Timing trust: client timestamps used for lag-comp rewind or cooldowns (server-tracked timing only; clamp rewind).
- Information leaks: newly replicated fields the receiving client shouldn't render (enemy positions behind walls, hidden rolls) — wallhack surface is an information-architecture finding.
- Reliability semantics: persistent state carried in events/RPCs (late-joiners miss it — state belongs in replicated properties/snapshots); gameplay-critical flow on unreliable channel without sequencing tolerance.

## Output format

Two finding tables (A: desync; B: trust), each `severity | file:line | class | consequence | fix`; then the infrastructure-delta list (tests/checksums to add); then a one-paragraph verdict: mergeable as-is / with named fixes / needs redesign, and — one sentence — the worst thing that happens in production if merged unchanged.
