# Performance: Instruments Workflow, SwiftUI Costs, and Main-Thread Hangs

> **Applies to:** Swift 6.2 · iOS 17+ · Xcode 26 / Instruments 26 · **Last reviewed:** 2026-07-06
> **Companions:** [memory-management.md](memory-management.md) (Allocations detail) · [state-and-architecture.md](state-and-architecture.md) (body-evaluation causes)

## The workflow (before any tool)

Rules that save more time than any instrument:

1. **Profile Release builds on real hardware — the oldest device you support.** Debug builds disable optimization and exaggerate Swift overhead 5–20×; the simulator has your Mac's CPU and no thermal budget. Every "SwiftUI is slow" report I've triaged that came from a debug-simulator run was noise.
2. **Reproduce → measure → hypothesize → change ONE thing → re-measure.** Two changes per iteration means you don't know which one worked, and one of them was probably a superstition you'll now cargo-cult for years.
3. **Field data beats lab data.** Wire up **MetricKit** (`MXMetricManager`) on day one: hang rate, launch time, memory, disk writes, per-signpost intervals, delivered daily from real users. Xcode Organizer shows aggregated hang/launch/battery metrics with no code at all. Lab Instruments answers *why*; MetricKit tells you *whether and where it matters*.

## Instrument selection table

| Symptom | Instrument | What to look at |
|---|---|---|
| CPU-bound slowness, spinners | **Time Profiler** | Heaviest stack trace; *invert* the call tree and hide system libraries to find your frames; separate main thread from the rest |
| UI freezes, slow taps | **Hangs** | Flags main-thread unresponsiveness ≥250 ms (micro-hang) and ≥500 ms (hang); each hang carries its blocking stack |
| Memory growth | **Allocations** (+ generation marks) | See the full workflow in [memory-management.md](memory-management.md) |
| Choppy scroll/animation | **Animation Hitches** template | Hitch ratio, which commit phase blew the frame budget |
| SwiftUI-specific churn | **SwiftUI template** | View body evaluation counts and durations per view type |
| "It's slow but only in this flow" | **os_signpost + Points of Interest** | Bracket your own phases: `let sp = OSSignposter(); sp.withIntervalSignpost("sync") { … }` — your app's semantics on the timeline next to system data |
| Launch time | **App Launch template** | Time to first frame; dyld vs your `main` vs first body |

---

## Failure catalog (failure → detection → fix → prevention)

### 1. Main-thread hangs (the watchdog and the 250 ms line)

**Failure.** Synchronous work on the main thread: JSON decoding a 5 MB payload, Core Data fetches with faults firing in `cellForRow`-equivalents, image decoding at full resolution for thumbnails, `@MainActor`-isolated "service" code doing CPU work ([concurrency.md](concurrency.md) §3b), synchronous I/O (`Data(contentsOf:)` — the classic). Above ~250 ms users perceive it; above several seconds on launch, **the watchdog kills the app** — crash reports with exception code `0x8badf00d` ("ate bad food"), which many teams misfile as a crash bug instead of a performance bug.

**Detection.** Hangs instrument in the lab; **MetricKit `MXHangDiagnostic`** + Xcode Organizer hang rate in the field; `0x8badf00d` termination reports. On-device dev setting: Settings → Developer → Hang Detection shows live overlays.

**Fix.** Move the work: `nonisolated`/`@concurrent` functions or an actor for CPU work; `UIImage.prepareThumbnail(of:)`/downsampling via ImageIO for images (decode at *target* size — decoding a 12 MP image for a 60 pt cell is the single most common scroll-hitch cause I've profiled); background-context Core Data fetches passing value snapshots to main. Never `Data(contentsOf:)` a URL that isn't a bundled resource.

**Prevention.** CI perf test with `XCTApplicationLaunchMetric` and `XCTOSSignpostMetric` on the top flows; MetricKit hang-rate dashboard with an alert threshold (regressions show up in a day, not in reviews).

### 2. SwiftUI recomputation storms

**Failure.** Body evaluations vastly out of proportion to visible change. Causes ranked by how often I've actually found them: (1) `ObservableObject` god-objects invalidating every subscriber ([state-and-architecture.md](state-and-architecture.md) §3); (2) unstable inputs — closures/computed objects recreated per parent body, defeating SwiftUI's equality short-circuiting; (3) heavy *work inside body* (formatting, sorting, filtering full arrays) — body must be cheap because the framework assumes it can call it often; (4) identity churn recreating subtrees ([state-and-architecture.md](state-and-architecture.md) §2).

**Detection.** Instruments SwiftUI template (evaluation counts per type); `Self._printChanges()` printed in the body of the suspect view names the property that triggered each evaluation.

**Fix.** Migrate to `@Observable` (per-property tracking); hoist computation out of body into the model, computed once per data change instead of once per render; pass leaf views plain values (a `String`, not the VM) so equatable diffing prunes them; for genuinely expensive mid-tree views, conform to `Equatable` + `.equatable()` to let SwiftUI skip them.

**A note on `AnyView`:** it's not the demon folklore says — it erases the type, which impairs diffing and *can* force rebuilds in hot lists, but the measured cost in most screens is negligible. Remove it from `ForEach` cells and hot paths; don't contort an entire architecture to avoid it in a settings screen. Measure (SwiftUI template) before refactoring.

**Prevention.** Per-release Instruments pass on the 3 heaviest screens with counts recorded in the PR; rule that body contains no `.sorted`/`.filter`/formatter creation (formatters are also expensive to *init* — cache them statically).

### 3. Scroll hitches from eager and oversized content

**Failure.** `VStack` inside a `ScrollView` building 2,000 cells eagerly; full-res images in cells; shadows/blur/`drawingGroup` misuse causing offscreen render passes. Frame budget is 8.3 ms at 120 Hz — one 12 ms commit is a visible hitch.

**Detection.** Animation Hitches template: shows *which* frames missed and in which phase (layout vs render). Long "commit" phases point at layout/body cost; render-phase hitches point at offscreen passes (shadows without `shadowPath`-equivalents, `.blur`, masks).

**Fix.** `LazyVStack`/`List` for anything unbounded; downsample images to display size *off-main* before setting them; flatten effects on scrolling content (pre-render shadows into images, avoid stacked `.blur`). `drawingGroup()` only for static complex vector art — it moves work to Metal but adds a texture round-trip; on scrolling text it makes things worse.

**Prevention.** Design-review rule for any new scrolling surface: lazy container + sized images + effect budget. Hitch-ratio check in the release Instruments pass.

### 4. The measurement traps (meta-failure)

- **Profiling debug builds** — see workflow rule 1. If a finding disappears in Release, it was never real.
- **Time Profiler is a sampler** (~1 ms) — it shows where CPU *time* goes, not where *waiting* happens. A main thread blocked on a lock or `.sync` shows as near-idle in Time Profiler while the app is frozen. For waiting, use the Hangs instrument or the Thread State track — "why is it slow" splits into "busy" (Time Profiler) vs "blocked" (thread states), and picking the wrong tool sends you optimizing code that was never the problem.
- **First-run effects** — cold caches, JIT-ish dyld work, Core Data store migration. Measure runs 2–4, or measure run 1 *deliberately* (launch path) and say which you're doing.

## Prevention summary

| Gate | Mechanism |
|---|---|
| Launch-time regression | `XCTApplicationLaunchMetric` perf test in CI, baseline-compared |
| Hang rate in the field | MetricKit `MXHangDiagnostic` pipeline + Organizer dashboard review each release |
| Scroll hitches | Animation Hitches pass on heaviest screens per release |
| Body-count regressions | SwiftUI-template counts recorded for top 3 screens per release |
| Oversized image decodes | Review rule: every remote image call site names its target pixel size |

**Related:** main-actor overload → [concurrency.md](concurrency.md) §3b · body-evaluation *causes* → [state-and-architecture.md](state-and-architecture.md) · memory instrumentation → [memory-management.md](memory-management.md)
