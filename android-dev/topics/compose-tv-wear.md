# Compose for TV & Wear OS — Production Patterns & Pitfalls

> **Tier: extended** — production patterns + common pitfalls; not a full form-factor guide.
> **Applies to:** Compose for TV (androidx.tv 1.x), Wear Compose 1.4+/Horologist, Wear OS 4–5, Android TV/Google TV API 28+ · **Last reviewed:** 2026-07-06
> **Related:** [memory-and-performance.md](../principles/memory-and-performance.md) · [background-work.md](../principles/background-work.md) · [accessibility-and-ui-correctness.md](../principles/accessibility-and-ui-correctness.md)

## The shared premise

Both form factors punish the assumption that "it's just a small/big phone." The interaction model (D-pad focus on TV, rotary + tiny-glance sessions on Wear) and the hardware envelope (TV: weak GPUs and huge panels; Wear: battery measured in single-digit hours of active use) invalidate phone defaults. Reuse your **data and domain layers unchanged** ([architecture.md](../principles/architecture.md) layering pays off here — this is the real-world case for it); rewrite the **UI layer natively per form factor**; share ViewModels only when the screens are genuinely the same shape.

## Compose for TV

### Focus is the product

On TV, **focus management is not a detail — it is the interaction model.** The entire UX is "where is the highlight and where does it go when I press right."

- **Pitfalls, ranked by how often they ship:** (1) focus lost on navigation/back — user returns to a browse row and focus resets to the top-left of the screen (use `focusRestorer()` on rows/grids and save focused-item keys in the VM; test *back* from every detail screen); (2) focus trapped — a row of unfocusable items (clickable but not focusable — TV components need both; `androidx.tv` Material components handle it, hand-rolled `Modifier.clickable` doesn't) makes everything past it unreachable by D-pad, which on TV means *unreachable, period*; (3) focus vs scroll fighting — default `LazyRow` scroll-to-focused behavior vs custom pivot offsets; use the TV `LazyRow`/`Carousel` variants, not phone lazy lists.
- **Detection:** you cannot test TV UI with a touch-driven emulator habit — navigate everything by emulator D-pad keys (or a real remote). Every PR checklist: "reachable and escapable by D-pad only."

### The hardware you actually ship to

TV devices are the worst GPUs you ship to: $30 sticks and 2018-era smart-TV SoCs at 4K. Recomposition storms that a phone absorbs jank badly here — apply [memory-and-performance.md](../principles/memory-and-performance.md)'s Compose section with tighter budgets; measure on a low-end stick, not the Studio emulator on your workstation GPU. Image loading at TV art sizes OOMs 1.5 GB-heap devices fast: size Coil requests to the *displayed* dp, never load source-resolution artwork into a browse row.

Also: **overscan** — a real percentage of physical TVs still crop edges; keep interactive elements inside the safe margins (~48dp horizontal / 27dp vertical guidance still applies).

## Wear OS

### The battery is the API

Every design decision routes through power. A Wear app that costs noticeable battery gets uninstalled *from the phone*, taking your review score with it.

- **Session shape:** interactions are 5–15 seconds, glanceable, one decision. Deep navigation hierarchies are a phone habit — a Wear "app" is closer to a notification + a tile + one screen than to a small phone app. Invest in **Tiles and complications before in-app screens** — that's where Wear engagement actually lives (our health app's tile got 20× the daily interactions of its full app).
- **Ambient/always-on:** your screen keeps "running" in ambient mode at 1 fps-ish with burn-in-protection constraints. Animations must stop, updates must coalesce (`AmbientLifecycleObserver`/Horologist helpers). The pitfall: a per-second ticker `Flow` running in ambient — the [lifecycle-and-state.md](../principles/lifecycle-and-state.md) background-collection battery bug, but 10× the relative cost.
- **Background limits are stricter than phone:** aggressive Doze, and health-adjacent OEM watches vary wildly. Use `WorkManager` with genuine tolerance for hours-late execution, `OngoingActivity` for genuinely ongoing things (workouts), and Health Services for sensors (batched, radio-efficient) instead of raw `SensorManager` — raw sensor listeners are the #1 Wear battery bug.
- **Connectivity is a distributed-systems problem:** the phone is *often absent* (BT out of range) and Wi-Fi/LTE on-watch is expensive. The Data Layer API (`DataClient`) is eventually-consistent state sync, not messaging — design offline-first with reconciliation, exactly like a flaky-network mobile app but flakier. Pitfall: request/response over `MessageClient` with no timeout/offline path — the "watch app hangs when I leave my phone upstairs" review.

### Wear UI specifics

- Round screens: use Wear Compose Material (`ScalingLazyColumn`/`TransformingLazyColumn`, `TimeText`, `ScreenScaffold`) — phone Material 3 composables lay out wrong on round displays (clipped corners, no scaling physics). Support **rotary input** (`.rotaryScrollable()` / Horologist) — crown scrolling not working marks the app as a lazy port to every reviewer.
- Text sizes and touch targets: bigger than feels natural; test on an actual wrist in motion, not a bench.

## Failure-mode summary

| Failure | Detection | Fix | Prevention |
|---|---|---|---|
| TV: focus lost/trapped | D-pad-only walkthrough | `focusRestorer`, focusable+clickable TV components | PR checklist: D-pad reachability |
| TV: jank/OOM on low-end sticks | profile on cheapest real device | sized image requests; recomposition audit | perf budget on min-spec hardware in CI/manual gate |
| Wear: battery drain | Battery Historian / on-watch battery stats per version | stop work in ambient; Health Services; coalesce sync | release gate: battery delta vs previous version |
| Wear: phone-absent hangs | airplane-mode-phone test | offline-first Data Layer sync, timeouts | test matrix includes "phone absent" row |

## When NOT to use this doc

Foldables/tablets are **not** TV/Wear — they're the phone app with `WindowSizeClass` ([accessibility-and-ui-correctness.md](../principles/accessibility-and-ui-correctness.md)). Automotive (AAOS) shares the D-pad-ish focus concerns but has its own templates/validation regime — treat it as out of scope for this KB.
