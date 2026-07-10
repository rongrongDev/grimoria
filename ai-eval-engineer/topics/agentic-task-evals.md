# Agentic & Multi-Step Task Evals: Scoring the Trajectory, Not Just the Landing

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Tier:** extended (production patterns + common pitfalls) · **Applies to:** tool-using agents, multi-turn assistants, computer-use/coding agents (Claude 4.x/Fable 5-era harnesses)

---

## The core shift

Single-turn evals score an *output*. Agentic evals score a *trajectory*: a sequence of model decisions, tool calls, tool results, and environment state changes, ending (hopefully) in a goal state. Two consequences dominate everything else:

1. **Final-answer-only scoring is systematically misleading.** An agent can reach the right answer via a trajectory you must not ship (deleted and recreated the file it was told to edit; ran 40 redundant tool calls; leaked data into a log on the way), and can fail for reasons that aren't "the model is bad" (flaky tool, sandbox missing a dependency). If you score only the landing, you can't tell a capability gap from an environment bug from a lucky disaster.
2. **The environment is part of the eval instrument.** A golden set item is now (initial state + goal + environment definition + verification). Environment drift is instrument drift (`../principles/regression-testing-and-edd.md` §versioning applies to container images and tool backends, not just items).

## Production patterns

**Score at three levels, report all three:**
- **Outcome:** did the goal state obtain? Best verified *programmatically against the environment* — tests pass, row exists in DB, file has the required content — not by judging the agent's final message. Agents confidently report success they didn't achieve; the environment doesn't lie. This is the single most important rule in agentic evals: **check the world, not the claim.**
- **Trajectory quality:** binary checklist over the trace — stayed within permitted tools; no destructive action outside scope; no ignored tool *errors* (plowing past a failed call is a top-3 real-world agent failure); recovered-after-error vs. wedged; step count within budget (efficiency as a scored dimension, since agent cost scales with steps).
- **Per-step diagnostics (non-gating):** where did failing trajectories first go wrong — wrong tool choice, malformed arguments, misread tool output, goal drift, gave up early. Not for gating (too noisy) but it's what makes failures *actionable*; this is what `eval-regression-tracer`-style clustering should bucket on.

**Success criteria must define "done" states exhaustively** — including partial credit policy (booked the flight but not the hotel) and *illegitimate success* (goal state reached by prohibited means scores as failure, or agents learn — via your own prompt iteration — that vandalism counts). Write the verification as executable checks committed next to the item.

**Determinism engineering.** Trajectories compound nondeterminism: temperature × tool latency variance × environment state. For gating tiers: hermetic environments (containerized, snapshot-reset per item — *fully* reset; see pitfalls), mocked/pinned external APIs, k runs per item with pass@k or mean reported and the item-level bootstrap from `../principles/statistical-rigor.md`. Budget for it: agentic items cost 10–100× single-turn items, which reshapes the whole tier structure (`../principles/cost-and-scalability.md` — smaller n, so wider CIs, so coarser MDE; say so in the suite README).

**Judging trajectories with an LLM:** feed the judge the *trace summary plus environment verification results*, not the raw 80k-token trace (judges degrade on very long inputs and anchor on the agent's own narration — the agent's "I have successfully completed..." is adversarial input to the judge). Checklist items over trace *facts* extracted programmatically (tool-call counts, error events, files touched) beat holistic trace vibes.

## Common pitfalls

- **Grading the agent's self-report.** The #1 agentic eval bug in the wild. Detection: sample "passing" items and verify the goal state by hand; any gap between claimed and actual success means your scorer reads narration. Fix: environment-verified outcomes, always.
- **State bleed between items.** Reused sandboxes/sessions where item N's side effects (files, env vars, conversation memory, rate-limit debt) alter item N+1. Symptoms: order-dependent scores — run the shuffle test from `../principles/cost-and-scalability.md` §3. Fix: full environment reset per item; assert clean preconditions programmatically before each run.
- **Tool flake scored as model failure.** A 2% tool-timeout rate across 30-step trajectories ≈ 45% of trajectories touched by a flake. Log tool errors as first-class events; separate "failed with degraded environment" from "failed" in reporting, and rerun the former. Otherwise your trend line tracks your tool vendor's uptime.
- **Trajectory-length bias in judges.** Judges read long, busy traces as diligent (the verbosity bias of `../principles/llm-as-judge.md` §3, trajectory edition) — measure score-vs-step-count correlation; efficient short solutions must not lose to thrashing.
- **Frozen environments diverging from production tools.** The eval's pinned tool API v1 while production runs v3 is the production-offline gap (`../principles/production-offline-gap.md`) wearing a tools costume. Version environments *and* schedule refreshes with baseline re-runs, same discipline as golden-set refreshes.
- **Indirect prompt injection untested.** Agents consume tool outputs and retrieved content; hostile instructions arriving through those channels are the dominant real attack surface (`adversarial-evaluation.md`). Include items where a tool result/webpage/file contains category-level manipulation attempts, verdict = did the agent treat data as data.

## Related
`../principles/eval-design.md` (criteria, golden sets) · `../principles/statistical-rigor.md` (k-runs, small-n honesty) · `adversarial-evaluation.md` (multi-turn attacks) · `../principles/multi-agent-orchestration.md` (evaluating *with* agents, distinct from this doc's evaluating *of* agents)
