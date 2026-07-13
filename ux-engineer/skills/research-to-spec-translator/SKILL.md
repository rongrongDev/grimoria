---
name: research-to-spec-translator
description: >
  Convert graded usability-research findings (session notes + severity ×
  frequency grid, rainbow spreadsheet, or a findings report) into an
  implementation-ready interaction spec: requirement blocks with evidence,
  mechanism, priority, Given/When/Then criteria, and edge-case coverage.
  Use when the user asks to "turn these findings into a spec", "translate
  this research readout for engineering", "write requirements from this
  study", or at Phase 4 of building-a-validated-flow. Do NOT use for:
  raw ungraded transcripts/recordings (grading happens first, with the
  humans who watched — usability-testing.md §1–2; this skill refuses to
  invent severity), spec-writing with no research input (that's
  spec-handoff.md applied directly), root-causing one disputed failure
  (dispatch the usability-failure-tracer subagent), or quantitative/
  analytics analysis.
---

# Research-to-Spec Translator

**Validated against:** Given/When/Then convention; WCAG 2.2 AA for a11y fields. **Date:** 2026-07-13.

You are executing the translation chain from `ux-engineer/principles/research-to-spec.md` — read it first, plus `spec-handoff.md` for the completeness half. The chain: **observation → insight (mechanism) → design decision → requirement → acceptance criterion**, traceable both directions. Your job is to *preserve and structure* evidence, never to manufacture it.

## Inputs

Graded findings: observations with n-of-N counts and severity, ideally a rainbow spreadsheet or severity × frequency grid, plus study/finding IDs for citation. **Gate the input first:** if findings arrive ungraded ("users were confused") or uncounted, stop and return the list of what's missing with the format needed (`usability-testing.md` §1's evidence format) — translating vague input produces authoritative-looking vapor, and severity invented by you is severity laundered (`orchestration/README.md` failure 3). Partial grading is workable: translate the graded findings, list the ungraded ones as "awaiting grading," and proceed.

## Procedure

1. **Cluster by mechanism, not by screen.** Group observations that share a hypothesized cause (one mechanism often spans screens; one screen often hosts several mechanisms). For each cluster, write the insight — a mechanism sentence that *predicts* behavior, not a restatement ("users predict consequences from action labels, not adjacent copy" predicts; "the copy is missable" restates). Where competing mechanisms fit the same observations, keep both and name the cheapest discriminating test — a requirement may legitimately be "blocked pending discriminator" (`research-to-spec.md` §2).
2. **Derive requirements per cluster** using `spec-template.md` (adjacent to this file) — every field, no exceptions. Priority derives from the cluster's max severity × frequency (Blocking / Should-fix / Consider), shown with its arithmetic, never negotiated silently. Requirements the input doesn't support but stakeholders want anyway get written too — labeled `[decision — no research basis]`, which is honest and keeps them revisitable (§4).
3. **Falsifiability pass** (§1): for each requirement, attempt the exploit — describe an implementation satisfying the words but not the intent. If you succeed, rewrite at behavior level with observable values. Grep your own output for unfalsifiable adjectives (intuitive, simple, clear, prominent, quick).
4. **Edge-case completion pass** (`spec-handoff.md`): for each requirement touching a view or interaction, note which of the eight states (empty/loading/error/partial/hostile/offline/concurrent/revisited) it implicates, filling what the evidence answers and flagging the rest as **open design questions** — you surface gaps; you don't improvise designs the research never touched.
5. **Traceability audit:** walk three random requirements backward to their observations. Any break, fix before delivering.

## Output format

```
## Interaction spec from research: <study/flow>
**Input coverage:** N findings translated, M awaiting grading, K marked [decision].
### Insights (mechanism layer)
- INS-1: <mechanism sentence> — from observations <IDs>, competing mechanism: <or "none">
### Requirements
<REQ blocks per spec-template.md, grouped by insight, Blocking first>
### Open design questions (evidence ran out here — decide before implementation)
### Discriminating tests needed (competing mechanisms to settle)
### Verify summary (every REQ's Verify line + suggested owner: E2E / a11y walkthrough / next round / analytics)
```

Rules: every requirement cites finding IDs with counts; priorities show their derivation; nothing unlabeled — evidence-based, `[decision]`, or absent. Counts travel verbatim: "4/6" never becomes "most users." Deliver the blocks as the artifact; if a summary is requested, it's *of* the blocks, not instead of them (the deck war story in `research-to-spec.md` is why).
