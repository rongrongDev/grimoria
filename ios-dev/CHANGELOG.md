# Changelog

All notable changes to this knowledge base, pinned against toolchain versions.
Format: date — change — toolchain baseline the content was validated against.

## 2026-07-06 — Initial release (v1.0)

Baseline toolchain for all v1.0 content:

- **Swift 6.2** (Swift 6 language mode assumed unless a doc says otherwise; Swift 5-mode caveats called out inline)
- **Xcode 26** (Instruments 26, Swift Testing bundled)
- **iOS 26 SDK**, guidance written for **minimum deployment iOS 17+** (where iOS 16-or-earlier differs materially — e.g., `@Observable` availability — docs say so explicitly)
- **The Composable Architecture 1.x** (observation-based, `@Reducer`/`@ObservableState` era)

Added:
- `README.md`, `GLOSSARY.md`, `DESIGN-NOTE.md`
- `principles/`: memory-judgment, concurrency-judgment, architecture-judgment, multi-agent-orchestration
- `topics/` core tier (full depth): memory-management, concurrency, state-and-architecture, async-patterns, performance, security, testing, release-and-platform
- `topics/` extended tier (production patterns + pitfalls): objc-interop, gcd-legacy, platform-variants, tca
- `guides/`: build-from-scratch (Capability A), analyze-existing-app (Capability B)
- Skills: `retain-cycle-reviewer`, `concurrency-migration-auditor`
- Subagents: `actor-isolation-scanner`, `crash-log-tracer`

## Maintenance rules for future editors

1. When a new Swift language mode, major SwiftUI release, or Xcode major ships: re-review `topics/concurrency.md`, `topics/state-and-architecture.md`, and both skills **first** — those rot fastest.
2. Update the version stamp (`Last reviewed:`) in any doc you touch, even if the change is a deletion.
3. Record *behavioral* rule changes here (e.g., "Swift X makes Y a compile error — removed the lint-rule workaround"), not typo fixes.
4. Never edit `GLOSSARY.md` definitions to match one doc's local usage; fix the doc.
