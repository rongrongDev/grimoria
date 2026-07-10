# Game Loop & Timing

**Applies to:** engine-agnostic; examples reference Unity 6.x, Unreal 5.4–5.6, Godot 4.x.
**Last reviewed:** 2026-07-06.
**Related:** [testing-and-determinism.md](testing-and-determinism.md), [networking-and-multiplayer.md](networking-and-multiplayer.md), [../guides/build-from-scratch.md](../guides/build-from-scratch.md) (a working implementation of everything here).

The game loop is the one piece of architecture you cannot refactor later without touching everything. Get the timestep decision wrong and you will discover it two years in, as a physics bug that only reproduces on a 144Hz monitor, or a desync that only appears when one client hitches. Decide it in week one.

---

## 1. The core decision: fixed vs. variable timestep

**Decision tree:**

- Simulation affects gameplay outcomes (physics, combat, economy) **and** any of: networking, replays, competitive play → **fixed timestep simulation, decoupled render, no exceptions.**
- Single-player, no replays, purely kinematic movement, small team → variable timestep is *acceptable*, but you are betting the project on never needing determinism. I have lost that bet twice. Both times the retrofit cost more than a month.
- Pure UI/visual layers (tweens, particles, camera smoothing) → variable timestep always; these should consume render delta time and must never feed back into simulation state.

The canonical loop (Gaffer-style accumulator — memorize this shape):

```
accumulator += min(frameDelta, MAX_FRAME_DELTA)   // clamp! see §3
while (accumulator >= FIXED_DT):
    previousState = currentState
    simulate(currentState, FIXED_DT)              // deterministic, no rendering reads
    accumulator -= FIXED_DT
alpha = accumulator / FIXED_DT
render(lerp(previousState, currentState, alpha))  // interpolation, see §4
```

Pick `FIXED_DT` once: **50Hz (20ms)** or **60Hz (16.67ms)** for action games; **30Hz** is fine for slower genres and halves your server cost; fighting games and rollback titles use 60Hz because input latency is the product. Changing tick rate after content is tuned re-tunes every jump arc and animation sync in the game — treat it as frozen after vertical slice.

## 2. Frame-rate independence — failure → detection → fix → prevention

**Failure mode:** Gameplay code multiplies by `deltaTime` inconsistently — or worse, doesn't. Classic bugs: `velocity += accel` (no dt) makes the game character jump higher at 144fps; `pos = lerp(pos, target, 0.1)` (per-frame exponential smoothing without dt) makes camera feel different on every machine; damage-over-time ticking per frame melts bosses on high-end PCs. A speedrunning community will find these in a week and your leaderboard is now segregated by monitor refresh rate.

**Detection:** Run the game at forced 30fps and forced uncapped (300+fps), same input script, diff the outcomes. Any gameplay-visible difference is a bug. This is a 30-minute automated test (see [testing-and-determinism.md](testing-and-determinism.md) §4) and it should be in CI from the first playable.

**Fix:** Move the offending logic into the fixed-timestep update where dt is constant and the multiply-by-dt question disappears for integration; for code that must stay in variable update, the frame-rate-independent lerp is `1 - pow(1 - k, dt * referenceHz)` — put it in a shared math library so nobody hand-rolls it.

**Prevention:** Lint/review rule: any `+=` on positional/velocity/timer state in a variable-rate update is a review flag. The `gc-allocation-auditor` skill's cousin check — grep for `Time.deltaTime` absent from movement code in `Update()` (Unity) or `Tick(float DeltaSeconds)` bodies ignoring the parameter (Unreal).

## 3. The spiral of death — failure → detection → fix → prevention

**Failure mode:** Simulation of one tick takes longer than one tick of real time. The accumulator grows, so next frame you run *more* simulation steps, which takes longer, which grows the accumulator. The game freezes at 100% CPU, permanently. I've seen this triggered by a single spike — a shader compile hitch on first encounter of an effect — from which the loop never recovered.

**Detection:** Log/telemetry counter: simulation steps executed per render frame. Sustained value above `renderHz / tickHz + 1` means you're in the spiral's onramp. Any hitch (alt-tab, load, GC pause) will show a burst; bursts are fine, *sustained* elevation is not.

**Fix (mandatory, not optional):** Clamp the accumulator input: `min(frameDelta, MAX_FRAME_DELTA)` with `MAX_FRAME_DELTA` = 3–5 fixed ticks (100–250ms). Beyond the clamp, the game slows down instead of freezing — time dilation is the correct degradation. For networked games the client must instead *fast-forward at reduced fidelity* or resync from the server; you cannot dilate time on one client (see [networking-and-multiplayer.md](networking-and-multiplayer.md) §4).

**Prevention:** Frame budget for simulation must be well under the tick period at worst-case entity counts — budget 50% of tick period, not 90% (see [performance-and-frame-budgets.md](performance-and-frame-budgets.md) §2). Soak test with 2× design-max entities and verify no spiral.

## 4. Render interpolation and the stutter nobody can name

**Failure mode:** Fixed 50Hz sim rendered raw at 60Hz produces a beat pattern — most frames show a new sim state, some show a repeat. Players report it as "feels stuttery but the fps counter says 60." QA cannot reproduce it "reliably" because it's always there and they've habituated.

**Detection:** Plot per-frame *rendered simulation age* (time between the sim state's timestamp and the frame's presentation). Raw rendering of a mismatched tick rate shows a sawtooth. Also: film the screen at 240fps with a phone and step through — cheap and brutally revealing, this is how a player will notice your problem before your tooling does.

**Fix:** Interpolate between previous and current sim state with the accumulator alpha (code in §1). Costs one extra state copy per tick and one frame... no — one *tick* of added latency (≤20ms at 50Hz). For latency-critical titles (fighting), extrapolate instead and accept occasional mispredictions, or run sim at render rate.

**Prevention:** Make interpolation part of the render contract from day one: renderable state is `(previous, current, alpha)`, never a raw reference to live sim state. This also enforces the sim/render separation that determinism needs — the renderer physically cannot mutate sim state it only holds interpolated copies of.

## 5. Physics tick vs. render tick decoupling in the big engines

- **Unity:** `FixedUpdate` runs on the accumulator pattern already (default 50Hz, `Time.fixedDeltaTime`). The classic bug: reading input in `FixedUpdate` — `Input.GetKeyDown` is *per render frame*, so at 30fps rendering / 50Hz physics some `FixedUpdate` calls see the same "down" twice and at 144fps some presses are consumed by frames with no `FixedUpdate` at all. Buffer input in `Update`, consume in `FixedUpdate`. Second classic: moving physics bodies from `Update` via `transform.position` instead of `Rigidbody.MovePosition` in `FixedUpdate` — teleports the body through walls and breaks interpolation. Set `Rigidbody.interpolation = Interpolate` on anything the camera watches.
- **Unreal:** Default is *variable-rate* physics ticking with substepping opt-in. For determinism-adjacent work enable fixed tick (`p.Chaos.Solver` fixed dt settings; in 5.x Chaos supports fixed-tick + async physics). Gameplay code in `Tick()` is variable-rate — same input-buffering discipline applies when you push work to the physics tick. Blueprint `Event Tick` at variable rate driving gameplay math is the most common frame-rate-dependence source in UE projects I've audited.
- **Godot:** `_physics_process(delta)` (fixed, default 60Hz) vs `_process(delta)` (variable). Same rules, same input-buffering trap. Godot 4.x has built-in physics interpolation (3D from 4.3, project setting) — turn it on rather than hand-rolling.

## 6. Timer and clock hygiene

- **One clock owns simulation time.** Sim time is `tickCount * FIXED_DT` — an integer tick count, not an accumulated float. Accumulating `float simTime += dt` drifts (float precision) and desyncs replays after ~4 hours. Store ticks as `uint64`, derive seconds for display only.
- **Never read wall clock (`DateTime.Now`, `FPlatformTime`, `Time.realtimeSinceStartup`) in simulation code.** Wall clock is for telemetry and daily-reward logic (which belongs on the server anyway — [security-and-anti-cheat.md](security-and-anti-cheat.md) §3).
- Cooldowns/durations in sim: store as tick counts (`expiresAtTick`), compare integers. Float-seconds comparisons (`>= 0.0f`) accumulate epsilon bugs that differ across platforms — a real desync class (see [networking-and-multiplayer.md](networking-and-multiplayer.md) §5).
- Pause: stop advancing tick count; don't set `timeScale = 0` and hope — audit everything that keeps running (audio, UI tweens should; anything reading sim state mid-pause must tolerate a frozen sim).

## 7. Checklist (use directly in review)

- [ ] Fixed-dt simulation exists and gameplay outcomes live entirely inside it
- [ ] Accumulator input clamped (spiral of death impossible)
- [ ] Render interpolates `(prev, curr, alpha)`; renderer has no mutable sim access
- [ ] Input buffered in variable update, consumed in fixed update
- [ ] Sim time is an integer tick counter; no wall clock in sim
- [ ] 30fps-vs-uncapped same-input diff test exists in CI
- [ ] Sim steps-per-frame telemetry counter exists
