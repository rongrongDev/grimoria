# Reasoning-Model Evals: When Thinking Budget Is Part of the Instrument

**Version:** 1.0.0 · **Date:** 2026-07-13 · **Tier:** extended (production patterns + common pitfalls) · **Applies to:** extended-thinking / reasoning-mode models (Claude 4.x/Fable 5 thinking modes, GPT-5.x reasoning-effort tiers, R-class open models)

---

## The core shift

A reasoning model's output is (reasoning trace + answer), produced under a **thinking budget** — and both the trace's visibility and the budget are configuration, not constants. Two consequences: the amount of compute you grant is now an eval variable that moves scores as much as a model swap does, and sampling variance is higher (reasoning modes often force sampling — temperature-0 determinism may not be available). An eval that reports "model X scores 71%" without stating budget, sampling policy, and aggregation method is reporting an unlabeled point on a curve.

## Production patterns

**Score the answer; treat the trace as a diagnostic channel, not a graded artifact.** Three reasons, any one sufficient: providers summarize, encrypt, or hide traces, and change that policy between versions — a trace-graded metric breaks silently on a provider update; traces are increasingly optimized to *read* well, so "sound reasoning" in the trace is weak evidence the answer-producing computation was sound; and trace-grading imports maximal judge exposure to the anchoring hazard below. Use traces the way `agentic-task-evals.md` uses per-step diagnostics: to bucket *where* failing items go wrong (wrong decomposition, arithmetic slip, gave up, ignored a constraint), never to gate.

**Choose the sampling aggregate to match the deployment claim — they answer different questions:**
- **pass@k** ("any of k samples correct"): capability ceiling. The right claim for "can this model do the task at all"; the wrong one for production, unless production actually runs k attempts against a verifier.
- **consensus@k / majority vote:** deployable-accuracy-with-sampling. The right claim when production will sample and aggregate.
- **Single sample at production settings:** what one user call gets. The default gating metric.
Report which one you're using and k, always; a pass@16 number quoted next to a competitor's single-sample number is the benchmark-marketing trick this KB exists to keep you from doing to yourself. Per-item k-runs feed the item-level bootstrap from `../principles/statistical-rigor.md`; expect wider A/A bands than non-reasoning suites and re-derive gate thresholds rather than inheriting them.

**Pin the thinking budget into the run record like temperature.** Model + prompt + params now includes budget/effort tier; CI refuses cross-budget comparisons the way it refuses cross-judge-hash comparisons (`../principles/regression-testing-and-edd.md`). For model-selection decisions, report a **score-vs-budget curve** (2–3 budgets minimum) — models cross: A beats B at low budget, loses at high, and a single-budget comparison silently picks the winner by where you happened to measure. A provider changing default effort between versions is an instrument change wearing a model-update costume: any suite-wide shift after a model-version bump, diff the effective budget first.

**Log budget exhaustion as a first-class event.** A trace that hits the budget ceiling and emits a truncated answer is a *resourcing* failure, not (necessarily) a capability failure — the reasoning-model analog of tool flake in `agentic-task-evals.md`. Separate "failed with budget exhausted" from "failed" in reporting; if the exhausted share moves, your trend line is tracking budget fit, not capability.

**Cost reality:** thinking tokens routinely dominate spend — 5–50× the answer tokens on hard items — and k-sampling multiplies it. This reshapes the tier structure of `../principles/cost-and-scalability.md`: smaller n, wider CIs, coarser MDE; write the suite's actual sensitivity in its README rather than inheriting promises from cheaper suites.

## Common pitfalls

- **Cross-budget comparisons narrated as capability differences.** "New model regressed 4 points" where the new default effort tier is lower. Detection: the run records disagree on budget. Prevention: the CI comparison guard above.
- **Judge anchoring on confident reasoning.** Feed a judge (trace + answer) and it scores the answer up when the trace sounds rigorous — fluent-wrongness bias (`../principles/llm-as-judge.md` §4) with the volume turned up, because reasoning traces are maximally fluent self-justification. Feed the judge the answer only (plus ground truth/context); verify claims programmatically where possible. If you must judge traces, judge extracted trace *facts* (step count, constraint mentions), not trace vibes.
- **Assuming temperature-0 determinism.** Reasoning modes may ignore or forbid it. Measure the A/A band under the real sampling regime before setting any gate (`../principles/regression-testing-and-edd.md` §flake); a gate threshold inherited from a deterministic suite will fire on noise weekly.
- **Reasoning-trace contamination.** Published traces (distillation sets, chain-of-thought benchmark solutions, incident writeups) leak the *solution path*, not just the answer — a model replaying a memorized path looks exactly like strong reasoning on that item. Detection: perturb surface details (numbers, names, ordering) and watch for a score cliff on perturbed twins; a real reasoner degrades gracefully, a memorized path shatters. Same vault-and-refresh discipline as `../principles/contamination-and-leakage.md`, faster decay assumed.
- **Comparing reasoning and non-reasoning models on latency-blind quality.** A 40-second thinking answer beating a 2-second answer by 3 points is a product decision, not a model ranking; put latency/cost per item next to every score (`../principles/production-offline-gap.md` §metric mismatch).

## Related
`../principles/statistical-rigor.md` (k-run aggregation, MDE under small n) · `../principles/llm-as-judge.md` (fluent wrongness, anchoring) · `../principles/contamination-and-leakage.md` (trace leakage, perturbation probes) · `../principles/cost-and-scalability.md` (thinking-token economics) · `agentic-task-evals.md` (per-step diagnostics pattern, environment verification)
