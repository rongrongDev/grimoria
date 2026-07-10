# Multi-Agent Orchestration for Eval Work

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Applies to:** Claude Code-style agent harnesses (skills + subagents with isolated contexts); patterns transfer to any planner/worker agent system
**Audience:** standalone. This doc is about *organizing agents to do eval work* — not about evaluating agents (that's `../topics/agentic-task-evals.md`).

---

## The prime directive

Split eval work across agents for exactly two reasons: **context isolation** (the work produces more tokens than a working context should carry — thousands of transcripts, similarity matrices) or **independence** (the check is only valid if the checker didn't produce the thing being checked). Splitting for theater — "a planner agent, an implementer agent, and a reviewer agent, because that's the pattern" — buys coordination overhead and context loss, and pays for it with subtle disagreements between agents that each hold half the picture.

Corollary: **judgment stays in the orchestrator; grind goes to subagents.** Deciding whether a 3-point delta justifies blocking a launch is judgment (needs the full history: A/A bands, MDE, what changed). Reading 400 failure transcripts and clustering them is grind. The classic mistake is shipping the judgment out with the grind.

---

## When to split roles (decision list, not "it depends")

**Split when:**
- **Contamination audit gating a benchmark adoption** → subagent (`contamination-scanner`). Dataset-scale n-gram/embedding sweeps produce megabytes of intermediate output that must never flood the parent context; and the *adopting* engineer wanting the benchmark is exactly who shouldn't grade its cleanliness. Isolation gives you both a clean context and a clean separation of interest. The parent gets back a verdict + evidence samples, not the matrix.
- **Regression triage after a gate fires** → subagent (`eval-regression-tracer`). Hundreds of before/after transcript pairs to diff, significance-check, and cluster. The parent gets clusters with counts, exemplars, and a noise-vs-signal call per cluster (`statistical-rigor.md` §4).
- **Judge calibration alongside suite authoring** → parallel agents, and deliberately *different* ones. The agent that wrote the rubric will read its own ambiguities the intended way — the author is the one reader guaranteed not to trip over the rubric's gaps. A separate agent (or the `eval-rubric-reviewer` / `judge-bias-auditor` skills in a fresh context) running the calibration catches what the author structurally cannot. This is the agent version of "never review your own PR."
- **Large eval-suite fan-out** (k prompts × m models × n big items) → worker agents per variant, hermetic per-item execution (`cost-and-scalability.md` §parallelization), results merged by the orchestrator.

**Don't split when:**
- Designing a rubric or choosing metrics — that's a judgment conversation with the human; fragmenting it across agents loses the "why" that must end up documented.
- The eval run fits in one context comfortably (< ~50 items with short transcripts). A subagent here adds a serialization boundary and cold-start re-derivation for nothing.
- You'd need to ship the *entire* working context to the subagent for it to do the job — that's not isolation, that's copying, and the copy will drift.

---

## Fan-out patterns for large suites

**Pattern: variant-sharded workers, orchestrator-owned truth.**
- Orchestrator pins the measurement config *once* — eval-set version, judge hash, decoding params, dependency snapshot IDs — and passes it to every worker. Workers that discover a config need mid-run *stop and report*; they never improvise. (A worker that "helpfully" bumps a timeout or swaps a fallback model has silently forked the experiment — the eval-harness version of `cost-and-scalability.md`'s silent-downgrade failure.)
- Workers return **structured results** (per-item scores + transcript refs), never prose summaries of scores. Prose is where numbers go to get rounded, reframed, and accidentally improved.
- Orchestrator does all cross-variant statistics itself, with multiple-comparisons correction sized to the *full grid* (`statistical-rigor.md` §3) — each worker sees one cell and cannot know the family size; only the orchestrator knows 40 cells were tested and ~2 will look "significant" by luck.
- Shard by **variant**, not by eval-set slice, when judges are involved: one judge config per full set keeps scores comparable; slicing a set across workers with any judge-context variation reintroduces instrument variance inside a single score.

**Pattern: pipelined gate.** contamination-scan → (pass) → calibration-check → (pass) → full run → (delta beyond band) → regression-trace. Each stage is a separate context; each hands forward a verdict artifact (markdown/JSON in the repo, versioned), not a chat transcript. Artifacts survive context compaction; vibes don't.

---

## Failure modes specific to multi-agent eval work

### 1. Agents treating noisy deltas as real signal

**War story.** An autonomous "eval-improvement loop" — agent runs suite, tweaks prompt, keeps the tweak if the score rose — ran overnight, 60 iterations on a 150-item set (MDE ≈ 9 points; typical per-tweak "gains": 1–3 points). By morning it had accreted a Frankenstein prompt of 60 superstitions, each a coin flip it had won once, and the held-out score was *down* 4 points. It's `statistical-rigor.md`'s random-walk engineering, but at machine speed and with machine confidence — agents don't get tired of celebrating noise, and every iteration also burned the dev set a little further (`contamination-and-leakage.md` §iteration leakage). LLM agents are, if anything, *more* prone than humans to narrate a 2-point wiggle into a causal story; they're trained to produce explanations.

- **Detection:** any agent loop that conditions actions on score deltas, inspected for a significance check between "score moved" and "act." Absent check = this bug, latent or active.
- **Fix/Prevention:** hard-code the two-step filter into agent instructions and tooling: (1) delta must exceed the suite's recorded A/A band / MDE, (2) survivors must replicate on a fresh slice before being treated as real. Batch small changes to reach detectable effect sizes. Cap iterations against any fixed set; charge each run against the set's burn budget. Subagent prompts must carry the noise band as *data* ("this suite's A/A band is ±4; treat smaller deltas as noise") — a fresh context can't know it otherwise; the orchestrator's job is to make sure statistical context travels with the task.

### 2. Redundant or conflicting golden-set edits from parallel agents

**War story.** Two agents worked the same suite in parallel: one refreshing stale items, one adding items from last week's incidents. Both touched the `billing` stratum. One *rewrote* ambiguous items; the other added near-duplicates of two of the same items sourced from an incident, with a *conflicting* expected answer (the incident had revealed the old label was wrong). Merged mechanically. The suite now contained two items asking the same question with opposite ground truths — pass rate on that stratum became structurally capped at ~50%, which surfaced three weeks later as a "billing regression" that no code change explained. The postmortem's one-line cause: *two writers, no editor.*

- **Detection:** duplicate/conflict scan as a suite CI check — embedding near-dup detection *within* the golden set (same machinery as `contamination-and-leakage.md` §2, pointed inward) plus label-consistency check on near-dup clusters. Structurally-capped strata (pass rate pinned below a ceiling across all systems) are the runtime smell.
- **Fix:** adjudicate conflicts with a human or a single senior-agent editor pass; the dedup scan output is its worklist.
- **Prevention:** golden-set writes are **single-writer per stratum per cycle** (partition the work: agent A owns billing, agent B owns auth), or all agent edits land as *proposals* (PR-style) merged by one editor context running the dedup/consistency scan. Never give N agents unmediated write access to one eval set. Sets are code (`regression-testing-and-edd.md` §versioning); this is just code review.

### 3. The judge-auditing-judge trap (inherited bias)

**War story.** A team asked an agent to audit their LLM judge for verbosity bias — and the auditor agent ran on the *same model family* as the judge. Its method: read (output, verdict) pairs and rate whether the verdict over-rewarded length. It reported "no significant verbosity bias." A human running the length-vs-score correlation found r = 0.38. The auditor shared the judge's taste: the long answers *looked better to it too*, so verdicts favoring them looked fine. An auditor with the same blind spot doesn't audit the blind spot — it notarizes it.

- **Detection:** check auditor/judge model-family overlap in any judge-audit setup. Ask what the audit *method* was: an auditor that re-judged and agreed is testing agreement, not bias; only behavioral probes (A/A position swaps, content-identical compression pairs, cross-family re-judging — the `judge-bias-auditor` protocols) test bias.
- **Fix/Prevention:** judge audits must rest on **measurements, not model opinions**: the auditor agent's job is to *run the probes and compute the numbers* (flip rates, length correlations, cross-family disagreement), where its own biases can't reach the arithmetic. Where model judgment is unavoidable in the audit loop, use a different family than the judge under audit — and note the residual risk in the report. This is why `judge-bias-auditor` is written as a probe-runner, not an opinion-haver.

### 4. Verdict laundering across agent boundaries

Every agent hand-off is a lossy compression. A subagent reports "23 failures, 19 in the noise-consistent band, 4 significant, clustered as X"; three hand-offs later the launch doc says "eval healthy, minor noise." Each intermediate agent summarized *reasonably*; the composition lied.

- **Detection:** trace any decision-feeding claim back to its originating artifact. If the chain passes through ≥ 2 prose summarizations with no attached numbers, assume drift.
- **Fix/Prevention:** verdict artifacts are structured and immutable (JSON/markdown files with numbers, CIs, set/judge hashes); downstream agents *link* to them rather than restating; the orchestrator's final report quotes numbers from artifacts, never from intermediate agent prose. Same rule as fan-out workers: numbers travel as numbers.

---

## Reference topology for a full eval program

```
Human + orchestrator (judgment, decisions, statistics)
│
├─ skills, in-context (bounded reviews on artifacts at hand):
│    eval-rubric-reviewer · judge-bias-auditor
│
├─ subagents, isolated (context-heavy grind, independence-critical checks):
│    contamination-scanner   — gates benchmark/golden-set adoption
│    eval-regression-tracer  — triages fired gates into clusters + noise calls
│
└─ fan-out workers, ephemeral (large sweeps):
     variant runners with pinned config → structured results → orchestrator stats
```

---

## Related

- The statistics agents must carry with them: `statistical-rigor.md`
- Iteration-leakage budgets for agent loops: `contamination-and-leakage.md`
- Hermetic parallel execution: `cost-and-scalability.md`
- The subagents referenced here: `.claude/agents/contamination-scanner.md`, `.claude/agents/eval-regression-tracer.md`
- The skills referenced here: `.claude/skills/eval-rubric-reviewer/`, `.claude/skills/judge-bias-auditor/`
