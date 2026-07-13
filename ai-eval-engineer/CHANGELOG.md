# Changelog — AI Evaluation Engineer KB

All notable changes to this knowledge base. Eval methodology and tooling move fast: every doc carries its own version/date header, and material revisions land here. Follow the KB's own advice — when a doc's guidance changes meaning (not just wording), note the discontinuity.

## [1.1.0] — 2026-07-13 (audit remediation: all P0 + P1, part of P2)

Resolves the P0 and P1 backlog of `audits/2026-07-13-kb-audit.md`; per-item notes in the report itself.

**Fixed — callable references (P0):** maintainer decision: this repo is a KB *library*, so nothing is installed at a repo-root `/.claude/` — instead all 24 broken `.claude/...` references across 11 files were rewritten to the callables' real KB-relative homes (`skills/...`, `agents/...`), which have existed all along. Activation instructions for adopting projects recorded in `DESIGN.md` §structural choices. The 1.0.0 "callables (repo `.claude/`)" claim below has been amended to match. (An interim symlink installation was tried first and verified discoverable by Claude Code, then reverted in favor of this.)

**Added — topics:** `rag-evaluation.md` (retrieval metrics at production k, faithfulness/groundedness/answer-relevance triad, retriever-vs-generator attribution triage, oracle runs, RAG-specific contamination) and `reasoning-model-evals.md` (answer-not-trace scoring policy, pass@k vs. consensus@k vs. single-sample, thinking budget as instrument variable, trace-contamination perturbation probes). Both wired into the README router/extended tier and cross-linked from the relevant principles docs.

**Added — online evaluation:** `production-offline-gap.md` §"The online half" (v1.1.0): primary-vs-guardrail metrics, peeking/sequential-testing policy, online MDE honesty, interleaving, novelty effects — "offline green + A/B" is now executable from the doc, not just invoked.

**Added — build guide Step 4 (v1.1.0):** "choosing a harness" landscape map (as of 2026-07) plus a minimal worked Inspect AI config, closing the checklist-to-running-harness gap.

**Changed — tool landscape refresh (currency):** verified promptfoo was acquired by OpenAI 2026-03-09 (remains open source); annotated every mention and refreshed exemplar lists with Inspect AI and DeepEval across `eval-design.md`, `llm-as-judge.md`, `regression-testing-and-edd.md`, `statistical-rigor.md` (all v1.0.1), and the build guide; exemplar lists now carry their own re-check date. Ragas/Phoenix/Langfuse/W&B Weave/Braintrust/LangSmith mapped in the build guide Step 4 landscape rather than in every header.

**Changed — adjacent-KB cross-links:** README gains an "Adjacent KBs" section; `adversarial-evaluation.md` (v1.0.1) → `ai-model-red-teamer` + `ai-agent-red-teamer`; `llm-as-judge.md` → `prompt-engineer` (reciprocating its existing links here); fairness-slice gap closed by linking `ai-model-red-teamer/topics/bias-fairness-red-teaming.md` from `eval-design.md` and `adversarial-evaluation.md` — no new content written where a sibling KB already owns the depth.

**Fixed — typos/format:** `eval-design.md` doubled link artifact, `human-evaluation.md` "disagge", `eval-rubric-reviewer/checklist.md` C2 unclosed bold.

**No guidance invalidated** — all changes are additive or currency annotations; no prior recommendation reversed.

**Watch list (no action yet, per audit P2):** agent-as-a-judge, trace-based issue localization (TRAIL-class), eval-scores-as-runtime-guardrails. Next staleness re-check due ~2027-01.

## [Audit] — 2026-07-13

First inherited-KB audit: `audits/2026-07-13-kb-audit.md`. Top-line: KB is **strong** — core-tier depth standard genuinely met — but the four callables are not installed (repo `.claude/skills|agents/` are empty; all 25 path references broken, P0), the named tool landscape needs a 2026 refresh (promptfoo acquisition, Inspect AI et al. missing), and RAG evaluation is the one serious coverage gap.

## [1.0.0] — 2026-07-06

Initial complete release (final knowledge transfer).

**Added — structure & meta:** `README.md` (30-second router), `DESIGN.md` (primitive-placement rationale), `GLOSSARY.md`, this changelog.

**Added — principles (core tier, full depth, each with failure→detection→fix→prevention):** `eval-design.md`, `llm-as-judge.md`, `human-evaluation.md`, `statistical-rigor.md`, `contamination-and-leakage.md`, `regression-testing-and-edd.md`, `production-offline-gap.md`, `cost-and-scalability.md`, `multi-agent-orchestration.md`.

**Added — topics (extended tier, production patterns + pitfalls):** `adversarial-evaluation.md` (methodology/metrics only, no payloads by design), `agentic-task-evals.md`, `multimodal-evals.md`, `rlhf-preference-data-evals.md`.

**Added — guides (end-to-end capabilities):** `build-eval-suite-from-scratch.md`, `audit-existing-eval-setup.md`.

**Added — callables (KB `skills/` and `agents/`; claim amended 2026-07-13 — originally said "repo `.claude/`", which was never true as shipped):** skills `eval-rubric-reviewer` (+ `checklist.md`), `judge-bias-auditor` (+ `bias-test-protocols.md`); subagents `contamination-scanner`, `eval-regression-tracer`.

**Scope stamps:** written against Claude 4.x/Fable 5- and GPT-5.x-era model families; harness-agnostic (promptfoo / Braintrust / LangSmith / custom). Statistical content is timeless; tool-cost ratios and model-family specifics should be re-checked after ~2 quarters (the KB's own staleness rule, applied to itself).

## Maintenance protocol for future editors

- Bump the doc-level version/date header on any material edit; add a line here stating what changed and whether prior guidance is invalidated.
- New failure modes require: the failure, a detection method, a fix, a prevention mechanism, and ideally the war story — pattern-match the existing skeleton.
- New skills/subagents: cross-reference both directions (callable ↔ backing principles doc) and add to the README router table.
- Keep `GLOSSARY.md` the single definition source; docs link to it rather than redefining terms.
