# Changelog

All notable changes to this knowledge base. This field moves faster than any
other in this series: **when you revise a doc, update its `Last reviewed` stamp
and add a line here.** A KB whose changelog goes quiet for six months should be
treated as suspect, not stable.

## 2026-07-06 — Initial release

**Structure** (see `DESIGN-NOTE.md` for the reasoning):
- `README.md`, `GLOSSARY.md`, `DESIGN-NOTE.md`, this file
- `principles/` — `core-principles.md` (12 principles with failure traces),
  `decision-trees.md` (7 decision trees with defaults)
- `topics/` — full-depth core tier, each area covering failure mode →
  detection → fix → prevention:
  - `prompt-design.md` — ambiguity, injection surface, few-shot bias, format
    brittleness, prompt versioning
  - `rag.md` — chunking, embedding/domain mismatch, recall vs. precision,
    re-ranking, staleness/conflicts, citation grounding, back-to-front
    debugging order
  - `agents-and-tool-use.md` — loop detection/termination, tool-error
    taxonomy, over/under-eager invocation, context management, per-turn budgets
  - `evaluation.md` — production-faithful eval sets, offline/online gap,
    LLM-as-judge protocol, prompt regression testing in CI
  - `hallucination-and-reliability.md` — grounding techniques ladder,
    confidence-from-evidence, abstention as a built feature, structured-output
    validation ladder
  - `safety-and-guardrails.md` — model-level vs. application-level,
    moderation sandwich, jailbreak-resistant design, PII data-flow
  - `cost-and-latency.md` — attribution first, token budgets, prompt/retrieval
    caching, streaming vs. batch, tier routing
  - `multi-agent-orchestration.md` — entry criteria, four working patterns,
    handoff schema, the four multi-agent-specific failure modes
- `guides/` — `build-a-rag-system.md` and `build-a-tool-using-agent.md`
  (start-to-finish with code and eval suites); `analyze-an-existing-system.md`
  (4-hour bounded protocol + 30-minute triage variant)
- `extended/` — production patterns + pitfalls tier:
  `fine-tuning-vs-prompting.md`, `multi-agent-frameworks.md`,
  `voice-and-multimodal.md`, `moderation-layers.md`
- `.claude/skills/` — `prompt-injection-reviewer`, `rag-grounding-auditor`,
  `eval-suite-planner`
- `.claude/agents/` — `eval-suite-runner`, `agent-trajectory-tracer`

**Version scope at release:** written against Claude 4.x–5 family and
GPT-5-era models, Anthropic SDK ≥ 0.40, voyage-3-class embeddings,
2025–2026-generation orchestration frameworks. Architectural judgment is
marked model-agnostic in each doc; pricing ratios and modality capabilities
are the fastest-rotting specifics — re-verify those first.

**Known gaps** (deliberate, candidates for future entries):
- No dedicated doc on long-term memory systems for agents (episodic/semantic
  memory stores) — patterns weren't stable enough to encode as durable judgment
  at time of writing.
- Injection/jailbreak *payload corpus* is referenced as CI infrastructure but
  not shipped here (payloads rot fastest of all; maintain locally).
- No provider-comparison shopping guide — deliberately: it would be stale
  before the ink dried. The decision trees give the durable selection logic.
