# AI Evaluation Engineer — Knowledge Base

**Version:** 1.0.0 · **Date:** 2026-07-06 · Final knowledge transfer from a principal AI evaluation engineer. Self-contained: every doc is standalone-readable by humans (junior → staff) and by smaller models given a single file.

**The KB's one-sentence thesis:** an eval is a proxy measured by an instrument, and both the proxy and the instrument fail *silently* — the score keeps printing — so detection is a first-class design requirement, not an afterthought.

## Find what you need in 30 seconds

**"I need to..."**

| ...do this | Go here |
|---|---|
| Build an eval suite for a new feature, end to end | `guides/build-eval-suite-from-scratch.md` |
| Assess an eval suite I inherited / don't trust | `guides/audit-existing-eval-setup.md` |
| Review a rubric before raters/judges see it | skill **`eval-rubric-reviewer`** (`../.claude/skills/eval-rubric-reviewer/`) |
| Check my LLM judge for bias | skill **`judge-bias-auditor`** (`../.claude/skills/judge-bias-auditor/`) |
| Vet a benchmark before adopting it | subagent **`contamination-scanner`** (`../.claude/agents/contamination-scanner.md`) |
| Understand what regressed after a gate fired | subagent **`eval-regression-tracer`** (`../.claude/agents/eval-regression-tracer.md`) |
| Decide if a score delta is real | `principles/statistical-rigor.md` |
| Look up a term | `GLOSSARY.md` |

**"I want the judgment on..."** — core tier, full depth (each with failure → detection → fix → prevention):

- `principles/eval-design.md` — task definition, success criteria, golden sets, the metric-trust hierarchy
- `principles/llm-as-judge.md` — judge prompts, calibration, the bias catalog (self-preference, position, verbosity, prompt sensitivity)
- `principles/human-evaluation.md` — rubrics for humans, IRR, fatigue/drift, expertise routing, aggregation
- `principles/statistical-rigor.md` — CIs, MDE/sample size, paired tests, multiple comparisons, noise-vs-signal triage
- `principles/contamination-and-leakage.md` — direct, near-duplicate, and iteration leakage; probes and provenance
- `principles/regression-testing-and-edd.md` — tiered CI gates, flake, thresholds, suite rot, versioning
- `principles/production-offline-gap.md` — distribution drift, feedback-loop bias, the safe production→eval pipeline
- `principles/cost-and-scalability.md` — spend anatomy, sampling, parallelization hazards, tiered fidelity
- `principles/multi-agent-orchestration.md` — when to split eval work across agents, fan-out patterns, agent-specific failure modes

**Extended tier** — production patterns + pitfalls only: `topics/adversarial-evaluation.md` (methodology/metrics, no payloads) · `topics/agentic-task-evals.md` (trajectory scoring) · `topics/multimodal-evals.md` · `topics/rlhf-preference-data-evals.md`

**Meta:** `DESIGN.md` (why doc vs. skill vs. subagent, per piece) · `GLOSSARY.md` · `CHANGELOG.md`

## Reading paths

- **New to evals:** `eval-design.md` → `statistical-rigor.md` → `llm-as-judge.md`, then the build guide with the rest as reference.
- **Staff engineer standing up eval infra:** build guide first (it deep-links everything), then `regression-testing-and-edd.md` + `cost-and-scalability.md` for the parts that keep it alive.
- **Agent invoked with one task:** use the table above; every skill/subagent names its backing principles doc, every principles doc names its operationalizing callables.

## Ground rules the whole KB assumes

1. No score without a CI and an eval-set version. 2. No judge without calibration evidence. 3. No gate threshold without a measured A/A band. 4. No benchmark adoption without a contamination scan. 5. Dev and held-out sets split from day one. 6. Instrument changes (labels, judge, strata) get same-day baseline re-runs and a CHANGELOG line. Every rule earned its place via a war story in the corresponding doc.
