# Changelog

Track every addition/revision here, with the tool/spec versions the content was validated against. Newest first.

## 2026-07-13 — Initial release (v1.0)

Full initial authoring of the knowledge base.

- **Root:** `README.md`, `DESIGN.md`, `GLOSSARY.md`, `CHANGELOG.md`.
- **Principles (full depth, failure→detection→fix→prevention per area):**
  - `design-tokens.md` — validated against DTCG format 2025.1 draft, Style Dictionary 4.x, Figma Variables
  - `component-api.md` — framework-agnostic; examples React 19 / TS 5.x
  - `css-architecture.md` — `@layer`/`:has()`/container queries/nesting per Baseline; Tailwind 4.x, CSS Modules, vanilla-extract 1.x
  - `responsive-design.md` — container queries + `cqi`, `clamp()`, `dvh/svh`, `text-wrap: balance` per Baseline
  - `animation-motion.md` — WAAPI, View Transitions (same-document Baseline 2025), `@starting-style`/`allow-discrete` (Baseline 2024), Motion 12.x
  - `component-accessibility.md` — WCAG 2.2 AA, APG, native `<dialog>`/`popover`/`inert`, axe-core 4.x; delta on `web-dev/principles/accessibility.md`
  - `visual-regression-testing.md` — Playwright 1.5x, Storybook 9, Chromatic/Percy/Lost Pixel
  - `governance.md` — tooling-agnostic
- **Extended tier (production-patterns + common-pitfalls):** `topics/cross-browser.md` (Baseline vocabulary, Safari 17–18 floor), `topics/design-handoff.md` (Figma Dev Mode/Variables 2025, Code Connect, Tokens Studio), `topics/multi-brand-theming.md`, `topics/i18n-layout.md` (logical properties Baseline 2023, `:dir()` 2024).
- **Capability A:** `building-a-design-system/README.md` — followable start-to-finish (tokens → components → VRT → adoption); validated against Style Dictionary 4.x, Storybook 9, Playwright 1.5x, React 19 for examples.
- **Capability B:** `auditing-a-ui-codebase/README.md` — bounded-time playbook, four artifacts.
- **Skills:** `design-system-consistency-reviewer`, `component-from-tokens-generator`.
- **Subagents:** `duplicate-component-scanner`, `responsive-fidelity-auditor` (both no-write allowlists).
- **Orchestration:** `orchestration/README.md` — planner/implementer/reviewer split, fan-out audits, agent-specific failure modes.
- **Cross-KB ownership notes:** accessibility foundation, testing philosophy, performance/rendering pipeline, and framework mechanics are owned by `web-dev/` and linked, not duplicated (see `DESIGN.md`).

### Revision policy

- Re-validate version-sensitive docs when: a covered tool ships a major (Style Dictionary, Storybook, Tailwind, Playwright, Motion), a cited CSS feature changes Baseline status, or the DTCG format leaves draft. Update stamps and log what changed vs. what merely re-validated.
- Cross-browser floors (`topics/cross-browser.md`) reviewed every 6 months — stale "can't do that" claims are this KB's fastest-rotting content.
- Advice found to be wrong gets **corrected in place** and logged here — never leave a known-wrong doc standing because "the changelog notes it."
- If `topics/multi-brand-theming.md` outgrows its tier (full-depth need), promote to `principles/` and log the move.
