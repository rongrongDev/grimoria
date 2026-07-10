# Guide: Build a Minimal, Architecturally Sound Game From Scratch

**Applies to:** any language/engine; reference implementation in plain C# (.NET 8+, no engine — runs with `dotnet test`/`dotnet run`). Porting notes for Unity/Unreal/Godot/custom at each step.
**Last reviewed:** 2026-07-06.
**What you get by the end:** a deterministic fixed-timestep simulation, a minimal ECS, replay recording/playback, a client-predicted + server-reconciled networked move feature, and the test suite proving all of it. Roughly a weekend of work; each part is independently useful.
**Why these pieces:** they are the load-bearing decisions that can't be retrofitted ([game-loop §1](../principles/game-loop-and-timing.md), [networking §1](../principles/networking-and-multiplayer.md), [architecture §3.5](../principles/architecture-ecs-vs-oop.md)). Everything else in a game can be added later; these can only be added first.

Directory layout to build toward:

```
MiniGame/
├── Sim/            # deterministic core: NO engine refs, NO wall clock, NO global RNG
│   ├── World.cs, Components.cs, Systems.cs, InputFrame.cs, DetRandom.cs, Checksum.cs
├── Host/           # the loop: accumulator, interpolation, input sampling
│   └── GameHost.cs
├── Net/            # prediction/reconciliation over an in-memory "network"
│   └── Prediction.cs, FakeNetwork.cs
└── Tests/          # determinism, frame-rate independence, prediction tests
```

The one architectural law all four parts enforce: **`Sim/` is a pure function of (state, inputs). It never reads time, randomness, or the outside world except through what's passed in.** Every capability below (replay, netcode, testing) is a corollary of that law.

---

## Part 1 — Deterministic simulation core

### 1.1 Input as data ([testing doc §2](../principles/testing-and-determinism.md))

```csharp
// Sim/InputFrame.cs
public readonly record struct InputFrame(sbyte MoveX, sbyte MoveY, bool Jump)
{
    public static readonly InputFrame Neutral = new(0, 0, false);
    public void WriteTo(BinaryWriter w) { w.Write(MoveX); w.Write(MoveY); w.Write(Jump); }
    public static InputFrame ReadFrom(BinaryReader r) => new(r.ReadSByte(), r.ReadSByte(), r.ReadBoolean());
}
```

`sbyte` not float sticks: quantized input is smaller on the wire and removes an analog-drift desync source. Serialization lives with the type from day one — this struct *is* your replay format and your netcode upload format.

### 1.2 Deterministic RNG — owned, seeded, serialized ([networking §5 root cause #2](../principles/networking-and-multiplayer.md))

```csharp
// Sim/DetRandom.cs — xorshift128+; any stated algorithm works, "whatever the platform provides" does not
public struct DetRandom(ulong seed)
{
    private ulong _s0 = seed == 0 ? 0x9E3779B97F4A7C15UL : seed, _s1 = 0xBF58476D1CE4E5B9UL;
    public ulong NextU64() {
        ulong x = _s0, y = _s1; _s0 = y; x ^= x << 23;
        _s1 = x ^ y ^ (x >> 17) ^ (y >> 26); return _s1 + y;
    }
    public int NextInt(int minIncl, int maxExcl) => minIncl + (int)(NextU64() % (ulong)(maxExcl - minIncl));
}
```

It's a `struct` *inside* `World`: snapshot the world, you snapshot the RNG cursor — mandatory for rollback (Part 4) and saves. Presentation randomness (VFX jitter) uses a separate, non-serialized stream.

### 1.3 Fixed-point position math — the cross-platform determinism decision

For this guide we use **integer fixed-point (Q16.16)** for sim positions/velocities. If you will only ever need same-machine determinism (single-platform replay), floats are fine and you can substitute them mentally; but fixed-point costs little here and makes the determinism tests meaningful across machines ([networking §5 root cause #1](../principles/networking-and-multiplayer.md)).

```csharp
// Sim/Fix.cs
public readonly record struct Fix(int Raw)
{
    public const int One = 1 << 16;
    public static Fix FromInt(int v) => new(v * One);
    public static Fix operator +(Fix a, Fix b) => new(a.Raw + b.Raw);
    public static Fix operator -(Fix a, Fix b) => new(a.Raw - b.Raw);
    public static Fix operator *(Fix a, Fix b) => new((int)(((long)a.Raw * b.Raw) >> 16));
    public float ToFloat() => Raw / (float)One;   // PRESENTATION ONLY
}
```

### 1.4 Minimal ECS ([architecture doc §1](../principles/architecture-ecs-vs-oop.md) — the SoA idea without a framework)

```csharp
// Sim/World.cs — struct-of-arrays; dense, index == entity id for this minimal version
public sealed class World
{
    public const int MaxEntities = 1024;
    public int EntityCount;
    public ulong Tick;                       // integer sim time — game-loop doc §6
    public DetRandom Rng;
    // Components (SoA):
    public readonly Fix[] PosX = new Fix[MaxEntities];
    public readonly Fix[] PosY = new Fix[MaxEntities];
    public readonly Fix[] VelX = new Fix[MaxEntities];
    public readonly Fix[] VelY = new Fix[MaxEntities];
    public readonly bool[] Grounded = new bool[MaxEntities];

    public World(ulong seed) { Rng = new DetRandom(seed); }
    public int Spawn(Fix x, Fix y) { int e = EntityCount++; PosX[e]=x; PosY[e]=y; return e; }

    public World Clone() {                    // cheap flat copy — this is why state is flat arrays
        var w = new World(0) { EntityCount = EntityCount, Tick = Tick, Rng = Rng };
        Array.Copy(PosX, w.PosX, EntityCount); Array.Copy(PosY, w.PosY, EntityCount);
        Array.Copy(VelX, w.VelX, EntityCount); Array.Copy(VelY, w.VelY, EntityCount);
        Array.Copy(Grounded, w.Grounded, EntityCount);
        return w;
    }
}
```

A production ECS adds sparse entity ids + generations, archetypes, and events; *don't* add them until entity churn demands it. `Clone()` being trivial is the point: it powers interpolation snapshots (Part 2), prediction history (Part 4), and rollback — [architecture §1](../principles/architecture-ecs-vs-oop.md)'s "serialization for free-ish," demonstrated.

### 1.5 Systems: plain functions, fixed order ([architecture §3.4](../principles/architecture-ecs-vs-oop.md))

```csharp
// Sim/Systems.cs
public static class Systems
{
    public static readonly Fix Gravity = new(-(Fix.One * 30));       // units/s², pre-scaled by dt below
    public static readonly Fix MoveSpeed = Fix.FromInt(6);
    public static readonly Fix JumpVel = Fix.FromInt(12);
    public static readonly Fix Dt = new(Fix.One / 50);               // 50Hz — frozen, game-loop doc §1

    // THE ENTRY POINT: entire sim advance is one call. Deterministic by construction.
    public static void Step(World w, ReadOnlySpan<InputFrame> inputsByPlayer)
    {
        ApplyInput(w, inputsByPlayer);
        Integrate(w);
        w.Tick++;
    }
    static void ApplyInput(World w, ReadOnlySpan<InputFrame> inputs) {
        for (int p = 0; p < inputs.Length && p < w.EntityCount; p++) {
            w.VelX[p] = new Fix(Math.Sign(inputs[p].MoveX) * MoveSpeed.Raw); // digital -1/0/1 movement; analog scaling comes later
            if (inputs[p].Jump && w.Grounded[p]) { w.VelY[p] = JumpVel; w.Grounded[p] = false; }
        }
    }
    static void Integrate(World w) {
        for (int e = 0; e < w.EntityCount; e++) {
            if (!w.Grounded[e]) w.VelY[e] += Gravity * Dt;
            w.PosX[e] += w.VelX[e] * Dt;
            w.PosY[e] += w.VelY[e] * Dt;
            if (w.PosY[e].Raw <= 0) { w.PosY[e] = default; w.VelY[e] = default; w.Grounded[e] = true; }
        }
    }
}
```

Note what is *absent*: no `DateTime`, no `Random`, no engine types, no floats in state, no iteration over hash containers. Every absence is a [desync root cause](../principles/networking-and-multiplayer.md) §5 kept out by construction.

### 1.6 Checksum — build the desync detector before the desync ([networking §5](../principles/networking-and-multiplayer.md))

```csharp
// Sim/Checksum.cs — FNV-1a over sim-relevant state, per system for bisection
public static class Checksum
{
    public static ulong OfWorld(World w) {
        ulong h = 14695981039346656037UL;
        void Mix(int v) { h ^= (uint)v; h *= 1099511628211UL; }
        Mix((int)w.Tick); Mix(w.EntityCount);
        for (int e = 0; e < w.EntityCount; e++) {
            Mix(w.PosX[e].Raw); Mix(w.PosY[e].Raw); Mix(w.VelX[e].Raw); Mix(w.VelY[e].Raw);
            Mix(w.Grounded[e] ? 1 : 0);
        }
        return h;
    }
}
```

---

## Part 2 — The host loop (accumulator + interpolation)

Implements [game-loop-and-timing.md](../principles/game-loop-and-timing.md) §1/§3/§4 literally:

```csharp
// Host/GameHost.cs
public sealed class GameHost
{
    const double FixedDt = 1.0 / 50.0, MaxFrameDelta = 0.25;   // clamp: spiral of death impossible
    double _accumulator; World _current = new(seed: 12345); World _previous;
    readonly List<InputFrame> _pendingInput = new();            // buffered — consumed per tick
    public int StepsLastFrame { get; private set; }             // telemetry — game-loop §3 detection

    public void Frame(double frameDelta, InputFrame sampledInput, Action<World, World, float> render)
    {
        _accumulator += Math.Min(frameDelta, MaxFrameDelta);
        StepsLastFrame = 0;
        while (_accumulator >= FixedDt) {
            _previous = _current.Clone();
            Systems.Step(_current, stackalloc InputFrame[1] { sampledInput }); // input consumed at tick rate
            _accumulator -= FixedDt; StepsLastFrame++;
        }
        float alpha = (float)(_accumulator / FixedDt);
        render(_previous ?? _current, _current, alpha);          // renderer gets (prev, curr, alpha) — never live refs
    }
}
```

**Porting notes.** Unity: `FixedUpdate` is the `while` body; keep `Sim/` an asmdef with zero UnityEngine refs and enforce it in CI. Unreal: run `Step` from a fixed-tick manager (or Chaos fixed tick), keep `Sim/` a module without engine includes for the same enforcement. Godot: `_physics_process` is the body; interpolation setting replaces the alpha lerp for transforms. Custom: this *is* your main loop; add Tracy zones around `Step` and `render` now ([custom-engine doc §3](../engines/custom-engine/README.md)).

## Part 3 — Replay & the test suite (the payoff for Part 1's discipline)

A replay is `(seed, InputFrame[])`. Recording is appending to a list; playback is calling `Systems.Step` in a loop. The tests below are the [testing doc §3/§4](../principles/testing-and-determinism.md) suite in miniature — **write them now, they are the contract every later feature must keep:**

```csharp
[Fact] public void Replay_IsDeterministic_AcrossTwoRuns() {
    var inputs = RecordedOrGenerated(5000);                      // fuzz inputs from a seeded generator
    ulong a = RunAndChecksum(seed: 42, inputs);
    ulong b = RunAndChecksum(seed: 42, inputs);
    Assert.Equal(a, b);
}
[Fact] public void Sim_IsFrameRateIndependent() {                // game-loop §2's test
    var inputs = RecordedOrGenerated(500);
    // Drive the SAME inputs through hosts rendering at 30fps and 240fps:
    ulong slow = RunHostAndChecksum(inputs, frameDelta: 1/30.0);
    ulong fast = RunHostAndChecksum(inputs, frameDelta: 1/240.0);
    Assert.Equal(slow, fast);                                    // sim outcome identical; only render cadence differed
}
[Fact] public void Hitch_SlowsTimeInsteadOfSpiraling() {         // game-loop §3's clamp test
    var host = NewHost();
    host.Frame(5.0 /* 5-second stall */, InputFrame.Neutral, NoRender);
    Assert.True(host.StepsLastFrame <= (int)(0.25 / (1/50.0)) + 1);
}
[Fact] public void Snapshot_RoundTripsThroughCloneExactly() {    // prerequisite for Part 4
    var w = RunTicks(1000); var c = w.Clone();
    Assert.Equal(Checksum.OfWorld(w), Checksum.OfWorld(c));
}
```

Run per-commit; they take milliseconds. When `Replay_IsDeterministic` fails, the offending PR *just introduced a desync source* — you found it in CI instead of in a 4-player repro at beta. That trade is the entire thesis of this guide.

## Part 4 — Client prediction + server reconciliation ([networking §3](../principles/networking-and-multiplayer.md), implemented)

In-memory network with injectable delay stands in for UDP; the algorithm is the real one:

```csharp
// Net/Prediction.cs
public sealed class PredictedClient
{
    public World Predicted;                                    // what we render
    readonly Queue<(ulong tick, InputFrame input)> _history = new();   // networking §3 ring buffer

    public void LocalTick(InputFrame input) {                  // called every sim tick
        _history.Enqueue((Predicted.Tick, input));
        Systems.Step(Predicted, stackalloc[] { input });       // apply locally IMMEDIATELY — zero perceived latency
        SendToServer(Predicted.Tick - 1, input);
    }

    public void OnServerState(World authoritative) {           // arrives RTT-late, for some past tick T
        while (_history.Count > 0 && _history.Peek().tick < authoritative.Tick)
            _history.Dequeue();                                // drop acked history
        if (Checksum.OfWorld(PredictionAt(authoritative.Tick)) == Checksum.OfWorld(authoritative))
            return;                                            // prediction held — common case, do nothing
        // MISPREDICT: rewind to server truth, REPLAY buffered inputs to now — §3's step 4, the part
        // everyone skips and then ships rubber-banding:
        Predicted = authoritative.Clone();
        foreach (var (_, input) in _history)
            Systems.Step(Predicted, stackalloc[] { input });
        // (visual smoothing of the correction happens in presentation, not here — networking §3.5)
    }
}
```

The server is just `Systems.Step` fed by each client's uploaded `InputFrame`s, broadcasting `World` snapshots (or deltas) every N ticks. Because `Sim/` is shared code, client prediction and server truth *cannot* drift by implementation — [networking §3](../principles/networking-and-multiplayer.md)'s shared-sim-code rule, structurally enforced.

**The tests that make this real** (run them with the fake network's latency set to each [§7 tier](../principles/networking-and-multiplayer.md)):

```csharp
[Fact] public void CleanNetwork_ProducesZeroCorrections()      // predicted == authoritative when nothing interferes
[Fact] public void LatentNetwork_ConvergesAfterCorrection()    // inject a server-side perturbation (another player
                                                               // pushes you); assert client state == server state
                                                               // within RTT worth of ticks, and stays converged
[Fact] public void PacketLoss_NeverCorruptsState()             // drop 20% of snapshots; invariants hold, convergence still occurs
```

## Part 5 — Where to go from here

Add, in this order, each against its doc: presentation layer reading `(prev, curr, alpha)` only ([game-loop §4](../principles/game-loop-and-timing.md)); interpolated remote entities ([networking §3](../principles/networking-and-multiplayer.md) — remotes interpolate, never predict); snapshot delta compression + quantization ([networking §6](../principles/networking-and-multiplayer.md)); save/load = serialize `World` + version header + atomic write ([save doc](../principles/save-load-and-versioning.md) §2 — the kill-test applies from your first save file); pooling and budgets when the profiler says so ([performance doc](../principles/performance-and-frame-budgets.md) — not before). When entity churn or query complexity outgrows the dense arrays, graduate to a real ECS (EnTT/Flecs/Unity Entities/Bevy) — your `Sim/` law and your test suite transfer unchanged; that's the proof the architecture was sound.
