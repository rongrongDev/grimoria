# Cross-Browser Fidelity — Production Patterns & Common Pitfalls

**Tier:** extended (patterns + pitfalls only). **Validated against:** Baseline (web-platform-dx) as the compatibility vocabulary; evergreen Chrome/Edge/Firefox; Safari 17–18.x (the practical long pole); "legacy" in 2026 = old Safari on old iOS/macOS hardware and pinned enterprise WebViews — IE is dead and nothing here spends a word on it. **Date:** 2026-07-13.

## The mental model in one paragraph

Cross-browser work in 2026 is not "does it work in browser X" — it's **version lag**: every browser is evergreen except where the OS pins it (iOS Safari on old devices, enterprise WebViews, smart-TV embeds). So the question is never "does Safari support `:has()`" but "does the *oldest Safari in our support matrix* support it," and the support matrix is a **business decision you write down**, not a vibe. Define it (e.g. "last 2 major Safari, last 4 Chrome/Firefox/Edge, X% usage floor from our own analytics"), encode it in `browserslist`, and let tooling enforce it — because humans reliably develop in one browser and assume.

## Production patterns

- **Baseline as the feature-adoption gate.** For each CSS/platform feature: *Baseline widely available* → use freely; *Baseline newly available* → use if your matrix's floor includes it, else behind progressive enhancement; *not Baseline* → enhancement only, never load-bearing. The features this KB leans on (`@layer`, `:has()`, container queries, nesting, `dvh`) are all Baseline — but check the *floor*, not the headline, when your matrix includes 3-year-old iOS.
- **Progressive enhancement via `@supports`, not UA sniffing.** `@supports (container-type: inline-size)` branches on capability; UA strings lie, freeze, and rot. Structure it so the *base* experience is complete and the enhancement is layout refinement — if the un-enhanced branch is broken, that's not enhancement, that's a feature behind a flag you don't control.
- **One rendering-engine trio in CI, real devices for the floor.** Playwright's three engines (Chromium/WebKit/Gecko) catch most engine divergence cheaply in the visual suite (`../principles/visual-regression-testing.md`) — but desktop WebKit is *not* iOS Safari (different viewport behavior, different scrolling, same-engine-different-bugs). Keep one or two physical floor-matrix iOS devices (or a device cloud) for the money paths per release.
- **Normalize at the edges, not everywhere:** a modern reset (`box-sizing: border-box`, margin zeroing), `color-scheme` for form controls/scrollbars, self-hosted fonts with metric-compatible fallbacks. Most "browser differences" teams fight are actually *default-style* differences a reset ends permanently.
- **Autoprefixer/lightningcss via browserslist** handles the vendor-prefix tail automatically; hand-written `-webkit-` prefixes in source are a smell that the toolchain isn't wired.

## Common pitfalls

1. **Developing in Chrome, testing in Chrome, shipping to Safari.** The single most common fidelity failure has no exotic cause: nobody opened Safari until the bug report. *Prevention:* WebKit in the visual-regression matrix from day one; make Safari (not Chrome) the default local dev browser for one engineer per team — it's astonishing what that alone catches.
2. **Scroll and viewport behavior divergence on iOS.** `100vh` overshoot (fix: `dvh`/`svh` — `../principles/responsive-design.md` §4), position-fixed vs. the on-screen keyboard, rubber-band overscroll revealing unpainted background (`overscroll-behavior`, background on `html`), scroll-locking a modal (use `<dialog>`/scrollbar-gutter-aware locking, not `body { overflow:hidden }` alone, which iOS ignores in some configurations).
3. **Stale "can't do that" intuitions.** Styling selects, dialog elements, anchor positioning, text-wrap balancing — the platform moved; engineers who learned the workarounds in 2018 still ship the workarounds (heavier, less accessible) in 2026. *Prevention:* re-verify per control against Baseline before reaching for a library — the decision tree in `../principles/component-accessibility.md` §3 starts with "check the native element *again*."
4. **New-feature fallback never actually tested.** The `@supports` branch for old Safari exists but no one has rendered it since it was written; it rotted. *Prevention:* the floor device in the release pass renders the money paths — the fallback branch is part of the product, test it like one.
5. **Fonts rendering differently ≠ bug.** Sub-pixel rasterization differs per OS/engine; chasing pixel-identical text across platforms is a war you lose by design. Normalize what matters (metrics via `size-adjust` fallbacks so layout doesn't shift; `font-smoothing` only where the design is genuinely broken without it) and set the visual-suite tolerance philosophy accordingly: one pinned engine for the pixel-tight suite, cross-engine runs judged for *layout* breaks, not rasterization.
6. **Enterprise WebView pins.** If your product embeds in a customer's app or an Electron fork, your real floor may be years behind your analytics. Ask; write it into the matrix; it changes the Baseline math above more than any consumer browser does.

## Related

- Feature-specific floors are noted inline in `../principles/css-architecture.md`, `responsive-design.md`, and `animation-motion.md` version stamps.
- Cross-engine runs in CI: `../principles/visual-regression-testing.md`. Audit checks: `../auditing-a-ui-codebase/README.md` artifact 3.
