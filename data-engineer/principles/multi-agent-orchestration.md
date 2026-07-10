# Multi-Agent Orchestration for Data-Engineering Work

**Applies to:** Claude-family agents (Fable/Opus/Sonnet/Haiku) working on data platforms via Skills/Subagents; judgment transfers to any agent harness · **Last verified:** 2026-07-06

This doc is about *how to divide data-engineering work among AI agents* — not about pipelines (the rest of the KB covers those). The organizing insight: **data platforms punish uncoordinated actors with real money and corrupted state**, faster and more expensively than codebases do. A code merge conflict fails loudly in git; two agents backfilling the same table "succeeds" and doubles both the bill and the row counts. Design agent topologies the way you'd design the pipelines themselves: idempotent, gated, and observable.

---

## 1. The two legitimate reasons to split work across agents

1. **Context isolation:** the input volume would poison the coordinating context. Walking a 900-model dbt manifest plus warehouse access history to map a change's blast radius is thousands of lines of reading that the main conversation must not carry — only the verdict matters. This is why `lineage-blast-radius-scanner` and `data-quality-incident-tracer` are subagents, not skills: they read widely, return a page.
2. **Role separation as a control:** the agent that *proposes* a change should not be the agent that *approves its safety*, for the same reason the migration author isn't the migration reviewer. A reviewer sharing the implementer's context inherits the implementer's assumptions — a fresh-context reviewer re-derives the risk from the diff alone, which is precisely its value.

**Not a legitimate reason:** parallelism for its own sake on work that is cheap and sequential. Spawning three agents to write three dbt models that share a staging layer buys coordination risk (§4) to save minutes. Default to one agent; split when one of the two reasons above actually holds.

## 2. The gated pipeline-change topology (planner → impact-gate → implementer → reviewer)

For schema changes and pipeline modifications — the highest-stakes agent-driven work on a platform:

1. **Planner** (main conversation): scopes the change, decides expand/contract phasing per `data-engineer/principles/schema-evolution.md` §3.
2. **Impact gate** (subagent): `lineage-blast-radius-scanner` maps every downstream consumer. **The gate is blocking:** the implementer does not start until the blast-radius report exists, because the report changes *what* gets implemented (a rename with 3 consumers is a view-shim PR; with 60 consumers it's a quarter-long migration). Running impact analysis after implementation is theater.
3. **Implementer** (main or worktree agent): makes the change, including the tests the change requires (`dq-test-planner` skill for new tables).
4. **Reviewer** (skill in a fresh context, or on a human's screen): `schema-change-impact-reviewer` for the schema surface, `pipeline-idempotency-auditor` for the run-safety surface. The reviewer receives the *diff and the blast-radius report*, not the implementer's chat history — inherited context is inherited blind spots.

Humans stay at two points minimum: approving the plan when the blast radius is nontrivial, and merging. An agent may prepare a backfill; a human (or an explicitly granted budget, §4) launches it.

## 3. Fan-out patterns for platform-wide audits

Auditing data quality / idempotency / cost across many pipelines is embarrassingly parallel *reading* — the safe kind of parallelism, because auditors don't write:

- **Shard by ownership boundary** (one agent per domain/DAG-group/dbt project), not by file count — findings need an owner to be actionable, and domain sharding means each report lands on one team's desk.
- **Fix the rubric before the fan-out.** Every worker gets the same checklist (e.g., "apply `pipeline-idempotency-auditor` §checks; report in its format; severity per its rubric"). Without a shared rubric you get N incomparable essays, and the aggregation step becomes a re-audit. The skills in this KB *are* the rubrics — that's half of why they're written as procedures with output formats.
- **Cap severity claims at evidence.** Fan-out workers must quote `file:line` / model names for every finding (the `race-condition-scanner` evidence rule generalizes: if you can't quote it, you didn't find it). Aggregators dedup, rank, and *spot-check a sample* before the report ships — one hallucinated CRITICAL in a platform audit and the whole report loses the room. A 20-model shard's findings are checkable in minutes; check them.
- **Read-only means read-only:** audit agents get warehouse read/metadata credentials, never write. Least-privilege service accounts per agent role (`data-engineer/principles/security-and-governance.md` §2) — this is not paranoia; it converts a misbehaving auditor from an incident into a log entry.

## 4. Failure modes specific to agents on data platforms

| Failure mode | Why agents hit it | Control |
|---|---|---|
| **Redundant backfills** — two agents (or one agent retrying across sessions) each launch the same multi-week backfill; cost doubles, and if the job isn't idempotent, seams duplicate | Backfill state lives in the orchestrator, not in either agent's context; neither can see the other's intent | A backfill *ledger* (audit table: range, table, owner, status) checked-and-written before launch; orchestrator-level concurrency pools as the backstop (`data-engineer/principles/orchestration.md` §4); **hard budget**: agents get per-task spend ceilings, and any backfill estimated over the ceiling requires a human, with the estimate computed per `pipeline-correctness.md` §3 step 2 |
| **Conflicting schema migrations** — parallel agents each add "their" column or both rename the same one; migrations collide, or worse, both apply and consumers see two half-migrations | Schema is global mutable state; git worktree isolation does nothing for a shared warehouse | Serialize DDL per table through the gated topology (§2); one migration owner per table per sprint; CI check that rejects a PR whose migration touches a table with another open migration PR |
| **Agent-written tests that assert the bug** — an agent profiles current (wrong) data and writes tests encoding today's values as truth, freezing the bug in place | Agents anchor on observed data; a human knows revenue can't be negative, the agent sees `min=-4021` and writes `>= -4021` | `dq-test-planner` requires semantic bounds from docs/contracts, profile only for *volume* baselines; human review on generated assertions for tier-1 tables |
| **Retry-storms with side effects** — an agent, seeing a task fail, re-triggers it repeatedly; the task sends emails / calls vendor APIs / appends rows | Agents are tenacious by design; tenacity × non-idempotent side effects = incident | Same rule as for the orchestrator: agents may re-run only tasks audited idempotent; anything with external side effects is re-run by humans or behind a dedup gate (`pipeline-correctness.md` §1) |
| **Stale-lineage confidence** — agent trusts a lineage graph built last quarter, declares a drop safe, drops a table with three live readers | Agents treat retrieved artifacts as current; humans (sometimes) know the map is old | Blast-radius scans must state lineage source + freshness and cross-check against *recent* query history (the scanner's report format requires this field precisely so its absence is conspicuous) |
| **Silent scope creep in "fixes"** — asked to fix one model's null-handling, an agent "improves" six adjacent models, each a small unreviewed schema/semantics change | Helpfulness bias; diffs on data models look small while their blast radius isn't | Review gate diffs the *change surface* against the task scope; out-of-scope model edits are findings, not favors |

The meta-pattern: every one of these is a *coordination-through-shared-state* problem, and the platform's own disciplines — idempotency, ledgers, gates, least privilege, budgets — are the controls. Agents don't need new safety theory; they need the platform's existing safety rails applied to a new class of very fast, very literal operator.

## 5. Model sizing and credentials

- **Small models (Haiku-class) run rubric-shaped work:** fan-out audit shards, test scaffolding from a spec, log triage against known signatures. Their reports are drafts for aggregation, not verdicts. This KB's skills are deliberately written to be executable by small models — explicit checklists, output formats, severity rubrics, no implied context.
- **Frontier models take the judgment seats:** planner, aggregator, incident commander, anything that decides expand/contract phasing or interprets an ambiguous blast radius.
- **Credentials follow role, not model:** reviewers read; implementers write to dev + open PRs; *nothing automated* holds prod DDL or `ACCOUNTADMIN`. Promotion to prod goes through the same CI/CD gate humans use. An agent with prod write credentials isn't an agent, it's an unaudited engineer with no fear response and superhuman typing speed.

---

**See also:** the skills/agents this doc sequences: `schema-change-impact-reviewer`, `pipeline-idempotency-auditor`, `dq-test-planner`, `lineage-blast-radius-scanner`, `data-quality-incident-tracer` · `data-engineer/principles/orchestration.md` §4 (the backfill-storm mechanics agents must respect) · `data-engineer/guides/analyze-existing-platform.md` (the audit these fan-out patterns scale up).
