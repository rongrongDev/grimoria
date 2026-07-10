# Multi-Agent Orchestration for Red-Team Work

> **Version 1.0 — 2026-07-06.** Applies to: programs using AI agents (planner/worker/reviewer splits) to assist red-team operations. Read [core-principles](./core-principles.md) and [automated-red-teaming](./automated-red-teaming.md) first — the safety controls there are prerequisites, not optional.

This doc is about *how to structure multiple AI agents* doing red-team support work, and the failure modes unique to that structure. It is not a restatement of program design; it assumes you have read [program-design](./program-design.md) and are now deciding when to split work across isolated agent contexts, when *not* to, and how to keep parallel agents from turning into a distributed weapon-factory.

---

## The core question: split roles, or don't

A single agent doing everything holds the whole task in one context: it plans, executes, and judges its own work, and its context fills with the raw material of the task. Splitting into roles buys you two things and costs you coordination:

- **Context isolation** — a worker that reads hundreds of findings returns only a summary, so the caller's context is not flooded with the raw batch. This is the *primary* reason to split in red-team work: the raw material (large finding batches, long multi-turn transcripts) is voluminous *and* often sensitive, and you want it contained in a subordinate context that returns only the distilled result.
- **Role specialization and independence** — a reviewer that did not do the work has no sunk-cost bias in judging it; a triager scoring in parallel with human review provides an independent second opinion.

**Split when:** the input volume would flood or pollute the caller's context, OR you specifically want an independent judgment, OR the work is embarrassingly parallel across many items.

**Do NOT split when:** the task is small enough to hold in one context (splitting adds coordination overhead and more surfaces to secure for no benefit), OR the sub-task requires the *generation* of attack content that you do not want any additional agent context to hold (fewer contexts touching sensitive material is safer — see the weapon-factory failure mode).

## The role split for red-team program work

### Planner — coverage-gap / scoping agent

Before a testing round, a planner-role agent reviews the coverage matrix and identifies under-tested cells, so human effort goes to the dark corners rather than the fun ones ([program-design](./program-design.md) on tunnel vision). This is a *planning* output — a list of cells and categories to probe — which is safe to produce and store ([automated-red-teaming](./automated-red-teaming.md): categories, not payloads). The [coverage-gap-reviewer](../skills/coverage-gap-reviewer/SKILL.md) skill is exactly this role, bounded.

### Worker(s) — parallel analysis of large batches

Workers do the voluminous reading. Two established patterns:
- **Fan-out over a finding batch** for clustering: split a large batch across workers, each clusters its slice by root cause, a reducer merges. This is the [finding-cluster-analyzer](../agents/finding-cluster-analyzer.md) subagent's job — isolated context absorbs the batch, returns the pattern report.
- **Parallel triage**: a triage agent scores incoming findings by severity ([severity-and-triage](./severity-and-triage.md)) *in parallel with* human review, giving a fast independent first-pass that humans confirm or override. Never the sole triage — automation is signal, humans decide ([automated-red-teaming](./automated-red-teaming.md)).

### Reviewer — independent verification

A reviewer-role agent checks work it did not produce: does a claimed fix generalize ([fix-verification-tracer](../agents/fix-verification-tracer.md))? Is a finding report complete (mechanism + generalization profile present)? Independence is the point; a reviewer that also did the work inherits its blind spots.

## Fan-out for reviewing large finding batches

When a batch is too large for one context (a fuzzing run's output, a cycle's accumulated findings):

```
        ┌─────────────── orchestrator (holds only summaries) ───────────────┐
        │                            │                            │
   worker A                     worker B                     worker C
   (slice 1: cluster      (slice 2: cluster            (slice 3: cluster
    by root cause)          by root cause)               by root cause)
        │                            │                            │
        └──────────────► reducer: merge clusters, dedupe ◄────────┘
                                     │
                          cross-cutting patterns → humans
```

Each worker returns *clusters and mechanisms*, not raw payloads — the same signal-not-payload discipline from [automated-red-teaming](./automated-red-teaming.md). The orchestrator never holds the raw sensitive batch; it holds the distilled clusters.

## The failure modes unique to multi-agent red-team work

### 1. The distributed weapon-factory

The gravest one. An agent tasked with "test for vulnerability X" may, in the course of its work, *generate genuinely harmful reusable content* and leave it in its context, its outputs, or the orchestrator's aggregate. Multiply by parallel workers and you have manufactured, at scale, the exact artifact the program exists to prevent — now scattered across several agent contexts and logs.

**Controls (mandatory, from [automated-red-teaming](./automated-red-teaming.md) applied to orchestration):**
- Workers return *signal* (cluster labels, mechanisms, success-booleans, coverage deltas) — never generated attack payloads — into the orchestrator.
- Any worker that must handle raw sensitive content does so in an isolated, access-controlled, audited context whose outputs are filtered before they reach the orchestrator.
- Catastrophic-category work is not fanned out to autonomous workers; it stays human-in-the-loop ([harm-taxonomy](./harm-taxonomy.md), [automated-red-teaming](./automated-red-teaming.md)).
- Fewer contexts touching sensitive material is safer — do not split a sensitive-generation task just because you can.

### 2. Redundant / duplicate findings from parallel agents

Parallel workers reviewing overlapping slices produce the same finding multiple times, inflating counts and wasting triage. Detection: suspiciously high finding volume with low mechanism-diversity. Fix: deduplicate at the reducer *by mechanism*, not by surface text — the same vulnerability appears in many phrasings ([finding-cluster-analyzer](../agents/finding-cluster-analyzer.md) clusters on mechanism for exactly this reason). Prevention: assign non-overlapping slices, and reduce on root cause.

### 3. Orchestrator context poisoning

If workers dump raw findings up to the orchestrator, the orchestrator's context fills with the very volume (and sensitivity) that isolation was supposed to contain — you have paid for isolation and thrown away the benefit. Detection: orchestrator context growing with raw item content. Fix: strict summary-only return contracts. Prevention: define each worker's return schema as *distilled output only* before running.

### 4. Automated judgment mistaken for verdict

A parallel triage or verification agent's output is a *first pass*, not a decision. Treating it as final reproduces the [automated-red-teaming](./automated-red-teaming.md) error at the orchestration layer. Prevention: every automated judgment is confirmed by a human for anything above LOW, and the human retains override.

### 5. Loss of the human discovery step

Over-automating the pipeline squeezes out unstructured human discovery ([program-design](./program-design.md)), so the whole multi-agent apparatus only ever processes variants of known classes efficiently while discovering no new ones. Prevention: multi-agent orchestration accelerates *coverage and triage*, not *discovery* — keep humans in the discovery seat.

## When multi-agent is the wrong tool

- **Small batches / single findings.** One triage, one report — just do it in one context. Orchestration overhead exceeds benefit, and every extra agent is another context to secure.
- **Sensitive-content generation.** Minimize the number of contexts that ever hold it; do not distribute it for throughput.
- **Discovery.** No orchestration substitutes for human creativity here.

## Failure mode → detection → fix → prevention (summary)

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Distributed weapon-factory | Payloads in worker/orchestrator contexts or logs | Signal-only returns; filter + purge | Return schema = distilled signal; no fan-out of catastrophic work |
| Duplicate findings | High volume, low mechanism diversity | Dedupe by mechanism at reducer | Non-overlapping slices; reduce on root cause |
| Orchestrator poisoning | Orchestrator context fills with raw items | Enforce summary-only return | Define distilled return schema up front |
| Auto verdict trusted | Findings closed on agent judgment alone | Human confirms above LOW | Automation is first-pass, human decides |
| Discovery squeezed out | Only known-class variants processed | Reinstate human discovery phase | Orchestrate coverage/triage, not discovery |

## Related

- Safety controls these patterns depend on: [automated-red-teaming](./automated-red-teaming.md)
- The subagents this doc orchestrates: [finding-cluster-analyzer](../agents/finding-cluster-analyzer.md), [fix-verification-tracer](../agents/fix-verification-tracer.md)
- The skill used as a planner role: [coverage-gap-reviewer](../skills/coverage-gap-reviewer/SKILL.md)
- Parallel triage's rubric: [severity-and-triage](./severity-and-triage.md)
- Why discovery stays human: [program-design](./program-design.md)
