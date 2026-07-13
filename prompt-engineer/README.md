# @prompt-engineer/ — Prompt Craft Knowledge Base

**Last reviewed:** 2026-07-13 · **Covers:** Claude 4.x–5 family, GPT-5-era models. The judgment is largely model-agnostic; each doc stamps its own model scope and date — check stamps before trusting model-specific claims, because this is the fastest-rotting domain in the series.

The distilled judgment of years treating prompt design as a rigorous discipline: instructing a model precisely enough that its behavior is reliable, testable, and reproducible. Written for humans (junior → staff) and for AI models invoking the companion skills/subagents. Every doc stands alone; every strong claim carries the production failure that paid for it; every technical area covers **failure mode → detection → fix → prevention**.

**Scope in one line:** this KB owns the *prompt itself* — structure, language, examples, testing discipline. Building the surrounding system (RAG, agents, tools) is `@ai-engineer/`; evaluation methodology (metrics, judges, statistics) is `@ai-eval-engineer/`; adversarial testing is `@ai-agent-red-teamer/`. Where a doc here touches those walls, it links out.

## Find what you need in 30 seconds

**"I'm writing a prompt"**
| You want to... | Go to |
|---|---|
| Build a production prompt start-to-finish (spec → draft → regression set → ship) | `guides/build-a-production-prompt.md` |
| Decide a fork: few-shot or not, CoT or not, prompted vs. API-enforced JSON, one call or two | `principles/decision-trees.md` |
| Absorb the worldview first (12 rules, ~10 min) | `principles/core-principles.md` |
| Design or fix few-shot examples | `topics/few-shot-examples.md` |
| Write or refactor a system prompt | `topics/system-prompt-design.md` |
| Get reliable JSON/structured output | `topics/structured-output.md` |

**"Something is wrong"**
| Symptom | Go to |
|---|---|
| Output varies across similar inputs; behavior nobody can reproduce | `topics/clarity-and-specification.md`; skill: `prompt-clarity-reviewer` |
| Model "ignores" an instruction | `topics/clarity-and-specification.md` §2 (it's usually obeying your *other* instruction), then `topics/few-shot-examples.md` §4 (or the examples) |
| Parser breaking on model output | `topics/structured-output.md` |
| Behavior changed and nobody knows which change did it | `topics/versioning-and-regression-testing.md` §3; subagent: `prompt-version-differ` |
| CoT everywhere, accuracy flat, bill growing | `topics/reasoning-elicitation.md` §1 |
| Prompt works on model A, breaks on model B (or after an upgrade) | `extended/cross-model-portability.md` |
| Quality degrades deep into conversations | `extended/multi-turn-design.md` |
| Token bill scary | `extended/cost-and-token-efficiency.md` |

**"I inherited a prompt"** → `guides/audit-an-existing-prompt.md` (half-day protocol; 30-minute triage variant at the end).

**"Is this prompt safe to ship?"** → ship gate: `principles/decision-trees.md` §8. Untrusted content in the prompt? → `extended/injection-aware-structure.md`, then `@ai-engineer/`'s `prompt-injection-reviewer` skill if tools/capabilities are in play.

**"What does this term mean?"** → `GLOSSARY.md`.

## The map

```
@prompt-engineer/
├── README.md            ← you are here
├── DESIGN.md            why docs vs. skills vs. subagents (read once)
├── GLOSSARY.md          strict shared vocabulary
├── CHANGELOG.md         freshness ledger — check here first
├── principles/
│   ├── core-principles.md               12 rules + the war stories that paid for them
│   └── decision-trees.md                the forks, with defaults, incl. the ship gate (§8)
├── topics/              core tier — full depth, failure→detection→fix→prevention
│   ├── clarity-and-specification.md     ambiguity, conflicts, format under-specification
│   ├── few-shot-examples.md             selection, ordering, overfit, staleness
│   ├── reasoning-elicitation.md         when CoT pays, trace-trust limits
│   ├── structured-output.md             schema drift, real-world degradation, prior conflicts
│   ├── system-prompt-design.md          role altitude, patch accumulation, edit conflicts
│   ├── versioning-and-regression-testing.md   prompts as deploys; attribution
│   └── multi-agent-prompt-workflows.md  agent splits & fan-outs for prompt work itself
├── extended/            production patterns + pitfalls tier
│   ├── cross-model-portability.md
│   ├── injection-aware-structure.md
│   ├── cost-and-token-efficiency.md
│   └── multi-turn-design.md
├── guides/              start-to-finish, standalone, agent-executable
│   ├── build-a-production-prompt.md     capability A: task spec → shipped, tested prompt
│   └── audit-an-existing-prompt.md      capability B: unfamiliar prompt → prioritized remediation
├── skills/              the callable layer — bounded reviews
│   ├── prompt-clarity-reviewer/         ambiguity/conflict/format review before ship
│   └── few-shot-example-auditor/        staleness, accidental patterns, coverage matrix
└── agents/              isolated context — transcripts stay out of your window
    ├── edge-case-behavior-scanner.md    batch-runs a prompt, returns failure-mode characterization
    └── prompt-version-differ.md         case-level flip table between versions/models
```

## Reading paths by role

- **Junior engineer:** `core-principles.md` → `guides/build-a-production-prompt.md` end-to-end on a real task → the topic doc for whatever bites first. The war stories are the curriculum.
- **Senior engineer shipping prompt changes:** `decision-trees.md` at each fork → the 2–3 relevant topic docs → both skills before merge → `prompt-version-differ` against prod. `topics/versioning-and-regression-testing.md` once, so the lifecycle is muscle memory.
- **Staff engineer / reviewer:** `guides/audit-an-existing-prompt.md` as your review protocol; the checklists ending each topic doc as design-review ammunition; `topics/multi-agent-prompt-workflows.md` before anyone builds a prompt-editing agent pipeline.
- **AI model executing a task:** invoke the skill/subagent whose description matches — descriptions state when *not* to use them, and those clauses are load-bearing. Both guides are written to be executable as protocols. When acting from a single doc, trust it; every doc is standalone by design.

## House rules

1. **Check date and model-scope stamps before trusting anything model-specific.** Model-agnostic judgment (ambiguity, versioning, examples-as-spec) ages slowly; formatting preferences, CoT benefit, and schema-adherence behavior can shift per model release. `CHANGELOG.md` is the ledger and carries the maintenance contract.
2. Every doc is standalone — no reading order is assumed, ever.
3. The KB practices what it preaches: prompts for skills/subagents here have explicit output skeletons, not-for clauses, and uncertainty behavior — if you edit them, they get the same regression discipline they prescribe.
