# Multi-Agent Orchestration Frameworks (Extended Tier)

**Last reviewed:** 2026-07-06 · **Applies to:** the 2025–2026 framework generation (LangGraph-class graph runtimes; CrewAI-class role frameworks; AutoGen-class conversation frameworks). Names will churn; the *categories* and their failure modes are durable. Extended-tier depth: production patterns + common pitfalls. The architecture itself — patterns, handoffs, failure modes — is core-tier: `topics/multi-agent-orchestration.md`. The adopt-vs-build decision: `principles/decision-trees.md` §7.

The framing that keeps you safe: **a framework buys you plumbing, not judgment.**
Termination conditions, handoff schemas, budget caps, eval gates — the things
that actually determine whether your multi-agent system works — are your job in
every framework, and *easier to get wrong* when the framework's abstractions
hide the seams.

## The three categories and what each is actually for

- **Graph runtimes (LangGraph-class).** You define nodes and edges explicitly;
  the framework gives you durable state, checkpointing, resume, human-in-the-loop
  pauses. The most production-credible category *because* it's the least
  magical: control flow stays yours and visible. Adopt when you need
  durability/resumability — that's the feature that's genuinely expensive to
  build (`principles/decision-trees.md` §7); don't adopt for a linear pipeline
  a `for` loop expresses better.
- **Role frameworks (CrewAI-class).** Agents as personas with roles and goals;
  the framework decides much of who-does-what-when. Fast demos. The persona
  abstraction is precisely the anthropomorphic-decomposition trap
  (`topics/multi-agent-orchestration.md` §1) with a nicer API — production use
  demands you fight the framework's defaults (turn off open-ended delegation,
  bound everything).
- **Conversation frameworks (AutoGen-class).** Agents talk in a group chat until
  the task resolves. Powerful for exploration/research UX; the termination
  problem ("until it resolves" — per whom?) is structural. Treat any
  conversation-driven control flow as an unbounded loop that *you* must cap
  (`topics/agents-and-tool-use.md` §1 mechanics, applied to the whole chat).

## Production patterns

- **Adopt the narrowest layer.** Take the graph runtime for state/checkpointing;
  keep writing your own prompts, your own tool schemas, your own retrieval.
  Full-stack framework adoption couples you to its weakest layer, and framework
  prompt templates age faster than any other component in this field.
- **Your harness invariants ride along.** Per-node and per-run budget caps,
  repeat detection, structured handoff schemas
  (`topics/multi-agent-orchestration.md` §3–4), trajectory logging — implement
  them *inside* the framework's nodes/callbacks. No framework ships them with
  usable defaults; every framework lets you add them.
- **Evals at the graph level, not the node level only.** Frameworks make it easy
  to unit-eval a node and never eval the composition — but the composition
  (handoffs, routing) is where multi-agent systems fail. The
  plant-a-constraint-upstream test (`topics/multi-agent-orchestration.md` §3)
  is framework-independent and non-negotiable.
- **Pin the framework version like a model version.** These libraries move fast
  and break behavioral compatibility casually — a minor-version bump can change
  agent behavior with no code change of yours. Upgrades go through the eval
  suite like a model upgrade (`topics/evaluation.md` §4).

## Common pitfalls

- **Demo velocity mistaken for production readiness.** Role frameworks
  especially: the five-minute crew demo hides that observability, budgets, and
  failure routing are still 90% of the work. Budget accordingly.
- **Framework-hidden loops.** Delegation and group-chat features can recurse or
  ping-pong internally, below your instrumentation. If you can't see every LLM
  call and its cost (hook the framework's callbacks on day one), you can't see
  the §4c cost explosion coming — and it arrives on the invoice.
- **The abstraction inversion.** Debugging a bad run requires reconstructing
  what prompt actually went to the model — and the framework assembled it from
  templates, memory, and injected scratchpads you didn't write. If the
  framework can't dump the *exact final prompt* per call, that's disqualifying
  (`principles/core-principles.md` §10).
- **Framework memory as silent shared state.** Built-in "memory" features are
  shared mutable state with a friendly name — the exact thing §4d of the
  orchestration doc says to design away. Know precisely what enters context
  from memory, when, and how it's evicted; or turn it off and pass state
  explicitly.
- **Lock-in via graph shape.** Your node/edge definitions are portable design;
  your reliance on a framework's proprietary state serialization is not. Keep
  handoff payloads as plain JSON schemas (yours), so the framework stays
  swappable.

**Related:** `topics/multi-agent-orchestration.md` (the load-bearing doc) ·
`principles/decision-trees.md` §7 · `guides/build-a-tool-using-agent.md` (the
loop you'd otherwise write — read it even if adopting a framework, so you know
what the framework must provide).
