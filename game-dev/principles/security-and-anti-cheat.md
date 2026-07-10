# Security & Anti-Cheat Fundamentals

**Applies to:** engine-agnostic; defensive design only — this doc is about protecting your game and players.
**Last reviewed:** 2026-07-06.
**Related:** [networking-and-multiplayer.md](networking-and-multiplayer.md) (authority model is 80% of anti-cheat), [save-load-and-versioning.md](save-load-and-versioning.md) (tampering), skill: `netcode-desync-reviewer` (its unvalidated-client-state checks are the security half of desync review).

The one-sentence version of two decades of anti-cheat: **the client is in the attacker's hands, so the client's claims are testimony, not evidence.** Everything the client sends — inputs, positions, timestamps, purchase receipts, its own memory — can be fabricated by a motivated 15-year-old with Cheat Engine, and your economics guarantee motivated 15-year-olds. Anti-cheat is not a product you buy at the end; it's an authority architecture you choose at the start.

---

## 1. Threat model first (10 minutes that scope everything)

Rank what actually matters for *your* game: competitive integrity (aimbots/wallhacks in a ranked shooter), economy integrity (duping/botting where items have real-money value), progression integrity (leaderboards, achievements), and monetization integrity (entitlement bypass). A single-player game's "anti-cheat" budget is nearly zero (players cheating themselves is fine — except leaderboards, see §4) — over-engineering there is cost without benefit. A game with tradeable items is a bank and should be engineered like one.

## 2. Server-authoritative validation — failure → detection → fix → prevention

**Failure mode:** server accepts client-reported *outcomes* instead of client *inputs*. The taxonomy of what I've seen shipped-then-exploited: client sends its own position (→ teleport hacks), client reports "I hit player X for 40" (→ kill-everyone-instantly), client reports currency/XP earned (→ instant max level), client-supplied timestamps for lag compensation (→ shooting into the past, [networking doc §4](networking-and-multiplayer.md)), client-initiated inventory grants ("open chest" handled client-side, → duping).

**Detection:** audit every client→server message with one question: *does the handler change state based on a claim the server could have computed itself?* That's the finding. On the live side: statistical outlier telemetry — headshot rate, currency-per-hour, movement speed histograms per player. Cheaters are statistical outliers before they're reports.

**Fix:** clients send **intents** (input, "use item slot 3", "buy listing 88x") — the server simulates and decides outcomes. Where full simulation is too expensive, validate invariants: movement speed ≤ max × tolerance, fire rate ≤ weapon max, line-of-sight for hits, resource conservation on every transaction (nothing created or destroyed except by rule).
- Tolerance discipline: validation bounds must account for legitimate edge cases (lag spikes, knockback, teleporter abilities) or you'll punish innocents — flag-and-review beats auto-ban for everything except impossible-by-physics violations.

**Prevention:** the message-handler audit as a recurring review gate (it's in the `netcode-desync-reviewer` skill because unvalidated state and desync share a root: server/client disagreement about who owns truth). New gameplay features specify their authority split *in the design doc*: what's predicted, what's validated, what's server-only.

## 3. What the client can never be trusted with (reference list)

Client-side-only = decoration. Never client-authoritative: currency/inventory mutations, match results and scores, item/loot rolls (RNG for rewards rolls on the server; a client-rolled legendary is a guaranteed legendary), entitlements/receipt validation (validate with platform store APIs server-side), rate limits, daily-reset timers (client clock is a lie; [game-loop doc §6](game-loop-and-timing.md)), and *hidden information* — the subtle one: **wallhacks are an information-architecture bug, not a memory-hacking problem.** If the server replicates enemy positions behind walls, the data is in client RAM and *will* be read. Interest management ([networking doc §2](networking-and-multiplayer.md)) that withholds non-visible entities is the only real fix; everything else is obfuscation with a half-life.

## 4. Save-data & local-data tampering

**Failure mode:** locally-stored progression edited (JSON saves opened in Notepad, binary saves diffed between two known states — the standard attack, no skill required). Matters when saves feed leaderboards, multiplayer strength, or entitlements; doesn't matter much in pure single-player (let them; it's their save — spend the effort on §2 instead).

**Detection:** structural validation on load (§5 below is the stronger form); server-side plausibility checks when the save's consequences go online (character with endgame gear at 2 hours played).
**Fix/design:** anything with online consequences lives server-side, full stop — client saves become a cache. For local-but-matters (offline progression later synced): HMAC the save with a per-user key delivered from the server (offline-only keys embedded in the binary are extractable — this raises the bar, it isn't a wall; know which you're building), version the HMAC scheme, and validate on sync with the same flag-not-ban posture.
**Prevention:** the [save doc](save-load-and-versioning.md) checklist plus: never store entitlement flags client-side alone; treat "load save" as untrusted input parsing — a fuzzer-shaped attacker owns that file, so length-check and bounds-check like it's network data (it is).

## 5. Untrusted input parsing (packets, saves, mods, user content)

**Failure mode:** the deserializer as attack surface — malformed packet/save/replay/mod file causes OOB read/write in native code, or resource exhaustion (a 4GB-decompressed zip bomb of a save, a million-entity replay). This is classic security engineering that game teams skip because "it's just a save file."
**Detection:** fuzz the parsers (libFuzzer/AFL on the deserialization entry points — they're pure functions, fuzzing is cheap); crash telemetry clustering on parse code.
**Fix:** length-prefix validation, allocation caps derived from file size, depth/count limits, reject-don't-repair on structural violation.
**Prevention:** one shared "untrusted bytes → validated structs" layer for all external data; no gameplay code touches raw external bytes. User-generated content (mods, level sharing) additionally needs: no native code execution, scripting sandboxed (no filesystem/network from mod scripts), and server-side scanning if you host distribution.

## 6. Matchmaking, lobbies, and social abuse vectors

Underrated surface because it's "not gameplay": lobby-name/chat injection (sanitize player-controlled strings rendered by *other* clients — rich-text markup in player names has XSS'd more than one in-game browser and crashed clients via layout bombs), invite/join spam (rate-limit per identity), match-result forgery in P2P (both clients report, disagreements flagged — or results server-attested), boosting/win-trading (queue-time and opponent-graph analytics), and denial-of-service via report systems (auto-action on report volume = weaponized moderation; require evidence signals). Design rule: any string one player types and another player's client renders is untrusted input crossing a trust boundary.

## 7. Commercial anti-cheat (kernel drivers, attestation) — buy/build judgment

Client-side anti-cheat (EAC, BattlEye, Vanguard-class) detects *tools* (injectors, ESP overlays, aimbot signatures) and raises attacker cost; it does not remove the need for §2 — a server that trusts the client is exploitable with zero client tampering (packet-level bots don't touch game memory). Decision: competitive PvP shooter at scale → license one (building kernel-level AC in-house is a specialist multi-year commitment and an incident-response treadmill); co-op/PvE → server validation + telemetry is usually enough, and kernel AC's install friction costs real players. Never let its presence relax server validation — that's the actual failure mode of teams that "have anti-cheat."

## 8. Checklist

- [ ] Threat model written; effort matches what's actually at stake
- [ ] Every client→server handler audited: intents in, outcomes computed server-side
- [ ] Reward/loot RNG rolls server-side; economy transactions conserve resources
- [ ] Hidden info not replicated to clients that shouldn't render it
- [ ] Lag-comp rewind bounded and fed by server-tracked timing only
- [ ] Saves/packets/mods parsed through one hardened, fuzzed layer
- [ ] Player-authored strings sanitized before any client renders them
- [ ] Outlier telemetry (speed, rates, currency/hour) with flag-and-review pipeline
- [ ] Ban/action policy favors review over auto-punish for anything statistical
