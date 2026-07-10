# Multi-Agent Orchestration for Game Engineering Work

**Applies to:** teams using AI agents (Claude Code or similar) on game codebases; assumes the reader is the *orchestrating* agent or the human directing one.
**Last reviewed:** 2026-07-06.
**Related:** the three subagents this KB defines (`frame-profiler-analyzer`, `save-state-auditor`, `allocation-hotspot-scanner`), the skills (`gc-allocation-auditor`, `netcode-desync-reviewer`, `frame-budget-planner`), and [../guides/analyze-existing-project.md](../guides/analyze-existing-project.md) (which orchestrates several of them).

This doc is about running agents on *game* code specifically — where the generic multi-agent advice breaks. Game codebases have three properties that change the calculus: correctness is often *determinism* (invisible to a compile-and-test loop), the ground truth is often *a profiler capture or a feel test* (not reachable from code reading), and much of the "code" is *binary scene/prefab/asset data* that agents corrupt rather than merge.

---

## 1. When to split roles at all

Default: **don't.** A single agent with the right skill (e.g. `gc-allocation-auditor` on a diff) beats an orchestra for any task that fits in one context window. Split when one of these forcing functions is real:

1. **Context isolation** — the input is huge and the output is small. Profiler captures (`frame-profiler-analyzer`), whole-repo allocation sweeps (`allocation-hotspot-scanner`), serialization audits across historical formats (`save-state-auditor`). The subagent exists to *absorb* megabytes and return a page.
2. **Independence** — N systems need the same bounded audit and don't share state (§4 fan-out).
3. **Adversarial separation** — implementer and reviewer roles genuinely catch more when the reviewer hasn't watched the implementation rationalize itself. Worth it for: netcode features (implement, then `netcode-desync-reviewer` in a *fresh context* so the reviewer doesn't inherit the implementer's assumptions about what's deterministic), and performance work (the implementer claims a win; a verifier agent re-runs the capture and checks the claim against [performance doc §2](performance-and-frame-budgets.md)'s before/after rule).

## 2. Planner / implementer / reviewer for game features — the working split

For a feature like "add a grappling hook to a networked character controller":

- **Planner** (or the human): produces the *authority split* ([security doc §2](security-and-anti-cheat.md): predicted vs validated vs server-only), the frame budget line (`frame-budget-planner` skill), and the determinism constraints, *before* implementation. In game work the plan artifact that matters is not a task list — it's these three contracts, because they're the things an implementer will silently get wrong and a reviewer can mechanically check.
- **Implementer:** writes sim code + tests against those contracts. Must run: determinism suite, allocation gate, and the netcode latency-tier tests locally ([testing doc §8](testing-and-determinism.md)) — an implementer agent that only compiles and unit-tests has *not tested game code*.
- **Reviewer:** fresh context; runs `netcode-desync-reviewer` + `gc-allocation-auditor` skills against the diff, checks the contracts from the plan, and — critically — has the *authority to demand a capture* rather than accept a performance claim from prose.

## 3. Game-specific failure modes of agent work (learn these before delegating)

1. **Agents introduce nondeterminism that passes all visible tests.** An agent "fixing" a bug adds `Dictionary` iteration, an unseeded `Random`, a wall-clock read, or parallel accumulation in sim code. Everything compiles, unit tests pass, the game plays fine — and replays/rollback break in a way nobody notices for weeks ([networking doc §5](networking-and-multiplayer.md) root causes 2, 3, 7). **Mitigation:** the determinism trace suite must be in the merge gate agents use, and the `netcode-desync-reviewer` checklist runs on *every* agent-authored sim diff, even "trivial" ones — especially trivial ones; that's where the RNG sneaks in.
2. **Concurrent scene/prefab edits destroy each other.** Two agents editing one Unity scene or UE map = a YAML/binary merge that silently drops one agent's work or corrupts the file. **Mitigation:** partition by *file ownership, not by task* — an agent's writable set must be disjoint from every concurrent agent's; scene/prefab/asset files are single-owner locks always ([asset doc §6](asset-pipeline-and-memory.md)). Code files fan out fine; content files never do.
3. **Agents optimize against the wrong signal.** Told "reduce frame time," an agent will happily win the benchmark scene while regressing p99 in real gameplay, or trade memory it can't see for time it can. **Mitigation:** give agents the *budget table*, not a single number, and require the standard capture flythrough as evidence ([performance doc §2](performance-and-frame-budgets.md)).
4. **Agents can't feel.** No agent output about game feel, camera comfort, or input latency perception is evidence. Agent work stops at "mechanically correct + within budget + deterministic"; a human plays it before it's *done* ([testing doc §7](testing-and-determinism.md)).
5. **Editor-coupled state.** Much game work only manifests in the running editor/build (serialized fields, prefab overrides, shader compiles). An agent reporting success from code-reading alone is reporting a hypothesis. Require play-mode/headless-boot verification in the loop where the harness allows it.

## 4. Fan-out patterns that work

**Audit fan-out (the big one):** N independent workers × one bounded rubric × structured findings back to an aggregator. Good units of fan-out: per-system allocation audit (worker per subsystem directory, `allocation-hotspot-scanner` rubric), per-scene asset-budget audit, per-message-type validation audit ([security doc §2](security-and-anti-cheat.md)), save-migration coverage per version pair. Rules: workers are **read-only** (findings, not fixes — parallel fixers recreate failure mode #2); the rubric fixes the output schema (`file:line, failure class, evidence, severity`) so the aggregator can dedupe and rank; the aggregator — not the workers — decides remediation order against the budget tables.

**Fix fan-out (use sparingly):** only after an audit produced a *verified* finding list, only on code files, with disjoint file sets per worker and the full game gate (determinism + allocation + perf) on the merged result — not per-worker gates alone, because interactions between "independent" fixes are exactly what game state is good at.

**Long-pole pipeline:** profiler capture → `frame-profiler-analyzer` (isolate, attribute) → human/orchestrator picks targets against budget → implementer agent per target (disjoint files) → verifier re-captures. This is the highest-leverage agent pipeline in game work because the capture analysis is tedious, mechanical, and context-heavy — ideal agent food — while target selection stays judgment.

## 5. What to keep in the orchestrator's hands

Authority-split decisions, tick-rate/timestep/netcode-model choices ([game-loop](game-loop-and-timing.md) §1, [networking](networking-and-multiplayer.md) §1 — these are frozen-after-week-one decisions no agent should reopen incidentally), budget table changes, anything touching the save format (agents propose migrations; a human approves format changes because the blast radius is every existing player — [save doc §3](save-load-and-versioning.md)), and ship/no-ship performance judgment. The pattern behind the list: **agents execute within contracts; contracts change only at the top.**
