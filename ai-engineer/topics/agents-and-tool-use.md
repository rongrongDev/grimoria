# Agents & Tool Use

**Last reviewed:** 2026-07-06 · **Applies to:** Claude 4.x–5 family, GPT-5-era models with native tool calling; Anthropic SDK ≥ 0.40. Loop mechanics are model-agnostic.
**Read this when:** building or debugging anything where a model chooses actions.
**Related:** guide: `guides/build-a-tool-using-agent.md` · subagent: `agent-trajectory-tracer` · multi-agent concerns: `topics/multi-agent-orchestration.md`.

An agent is a while-loop where a language model chooses the next iteration's action.
Everything that makes agents dangerous follows from that: the loop condition is
probabilistic, the actions have costs and side effects, and the state (context
window) grows monotonically. You are not building intelligence; you are building a
loop with a stochastic policy — engineer the loop.

---

## 1. Tool-call loops: detection and termination

**Failure mode.** The agent repeats the same or near-same action without progress:
retrying a failing call, re-searching with cosmetic query variations, re-reading the
same file. Each iteration *looks* reasonable in isolation; the pathology is only
visible across iterations. Cost is unbounded; the model will not break the loop
itself, because from inside, every iteration seems like the next sensible step.

**War story.** (The one from `principles/core-principles.md` §6, in detail.) A
research agent called a search tool that had started returning HTTP 500 with an
empty body. The agent read the empty result as "no results found," concluded its
query was too narrow, broadened it, got another 500... 61 minutes, 190+ tool calls,
~$140. Two design failures compounding: the tool error was *indistinguishable from a
valid empty result*, and nothing counted repeated calls.

**Detection (all three; they catch different loops):**
- **Exact-repeat counter:** hash `(tool_name, canonicalized_args)`; N identical
  calls (N=3) → intervene.
- **No-progress detection:** define task-visible progress (new files read, new
  facts extracted, plan steps completed). M consecutive turns without progress
  (M=5) → intervene.
- **Semantic near-repeat:** embed tool-call sequences; high self-similarity over a
  window catches the "rephrase and retry" loop that exact matching misses.

**Fix (the intervention ladder).** On trip: (1) inject a synthetic message —
"you have called `search` 3 times with similar arguments and results have not
changed; step back, state what you're trying to learn, choose a different
approach or report inability" — models usually recover when the loop is *named*;
(2) if tripped again, terminate with a structured failure report. Never silently
kill: a failure report ("blocked: search backend erroring") is a useful output;
a timeout is not.

**Prevention.** Hard caps as non-negotiable loop parameters: **max turns** (task
p95 × 2), **max cost** in dollars per run, **max wall-clock**. Plus per-tool
budgets for expensive tools. These are your defense in a postmortem; "the model
usually stops" is not.

## 2. Tool-call error handling

**Failure mode.** A tool fails and the agent handles it wrong in one of three
directions: (a) treats the error as data — the empty-500 story above; (b) gives up
on a transient error a retry would fix; (c) retries a *permanent* error forever
(auth failure, 404). Each comes from the same root: the tool result didn't tell the
model what kind of failure occurred.

**Fix — design the error taxonomy into tool results.** Tool results are prompt
content; make them carry recovery semantics:

```json
{"status": "error", "kind": "transient", "message": "search backend timeout",
 "guidance": "retry up to 2 times; if it persists, report the capability as unavailable"}

{"status": "error", "kind": "permanent", "message": "repository not found",
 "guidance": "do not retry; verify the repo name or ask the user"}

{"status": "ok", "result": [], "note": "zero results is a valid outcome, not an error"}
```

Three rules: (1) errors are structurally distinct from empty successes — the
confusion between them caused the worst loop I ever saw; (2) `kind` +
`guidance` tell the model the recovery policy, so recovery doesn't depend on the
model inferring HTTP semantics; (3) deterministic retries (backoff for
transients) belong in the *harness*, below the model — don't spend model turns
on what a `for` loop can do.

**Detection.** Trajectory logs: flag runs where the same tool errored ≥3 times, and
runs where an error was followed by the agent asserting a conclusion about the
*task* (error-as-data). **Prevention.** Fault-injection evals: run the agent suite
with each tool forced to fail transiently/permanently/empty; assert the trajectory
shows retry / clean abort / correct interpretation respectively.

## 3. Over-eager vs. under-eager tool invocation

**Failure mode, two-sided.** Over-eager: the model calls tools it doesn't need —
searches for what's already in context, re-reads files, calls a calculator for
2+2 — burning latency and money, and (for side-effectful tools) doing real damage.
Under-eager: the model answers from parametric memory when it should have called
the tool — fabricating a "database lookup" result instead of looking up.
Under-eager is worse: it's a hallucination wearing a tool-use costume.

**War story.** An ops assistant with a `get_current_oncall` tool answered "the
current on-call is Priya" — plausibly, from a stale example in its few-shot block —
without calling the tool. Priya had rotated off two weeks prior. The escalation
went to the wrong person during an incident. The tool worked perfectly; it just
was never called.

**Detection.** Instrument both rates: tool calls per task (trend + outliers) for
over-eagerness; for under-eagerness, eval cases where the *only* correct answer
requires the tool — any correct-looking answer without a tool call in the
trajectory is a fabrication, score it zero even if the answer happens to be right.

**Fix.** Tool descriptions carry invocation policy, not just signatures: "ALWAYS
call this before answering questions about current on-call; never answer from
memory" / "only call when the user explicitly asks to send." Fewer, sharper tools
beat many overlapping ones — overlap creates dithering. For dangerous tools, add
harness-side confirmation gates rather than relying on the model's restraint.

**Prevention.** Tool-invocation assertions in the eval suite: for each eval case,
assert which tools *must* and *must not* appear in the trajectory. This is cheap
(it's a trajectory grep) and catches both failure directions on every prompt change.

## 4. State and context management across multi-step tasks

**Failure mode.** The context window fills with raw tool output — full file dumps,
verbose API responses — and the run degrades in a characteristic arc: sharp early,
then repetitive, then contradicting its own earlier findings, then hitting the
window limit mid-task. Separately: the "lost in the middle" effect — instructions
at turn 1 lose force by turn 40 as they recede into a giant context.

**Detection.** Log tokens-in-context per turn; plot quality-of-action against it.
Runs that fail late with high context are this. The `agent-trajectory-tracer`
subagent looks for exactly this arc (its report calls it "context saturation").

**Fix.**
- **Tools return summaries, not dumps.** A search tool returns titles + snippets +
  IDs, with a separate `fetch(id)` for the one document that matters. Design every
  tool result asking "what does the *next* decision need?"
- **Externalize state.** The agent maintains a scratchpad/plan file via tools
  (read/write), keeping the durable state (findings, decisions, remaining steps)
  outside the fragile context. On context pressure, compact: summarize completed
  work, drop raw intermediates, keep the plan.
- **Re-anchor**: repeat the core task statement and constraints in the harness's
  synthetic messages periodically (e.g., with each budget checkpoint).

**Prevention.** Long-horizon eval cases (20+ turns) in the suite; token-per-turn
budgets with compaction triggers built into the harness from day one — retrofitting
compaction into an agent that assumed infinite context is a rewrite.

## 5. Cost and latency budget per turn

**Failure mode.** Nobody set a budget, so the agent has one implicitly: infinite.
Costs are discovered on the invoice; latency is discovered by users. Per-*task*
thinking hides that agents multiply per-turn costs by an unbounded turn count.

**Fix.** Budget explicitly, per turn and per run:
- **Per turn:** context size cap (see §4), output cap, tool-latency timeout.
- **Per run:** max turns, max dollars (count both directions of tokens), max
  wall-clock — the §1 caps, enforced in the harness, logged when hit.
- **Tier the loop:** the main loop needs a top-tier model
  (`principles/decision-trees.md` §3 — per-step error compounds), but summarization
  of tool output, and routing/triage before the loop, can run a tier down.
  Prompt-cache the stable prefix (system prompt + tool definitions) — in a loop,
  the prefix is re-sent every turn, so caching typically cuts agent input cost
  50–80% (`topics/cost-and-latency.md`).

**Detection/prevention.** Dashboard per agent type: cost per completed task (not
per call), turn-count distribution, budget-hit rate. Alert on p95 drift — turn
inflation is a quality regression that shows up in finance before it shows up in
user reports.

---

## Postmortem quick-reference

| Symptom | First place to look | Doc section |
|---|---|---|
| Ran for an hour, no output | Repeat/no-progress counters (absent?) | §1 |
| Confident answer, wrong facts, tool never called | Under-eager invocation | §3 |
| Same tool erroring repeatedly in trajectory | Error taxonomy in tool results | §2 |
| Sharp start, incoherent finish | Context saturation | §4 |
| Bill spike, quality flat | Turn inflation, cache misses | §5 |

For any nontrivial trajectory autopsy, spawn the `agent-trajectory-tracer`
subagent — reading a 200-turn transcript in your own context window recreates the
§4 failure mode in *you*.

**Related:** `guides/build-a-tool-using-agent.md` (reference implementation of
every mechanism above) · `topics/multi-agent-orchestration.md` (when one loop
becomes several) · `topics/evaluation.md` (trajectory-level evals).
