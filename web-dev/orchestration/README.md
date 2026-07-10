# Multi-Agent Orchestration for Web-Dev Work

**For:** whoever is deploying AI agents (Claude Code sessions, subagents, or agent teams) on web development tasks. **Date:** 2026-07-06.
**This is not web-dev knowledge** — it's how to run a *team* of agents doing web-dev work. The web-dev judgment lives in the rest of this tree; this doc is about division of labor, and it borrows its instincts from running human engineering teams, because the failure modes rhyme.

## The first question: do you need more than one agent at all?

**One agent is the default**, and it's the right answer more often than the multi-agent literature suggests. Every additional agent adds: context-transfer loss (the new agent knows nothing you didn't write down), coordination overhead, and conflict surface. The parallel with human teams is exact — you don't staff a project to five people because five sounds thorough; you staff it when the work *decomposes*.

Split when at least one of these is true:

1. **Context isolation** — the task produces 10x more intermediate noise than conclusions (reading a whole repo, exhaustive dependency audits, big log analysis). This is the subagent case (`DESIGN.md`'s third primitive): dispatch, get the one-page answer back, keep the main context clean. The `legacy-project-onboarder` and `dependency-security-scanner` agents exist for exactly this.
2. **True parallelism** — independent work items with **disjoint write sets** (different packages, different routes, frontend vs backend halves of an agreed contract). Independence is a property of the *file graph*, not the task list: two "independent" features that both touch the router config are not independent.
3. **Adversarial separation** — reviewer/auditor roles benefit from *not sharing* the author's context and assumptions. A fresh-context reviewer catches what the author-agent rationalized, for the same reason human review works better than self-review. (This is why the `security-auditor` and `code-review` flows deliberately start cold.)

Anti-reasons that produce worse outcomes: "the task is big" (a big *sequential* task wants one agent with a good plan, not five agents sharing a mush of partial context); "multiple perspectives" on the same files (you'll get merge conflicts styled as insight); role-playing an org chart (PM-agent/architect-agent/dev-agent theater burns tokens re-explaining context that one agent would simply have).

## The patterns that work

### Fan-out / fan-in (research & audit)
Parallel *read-only* agents over disjoint slices (per package, per framework directory, per finding category), each returning a structured summary against the **same output schema** you specified up front; the orchestrator merges. Fan-in discipline: if you didn't fix the output format before dispatch, you'll spend the merge normalizing prose. This is the highest-success-rate pattern because read-only work can't conflict.

### Planner / implementer split (sequential, one at a time)
A planning pass (possibly with a stronger model) produces an explicit plan — files to touch, contracts, test strategy per `principles/testing.md` — then implementation executes it. The value isn't the role separation; it's that **the plan is a written artifact the human can review before code exists** (cheapest possible intervention point). Merge the roles back into one agent for small tasks; the artifact matters, not the headcount.

### Implementer + fresh-context reviewer loop
Author agent implements; reviewer agent (cold context, armed with the relevant `frameworks/<x>` docs or the `react-code-reviewer` skill) reviews the diff; author addresses findings. One round-trip catches most of what it will ever catch — unbounded author/reviewer loops converge on style debates, exactly like human nitpick spirals. Cap it at two rounds, then a human decides.

### Contract-first parallel implementation
The only safe way to parallelize *writes*: agree the interface **first** (OpenAPI schema, TS types package, component props), commit it, then frontend-agent and backend-agent build against the frozen contract with MSW/stub servers in between (the contract-testing machinery from `principles/testing.md` §contracts, reused as a coordination protocol). Contract changes mid-flight go through the orchestrator, never unilaterally — the same rule that governs human API teams, for the same reason.

## Failure modes specific to multi-agent coding

- **Conflicting edits:** two agents touch the same file; last-write-wins destroys the first agent's work, or a mangled merge ships. *Prevention:* partition by write set before dispatch (explicit file/directory ownership per agent); isolation via worktrees/branches with a real merge step; treat any overlap discovered mid-flight as a stop-and-reassign event, not something to merge through.
- **Context loss at handoffs:** Agent B doesn't know the constraint Agent A discovered ("we can't upgrade X because Y") and undoes or re-violates it. The human-team analogue is tribal knowledge; the fix is the same: **decisions live in written artifacts, not in heads/contexts** — a running `DECISIONS.md`/plan file that every agent reads on start and appends to. If a handoff matters, the handoff *is* a document.
- **Redundant work:** two agents independently install different date libraries, write two `formatCurrency`s, or re-derive the same analysis. *Prevention:* the orchestrator owns a work ledger (task list with claims); shared-utility creation is centralized ("if you need a new shared module, request it, don't write it").
- **Compounding assumption drift:** Agent A guesses an ambiguous requirement, B builds on A's guess, C on B's — by the fan-in, the guess is load-bearing architecture. *Prevention:* ambiguities resolve *upward* (back to the orchestrator/human) before dependent work dispatches; a wrong guess caught at fan-in costs everything built on it.
- **Reviewer capture:** the "independent" reviewer agent is fed the author's summary and rubber-stamps it. Give reviewers the *diff and the docs*, not the author's narrative — the fresh context is the entire point (adversarial separation, above).
- **Merge-time integration debt:** N agents' branches each pass their own tests and fail integration (the contract drifted, shared config diverged). *Prevention:* integrate continuously (small merges to a shared integration branch with CI) rather than one big-bang fan-in — yes, the same lesson the industry learned about human feature branches in 2010.

## Sizing guidance (rules of thumb)

- Audit/research on a repo ≥ moderate size → 1 orchestrator + fan-out read-only subagents per slice.
- Feature in one area → **one agent**, plan artifact first, optional cold reviewer at the end.
- Feature spanning frontend+backend → contract-first, then at most 2 writers + 1 reviewer.
- More than ~4 concurrent writers is a smell at any scale I've seen — coordination cost grows faster than throughput, which is Brooks's Law, which was never really about humans.

## The meta-rule

Every pattern above is a written-artifact discipline wearing an org chart: plans, contracts, decision logs, output schemas, ownership maps. **Agents don't share consciousness any more than engineers do** — the team that writes things down outperforms the team that vibes, at any headcount, silicon or otherwise.
