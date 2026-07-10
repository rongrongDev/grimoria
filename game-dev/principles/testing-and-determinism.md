# Testing Games: Determinism, Automation, and What Only Humans Catch

**Applies to:** engine-agnostic; Unity Test Framework / Unreal Automation specifics in the engine READMEs.
**Last reviewed:** 2026-07-06.
**Related:** [game-loop-and-timing.md](game-loop-and-timing.md) (a testable loop is a decoupled loop), [networking-and-multiplayer.md](networking-and-multiplayer.md) §5 (desync detection is determinism testing), [performance-and-frame-budgets.md](performance-and-frame-budgets.md) §2 (perf tests). Skills: `netcode-desync-reviewer`; agents: `save-state-auditor`.

Games are harder to test than CRUD software for one honest reason — the spec is "does it feel right," which no assert can check — and easier for one under-exploited reason: a deterministic simulation is a pure function from (initial state, input trace) to final state, which makes whole categories of testing *cheaper* than in server software. Teams that ship reliable games exploit the second fact hard and respect the first fact's boundary.

---

## 1. The game-test pyramid (what to automate, in what proportion)

1. **Pure-logic unit tests** (fast, thousands): damage formulas, inventory rules, state machines, save migrations, path smoothing — anything expressible without an engine boot. The architectural prerequisite is sim/view separation ([architecture doc §3.5](architecture-ecs-vs-oop.md)); if the damage formula needs a scene to run, that's an architecture finding, not a testing problem.
2. **Simulation tests** (seconds each, hundreds): boot headless sim (no rendering), drive with scripted input traces, assert on state. This tier is where game testing lives or dies — it covers "player walks into trigger, quest advances, enemy aggros" without a GPU or a human.
3. **Determinism/replay tests** (§3) and **save-compat corpus** ([save doc §3](save-load-and-versioning.md)) — cross-cutting, CI-blocking.
4. **Full-engine integration tests** (minutes, tens): real scenes, real loading, screenshot/state assertions. Expensive and flakier; reserve for load paths, scene transitions, platform integrations.
5. **Soak/load tests** (§6) nightly.
6. **Humans** (§7) for everything with the word "feel" in it.

The classic team failure is inverting this: 40 brittle full-engine UI tests, zero sim tests, and a QA team re-finding the same regressions each milestone. If you can only build one tier, build tier 2.

## 2. Making a game testable (the enabling architecture)

- **Headless boot path:** the sim must run without renderer/audio/input devices. This is also the netcode bot-client and the server build — one investment, three payoffs ([networking doc §7](networking-and-multiplayer.md)).
- **Scripted input as a first-class citizen:** input enters the sim as data (`InputFrame` structs per tick), so a test, a replay, a network peer, and a human are indistinguishable to the sim. This is the same abstraction prediction/rollback needs — build it once, week one ([build-from-scratch guide](../guides/build-from-scratch.md) implements it).
- **Injected time and RNG:** tests control tick advancement and seeds. Any `sleep`, wall clock, or global RNG in sim code is both a test blocker and a desync source — one grep finds both.
- **State assertions over pixel assertions:** assert `boss.hp == 0`, not "screen shows victory." Screenshot comparison has its place (§5) but as a default it converts every art tweak into a red build.

## 3. Determinism testing (replay/rollback/lockstep games — and honestly, everyone)

The contract to enforce: same build + same seed + same input trace → **bit-identical** state checksums every tick. The test recipe:

1. Record input traces from real play sessions (make recording always-on in dev builds; the trace is also your best bug-repro format — "attach the replay" beats a repro-steps paragraph every time).
2. CI job: run each trace **twice in one process** (catches uninitialized memory/statics), **across process restarts** (catches init-order and pointer-order dependence, e.g. hash-map iteration keyed on addresses), **across core counts** (catches parallel-reduction ordering, [concurrency doc §6](concurrency-and-race-conditions.md)), and — if cross-platform determinism is claimed — **across platforms** (catches FP divergence, [networking doc §5](networking-and-multiplayer.md)).
3. Compare per-tick hierarchical checksums (per-system, then per-entity). On divergence, report first divergent tick + system + entity — this precision is the difference between a one-afternoon fix and a nine-day hunt.
4. Gate merges on it for any PR touching sim code. Non-negotiable for rollback/lockstep titles; strongly recommended even for single-player, because determinism failures are always *also* real bugs (uninitialized state, hidden global deps) wearing camouflage.

**Failure mode of the test itself:** traces go stale as content changes (the recorded level no longer exists). Fix: traces pinned to test-only scenes for the permanent suite + a rolling window of recent real-content traces; a trace that can't load is deleted loudly, not skipped silently.

## 4. Frame-rate independence & timing tests

From [game-loop-and-timing.md](game-loop-and-timing.md) §2, automated: run the same input trace with render throttled to 30fps, 60fps, and uncapped; assert identical sim outcomes (trivial if sim is fixed-timestep and decoupled — the test exists to catch the PR that breaks the decoupling). Add a clamp test: inject a synthetic 500ms hitch, assert the sim slows rather than spiraling ([game-loop doc §3](game-loop-and-timing.md)).

## 5. Rendering & audio regression (the honest scope)

Screenshot testing works when scoped to: fixed camera, fixed seed, deterministic content, tolerance-based comparison (per-platform reference images; GPUs differ in LSBs), and a human-triaged diff queue rather than auto-fail. Use for: shader/pipeline refactors, lighting bakes, UI layouts across resolutions/locales (German strings overflow every box — automate that specifically). Don't use for: anything with simulation variance in frame. Audio: assert *events* (sound X triggered with params Y) rather than comparing waveforms.

## 6. Load & soak (live-service especially)

- **Soak:** bot-driven play for 8–24h; watch memory (leak/fragmentation trend), hitch rate, handle counts, save-file growth. Most "crashes after 4 hours" bugs (pool exhaustion, float-accumulation, drift) are *only* findable here — no human tests hour nine.
- **Server load:** headless bot clients (§2) at target CCU × 1.5, with realistic behavior mix (not everyone pathfinding at once — record real session behavior distributions and replay them); measure tick-time p99, bandwidth per client, DB/backend saturation. Run before every major content drop; content changes shift server cost in ways backend teams don't see coming (a new ability that spawns 50 projectiles is a server CPU feature).
- **Chaos-lite for netcode:** the packet-loss/latency matrix from [networking doc §7](networking-and-multiplayer.md) scripted as CI tiers.

## 7. What automation cannot catch — budget humans deliberately

Feel (input latency perception, camera comfort, difficulty curve, "juice"), fun, confusion (players not finding the door — watch playtests, don't survey them; players misreport their own confusion), motion sickness, and emergent multiplayer social dynamics. Playtest methodology in one paragraph: fresh players every time (staff are contaminated after one session), record screen + face + inputs, count *behaviors* (deaths, quits, wrong turns, feature discovery time) not just opinions, and never brief the player on what's being tested. Automation's job is to make every hour of this expensive human attention land on feel — not on "the quest broke," which tier 2 should have caught for cents.

## 8. CI shape for a game team (reference layout)

Per-commit: logic units + affected sim tests + lint (allocation/format gates) — <10 min. Per-merge to main: full sim suite + determinism traces + save corpus + headless build all platforms — <45 min. Nightly: full-engine integration, perf flythroughs with p99 gates, screenshot suite, 2h mini-soak, console builds on real devkits. Weekly: full soak, load test, `allocation-hotspot-scanner` sweep. **Build breakage is a stop-the-line event** — a game team with a red main for a week loses the content team's trust in the pipeline permanently, and they start branching around it, and then you are unshippable. The build cop rotation is cheaper than that.
