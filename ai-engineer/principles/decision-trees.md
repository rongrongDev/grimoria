# Decision Trees

**Last reviewed:** 2026-07-06 · **Applies to:** Claude 4.x–5 family, GPT-5-era models; judgment is model-agnostic
**Read this when:** you're at a fork and want the default answer, not a survey of options.

"It depends" is true and useless. These trees encode what it depends *on*. Each ends
in a default; deviate when you can articulate why, and write the reason down.

---

## 1. Prompting vs. RAG vs. fine-tuning

```
Does the task need knowledge the model doesn't have?
├─ No (it's about behavior/format/reasoning, not facts)
│   └─ Prompt-engineer. Add few-shot examples before considering anything else.
│      Still failing after honest prompt iteration + examples?
│      ├─ Failing on style/format consistency at high volume → consider fine-tuning
│      └─ Failing on reasoning → bigger model, or decompose the task; fine-tuning won't fix reasoning
└─ Yes — where does the knowledge live?
    ├─ Changes over time, or is queryable per-request (docs, tickets, DB rows)
    │   └─ RAG. Facts that change do not belong in weights.
    ├─ Fits in the prompt (< ~50K tokens, stable)
    │   └─ Just put it in the prompt. With prompt caching, a big static context
    │      is cheap. A retrieval system you didn't need is pure operational debt.
    └─ Vast, static, and pattern-like (e.g. a proprietary language, house style
       across millions of examples)
        └─ Fine-tuning is plausible — but see extended/fine-tuning-vs-prompting.md
           for what you're signing up for. Default remains RAG + prompting.
```

**Default:** prompt → stuff-the-context → RAG → fine-tune, in that order. Each step
right only when the previous one has *measured* (evaled, not vibed) failure.

## 2. One call vs. pipeline vs. agent vs. multi-agent

```
Can you enumerate the steps in advance?
├─ Yes, and it's one transformation → single call. Done. Most tasks end here.
├─ Yes, several distinct transformations (extract → validate → summarize)
│   └─ Fixed pipeline of calls. You keep: per-step evals, per-step model tiers,
│      per-step retries. No agent needed — YOU are the planner.
└─ No — the steps depend on intermediate results (which file? which API? how many
   searches?)
    ├─ One context window can hold the whole task
    │   └─ Single agent loop with tools + termination conditions.
    └─ The task provably exceeds one context window, or has parallel independent
       parts with no shared mutable state
        └─ Multi-agent — read topics/multi-agent-orchestration.md FIRST.
           Entry criteria, not preference: context isolation or true parallelism.
```

**Default:** the dumbest architecture that passes the eval. Complexity is spent, not
earned, by moving down this list.

## 3. Model tier selection

```
Is the task classification / extraction / routing / formatting with clear criteria?
├─ Yes → start with the small tier (Haiku-class). Run your eval.
│        Passes → ship it. Fails → mid tier, re-run.
└─ No — does it require multi-step reasoning, nuanced judgment, code generation,
   or agentic tool use?
    ├─ Agentic / long-horizon → top tier (Opus/Fable-class). Small-model agents
    │   compound their per-step error rate across every step: 95%-per-step over
    │   10 steps is a 60% task success rate.
    ├─ Judgment/generation, single-shot → mid tier (Sonnet-class), escalate on eval failure.
    └─ LLM-as-judge for your evals → one tier ABOVE the model being judged,
       never the same model (self-preference bias — topics/evaluation.md).
```

Route per *task*, not per *product*: one product should be calling multiple tiers.
Revisit tier choices every model generation — the small tier of this year beats the
top tier of two years ago on many tasks.

## 4. Do I need re-ranking?

```
Measure first: retrieval recall@k on a labeled set (topics/rag.md §measurement).
├─ Recall@20 is low → re-ranking can't help; nothing relevant to re-rank.
│   Fix chunking / embeddings / hybrid search first.
├─ Recall@20 good, precision@5 bad (right answer exists but ranks 8th–15th)
│   └─ This is THE re-ranker use case. Add one. Expect +50–200ms.
└─ Recall@20 and precision@5 both good → you don't need it. Stop.
```

## 5. Streaming vs. batch

```
Is a human waiting for this specific output?
├─ Yes → stream. TTFT is the perceived latency; total time barely registers.
└─ No (pipeline stage, offline enrichment, eval run)
    └─ Don't stream. And if it can wait hours → provider batch API, typically 50% off.
```

## 6. Structured output: how strict?

```
Will code consume the output?
├─ No (human reads it) → don't force JSON; you pay a small quality tax for
│   structure you don't need.
└─ Yes → define a schema. Then:
    ├─ Provider supports strict/constrained mode for your call shape → use it.
    ├─ Otherwise → tool-calling with the schema as tool parameters (models are
    │   heavily trained on this path; it beats "respond in JSON" prompting).
    └─ EITHER WAY: validate with a real schema validator + semantic checks
        (IDs exist, dates parse, enums in range). Schema-valid ≠ true.
        See topics/hallucination-and-reliability.md §structured-output.
```

## 7. Build the orchestration layer vs. adopt a framework

```
Is your agent loop < ~500 lines of your own code? (It usually is.)
├─ Yes → write the loop yourself (guides/build-a-tool-using-agent.md).
│   You will need to debug at the loop level; owning it means you can.
└─ You need durable state, human-in-the-loop pauses, resumable long-running
   graphs, or your org already standardized
    └─ A graph framework (LangGraph-class) earns its keep. Adopt the
       narrowest layer that gives you the missing feature — not the
       framework's prompts, memory abstraction, and retrieval stack too.
       See extended/multi-agent-frameworks.md for the pitfalls.
```

**Default:** custom loop. Frameworks hide the exact seams you'll need to see into
when (not if) the agent misbehaves.

---

**Related:** `principles/core-principles.md` · each branch's reasoning lives in the
corresponding `topics/` doc.
