# Multi-Agent Orchestration for Backend Work

**Last reviewed:** 2026-07-06. Written for Claude Code-style agent harnesses (a main agent that can spawn subagents with scoped tools and isolated context windows); the principles transfer to any orchestrator.
**Related:** [DESIGN-NOTES.md](../DESIGN-NOTES.md) (why each subagent in this KB exists), `.claude/agents/` (the concrete subagents), [guides/analyze-existing-service.md](../guides/analyze-existing-service.md) (a worked fan-out example).

This doc is about *orchestrating agents on backend engineering tasks* — not about backend engineering. The failure modes here are new: they come from parallelism over a **shared mutable substrate** (one codebase, one schema, one database), which is exactly what backend work is. Most multi-agent advice assumes independent work items; a schema is the opposite of independent.

---

## 1. The one question before splitting: is the state shared?

Decision tree for parallelizing backend work across agents:

- **Read-only over disjoint or shared material** (audit 12 services, scan a codebase, summarize logs) → **fan out freely.** Reads don't conflict; this is where multi-agent shines.
- **Writes to disjoint files/modules with a stable interface between them** (implement 3 independent endpoints against a frozen OpenAPI spec) → parallelize **after** the contract is fixed. The contract-freezing step is the orchestration; skipping it yields N incompatible interpretations.
- **Writes to shared state** — the schema, a shared module, a config file, *the database itself* → **serialize.** One agent owns the mutation; others consume its output. Parallel agents editing migrations are the multi-agent version of the dual-write bug ([concurrency.md](concurrency.md) §5): each is locally correct, the interleaving corrupts.
- **Not sure?** Serialize. The cost of unnecessary serialization is latency; the cost of wrong parallelism is a broken merge, a doubled migration, or a corrupted dev database — and diagnosing agent-interleaved damage is worse than diagnosing your own.

## 2. Planner / implementer / reviewer — when the split earns its cost

Splitting roles costs context handoff (each agent starts cold — everything it must know travels in the prompt or in files). The split pays when the roles need **different context shapes** or **independent judgment**:

- **Planner separate from implementer** when the plan requires reading far more than the implementation touches (plan a refactor by reading 60 files; implement by editing 6). The planner's exploratory noise would poison the implementer's context. Deliverable between them: a *written plan file* listing exact files, exact changes, and the contract to preserve — not a chat summary. Prose plans degrade; file paths and function signatures don't.
- **Reviewer separate from implementer** when you want *genuinely* independent judgment: an agent reviewing its own diff in the same context window is anchored on its own reasoning and will re-approve its own mistake (same failure as human self-review, mechanized). A fresh-context reviewer sees the diff cold — this is why `migration-safety-reviewer` runs as a Skill invoked on the diff, not as a "now double-check yourself" step, and why a schema-change review can run *in parallel with* the implementation agent finishing tests: review of artifact A while artifact B proceeds is safe parallelism (reads only).
- **Don't split** for small bounded tasks. A one-file bugfix orchestrated across planner/implementer/reviewer is three cold starts and two lossy handoffs to replace one competent pass. Orchestration overhead is roughly constant per agent; it only amortizes over enough work.

## 3. Fan-out patterns for auditing many services

The canonical backend use case: run the same analysis across N repos/services (find every service missing idempotent consumers; audit all connection-pool configs against [data-layer.md](data-layer.md) §4).

- **Fixed rubric, per-service agent, structured output.** Every fanned-out agent gets the *same* prompt template: the checklist to apply, the exact output schema (fields, severity enum, evidence format: `file:line` + quoted snippet). Free-form findings from N agents cannot be aggregated; you'll spend the saved time re-reading N essays. Define the output schema *before* the first spawn.
- **Bound each agent's scope explicitly:** "service X, directories `src/` and `migrations/`, read-only, produce ≤ 15 findings ranked by severity." Unbounded scans produce unbounded noise, and agents (like juniors) will fill any scope you leave open.
- **Evidence or it didn't happen:** require `file:line` and a quoted snippet for every claim. Agents *will* report plausible-sounding issues that don't exist — pattern-matched from training rather than found in the code. Unverifiable findings are worse than none because each costs human time to disconfirm; make un-evidenced findings invalid by schema.
- **Aggregate with a dedicated pass:** a final agent (or the orchestrator) that merges, deduplicates cross-service findings ("all 12 services share the same broken retry config" is one finding, not twelve — and it points at the shared template as the real fix), and re-ranks globally. Skipping the merge step turns 12 tidy reports back into noise.
- **Cap concurrency** against shared resources: 12 agents each running the test suite, cloning repos, or opening DB connections at once is a self-inflicted thundering herd ([concurrency.md](concurrency.md) §6 applies to your own tooling). Stagger or pool.

## 4. Failure modes specific to backend multi-agent work

| Failure mode | What it looks like | Prevention |
|---|---|---|
| **Conflicting migrations from parallel agents** | Two agents each add migration `0042_*.py` / both `ALTER` the same table; merge passes textually, deploy breaks or double-applies | Schema changes are a **serialized resource**: one agent owns all migrations for a work batch; others submit *requests* for schema change to it. CI gate: migration sequence numbers/graph must be linear |
| **Redundant expensive scans** | Three subagents each run the full test suite / full-repo grep / `EXPLAIN` on the same 50 queries — 3× wall time, 3× cost, and possibly 3× load on a shared dev DB | Orchestrator runs shared-expensive steps **once**, writes results to a file, passes the path to each agent. Artifacts > repeated work |
| **Contract drift between parallel implementers** | Agent A implements the producer, agent B the consumer, each "improves" the message schema slightly | Freeze the contract in a file (OpenAPI/proto/JSON Schema) before fan-out; both agents get it read-only; contract tests ([testing.md](testing.md) §3) verify both sides against the *file*, not against each other's code |
| **Stale-context overwrite** | Long-running agent A finalizes a file it read an hour ago, silently reverting agent B's merged change — the multi-agent lost update ([concurrency.md](concurrency.md) §1) | Re-read before write; keep agent leases on files disjoint; rebase-and-rerun-checks as the last step of any long-running agent |
| **Confident nonsense at scale** | Fan-out returns 60 findings, 20 fabricated; humans burn a day disconfirming | Evidence-required schema (§3); spot-verify a sample before acting on the batch; track per-rubric false-positive rates and tighten prompts |
| **Agent hammers production-grade resources** | An "analyze the DB" agent runs `SELECT count(*)` on the 2B-row table, or worse, an unbounded `EXPLAIN ANALYZE` (which *executes*) | Tool allowlists: analysis agents get read-only DB users with `statement_timeout`, never write creds. The same least-privilege you'd give a new hire ([security.md](security.md)) |
| **Context poisoning of the main thread** | Main agent pastes 5,000 lines of logs/scan output into its own window, then makes worse decisions afterward | That's what subagents are *for*: high-volume evidence stays in the subagent; only the structured conclusion returns. See [DESIGN-NOTES.md](../DESIGN-NOTES.md) |

## 5. Handoff hygiene (the protocol details that decide success)

1. **Every handoff is a file, not a vibe.** Plans, findings, contracts, and status live in files with defined formats. Chat-history handoffs lose the one detail that mattered.
2. **Instructions must be self-contained** — the receiving agent has *none* of your context. Name absolute paths, exact commands, the definition of done, and what to do on failure. Writing the handoff is where you discover your own plan's holes; that's a feature.
3. **Verification is part of the handoff:** every delegated task carries its acceptance check ("tests X, Y pass; `oasdiff` reports no breaking changes"). An agent's "done" without a mechanical check is a claim, not a result — trust but verify, where verify means *run something*.
4. **Budget explicitly:** max files to touch, max findings, time/turn bounds. Agents don't self-limit; unbounded delegation returns either nothing or everything.
5. **One writer per artifact per phase.** The entire discipline of this doc in one line — it's [concurrency.md](concurrency.md)'s single-writer principle applied to agents, and it prevents 80% of the table above.
