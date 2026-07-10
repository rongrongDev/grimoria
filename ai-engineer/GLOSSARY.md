# Glossary

**Last reviewed:** 2026-07-06 · **Applies to:** model-agnostic

Terms as used throughout this KB. Where the industry uses a term loosely, the
definition here is the strict one the docs assume.

### Core model behavior

- **Context window** — the maximum number of tokens (input + output) a model can
  attend to in one call. Everything the model "knows" about your task at inference
  time must fit here; nothing persists between calls unless you re-send it.
- **Token** — the unit models read and produce; roughly ¾ of an English word.
  You are billed, rate-limited, and latency-bound in tokens, not characters.
- **Hallucination** — the model asserting something false with the same fluency and
  confidence as something true. Not a bug to be fixed once; a permanent property to
  be engineered around. See `topics/hallucination-and-reliability.md`.
- **Grounding** — constraining model output to be supported by supplied source
  material (retrieved documents, tool results) rather than parametric memory.
  A claim is *grounded* if you can trace it to a specific passage the model was shown.
- **Confabulated citation** — a citation that looks real (plausible title, author,
  section number) but doesn't exist or doesn't support the claim. The signature
  failure of naive RAG.
- **Temperature** — sampling randomness. Low (0–0.3) for extraction, classification,
  tool use; higher only when you want diversity. Non-zero temperature makes failures
  non-reproducible — remember this when debugging.
- **System prompt** — the instruction block that frames every turn. In a well-built
  system it is versioned, tested, and access-controlled like code, because it *is* code.

### Retrieval / RAG

- **RAG (Retrieval-Augmented Generation)** — architecture where relevant documents are
  fetched at query time and injected into the prompt so the model answers from them
  instead of from memory.
- **Chunk / chunking** — splitting documents into retrieval-sized pieces. The chunking
  strategy determines what *can* be retrieved; no downstream step can recover
  information a bad chunk boundary destroyed.
- **Embedding** — a vector representing a text's meaning, produced by an embedding
  model. Similarity between vectors approximates semantic similarity between texts —
  in the embedding model's training distribution, which may not be your domain.
- **Vector search / semantic search** — nearest-neighbor search over embeddings.
- **Hybrid search** — combining vector search with lexical search (BM25/keyword).
  Usually the cheapest large quality win in RAG.
- **Retrieval recall** — of all chunks that *could* answer the query, the fraction your
  retriever returned. Low recall → the model can't be right no matter how good it is.
- **Retrieval precision** — of the chunks returned, the fraction actually relevant.
  Low precision → the model answers from distractors, or the right passage is buried.
- **Re-ranking** — a second-stage model that re-scores the top-N retrieved candidates
  for relevance to the specific query. Trades latency for precision.
- **Top-k** — the number of chunks passed to the model. Bigger is not safer: it dilutes
  attention and inflates cost.

### Agents / tool use

- **Tool calling / function calling** — the model emitting a structured request to
  invoke a function you defined; your code executes it and returns the result. The
  model never executes anything itself.
- **Agent** — an LLM in a loop: model proposes an action (usually a tool call), the
  harness executes it, results go back into context, repeat until a termination
  condition. The loop and its termination conditions are *your* code and your
  responsibility.
- **Tool-call loop (pathological)** — the agent repeating the same or near-same tool
  call without progress, burning tokens. See `topics/agents-and-tool-use.md` for
  detection and termination.
- **Termination condition** — an explicit rule that ends an agent run: task-complete
  signal, max turns, max cost, no-progress detection. An agent without one is an
  unbounded spend commitment.
- **Trajectory** — the full sequence of an agent run: prompts, model outputs, tool
  calls, tool results, final answer. The unit of agent debugging.
- **Handoff** — passing work between agents (or agent → human), including the context
  the recipient needs. Handoff design is where multi-agent systems live or die.
- **Orchestrator / planner-worker** — pattern where one agent decomposes and delegates
  to others. See `topics/multi-agent-orchestration.md`.

### Evaluation

- **Eval / eval suite** — a fixed set of inputs with expected properties of the output,
  run against your system to measure quality. The unit test suite of LLM engineering.
- **Golden set** — eval cases with human-verified correct answers.
- **LLM-as-judge** — using a model to grade another model's output. Cheap and scalable;
  biased and inconsistent in known ways (self-preference, position bias, verbosity
  bias). See `topics/evaluation.md`.
- **Offline eval** — run before deployment on a fixed set. **Online monitoring** —
  measurement on live traffic. The gap between them is where production incidents live.
- **Regression testing (prompts)** — re-running the eval suite when a prompt, model
  version, or retrieval parameter changes, gating the change on results — exactly like
  CI for code.
- **Happy path** — the inputs everyone tests because they're the inputs everyone
  imagines. Real traffic is mostly not this.

### Safety / reliability

- **Prompt injection** — untrusted content (user input, retrieved documents, tool
  results, web pages) containing text that the model treats as instructions.
  The XSS of LLM systems: a *data-plane vs. control-plane* confusion.
- **Jailbreak** — adversarial input crafted to bypass a model's safety training or
  your application's constraints.
- **Guardrail** — application-level enforcement outside the model: input/output
  moderation, schema validation, allowlists, rate limits. Distinct from model-level
  safety training, which you don't control and shouldn't solely rely on.
- **Moderation layer** — a classifier (model or rules) that screens inputs and/or
  outputs before they cross a trust boundary.
- **PII** — personally identifiable information. In LLM systems it leaks through
  prompts, logs, caches, eval sets, and vendor telemetry — every place a prompt goes.
- **Structured output** — model output constrained to a schema (JSON schema, tool
  parameters). Validation of it is a guardrail; the constraint alone is not.

### Cost / performance

- **Prompt caching** — provider-side caching of a stable prompt prefix so repeated
  tokens are billed and processed at a fraction of the cost. Requires *byte-stable*
  prefixes — a timestamp in your system prompt silently defeats it.
- **TTFT (time to first token)** — latency until streaming starts; what users perceive.
- **Model tier** — the capability/cost class of a model (e.g. Haiku < Sonnet < Opus <
  Fable/Mythos). Tier selection per task is one of the biggest cost levers.
- **Fan-out** — issuing many parallel LLM calls/agents for one task. Multiplies cost
  and, done naively, duplicates work. See `topics/multi-agent-orchestration.md`.
