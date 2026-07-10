# Multi-Agent Orchestration

**Last reviewed:** 2026-07-06 · **Applies to:** Claude 4.x–5 era agentic systems; patterns are framework-agnostic (framework specifics: `extended/multi-agent-frameworks.md`).
**Read this when:** anyone proposes more than one agent. Read §1 *especially* then.
**Related:** `topics/agents-and-tool-use.md` (single-loop mechanics — prerequisite) · `principles/decision-trees.md` §2.

Multi-agent is not "agents, but more." It's a distributed system whose nodes are
probabilistic and whose messages are prose. Every classic distributed-systems
problem — partial failure, message loss, duplicated work, write conflicts — shows
up, plus a new one: **the bandwidth between your nodes is a natural-language
summary, and every hop is lossy.**

---

## 1. When one LLM call (or one agent) suffices — the entry criteria

**Failure mode.** Multi-agent adopted for elegance: "a researcher agent, a writer
agent, a critic agent!" The org chart is satisfying; the system is slower, 5–15×
more expensive, and *less* accurate than one good agent, because every handoff
lost context and every agent re-derived what its predecessor knew. Anthropomorphic
decomposition — splitting by job title instead of by engineering constraint — is
the single most common multi-agent mistake.

**The only two entry criteria** (from `principles/decision-trees.md` §2 — both are
engineering constraints, not preferences):
1. **Context isolation:** a subtask generates volumes of intermediate content the
   parent must not carry — running a 300-case eval, reading 40 files to answer
   one question, replaying a giant trajectory. The subagent's context is a
   *disposable workspace*; only the conclusion returns. (This KB's own
   `eval-suite-runner` and `agent-trajectory-tracer` exist for exactly this.)
2. **True parallelism:** independent subtasks with **no shared mutable state**,
   where wall-clock matters — analyze 20 repos, research 8 competitors.

A useful smell test: if your proposed agents are named after *people* (researcher,
reviewer, PM), re-derive the design from constraints. If they're named after
*workspaces* (per-repo worker, eval runner), you're probably fine.

**Not** entry criteria: "the prompt is getting long" (fix the prompt), "different
steps need different personas" (one model handles sequential modes fine), "we
want specialization" (a fixed pipeline of calls gives you that without handoffs —
`principles/decision-trees.md` §2).

## 2. The patterns that actually work

### 2a. Planner / worker (orchestrator-delegate)

One top-tier agent owns the task: decomposes, dispatches workers, integrates
results, and — critically — **retains responsibility for the outcome**. Workers
are cheap-to-mid tier, single-purpose, and disposable.

Rules learned the hard way:
- The planner *never* does worker-sized work itself (context protection), and
  workers *never* talk to each other — all coordination through the planner.
  Worker-to-worker chatter is how you get emergent behavior you can't debug.
- Worker tasks must be **self-contained**: a worker that needs to ask a
  clarifying question is a failed decomposition. Write worker prompts like you'd
  write a ticket for a contractor in another timezone (see §3, handoffs).
- The planner validates worker output before integrating (schema + sanity), and
  has an explicit policy for worker failure: retry with a refined brief once,
  then integrate a documented gap rather than blocking the whole task.

### 2b. Fan-out / fan-in (parallel research)

For N independent lookups: dispatch N workers with *identical prompt templates*
(differing only in the target), each returning a **fixed-schema** result;
a fan-in step (often a plain LLM call, not an agent) merges.

The two things that go wrong: overlap (§4b, redundant work — partition the
input space explicitly, don't let workers choose their own scope) and unbounded
N (§4c, cost — N is a reviewed constant or capped function, never
model-chosen without a ceiling).

### 2c. Reviewer loop (generate → critique → revise)

A generator produces; a reviewer critiques against a **written rubric**; the
generator revises. Genuinely improves quality for code, long-form content, and
plans — with three hard rules:
- **Bounded iterations** (2, rarely 3 — improvement saturates fast, and past
  saturation the loop *oscillates*: reviewer flags style, revision introduces a
  new nit, forever. It's `topics/agents-and-tool-use.md` §1's loop pathology at
  the pattern level; the bound is your termination condition).
- Reviewer gets the rubric and the artifact, **not** the generator's reasoning —
  reviewing the rationale instead of the artifact reproduces LLM-as-judge
  sycophancy (`topics/evaluation.md` §3).
- The reviewer's job is *findings*, the generator's job is *fixes*. A reviewer
  that rewrites is two generators fighting (§4d).

### 2d. Handoff (sequential specialization)

Stage A finishes and passes to stage B — triage → resolution, extraction →
synthesis. Only worth it over a single agent when stages need different
capability tiers, different tool allowlists (privilege separation,
`topics/safety-and-guardrails.md` §3), or context reset. The entire pattern
lives or dies on the handoff artifact — §3.

## 3. Handoff protocols: preserving context without bloating it

**Failure mode — context loss.** Agent A learns ten constraints; the summary it
writes carries four; Agent B violates constraint seven and is *correct to do so
given what it was told*. No component erred; the *interface* dropped the
requirement. This is the defining failure of multi-agent systems, and it's
invisible in any single agent's logs — only visible in the diff between what A
knew and what B was told.

**War story.** A migration task: the analysis agent discovered the target system
required ISO-8601 dates ("note: dates must be converted"). The handoff summary
said "convert the user table." The execution agent converted it — copying dates
in the source format. Each trajectory, read alone, looked flawless. Three days
lost to re-migration. The bug lived *between* the agents.

**Failure mode — the overcorrection.** Burned once, teams pass *everything*:
A's full trajectory becomes B's input. Now B drowns in A's dead ends
(`topics/agents-and-tool-use.md` §4 context saturation), latency and cost double
per hop, and B weights A's abandoned hypotheses equally with its conclusions.

**Fix — the handoff is a schema, not a vibe.** Prose summaries silently drop
constraints; structured handoffs make the dropped field visible:

```json
{
  "objective": "what B must accomplish, in one sentence",
  "deliverable": "exact expected output shape",
  "constraints": ["every MUST/MUST-NOT discovered so far — the load-bearing field"],
  "decisions_made": [{"decision": "...", "reason": "one line"}],
  "inputs": [{"ref": "file/id/url", "why_relevant": "..."}],
  "known_pitfalls": ["what A tried that failed, so B doesn't retry it"],
  "out_of_scope": ["what B must NOT touch"]
}
```

Two disciplines make it work: **references over payloads** (pass file paths and
IDs, not contents — the recipient fetches what it needs; this single rule
prevents most bloat), and **constraints accumulate monotonically** — every hop
copies the constraints list forward verbatim; hops may append, never
re-summarize. Re-summarization is where constraint seven dies.

**Detection.** When a multi-agent run fails, audit the *seams first*: diff what
each agent knew against what it passed on (the `agent-trajectory-tracer`
subagent's multi-agent mode does exactly this). If a constraint appears in A's
context and not in B's input, you've found it. **Prevention:** eval cases that
plant a critical constraint in stage A's discovery phase and assert it survives
to the final output — the multi-agent equivalent of a data-integrity test.

## 4. The failure modes specific to multi-agent

### 4a. Context loss between agents
Covered in §3 — listed here because it's the #1 killer and postmortem readers
look for a list.

### 4b. Redundant work and duplicate tool calls
**Failure:** three parallel workers each independently fetch the same three
documents, embed the same queries, hit the same rate limits — 3× cost for
zero added information; at worst, rate-limit exhaustion takes down the *whole*
fan-out. **Detection:** aggregate tool-call logs *across* agents per run; count
duplicate `(tool, args)` pairs — single-agent dashboards can't see this by
construction. **Fix:** partition inputs explicitly at dispatch (workers scoped,
not self-directed); shared read-through cache for fetch/embed/search across the
run (`topics/cost-and-latency.md` §2); do common groundwork *once* in the
planner and hand references down. **Prevention:** duplicate-call-rate as a
per-run metric with a threshold alert.

### 4c. Cost explosion from unbounded recursion / fan-out
**Failure:** agents that can spawn agents, with the spawn decision made by a
model. Task hits a hard patch → planner spawns helpers → helpers struggle on the
same hard patch → helpers spawn helpers. Cost compounds *geometrically*, and each
level looks locally reasonable. **War story:** a "decompose recursively until
subtasks are simple" research system hit a paywalled-source cluster; "not simple
yet" cascaded three levels deep into 43 dispatched agents and a ~$900 run —
overnight, unattended. The postmortem line item that stung: 31 of 43 agents
produced *no information the top level used*. **Fix (all mandatory):** max
spawn depth (2 is almost always enough), max total agents per run, **run-level
dollar budget enforced by the harness, checked before every spawn** — sub-budgets
don't sum right when the model allocates them. The run dies loudly at the cap
with partial results, exactly like `topics/agents-and-tool-use.md` §1's
termination discipline, one level up. **Prevention:** spawn-tree logged and
visualizable; any run touching its cap gets a human look.

### 4d. Conflicting writes to shared artifacts
**Failure:** two agents edit the same file/document/record concurrently.
Last-writer-wins silently destroys the other's work — or worse, interleaved
partial writes produce a *merge no one wrote*, which then reads as plausible
(`topics/hallucination-and-reliability.md`'s theme: failures that look like
success). LLM agents make this worse than classic concurrency because each
agent, seeing unexpected file state, will *helpfully adapt* — papering over the
conflict instead of surfacing it. **Fix, in order of preference:** (1) design
away shared mutable state — partition artifacts so each has exactly one writer
per run (this is why §1's parallelism criterion says *no shared mutable state*);
(2) writers produce *proposals* (diffs/patches), a single integrator applies
them — conflicts become explicit at integration where one context can resolve
them; (3) real locking/worktree isolation if you must. **Detection:** write-log
per artifact per run; two writers on one artifact is an alert even when nothing
visibly broke. **Prevention:** the dispatch-time invariant "one writer per
artifact" checked mechanically at plan time, not hoped for at runtime.

---

## The design review checklist for any multi-agent proposal

1. Which entry criterion — context isolation or true parallelism? (If neither:
   one agent. If "specialization": fixed pipeline.) — §1
2. Are agents named after workspaces or job titles? — §1
3. Handoffs: structured schema? References over payloads? Constraints copied
   forward verbatim? — §3
4. Fan-out: explicit input partition? N bounded? — §2b/§4b
5. Recursion: depth cap, agent cap, run-level dollar cap in the *harness*? — §4c
6. Every shared artifact has exactly one writer (or a single integrator)? — §4d
7. Reviewer loops bounded at 2–3 iterations? — §2c
8. Can you see cross-agent duplicate tool calls in your logging? — §4b
9. An eval case that plants a constraint upstream and asserts it survives? — §3

**Related:** `topics/agents-and-tool-use.md` (every single-loop discipline
applies to each node here) · `extended/multi-agent-frameworks.md` (CrewAI/
AutoGen/LangGraph-class tradeoffs) · `topics/cost-and-latency.md` ·
subagents: `eval-suite-runner`, `agent-trajectory-tracer` (working examples of
§1's context-isolation criterion).
