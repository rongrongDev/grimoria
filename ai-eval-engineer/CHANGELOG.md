# Changelog — AI Evaluation Engineer KB

All notable changes to this knowledge base. Eval methodology and tooling move fast: every doc carries its own version/date header, and material revisions land here. Follow the KB's own advice — when a doc's guidance changes meaning (not just wording), note the discontinuity.

## [1.0.0] — 2026-07-06

Initial complete release (final knowledge transfer).

**Added — structure & meta:** `README.md` (30-second router), `DESIGN.md` (primitive-placement rationale), `GLOSSARY.md`, this changelog.

**Added — principles (core tier, full depth, each with failure→detection→fix→prevention):** `eval-design.md`, `llm-as-judge.md`, `human-evaluation.md`, `statistical-rigor.md`, `contamination-and-leakage.md`, `regression-testing-and-edd.md`, `production-offline-gap.md`, `cost-and-scalability.md`, `multi-agent-orchestration.md`.

**Added — topics (extended tier, production patterns + pitfalls):** `adversarial-evaluation.md` (methodology/metrics only, no payloads by design), `agentic-task-evals.md`, `multimodal-evals.md`, `rlhf-preference-data-evals.md`.

**Added — guides (end-to-end capabilities):** `build-eval-suite-from-scratch.md`, `audit-existing-eval-setup.md`.

**Added — callables (repo `.claude/`):** skills `eval-rubric-reviewer` (+ `checklist.md`), `judge-bias-auditor` (+ `bias-test-protocols.md`); subagents `contamination-scanner`, `eval-regression-tracer`.

**Scope stamps:** written against Claude 4.x/Fable 5- and GPT-5.x-era model families; harness-agnostic (promptfoo / Braintrust / LangSmith / custom). Statistical content is timeless; tool-cost ratios and model-family specifics should be re-checked after ~2 quarters (the KB's own staleness rule, applied to itself).

## Maintenance protocol for future editors

- Bump the doc-level version/date header on any material edit; add a line here stating what changed and whether prior guidance is invalidated.
- New failure modes require: the failure, a detection method, a fix, a prevention mechanism, and ideally the war story — pattern-match the existing skeleton.
- New skills/subagents: cross-reference both directions (callable ↔ backing principles doc) and add to the README router table.
- Keep `GLOSSARY.md` the single definition source; docs link to it rather than redefining terms.
