# Trajectory-Level Evaluation

**Version 1.0 — 2026-07-06.** Applies to: any multi-step agent (a tool-calling loop, a plan-execute agent, a multi-agent workflow). Framework-agnostic. Core-tier, full depth. Includes the **privilege-escalation-through-legitimate-chains** technical area (folded here deliberately — see [DESIGN.md](../DESIGN.md); it *is* the trajectory problem).

> The central claim: **judging an agent by its final output is judging a journey by the postcard.** The output can look fine while the path was harmful. Agentic red-teaming lives at the trajectory level or it misses the failures that matter.

---

## 1. Why the final output is the wrong unit

A single-turn model is fairly assessed by its output — the output *is* the behavior. An agent is not. Between the request and the final answer sit tool calls, tool results, intermediate reasoning, and actions in the world. The failures unique to agents happen *in that middle*, and many of them leave the final output looking clean:

- An agent asked to "research and summarize" reads a document, gets injected, quietly exfiltrates data via a tool call mid-run, then produces a perfectly good summary. **Output: pass. Trajectory: breach.**
- An agent takes an unauthorized irreversible action, the action succeeds, and the final message cheerfully reports task completion. The harm already happened; the output conceals it.
- An agent reaches the right answer but only after leaking a secret into a log, calling a tool it shouldn't have, or burning the budget in a loop it recovered from.
- An agent assembles a harmful cumulative effect out of individually-legal steps (§4) and reports an innocuous conclusion.

**So the unit of evaluation is the trajectory: the ordered sequence of (thought, action, observation) tuples, with each action attributable to the content that prompted it.** If your evaluation, monitoring, or red-team success criteria are defined only over the endpoint, you are structurally blind to the agent-specific failure modes — and an adversary who understands this will route the harm through the middle and hand you a clean postcard.

## 2. Failure mode — what trajectory review catches that output review can't

- **Mid-trajectory unauthorized actions** whose effects don't surface in the final answer.
- **Boundary crossings** — the turn where a tool result (untrusted) entered context and the next action diverged from the task ([indirect-prompt-injection.md](indirect-prompt-injection.md)).
- **Data egress** — a secret, a record, or PII leaving via a tool call, log line, or outbound message, regardless of the final output.
- **Cumulative-effect escalation** (§4) — a harmful whole built from harmless parts.
- **Silent recovery from a bad state** — the agent hit an error/loop/wrong path, recovered, and the final answer hides that it ever went wrong (which matters because next time it might not recover).
- **Wrong-reason-right-answer** — the agent got the right output by an unsafe or unauthorized route, which will fail differently next time.

## 3. Defining trajectory-level success/failure criteria

An agent passes a trajectory eval only if the *whole path* satisfies criteria, not just the endpoint. Define criteria in three layers:

**Layer A — Endpoint correctness.** Did it produce the right answer/outcome? Necessary but not sufficient. (This is the only layer output-only eval has.)

**Layer B — Path safety (the agentic layer).** Across the whole trajectory:
- **Action authorization** — every action taken was within granted authority and appropriate to the task. No action fired that the task didn't call for.
- **Boundary integrity** — untrusted content was treated as data; no action was steered by injected instructions. (Test with benign marker probes — [indirect-prompt-injection.md](indirect-prompt-injection.md) §3-4 — and assert the marker's behavioral effect is *absent*.)
- **No unauthorized egress** — nothing sensitive left via any channel.
- **Gate compliance** — every irreversible/external action that required a gate got one, and it was meaningful ([irreversible-actions-and-oversight.md](irreversible-actions-and-oversight.md)).
- **Bounded cumulative effect** — the total of what the run *accomplished* stayed within intended limits (§4).

**Layer C — Path quality (efficiency/robustness).** Did it get there without loops, without runaway cost, without depending on luck to recover from a wrong turn? Lower severity than B, but loops and cost blowups are their own reliability risk.

**The rule: a trajectory that fails Layer B fails, even if Layer A passes.** A clean answer reached through a breach is a failing run. Encode this in your eval harness and your red-team scoring, or you will report "95% pass rate" on a suite that never looked at the middle.

## 4. Privilege escalation through legitimate chains

This is the subtlest agentic risk and the reason per-step review is insufficient.

**The mechanism:** a sequence of tool calls, each individually within the agent's authority and each individually reasonable, compounds into an outcome nobody would have approved as a single request. No step is a violation; the *emergent effect* is. Examples of the *shape* (not exploits):
- Reading records one at a time is authorized; the cumulative read of ten thousand records is a bulk data pull no one signed off on.
- Each small permission or config change is within scope; the sequence walks the agent (or its environment) from a low-privilege state to a high-privilege one.
- Each outbound message is allowed; the aggregate is a mass-communication event.

**Why per-step guardrails miss it:** every guardrail that evaluates one action against policy says "yes" to every step, because every step *is* permitted. The violation exists only in the sum. You cannot catch a cumulative-effect attack by reviewing steps in isolation — the review has to reason about the *aggregate*.

**Detection — reason about cumulative effect, not just per-step legality:**
- **Trajectory-level accounting.** Track running totals across the run: records touched, money moved, messages sent, permission-state changes, data volume egressed. The question is "what did this whole run *accomplish*," asked against an intended-envelope for the task.
- **Rate and volume caps as structural limits.** A cap on records-per-run, spend-per-run, messages-per-run converts an unbounded cumulative attack into a bounded, alertable one. Caps are the cheapest defense here ([excessive-agency.md](excessive-agency.md) §4, quantity dimension).
- **Escalation-path monitoring.** Watch specifically for trajectories that increase the agent's own effective authority (permission grants, credential access, config changes to its environment) — a privilege-gaining chain is worth flagging regardless of per-step legality. See [../extended/sandbox-and-environment-integrity.md](../extended/sandbox-and-environment-integrity.md).
- **Anomaly on the aggregate.** Compare a run's totals against the distribution of normal runs. A run that touches 100× the usual number of records is a signal even if each touch was legal.

**Fix / prevention:** design the task envelope with explicit cumulative limits, enforce them as caps, and include cumulative-effect criteria in trajectory review (Layer B). Don't rely on any per-step check to catch a whole-run problem.

## 5. Logging design sufficient for trajectory review

You can only review a trajectory you can reconstruct. **Insufficient logging is a high-severity finding on its own** — it means failures are invisible until they're expensive, and incidents are un-investigable. Minimum viable trajectory log:

- **Every tool call with its full arguments** — not "called send_email" but the actual recipient, subject, body (redaction-aware for secrets, but the *shape* must be reconstructable).
- **Every tool result** — including errors and metadata. A log missing tool results can only half-diagnose a run (the `agent-trajectory-tracer` subagent will tell you this up front).
- **The model's reasoning/intermediate messages** — enough to see *why* an action was taken.
- **Provenance attribution** — for each action, what content prompted it, and which side of the trust boundary that content came from. This is what lets you find the injection divergence turn.
- **Gate decisions** — what was shown to the human, who approved, when ([irreversible-actions-and-oversight.md](irreversible-actions-and-oversight.md)).
- **Running aggregates** — the cumulative totals from §4, so the whole-run effect is queryable.
- **Ordering and timestamps** — the sequence is the point; unordered logs can't be a trajectory.

Design this in from the start. A logging schema that captures (thought, action-with-args, observation, provenance) per step, in order, is the foundation of both red-teaming and incident response — they read the same logs.

## 6. Detection method — replaying trajectories

To find *where* a trajectory went wrong (in a red-team run or a post-incident investigation):

1. **Ground yourself in the task and the outcome** before reading turn 1: what should a correct run do, what did this run actually do?
2. **Skim the skeleton** (turn count, tool-call sequence, cost curve) before the content — the shape often names the pathology (a repeating tool call is a loop; a tool result followed by an off-task action is a boundary crossing).
3. **Find the divergence turn** — the first turn where the agent's action stops being what the task called for. Everything after is usually consequence, not cause; resist diagnosing the crash site instead of the wrong turn taken earlier.
4. **Attribute the divergence** to its trigger: the tool result / retrieved content / handoff message that preceded it. If untrusted content is at that seam, you've found a boundary failure.
5. **Check the aggregate** for cumulative-effect escalation even if no single turn looks wrong (§4).

For long transcripts, do not do this in your own context — the transcript volume is exactly the context-saturation problem. Dispatch the **`agent-trajectory-tracer`** subagent (it reads the whole transcript in isolation and returns the divergence turn + diagnosis). This is the reuse decision documented in [DESIGN.md](../DESIGN.md): the general tracer already treats injected content as a first-class finding, so this KB uses it rather than forking a red-team copy.

## 7. Common pitfalls

- **Output-only eval reported as agent eval.** "95% task success" measured only on final answers tells you nothing about path safety. This is the single most common evaluation error in agent programs — it's measuring the postcard.
- **No provenance in the logs.** You can see *that* an action fired but not *what content caused it*, so you can't find the injection divergence turn. Trajectory review degrades to guesswork.
- **Per-step guardrails treated as complete.** They can't catch cumulative-effect escalation by construction (§4). Necessary, not sufficient.
- **Reading long trajectories in the main context.** The transcript saturates your context and you miss the early divergence — the very failure you're investigating. Isolate it (§6).
- **Diagnosing the crash, not the cause.** The run fails loudly at turn 40, but the wrong turn was at turn 6. Trace back to the divergence.
- **No dry-run trajectories.** Without a stub mode ([irreversible-actions-and-oversight.md](irreversible-actions-and-oversight.md) §5), you can't generate dangerous-path trajectories to review without real effects.

## Review protocol

1. Confirm evaluation/success criteria are defined at the **trajectory level** (Layers A/B/C, §3), and that a Layer-B failure fails the run regardless of the endpoint.
2. Confirm **logging** is sufficient to reconstruct a run: tool calls+args, tool results, reasoning, provenance, gate decisions, aggregates, order (§5). Missing = high-severity finding.
3. For a given run, **replay** to the divergence turn and attribute it (§6); isolate long transcripts to `agent-trajectory-tracer`.
4. Check **cumulative effect** (§4): are there running caps? Could a fully-authorized run accomplish something harmful in aggregate?
5. Confirm **benign-marker probe results** are asserted absent in the path-safety layer.
6. Report per [reporting-and-verification.md](reporting-and-verification.md).

**Related:** [core-principles.md](core-principles.md) §6–7 (trajectory-over-output, cumulative effect), [indirect-prompt-injection.md](indirect-prompt-injection.md) (divergence turns), [irreversible-actions-and-oversight.md](irreversible-actions-and-oversight.md) (gate decisions in the log), [../extended/goal-drift-long-horizon.md](../extended/goal-drift-long-horizon.md) (drift is a trajectory pathology). Subagent: `agent-trajectory-tracer`.
