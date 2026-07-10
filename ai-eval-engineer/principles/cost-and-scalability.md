# Cost & Scalability of Eval Infrastructure

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Applies to:** API-priced frontier models (Claude 4.x/Fable 5, GPT-5.x era); price ratios drift, the *structure* of the tradeoffs doesn't
**Audience:** standalone. Theme: the most rigorous eval design is worthless if it's too slow or expensive to run when decisions happen. Cost engineering is what keeps rigor *deployed*.

---

## Know your cost anatomy first

Eval run cost = items × (system-under-test inference + scoring). Three facts that surprise people:

1. **The judge often costs more than the system under test** — a frontier judge scoring a 6-item checklist per output, with the full input+output in its context, can run 5–10× the generation cost. When people say "evals are expensive," they usually mean judging is.
2. **Latency is a cost too:** a 3-hour Tier-1 suite doesn't gate merges; it gates *nightly* merges, which changes what your CI can promise (`regression-testing-and-edd.md` §tiers).
3. **Human labels are the luxury tier** ($2–15+/item double-labeled, `human-evaluation.md`) — which is why every architecture decision below is ultimately about spending humans and frontier-judge tokens only where they're irreplaceable.

Instrument before optimizing: per-run cost broken down by generation vs. judging vs. infra, and wall-clock per tier. Teams that haven't measured usually misattribute (see war story 1).

---

## Failure modes

### 1. Suite too expensive → run rarely → decisions made blind

**War story.** A team's full suite cost ~$400 and 4 hours per run (2,000 items, frontier judge with verbose reasoning, 3 judge calls per item for a panel they'd cargo-culted from a launch-gate doc onto *every* run). So they ran it weekly. All week, prompt changes merged on vibes, then Friday's run showed a blended delta across 15 merged changes — unattributable to any of them. The fix wasn't a bigger budget: the cost breakdown showed 85% was judge-panel tokens. Panel-on-everything became panel-on-release-only; per-merge runs used a single cheaper judge *calibrated against the panel* (kappa 0.83 on 300 items); reasoning output capped. New cost: ~$40/run — cheap enough to run per-merge, which was the actual requirement all along.

- **Detection:** cost/latency per tier vs. the decision cadence each tier must serve. Any tier whose run cost forces it to run less often than the decisions it's supposed to gate = this failure.
- **Fix, in order of typical yield:** (1) hybrid scoring — code checks everything code can check, judge only judges judgment calls (`llm-as-judge.md`); (2) smaller/cheaper judge calibrated against your expensive judge *on your rubric* (report the kappa; recheck quarterly); (3) cache aggressively — key on (input, system-config hash) for generations and (input, output, judge-hash) for verdicts; unchanged items on unchanged systems cost zero; (4) cap judge reasoning length; (5) reserve panels and humans for Tier 2.
- **Prevention:** cost-per-run and wall-clock are suite health metrics with budgets, reviewed like p95 latency. A suite that drifts over its latency budget pages its owner *before* engineers start skipping it.

### 2. Sampling done naively when full runs are too expensive

Running a random 10% subsample per merge is fine — **if** you do the arithmetic on what it can detect and stratify it.

- **Detection:** a subsample gate whose threshold was inherited from the full suite (n=200 sample, gate at 2 points, MDE at that n ≈ 8 points — the gate is a coin flip, see `statistical-rigor.md` §MDE). Or an unstratified sample that some runs draws 3 safety items and other runs 19 — per-stratum numbers whiplash and get ignored.
- **Fix:** **stratified sampling with per-stratum minimums** (every gate-relevant stratum gets enough items to say *something*, rare-but-critical strata run in full — safety strata are usually small; just run all of them); recompute gate thresholds for the sample's actual n; rotate the sampled subset across runs (fixed subsets become their own little burned dev set — `contamination-and-leakage.md` §iteration leakage in miniature) while keeping a small fixed anchor slice for run-to-run comparability.
- **Prevention:** the harness owns sampling policy (stratification, minimums, rotation, seed logging) so eval authors can't accidentally hand-roll a biased sample. Sample seed goes in the run record for reproducibility.

### 3. Parallelization introducing order/interference bugs

**War story.** A team parallelized their suite 50-wide against a shared **retrieval index that another pipeline was re-indexing nightly**. Items early in a run hit the old index; late items hit the new one. Scores became a function of *item position × wall-clock*, which surfaced as an unreproducible 3-point mystery oscillation between "identical" runs — worse, between the baseline run and candidate run, which ran at different hours. Two engineers spent a week hunting a model regression that was an infrastructure race. The tell in the data, found later: failure rate correlated with item *start timestamp*, not with item content.

Related genus, same family: rate-limit-induced degradation (parallel burst trips provider throttling; retries silently downgrade to a fallback model for the back half of the run — the eval scored two different models and told no one); shared-cache interference (item A's cached retrieval serving item B's slightly-different query); conversation-state bleed in agentic harnesses that reuse sessions (`../topics/agentic-task-evals.md`).

- **Detection:** (1) **the shuffle test** — run the suite twice with different item orderings; score movement beyond the A/A band means order dependence, full stop; (2) plot per-item results vs. execution timestamp and vs. worker ID — flat is healthy; (3) log and alert on *any* fallback/retry-with-degradation events inside eval runs — a silent model downgrade mid-run invalidates the run.
- **Fix:** hermetic per-item execution (no shared mutable state; snapshot or pin external dependencies — index versions, tool backends — for the run's duration); rate-limit-aware pacing below throttle thresholds rather than retry-after-throttle; fail loudly on degraded responses inside evals (a production system should degrade gracefully; an *eval harness* should refuse — the eval's job is measurement, and a silently-degraded measurement is worse than a failed one).
- **Prevention:** shuffle test in the harness's own CI (yes, the eval infra needs tests); dependency versions (index snapshot ID, tool version) recorded per run and asserted constant within a run; A/A canary (`regression-testing-and-edd.md`) catches newly-introduced order effects as a band widening.

### 4. Cost pressure quietly changing what's measured

The insidious one: economizing decisions that each look reasonable and jointly redefine the metric. The cheap judge (calibrated once, two quarters ago, drifted since). Reasoning-capped judge that now can't articulate why it failed borderline items, so borderline items pass. Sampled suite whose "temporary" exclusion of the expensive agentic stratum became permanent. Nobody decided to stop measuring agentic quality; the invoice decided.

- **Detection:** diff *measurement config* over time, not just scores: judge model/hash, strata weights, sampled-vs-full per stratum, items skipped for cost. If the current suite's measurement surface isn't the one the baseline was established on, your trend line changed meaning at some unmarked point.
- **Fix:** re-establish comparability: re-run current baseline under current config (`regression-testing-and-edd.md` §versioning); restore or explicitly deprecate silently-dropped coverage with a CHANGELOG entry someone signed.
- **Prevention:** cheap-judge calibration has an expiry date (quarterly recheck against the reference judge on fresh items); every cost optimization that touches scoring lands as a reviewed change with before/after agreement evidence, not a config tweak.

---

## Architecture patterns that keep cost sane at scale

- **Tiered fidelity** (the master pattern; details in `regression-testing-and-edd.md`): cheap-deterministic per-PR → calibrated-cheap-judge per-merge → frontier-panel + human per-release. Each tier's cheaper instrument is periodically audited by the tier above it — that audit chain is what makes cheap trustworthy.
- **Content-addressed caching everywhere:** generation keyed on (input, system hash); verdicts keyed on (input, output, judge hash). Typical Tier-1 runs after a prompt-only change re-generate everything but re-judge only changed outputs — often 60–90% judge-cost savings alone.
- **Fan-out with hermetic workers** for many-variant sweeps (k prompts × m models): parallelize across *variants*, keep per-item execution hermetic, and mind the multiple-comparisons bill that k×m grids run up (`statistical-rigor.md` §3 — a 40-cell grid at α=0.05 hallucinates two winners for free; see `multi-agent-orchestration.md` for orchestrating sweep agents without them treating those two ghosts as findings).
- **Batch/off-peak APIs for Tier 2:** release-cadence runs rarely need interactivity; batch pricing typically halves the bill. Never for Tier 0/1 — latency is the product there.
- **Spend shape rule of thumb:** if > 50% of eval spend is judging, you haven't finished hybridizing; if > 30% is human labels *outside* calibration/ground-truth work, your calibrated-judge layer is underbuilt (`human-evaluation.md` §when).

---

## Related

- What n buys and what the sample must detect: `statistical-rigor.md`
- Tier structure and flake economics: `regression-testing-and-edd.md`
- Judge-downgrade calibration protocol: `llm-as-judge.md`
- Fan-out orchestration and its failure modes: `multi-agent-orchestration.md`
