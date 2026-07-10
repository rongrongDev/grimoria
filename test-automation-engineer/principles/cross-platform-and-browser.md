# Cross-Platform & Cross-Browser Strategy

**Stamped:** 2026-07-06 · Applies to: Playwright 1.50, Selenium Grid 4.27, Appium 2.12; device-farm patterns in `frameworks/device-farms.md`.

The matrix question — which browsers, OSes, and devices to run on — is where suites burn the most money for the least signal. The instinct is "test everything we support." The economics say: every added matrix cell multiplies runtime and flake surface, while cross-browser bugs cluster in a narrow band of features. Test *what can actually differ*, weighted by *who actually uses it*.

## Matrix prioritization

```
Tier 0 — every PR (blocking):
    ONE engine, headless, desktop viewport. Chromium, usually —
    or whatever your traffic says is #1. Functional correctness
    is 95%+ engine-independent; catch logic bugs here, fast.
    + a mobile-VIEWPORT project for responsive-critical flows
      (viewport ≠ device: catches layout, not touch/OS behavior).
Tier 1 — main / nightly:
    Full journeys on the #2/#3 engines from your real traffic analytics
    (typically WebKit — Safari is where the bugs are — and Firefox).
Tier 2 — nightly/weekly:
    Real mobile devices (Appium/device farm) for the top revenue journeys;
    legacy/long-tail browsers only if traffic + revenue justify each cell.
```

Decide from **your analytics**, not defaults: pull browser/OS share weighted by *revenue*, cut the matrix where share × risk drops below the cost of the cell. Defend each cell annually; matrices only grow.

**What actually differs across engines** (from my defect logs — target Tier 1+ suites at these instead of re-running everything): input/focus/IME behavior, date/time pickers and `Intl` formatting, file upload/download UX, clipboard & permissions APIs, video/audio/DRM, PDF/print, complex CSS (sticky, container queries during their rollout window), safe-areas and virtual-keyboard behavior on real mobile. Pure business logic through REST calls does not differ; running your entire regression suite on five engines mostly quintuples the flakes (WebKit-on-Linux timing differs from real Safari anyway — see below).

## Grid & execution-infrastructure decision

```
Where do the browsers run?
├─ Playwright bundled browsers on CI runners      ← default. No grid to
│    operate; parallelism via workers × shards (parallelization doc).
│    Caveat: Playwright "WebKit" is the engine, not Safari-the-product —
│    good bug-finder, not a certification of real Safari.
├─ Selenium Grid (self-hosted, containerized)     ← when: legacy Selenium
│    estate, strict data residency, or in-house device lab.
│    You now operate a service: session queuing, node health, browser
│    version rollout. Budget real ops time or it becomes the flake source.
│    (Sizing/pitfalls: frameworks/selenium/README.md §grid.)
├─ Cloud grid / device farm (BrowserStack et al.) ← when: real Safari-on-macOS
│    or real devices matter and volume doesn't justify a lab.
│    Pay-per-minute, network-hop flakiness, tunnel ops.
│    (Tradeoffs: frameworks/device-farms.md.)
└─ Emulators/simulators (mobile)                   ← Tier 0/1 mobile default:
     cheap, parallel, deterministic. Real devices reserved for what
     emulators can't show: perf, gestures, camera/biometrics, OEM quirks
     (frameworks/appium/README.md §real-vs-virtual).
```

## Headless vs headed

Headless for CI, headed for humans. Since Chrome's unified "new headless" (and Firefox/WebKit equivalents), rendering parity is close enough that headless-specific *functional* failures are rare — but not zero. The residual differences that have bitten me: font availability/metrics on bare CI images (layout/visual diffs — pin fonts in the runner image), GPU-dependent rendering (canvas/WebGL — force consistent flags), viewport/device-scale defaults (set them explicitly, never inherit), notification/permission prompt behavior, and anti-bot systems treating headless differently (allowlist your CI egress in the app env, don't fight it in the suite). Policy: run headless everywhere in CI; any test that behaves differently headed-vs-headless gets that difference *root-caused*, not a `headless: false` patch — headed-in-CI (xvfb) is a workaround with a comment explaining why, and there should be at most a handful. Visual-regression baselines are per-mode by definition: never compare headed captures against headless baselines (`frameworks/visual-regression.md`).

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Matrix sprawl (every suite × every browser) | CI spend + wall-clock per cell; Tier 1 cells with zero unique catches in 6 months | Cut to tiered model; keep per-cell "unique bugs found" tally | Annual matrix review vs traffic analytics; new cells require a stated unique risk |
| Engine-specific flakes polluting the blocking set | Flake telemetry sliced by browser project: WebKit/Firefox flake ≫ Chromium | Move engine coverage to Tier 1 non-blocking; fix the timing assumptions (often real, engine-revealed — `waiting-and-synchronization.md`) | Blocking set = one engine by policy |
| "WebKit passed, Safari broke" | Field bug on real Safari with green Playwright WebKit | Add Tier 2 real-Safari (cloud grid) coverage for the affected journey | Document the WebKit≠Safari caveat next to the matrix; revenue-critical Safari journeys get real-Safari cells |
| Grid as flake source | Failures with session-create/timeout signatures, not app signatures; correlate with grid node health | Grid ops: autoscale, node recycling, version pinning | Grid health metrics on the same dashboard as flake rate; or exit self-hosting |
| Headless-only failure chased as app bug | Repro attempt headed passes | Root-cause the environment delta (fonts/GPU/viewport list above) | Runner image pins fonts + flags; env deltas documented in framework README |
| Duplicate coverage across cells (same test, five engines, zero delta risk) | Per-cell catch tally ≈ 0 for logic-only specs | Tag specs `@engine-sensitive` vs not; only sensitive specs fan out | Scaffolder default: new specs are single-engine unless tagged |

## Cross-references

- Device-level mobile matrix: `frameworks/appium/README.md` · Cloud farms: `frameworks/device-farms.md`
- Shard/worker math once the matrix is set: `parallelization-and-sharding.md`
- Which journeys deserve multi-engine coverage at all (risk-based): `@quality-dev/` test-strategy material
