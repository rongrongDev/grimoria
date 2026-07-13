# Changelog

Track every addition/revision here, with the spec/method versions the content was validated against. Newest first.

## 2026-07-13 — Initial release (v1.0)

Full initial authoring of the knowledge base.

- **Root:** `README.md`, `DESIGN.md`, `GLOSSARY.md`, `CHANGELOG.md`.
- **Principles (full depth, failure→detection→fix→prevention per area):**
  - `prototyping-fidelity.md` — four-dial fidelity model; method-agnostic (Figma 2025 / coded prototypes)
  - `interaction-design.md` — 0.1s/1s/10s thresholds (Card/Miller/Nielsen), WCAG 2.2 input-modality SCs (2.5.7, 2.5.8)
  - `journey-accessibility.md` — **WCAG 2.2 AA** (incl. 2.2 additions 2.4.11, 3.3.7, 3.3.8), ARIA 1.2, axe-core 4.x, NVDA/VoiceOver current
  - `usability-testing.md` — Nielsen heuristics (rev. 2020), 5-user guidance with conditions (Nielsen/Landauer 1993), tooling-independent
  - `information-architecture.md` — card sort / tree test / first-click methods (Bailey/Wolfson first-click data)
  - `motion-behavior.md` — timing/meaning judgment; WCAG 2.2.2/2.3.3; implementation half delegated to `ui-engineer/principles/animation-motion.md`
  - `research-to-spec.md` — five-link chain, requirement template, Given/When/Then convention
  - `spec-handoff.md` — two-engineer test, eight-state inventory, state × event matrix
- **Extended tier (production-patterns + common-pitfalls):** `topics/design-system-collaboration.md`, `topics/motion-spec-handoff.md`, `topics/voice-conversational.md`, `topics/cross-platform-consistency.md` (iOS HIG / Material 3 / web conventions).
- **Capability A:** `building-a-validated-flow/README.md` — six-phase sequence, followable start-to-finish, worked example threaded (multi-person reschedule flow).
- **Capability B:** `auditing-a-flow/README.md` — bounded-time playbook, four artifacts, fan-out notes.
- **Skills:** `journey-accessibility-reviewer` (+ `checklist.md` seam worksheet), `research-to-spec-translator` (+ `spec-template.md`).
- **Subagents:** `flow-accessibility-auditor`, `usability-failure-tracer` (both read-only-plus-Bash-for-running, no-write allowlists).
- **Orchestration:** `orchestration/README.md` — a11y gate, parallel translation, planner/implementer split, audit fan-out, five agent-specific failure modes (scanner-equals-audit foremost).
- **Cross-KB ownership seams (see `DESIGN.md`):** component-level accessibility, motion implementation/tokens, visual handoff, and design-system governance are owned by `ui-engineer/` and linked, not duplicated.

### Revision policy

- **WCAG is the fastest-moving dependency:** when WCAG 3.0 leaves draft (or 2.x errata land), re-validate `principles/journey-accessibility.md` first, then the SC references in `interaction-design.md`, `motion-behavior.md`, both skills, and the auditor subagent. Log what changed vs. what merely re-validated.
- Perceptual-threshold content (0.1s/1s/10s, timing ranges) is research-stable — re-validate only against new primary research, not tooling churn.
- Method claims with citations (5-user conditions, first-click success rates) keep their citations; if a doc's claim loses its citation in an edit, the edit is wrong.
- Tooling references (axe-core, Playwright, Figma, SRs) are deliberately version-loose in docs and stamped here; refresh stamps when a major changes behavior the docs rely on.
- Advice found to be wrong gets **corrected in place** and logged here — never leave a known-wrong doc standing because "the changelog notes it."
- If `topics/cross-platform-consistency.md` outgrows its tier (full-depth need), promote to `principles/` and log the move.
