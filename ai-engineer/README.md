# @ai-engineer/ — Production LLM Engineering Knowledge Base

**Last reviewed:** 2026-07-06 · **Covers:** Claude 4.x–5 / GPT-5-era systems; judgment is model-agnostic and each doc states its version scope.

The distilled judgment of years building production LLM systems — RAG pipelines,
agents, tool-using assistants — written for humans (junior → staff) and for AI
models invoking the companion skills/subagents. Every doc stands alone; every
strong claim is backed by a concrete failure; every technical area covers
**failure mode → detection → fix → prevention**.

## Find what you need in 30 seconds

**"I'm starting something new"**
| You want to... | Go to |
|---|---|
| Decide prompt vs. RAG vs. fine-tune, one agent vs. many, which model tier | `principles/decision-trees.md` |
| Build a RAG system from zero (working code + evals) | `guides/build-a-rag-system.md` |
| Build a tool-using agent from zero (loop, termination, budgets, code) | `guides/build-a-tool-using-agent.md` |
| Plan the eval suite before writing the feature | skill: `eval-suite-planner` |
| Absorb the worldview first | `principles/core-principles.md` (12 rules, ~10 min) |

**"Something is wrong"**
| Symptom | Go to |
|---|---|
| Wrong/invented answers, fake citations | `topics/rag.md` (§debugging order!), `topics/hallucination-and-reliability.md`, skill: `rag-grounding-auditor` |
| Agent looped, overspent, or did something weird | `topics/agents-and-tool-use.md`; long transcript → subagent: `agent-trajectory-tracer` |
| Output quality inconsistent / regressed after a change | `topics/prompt-design.md`, `topics/evaluation.md` §4 |
| The invoice or the latency is scary | `topics/cost-and-latency.md` (start at §0) |
| Users made the model do something it shouldn't | `topics/prompt-design.md` §2, `topics/safety-and-guardrails.md`, skill: `prompt-injection-reviewer` |
| Multi-agent system lost a requirement between agents | `topics/multi-agent-orchestration.md` §3 |

**"I inherited a system"** → `guides/analyze-an-existing-system.md`
(4-hour protocol; 30-minute triage variant at the end).

**"What does this term mean?"** → `GLOSSARY.md`.

## The map

```
@ai-engineer/
├── README.md            ← you are here
├── DESIGN-NOTE.md       why docs vs. skills vs. subagents (read once)
├── GLOSSARY.md          shared vocabulary, strict definitions
├── CHANGELOG.md         dated history — check freshness here first
├── principles/
│   ├── core-principles.md      12 rules with the war stories that paid for them
│   └── decision-trees.md       the forks, with defaults (not "it depends")
├── topics/              full depth: failure → detection → fix → prevention
│   ├── prompt-design.md
│   ├── rag.md
│   ├── agents-and-tool-use.md
│   ├── evaluation.md
│   ├── hallucination-and-reliability.md
│   ├── safety-and-guardrails.md
│   ├── cost-and-latency.md
│   └── multi-agent-orchestration.md
├── guides/              start-to-finish, code included, standalone
│   ├── build-a-rag-system.md
│   ├── build-a-tool-using-agent.md
│   └── analyze-an-existing-system.md
└── extended/            production patterns + pitfalls tier
    ├── fine-tuning-vs-prompting.md
    ├── multi-agent-frameworks.md
    ├── voice-and-multimodal.md
    └── moderation-layers.md

.claude/  (repo root — the callable layer)
├── skills/
│   ├── prompt-injection-reviewer/   static injection-surface review of a prompt/agent design
│   ├── rag-grounding-auditor/       do generated claims trace to retrieved sources?
│   └── eval-suite-planner/          designs a concrete, CI-gated eval suite
└── agents/   (isolated context — large intermediates stay out of your window)
    ├── eval-suite-runner.md         runs a full suite, returns failure clusters
    └── agent-trajectory-tracer.md   replays a trajectory, returns the divergence turn
```

## Reading paths by role

- **Junior engineer:** `core-principles.md` → one build guide end-to-end (type
  the code) → the topic doc for whatever you're assigned. The war stories are
  the curriculum; the code is the lab.
- **Senior engineer shipping a feature:** `decision-trees.md` for the
  architecture call → the 2–3 relevant topic docs → `eval-suite-planner`
  before writing the feature.
- **Staff engineer / reviewer:** `analyze-an-existing-system.md` as your review
  protocol; the checklists at the end of each topic doc as design-review
  ammunition; `multi-agent-orchestration.md` §1 whenever someone proposes more
  agents.
- **AI model executing a task:** invoke the skill/subagent whose description
  matches; each names the docs that carry its reasoning. When acting from a
  single doc, trust it — every doc is written to be complete standalone.

## House rules (for readers and future maintainers)

1. Check the `Last reviewed` stamp before trusting anything quantitative —
   pricing ratios and modality capabilities rot fastest. `CHANGELOG.md` is the
   freshness ledger; revisions update both.
2. Every doc is standalone by design — you never need to have "read the series."
3. Skills and subagents state when *not* to use them. Those clauses are
   load-bearing; a skill invoked outside its lane produces confident nonsense,
   which is this field's signature failure (see `principles/core-principles.md` §1 —
   it applies to this KB's own tooling too).
