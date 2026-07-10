# Networking & Multiplayer

**Applies to:** engine-agnostic; Unity NGO/Netcode specifics in [../engines/unity/netcode.md](../engines/unity/netcode.md), Unreal replication in [../engines/unreal/networking-and-replication.md](../engines/unreal/networking-and-replication.md).
**Last reviewed:** 2026-07-06.
**Related:** [game-loop-and-timing.md](game-loop-and-timing.md) (fixed timestep is a prerequisite), [testing-and-determinism.md](testing-and-determinism.md), [security-and-anti-cheat.md](security-and-anti-cheat.md). Skill: `netcode-desync-reviewer`. A working predicted-movement implementation: [../guides/build-from-scratch.md](../guides/build-from-scratch.md) Part 4.

Multiplayer is the domain where architecture mistakes are least recoverable. You can refactor a renderer; you cannot bolt determinism onto a simulation that reads `Time.deltaTime` in 400 places, and you cannot bolt server authority onto a game whose clients have been trusted for two years of content. Decide the model before the first gameplay system is written.

---

## 1. Topology & model — the decision tree

**Client-server, server-authoritative** (default for anything competitive or with an economy):
- Server simulates truth; clients send *inputs/intents*, receive state.
- Choose when: >2 players, cheating matters, persistence matters, genre tolerates 50–150ms round trip masked by prediction (shooters, MMOs, co-op, MOBAs).
- Cost: server hosting, and every gameplay feature is written twice-ish (predicted client path + authoritative server path).

**Deterministic lockstep** (peer-to-peer or relayed):
- Peers exchange only *inputs*; every machine simulates identically. Bandwidth is tiny and flat regardless of entity count.
- Choose when: entity count is huge relative to bandwidth (RTS with 2,000 units), small player counts, and you can actually achieve determinism (see §5 — this is a serious commitment).
- Cost: input latency ≥ worst peer's RTT unless you add rollback; one desync = game over; joins-in-progress and reconnects are hard (must transfer full state).

**Rollback (GGPO-style)** — lockstep + speculative execution:
- Simulate immediately with predicted remote inputs; when real inputs arrive, rewind and re-simulate.
- Choose when: latency is the product — fighting games, platform fighters, 1v1/2v2. Requires: deterministic sim, **full game state save/restore cheap enough to do every tick**, and re-simulating up to ~7–10 ticks in one frame (your sim must run at ~10× real time; budget accordingly — this constrains entity counts hard).

**Peer-to-peer with host authority:** one player's machine is the server. Acceptable for co-op with friends; host migration and host-cheating are the taxes. Don't use for ranked anything.

Hybrids are normal: server-authoritative world + deterministic minigames; lockstep sim + server relay for matchmaking/anti-cheat attestation.

## 2. State replication vs. input replication

Everything in §1 reduces to what you send: **state** (server → clients: "entity 42 is at x,y") or **inputs** (everyone: "player 3 pressed jump on tick 981"). State replication tolerates nondeterminism and packet loss (later state supersedes) and supports late join trivially, but bandwidth scales with world size and you must solve interest management (which entities does this client need? — relevancy/AOI systems) and delta compression (send changes against last-acked baseline, not full snapshots). Input replication scales with player count only, but demands perfect determinism. Most shipped client-server games: state replication for the world + input upload from clients, prediction on top.

## 3. Client-side prediction & reconciliation (the part everyone gets wrong once)

The problem: at 80ms RTT, a naive server-authoritative client presses W and moves 80ms later. Unacceptable. The fix, precisely:

1. Client stamps each input with its tick, sends it, **and applies it locally immediately** to a predicted copy of the player.
2. Client keeps a ring buffer of `(tick, input, resultingPredictedState)`.
3. Server simulates with the client's input when it arrives, sends back authoritative state stamped with the last input tick it consumed.
4. Client compares server state at tick T with its stored prediction at T. Match (within epsilon) → discard history ≤ T, done. Mismatch → **rewind to server state at T, then re-apply all stored inputs from T+1 to now** (re-simulating the player's local movement code), landing on a corrected present.
5. Visual smoothing: blend the corrected position over ~100ms rather than snapping, *except* for large corrections (teleport/anti-cheat rejections) which should snap — smoothing a 5-meter correction looks like ice skating.

**Failure modes & their symptoms:**
- *Reconciliation without replay* (rewind to server state, don't re-apply inputs): rubber-banding proportional to RTT on every packet. The most common prediction bug in the wild.
- *Predicting other players:* you don't have their inputs; **interpolate remote entities instead** — render them ~100–200ms in the past between two known snapshots (Valve model). Mixing this up (extrapolating remotes with local-style prediction) produces remote players who jitter and warp on every direction change.
- *Predicting non-movement effects* (damage, pickups, door opens): each needs an explicit predicted/confirmed/rolled-back lifecycle, and the rollback must be *presentable* (the pickup you grabbed reappears). Predict only what's worth the UX complexity: movement always; firing effects usually; kills/economy never — see [security-and-anti-cheat.md](security-and-anti-cheat.md).
- *Sim code not shared:* prediction requires the client to run *the same movement code* as the server. Two implementations = permanent micro-mispredictions = constant soft rubber-banding. Structure the sim as a shared library from day one.

**Detection:** Log prediction-miss rate (corrections per second) and correction magnitude as first-class telemetry. Baseline it; a gameplay PR that doubles it introduced server/client divergence. Test at simulated 120ms RTT + 2% loss + 30ms jitter — every netcode feature, in CI if you can script it (see §7).

## 4. Lag compensation (hitting what you see)

With remote entities interpolated ~150ms in the past, a perfectly-aimed shot at the server's *present* misses. Server-side rewind: keep a history buffer of entity transforms (~1s); when processing a shot from client at estimated view-time T, rewind targets to T, trace, restore. **The tradeoff is policy, not tech:** the shooter's fairness is the victim's "I was already behind the wall" — decide the max rewind (typically 200–400ms; beyond that high-ping players get kills that feel like cheating to everyone else) and expose it in telemetry. Failure mode: unclamped rewind + spoofed timestamps = clients shooting into the past at will; the rewind time must come from *server-tracked* RTT/interp state, never a client-supplied timestamp (see [security-and-anti-cheat.md](security-and-anti-cheat.md) §2).

## 5. Desync — root causes, detection, and the debugging discipline

A desync is two simulations that were supposed to agree, diverging. In lockstep/rollback it's fatal; in server-authoritative it manifests as elevated misprediction. Root causes, ranked by how often I've actually found them at the end of a desync hunt:

1. **Floating point nondeterminism:** different FPU behavior across compilers/platforms/CPUs (x87 vs SSE history, FMA contraction, denormals, `sin/cos` library differences, fast-math flags). Also *within* one platform: order-dependent float sums under parallelism ([concurrency-and-race-conditions.md](concurrency-and-race-conditions.md) §6). Cross-platform lockstep with raw floats is a research project; use fixed-point math for sim, or constrain to one platform/compiler with fastmath off and FMA policy pinned.
2. **Unseeded/shared RNG:** any `Random` call in sim code not drawn from the deterministic, tick-synced, save-state-included sim RNG stream. One `Random.value` in a VFX script that *also* nudges gameplay = desync that reproduces once a week. Separate RNG streams: sim (deterministic, replicated seed) vs presentation (free).
3. **Iteration order:** hash map/dictionary iteration order differing across runs/platforms (pointer-keyed maps are the classic — address layout differs per run). Sim must iterate stable orders: sorted keys or stable arrays.
4. **Uninitialized memory / stale state:** a pooled object leaking state ([performance doc §4](performance-and-frame-budgets.md)) into sim; uninitialized struct fields that happen to differ.
5. **Sim reading presentation state:** animation time, `Time.deltaTime`, camera position, LOD level, or *frame rate* leaking into gameplay decisions. The 4-player desync I spent nine days on in 2016 was an ability whose cooldown UI *rounded* the cooldown, and a designer had wired the rounded display value back into the ability check — clients with different UI scales disagreed after minutes of play.
6. **Physics engine internals:** most engine physics (PhysX, Chaos, Jolt-default-config) are not cross-machine deterministic. Lockstep games write or adopt deterministic physics (fixed-point or carefully constrained: Box2D-derived, Rapier's deterministic mode, Volatile-style) — do not assume the engine's.
7. **Timer/tick drift:** float-accumulated sim time ([game-loop doc §6](game-loop-and-timing.md)).

**Detection — build this before you need it:** per-tick **state checksum** (hash of authoritative-relevant state: positions quantized to sim precision, health, RNG cursor, entity list). Lockstep peers exchange checksums every N ticks and halt-and-dump on mismatch. Server-authoritative: server spot-checks predicted-relevant state. On mismatch, dump *per-system* checksums (physics vs combat vs economy hashed separately) to bisect which system diverged, then per-entity. Without hierarchical checksums, a desync report is "it broke somewhere in 40MB of state" — with them it's "entity 1207's velocity, tick 84,112." The difference is nine days versus one afternoon; the `netcode-desync-reviewer` skill checks new features carry checksum coverage.

**Prevention:** replay-based determinism test in CI: record input trace → simulate twice (and on two platforms if cross-platform lockstep) → compare per-tick checksums. Run per-commit on sim code. Full recipe in [testing-and-determinism.md](testing-and-determinism.md) §3.

## 6. Bandwidth & tick budgets (numbers to start from)

Server tick 20–60Hz (shooters 60+, MMOs 10–20 is normal); client → server: input packets ~10–50 bytes at client tick rate; server → client budget: 20–50KB/s per client is a sane target for a mid-size game — enforced by interest management + delta compression + quantization (positions to ~1cm, rotations to 8–10 bits/component are common; **quantize before checksumming and before prediction-compare**, or quantization itself causes false mispredicts). Reliability: gameplay state goes *unreliable-sequenced* (a newer snapshot obsoletes a lost older one — resending it is harmful); reliable-ordered channels only for events that must arrive exactly once (chat, purchases, match results). Running gameplay over TCP (or reliable-everything) causes packet-loss-induced multi-hundred-ms stalls: head-of-line blocking. UDP-based with a thin reliability layer (or QUIC datagrams for web) is the floor.

## 7. Test rig (non-negotiable for any multiplayer project)

- Network condition simulation in-engine (latency/jitter/loss injection) usable by every dev locally: nobody writes working netcode against localhost-0ms.
- Standard test matrix: 0ms (logic), 60ms/0.5% (typical), 150ms/2%/30ms jitter (bad wifi), 300ms/5% (worst supported). A feature ships when it's *playable* at tier 3 and *doesn't corrupt state* at tier 4.
- Headless bot clients that can run the real client sim: 4-player desync bugs need 4 clients; humans are too expensive to be your repro harness. This is also the load-test fleet ([testing-and-determinism.md](testing-and-determinism.md) §6).
