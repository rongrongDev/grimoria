# Changelog

All notable changes to this knowledge base. Each entry records **what changed and against which ecosystem versions it was validated** — that's what lets a future reader judge staleness.

## Revision protocol (the author is retired; this is how you keep the KB alive)

1. **Every doc carries an `Applies to:` + `Last reviewed:` header.** When you verify a doc against current tooling — even with zero edits — bump `Last reviewed` and log it here. A doc >18 months unreviewed is *hypotheses, not facts*.
2. **Triggers for a review pass:** new Android API level (annually, ~Q3) → re-check `background-work.md` API ratchet table and `security.md`; AGP/Kotlin major → `build-and-release.md` and the from-scratch guide's catalog; Compose compiler behavior change (e.g., stability semantics) → `memory-and-performance.md` Compose section + `compose-recomposition-auditor` skill.
3. **War stories are load-bearing.** Don't delete them when tooling changes; annotate them ("historical — fixed by X in version Y") so the *reasoning pattern* survives the fix.
4. Keep entries in reverse chronological order; one line per doc touched.

## [1.0.0] — 2026-07-06

Initial release. Authored against: **Kotlin 2.2, AGP 8.12, Gradle 8.14, Compose BOM 2026.06, Lifecycle 2.9, Room 2.7, WorkManager 2.10, Hilt 2.56, kotlinx.coroutines 1.10, API 24–36 (targetSdk 36), Robolectric 4.14, LeakCanary 2.14, Turbine 1.2.**

### Added
- `DESIGN.md` — structure rationale; primitive-assignment rules (doc vs skill vs subagent).
- `principles/architecture.md` — UDF, layering, UiState rules, MVVM-vs-MVI decision, DI scoping.
- `principles/lifecycle-and-state.md` — the three-questions model; config change, process death, observation lifecycles; Compose effects decision tree.
- `principles/concurrency.md` — scope decision tree; cancellation, races, `stateIn`, dispatcher injection; Flow judgment calls.
- `principles/background-work.md` — mechanism decision tree; WorkManager/FGS failure modes; API-level ratchet table (24→36).
- `principles/memory-and-performance.md` — leak taxonomy, recomposition storms, startup, ANR causology.
- `principles/security.md` — two-adversary threat model; Keystore, storage (notes `androidx.security.crypto` deprecation → Tink), pinning policy, R8 honesty, exported components, permissions.
- `principles/testing.md` — layer economics; coroutine/Turbine patterns; Robolectric-vs-instrumented decision; mutation-testing score guidance.
- `principles/build-and-release.md` — modularization judgment, convention plugins, R8 silent-breakage, variant combinatorics, staged rollout.
- `principles/accessibility-and-ui-correctness.md` — semantics model, font-scale, edge-to-edge (targetSdk 35+), OEM fragmentation.
- `principles/multi-agent-orchestration.md` — role splits, module-sharded fan-out, single-writer rules for shared build files, verdict-laundering guard.
- `guides/build-from-scratch.md` — complete Notes app: catalog, Room→repository→VM→stateless Compose, full test stack, minified-build checkpoint.
- `guides/analyze-existing-app.md` — tiered (2 h / 1 d / 3 d) audit procedure with grep battery and report template.
- `topics/` — extended-tier: views/Compose interop, Java interop, KMP, TV/Wear (production patterns + pitfalls only).
- `.claude/skills/` — `compose-recomposition-auditor`, `lifecycle-leak-reviewer`.
- `.claude/agents/` — `anr-root-cause-tracer`, `gradle-config-auditor` (both read-only tool allowlists).
- `README.md`, `GLOSSARY.md`, this changelog.

### Known gaps (deliberate, for the next maintainer)
- No dedicated Room-migrations deep-dive (covered only in testing.md note); worth a topic doc when someone hits it.
- Baseline Profile setup is referenced, not walked through step-by-step.
- Automotive (AAOS) explicitly out of scope (`topics/compose-tv-wear.md`).
