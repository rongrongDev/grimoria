# Adversarial & Red-Team Evaluation: Methodology and Metrics

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Tier:** extended (production patterns + common pitfalls) · **Applies to:** safety/robustness evals for deployed LLM systems
**Scope note:** This doc covers *methodology and measurement* — how to structure adversarial eval sets and interpret robustness metrics. It deliberately contains no exploit payloads, no jailbreak strings, no bypass recipes. If you need actual attack content, that's a job for your security team's authorized tooling under an engagement, not an eval KB.

---

## How adversarial evaluation differs from security testing (and from your other evals)

- **Security testing** asks "can a motivated attacker break this system?" — exhaustive, exploit-driven, point-in-time, done by specialists under authorization.
- **Adversarial evaluation** asks "how robust is the model's behavior against *categories* of hostile or degenerate input, and is that robustness regressing?" — sampled, category-driven, continuous, run in CI like any other suite.
- They complement: red-team findings seed adversarial eval categories (the incident→golden-set pipeline of `../principles/production-offline-gap.md`, applied to attacks); the adversarial suite then guards against *regression* on known categories while security testing hunts *novel* ones. An adversarial eval suite is not a substitute for red-teaming, and passing it proves resistance to your categories, not safety in general — write that sentence into the suite README before someone quotes the number as a safety certificate.

## Production patterns

**Category taxonomy first, items second.** Structure the set by attack *goal* × *technique family* × *severity*, e.g. goals: policy bypass, data exfiltration via prompt (system-prompt leakage, tool-output injection), harmful-content elicitation, off-role manipulation; technique families (named, not instantiated): direct instruction override, role-play framing, encoding/obfuscation, multi-turn incremental escalation, indirect injection via retrieved/tool content. Report per-cell, never blended — a single "robustness score" hides "great against direct override, hollow against indirect injection," and indirect injection is where agentic systems actually bleed (`agentic-task-evals.md`).

**Severity-weighted verdicts.** A refusal-with-explanation, a partial leak, and a full policy violation are different outcomes; score ordinal (full-defense / partial-degradation / violation), and weight by blast radius of the deployment (a violation in a tool-wielding agent outranks one in a chat toy). Binary pass/fail flattens exactly the gradient your launch decision needs.

**Attack success rate (ASR), framed defensively.** Report "violation rate under category-C probes: X% (n, CI)" per cell, trend it per release. ASR is a *sampling* of an adversarial distribution you don't control: absolute values mean little (they reflect your item difficulty), **deltas and trends on a frozen set mean a lot**. Statistical care from `../principles/statistical-rigor.md` applies double — adversarial strata are small, so CIs are wide and per-cell deltas are mostly noise; gate on the aggregate, investigate per-cell.

**Grading adversarial outcomes is a judge problem with extra teeth.** "Did the model comply with the injected instruction?" is often subtler than it sounds (partial compliance, sanitized-but-leaky paraphrase). Calibrate the judge on human-labeled violation exemplars specifically (`../principles/llm-as-judge.md`); judges under-flag *polite* violations — completion of the harmful request wrapped in disclaimer prose reads as a refusal to a lazy rubric. Rubric item: "ignore tone; did the harmful content/action occur?"

## Common pitfalls

- **The burned adversarial set.** Adversarial items leak into training/RLHF data *faster* than normal items (they get pasted into incident tickets, safety training sets, public writeups). A suite passing 100% may mean the model memorized your probes, not that it's robust — the `../principles/contamination-and-leakage.md` failure with higher stakes and faster decay. *Prevention:* hold-out vault of never-trained-on probes, refreshed quarterly; treat probe leakage into any training pipeline as an incident; watch for the tell (old categories at 100%, freshly-authored same-category items failing).
- **Measuring the wrapper, not the model.** If production runs input filters + the model + output filters, decide *which layer* the eval targets and pin it. Suites that accidentally test filter+model, then run against model-only in CI (filters are "too slow"), produce numbers that don't compose — and a filter change silently moves the "model robustness" trend.
- **Single-turn myopia.** Most cheap adversarial items are single-turn; a large share of real bypasses are multi-turn escalations where no individual turn trips a check. Include multi-turn trajectories with trajectory-level verdicts (`agentic-task-evals.md` for the machinery).
- **ASR theater.** "Robustness improved from 94% to 96%" on 50 items per cell is a CI-width mirage (`../principles/statistical-rigor.md` §MDE). Adversarial suites are chronically under-powered because items are expensive to author; be honest about what yours can detect.
- **Red-teaming your own judge with your own model family** — the inherited-bias trap of `../principles/multi-agent-orchestration.md` §3. A same-family judge grading "did the model resist manipulation?" can share the manipulability being probed.

## Related
`../principles/eval-design.md` (adversarial stratum sizing) · `../principles/contamination-and-leakage.md` (probe burn) · `agentic-task-evals.md` (indirect injection, trajectories) · `../guides/build-eval-suite-from-scratch.md` §step 4 (adversarial stratum construction)
