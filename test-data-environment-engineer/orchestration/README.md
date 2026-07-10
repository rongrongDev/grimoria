# Multi-Agent Orchestration for Test Data & Environment Work

> Last reviewed: 2026-07-09. Assumes an agent runtime with isolated-context subagents and tool allowlists (Claude-class). Generic multi-agent theory for test *automation* work lives in `../../test-automation-engineer/principles/multi-agent-orchestration.md` and `../../quality-dev/orchestration/README.md`; this doc covers only what is different when the work is **data and environments** — where agents hold credentials to real substrate, mistakes cost money and compliance exposure, and "done" is a *measured* property.

## What's different about this domain

Three properties change the orchestration calculus versus code-writing agents:

1. **Actions are stateful and priced.** An agent that writes bad code produces a red diff; an agent that provisions environments produces a cloud bill and a drift surface. Reversibility must be designed in, not assumed.
2. **The substrate is shared.** Parallel agents touching the same database/environment collide exactly like parallel teams do — every failure mode in `../principles/environment-lifecycle-and-contention.md` applies to agents, with less common sense and more speed.
3. **Safety claims require verification, not inheritance.** "This dataset is masked" is a claim with a measurement protocol behind it. An agent that inherits the claim without the measurement propagates it into places the original sign-off never covered.

## Role splits that earn their coordination cost

**Gate pattern — reviewer with veto, different context than the builder.** The masking pipeline built (or modified) by one agent is *never* self-certified: a separate `masking-coverage-reviewer` execution — fresh context, only the config + schema + scanner report as inputs — issues the PASS/FAIL before any prod-derived byte flows. The isolation is the point: the builder's context is contaminated with its own intentions ("I masked all the fields I knew about"); the reviewer's coverage diff starts from the schema, which is precisely the discipline the human version of this review requires (`../principles/masking-and-anonymization.md` failure mode #1). Same pattern gates subset re-cuts (validation epilogue by a non-builder) and parity-sensitive environment changes.

**Sentinel pattern — scheduled watchers filing findings, never fixing.** The standing-operations table in `../guides/build-a-platform-from-scratch.md` is natural scheduled-agent work: weekly shape-diff (staleness), reconciliation (orphans), state-diff canary (leakage), monthly `environment-parity-auditor` on release-gating environments, quarterly `pii-field-scanner` re-sweep. Sentinels are read-only by construction and file findings for humans/owning teams — a sentinel empowered to "fix" drift by mutating environments is an unattended state-changer, and unattended state-changers are how in-flight suites die (`../principles/environment-lifecycle-and-contention.md` failure mode #4). The one exception: reapers acting on expired TTLs under the lease protocol, because that contract was designed for unattended execution.

**Fan-out pattern — per-service audits with a merging planner.** Masking coverage across 30 services, or the assessment guide's steps 2–5 across many environments: one planner shards the work (one schema/environment per subagent — shard boundaries must follow *substrate* boundaries, see failure mode #2), each runs the relevant skill/agent procedure isolated (the volume argument: 30 schemas of scan output cannot share one context), and the planner merges *structured outputs only* — the output contracts in this KB's skills/agents are designed as merge keys. The planner's second job is cross-shard analysis the shards can't see: the same quasi-identifier combination appearing in multiple services' "clean" reports is a *join risk across datasets* — invisible to every per-service reviewer, real to an attacker holding both datasets (failure mode #3).

## Failure modes specific to agents on this substrate

### 1. Agents provisioning redundant long-lived environments

**What happens.** An agent needing a test environment provisions one (correct), fails or gets interrupted before teardown (routine), and the next invocation — with no memory — provisions another. Repeat at agent speed: the orphan-accumulation problem (`../principles/environment-lifecycle-and-contention.md` failure mode #3) with the human rate limiter removed. Variant: an agent "helpfully" keeping an environment warm for next time, i.e., autonomously creating a snowflake.

**Controls.** Agents provision only through the same tagged pipeline humans use — TTL + owner (the *agent task ID*, so reconciliation can trace debris to its creator) + purpose tags enforced at creation; the reaper needs no special agent-awareness because the tags carry everything. Budget caps per agent identity (quota on concurrent environments — an agent that hits its cap and has to reuse/wait is functioning correctly). Agent instructions state the check-before-create rule: query for an existing tagged environment from a prior attempt *first*; adopting your own debris beats duplicating it.

### 2. Parallel agents colliding on shared test data

**What happens.** Fan-out shards run "independently" against the same database or environment: agent A's canary state-diff counts agent B's in-flight writes as leakage (false positive); two agents' fixture writes collide on unique constraints; an agent running the assessment guide's double-build determinism test sees another agent's mutations as non-determinism. Wrong findings are worse than crashes — they get *filed* and then someone spends a week on a phantom.

**Controls.** Shard boundaries = substrate boundaries: no two concurrent agents share a mutable database/schema/namespace unless both are read-only, and "read-only" is enforced by the credentials issued to the agent (tool allowlists like the ones on `../agents/*.md`), not by prompt text. Mutating agents take the same lease consumers take (`../principles/environment-lifecycle-and-contention.md` failure mode #4) — the lease protocol was built for exactly this and doesn't care that the consumer is an agent. Canary/measurement agents check the lease table for concurrent activity and *abstain* ("environment busy — measurement invalid, rescheduled") rather than measure a contaminated window; an abstention is a correct output.

### 3. An agent treating "masked" as a property instead of a claim

**What happens.** The subtlest and most consequential one. An agent is asked to move/copy/hand a dataset somewhere and finds evidence of masking (a config exists, a pipeline ran, a column looks fake) — and infers *safe*. But the masking sign-off was scoped: to a trust boundary (staging, engineering-only), to a schema version (three migrations ago), to a corpus (k measured on the full dataset, not the slice being copied — `../patterns/production-scale-subsetting.md` pattern 5). The agent's copy exits the scope: to a demo environment with broader access, to a vendor, into a fine-tuning corpus, into a ticket as "sample data." Every one of those is the re-identification war story (`../principles/masking-and-anonymization.md`) waiting for an audience — executed faster and with better plausible deniability than any human shortcut.

**Controls.** The rule agents must carry verbatim: **"masked" is a claim about a dataset × boundary × version triple; moving the dataset invalidates the triple.** Mechanically: any agent action that copies prod-derived data across a boundary requires the manifest (`../principles/data-refresh-and-versioning.md` failure mode #4) to show a k-report valid for *this* artifact, and the destination's access scope ⊆ the sign-off's assumed boundary — a check that fails *closed*: no manifest, no movement, escalate to the pipeline owner. This is the compliance decision tree (`../principles/compliance-and-governance.md`) with the human judgment replaced by its written-down preconditions, which is the only form of that judgment an agent should be trusted with.

### 4. Sentinel findings rotting into noise

**What happens.** The scheduled auditors work; their findings pile up unactioned; humans learn to skim past the weekly report — and the one week the parity audit catches the `statement_timeout`-class divergence that matters, it's paragraph 40 of a report nobody reads. The agent equivalent of alarm fatigue, arriving faster because agents never get bored of filing.

**Controls.** Sentinels file *deltas*, not states ("new since last run: 2 findings" — a finding filed weekly is one finding, not 52); severity models from the skills' output contracts route S1/P0 to a paging channel and the rest to a queue with an owner; and a standing meta-rule: a sentinel whose findings have been ignored for a quarter gets its scope renegotiated or gets turned off — a watcher nobody believes is pure cost, and its existence falsely comforts.

## Cross-references

- The skills/agents these patterns compose: `../skills/masking-coverage-reviewer/SKILL.md`, `../skills/environment-parity-auditor/SKILL.md`, `../agents/pii-field-scanner.md`, `../agents/state-leak-tracer.md`
- Lease, TTL, registry, reaper mechanics (all reused verbatim for agents): `../principles/environment-lifecycle-and-contention.md`, `../principles/cleanup-and-isolation.md`
- Generic writer/reviewer splits and agent test-execution patterns: `../../quality-dev/orchestration/README.md`, `../../test-automation-engineer/principles/multi-agent-orchestration.md`
