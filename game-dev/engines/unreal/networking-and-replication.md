# Unreal: Networking & Replication

**Applies to:** UE 5.4–5.6 (classic replication path; Iris notes marked — Iris matures per version, verify current status before adopting).
**Last reviewed:** 2026-07-06.
**Principles this implements:** [../../principles/networking-and-multiplayer.md](../../principles/networking-and-multiplayer.md) (models, prediction theory, desync, bandwidth) and [../../principles/security-and-anti-cheat.md](../../principles/security-and-anti-cheat.md) §2 (authority). This doc: how UE's machinery maps onto that theory, and where teams get hurt. Skill: `netcode-desync-reviewer`.

---

## 1. What UE gives you (and what model you're actually in)

UE networking is **server-authoritative state replication with client prediction for movement** ([principles §1/§2](../../principles/networking-and-multiplayer.md)) — the framework assumes it, GameMode-server-only enforces it, and you should not fight it (lockstep/rollback in UE means bypassing most of this machinery; that's a specialist project). The pieces: replicated actors (server-spawned, replicated to relevant clients), replicated properties (`UPROPERTY(Replicated/ReplicatedUsing)` + `GetLifetimeReplicatedProps`), RPCs (`Server`/`Client`/`NetMulticast`), `CharacterMovementComponent`'s built-in predict/reconcile, and relevancy/priority as the [interest-management](../../principles/networking-and-multiplayer.md) §2 knobs.

**The state-vs-RPC classification rule** (same as [Unity netcode doc §2](../unity/netcode.md), UE dialect): replicated properties are state — late joiners get them; RPCs are transient events — late joiners don't. `NetMulticast` RPCs carrying persistent facts ("door opened") is the same month-12 rewrite. Reliable RPC spam also risks queue overflow disconnects under loss — gameplay state goes in properties with `ReplicatedUsing` callbacks, full stop.

## 2. Authority discipline (where UE makes it easy to do right — or silently wrong)

- Every mutation site: `HasAuthority()` guard or server-only path by construction. Client-side `if (!HasAuthority()) return;` *presentation* branches are fine; client code mutating replicated state locally "so it feels responsive" without the prediction machinery = permanent client/server drift that replication papers over until it doesn't (symptom: state snaps back seconds later under loss).
- **`Server` RPC validation:** the `WithValidation`/`_Validate` function is your [security §2](../../principles/security-and-anti-cheat.md) intent-validation hook — `return true;` boilerplate is an unvalidated-client-state finding; the `netcode-desync-reviewer` skill checks every `_Validate` body for actual bounds checks.
- **Character movement is client-authoritative-ish by default in feel but server-checked**: CMC sends client moves, server simulates and corrects. Its tolerance knobs (position error thresholds, `ServerMove` trust settings) are the speed-hack surface — defaults are sane, projects loosen them to "fix" rubber-banding and ship teleport exploits. Fix rubber-banding at its cause ([principles §3](../../principles/networking-and-multiplayer.md) — usually sim divergence between client/server movement-affecting state), not by widening trust.
- **Custom movement (abilities, dashes, vehicles):** extending CMC's saved-move system (`FSavedMove` flags → `UpdateFromCompressedFlags`) keeps you inside its predict/replay loop — the *correct* path. Implementing a dash as "client RPC → server teleports me" abandons prediction (input lag) *and* authority (unvalidated teleport) in one move; it's the most common UE netcode antipattern I've reviewed. GAS (Gameplay Ability System) exists largely to solve predicted-abilities properly — steep learning curve, but for ability-heavy netplay it beats reinventing its prediction keys/rollback bookkeeping.

## 3. Replication performance (server frame = the product at scale)

The classic path's cost model: per net-update, the server considers each replicated actor per connection — actor count × connection count, throttled by `NetUpdateFrequency`, relevancy, and priority. What actually moves the needle, in deployment order:

1. **Turn down what doesn't need it:** `NetUpdateFrequency` per actor class (a pickup doesn't need 100Hz), dormancy (`SetNetDormancy` — dormant actors cost ~nothing until woken; the single biggest cheap win on world-object-heavy games), relevancy distance tuning.
2. **Replication Graph** (large player/actor counts): replaces per-actor-per-connection consideration with shared spatial/team node structures — the difference between 100-player servers working or not in the classic path. Adopt when `stat net`/Network Insights shows replication consideration dominating server frame.
3. **Iris** (the new replication system, maturing across 5.x): push-model, better scaling; migration is API-visible (verify per-version readiness and plugin compatibility before betting a project — mid-2026 status: adopted by flagship titles, watch for subsystem gaps).
4. **Bandwidth shaping:** quantization (`FVector_NetQuantize` variants — and remember [quantize-before-compare](../../principles/networking-and-multiplayer.md) §6 for any prediction-adjacent state), conditional replication (`COND_OwnerOnly` etc. — also the [hidden-information](../../principles/security-and-anti-cheat.md) §3 tool: `COND_SkipOwner`/custom relevancy withholds wallhack-feeding data), and struct delta via `FFastArraySerializer` for inventories/lists (per-item dirtiness instead of whole-array resend — mandatory for any replicated container beyond trivial size).

**Measurement:** `stat net` (server), Network Insights trace channel, per-connection bandwidth telemetry against the [§6 budgets](../../principles/networking-and-multiplayer.md). Load-test with headless clients (UE supports `-nullrhi` clients driven by scripted input — the [testing doc §6](../../principles/testing-and-determinism.md) bot fleet) before beta, because replication cost is superlinear in ways that only appear past ~30 real connections.

## 4. Failure → detection → fix → prevention

| Failure | Detection | Fix | Prevention |
|---|---|---|---|
| Door-opened-via-RPC missed by late joiners | join-in-progress test pass | state → replicated property | JIP test per feature ([testing doc §2](../../principles/testing-and-determinism.md)); state/event classification in design docs |
| `_Validate` boilerplate `return true` | grep + skill review | real bounds checks (speed, rate, LOS, resource conservation) | `netcode-desync-reviewer` on every netcode PR |
| Rubber-banding after ability ships | prediction-miss telemetry spikes ([principles §3](../../principles/networking-and-multiplayer.md)) | move ability into saved-move/GAS prediction; find client/server sim divergence | shared-sim-code rule; latency-matrix CI tiers |
| Server frame melts at 60 players | `stat net`: consideration time; Network Insights | dormancy sweep → RepGraph/Iris | load test with bot fleet each milestone |
| Inventory resends whole array per item change | Network Insights per-property bytes | `FFastArraySerializer` | replicated-container review rule |
| Cheater teleports within loosened CMC tolerances | movement outlier telemetry ([security §2](../../principles/security-and-anti-cheat.md)) | restore thresholds; fix divergence root cause | never widen trust to fix feel; review gate on CMC config diffs |
| One-frame-late or missing `OnRep` UI | (know the semantics) `OnRep` fires on change *receipt*, order across properties not guaranteed; shadow-state comparisons inside | derive UI from state idempotently, not from OnRep call order | OnRep handlers must be re-entrant/idempotent — review rule |
