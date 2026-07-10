# Regression Testing & Eval-Driven Development

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Applies to:** CI-gated LLM/agent systems; harness-agnostic (promptfoo, Braintrust, LangSmith, custom); model families Claude 4.x/Fable 5, GPT-5.x era
**Audience:** standalone. This is the doc about making evals *load-bearing* — running in CI, blocking merges, surviving contact with a team that just wants to ship.

---

## Eval-driven development in one paragraph

Treat model/prompt/retrieval changes the way you treat code changes: no change merges without evidence it didn't break what mattered. The eval suite is the test suite; the golden set is the fixtures; the judge config is part of the toolchain. Everything that applies to keeping a test suite trustworthy — determinism, speed tiers, quarantine for flakes, fixture versioning — applies here, plus one hard extra: **your assertions are statistical, not boolean** (`statistical-rigor.md`). A conventional test fails or passes; an eval *moves*, and deciding whether a move is real is half this discipline.

### The tiered-gate pattern (the one that survives)

- **Tier 0 — per-PR, minutes, cheap:** deterministic checks (format, schema, banned-string, unit-style exact-match items) + a small smoke slice (30–100 items) of the golden set. Catches catastrophes: broken template variables, empty outputs, refusal storms. Blocking.
- **Tier 1 — per-merge / nightly:** the full dev golden set with judge scoring. Blocking on deltas beyond the noise band (below).
- **Tier 2 — per-release / weekly:** held-out set (`contamination-and-leakage.md` §iteration leakage), human-eval sample, full stratified reporting with CIs. Gates releases, recalibrates judges.

Teams that run only Tier 1 per-PR get slow CI and start skipping it; teams that run only Tier 0 ship judged-quality regressions. You need the ladder.

---

## Failure modes

### 1. Flaky evals: nondeterminism eating trust

**War story.** A team set a CI gate: "block if pass rate drops > 2 points." Their system ran at temperature 0.7 and the judge at 0.3. Run-to-run variance on *no change at all* was ±4 points. The gate fired randomly, engineers learned to click re-run until green — and once re-run-until-green is muscle memory, the gate catches **nothing**, because real regressions also go green on the third try. Two months later a real 6-point regression shipped through exactly that habit. A gate people route around is worse than no gate: it consumes credibility that a future working gate will need.

- **Detection:** **A/A runs** — same code, same set, N repeated runs. The spread is your flake band. If you've never measured it, your gate threshold is fiction. Decompose sources: system-under-test sampling (temp > 0), judge sampling, retrieval/tool nondeterminism (timeouts, live APIs, mutable indexes), harness ordering bugs (`cost-and-scalability.md` §parallelization).
- **Fix, in priority order:** (1) temperature 0 / fixed seeds for gating runs where product-realistic sampling isn't the point; (2) judge at temperature 0 with pinned model + prompt hash (`llm-as-judge.md`); (3) mock or snapshot external dependencies (live-API items move to a separate non-blocking tier — a flaky dependency in a blocking gate is a pager for someone else's outage); (4) where sampling *is* the product (creative gen), score k samples per item and gate on the aggregate — variance shrinks as √k; (5) set gate thresholds *outside* the measured A/A band.
- **Prevention:** scheduled A/A canary (weekly); its band is recorded and gate thresholds are derived from it mechanically, not chosen in a meeting. Flake-quarantine protocol identical to flaky unit tests: an item that flips on identical inputs gets quarantined (scored, reported, non-blocking) with an owner and a ticket — not deleted (that's silently shrinking coverage), not left blocking (that's teaching re-run-until-green).

### 2. Gate thresholds nobody can defend

- **Detection:** ask "why 2 points?" If the answer isn't in terms of (a) the A/A flake band and (b) the suite's minimum detectable effect (`statistical-rigor.md` §MDE), the threshold is folklore.
- **Fix:** threshold ≥ max(flake band, MDE) for blocking gates; softer "warn" band below it. Use paired per-item comparison (McNemar) against the baseline run, not two independent topline numbers — it's more sensitive at the same n.
- **Prevention:** thresholds live in versioned config next to the suite with a comment linking the A/A measurement that justifies them; re-derived whenever the suite or system's determinism profile changes.

### 3. Eval suite rots as the system evolves

**War story.** A product pivoted from single-turn Q&A to multi-turn assistant. The eval suite — 500 lovingly curated single-turn items — kept running, kept passing, kept gating. For six months the team had ~95% "eval coverage" of a product shape that no longer existed, while the actual product surface (context carryover, clarifying questions, tool use mid-conversation) had zero items. The suite was a museum with a green checkmark. Nobody decided this; it happened by nobody deciding anything.

- **Detection:** coverage review against *current* production traffic shape (the distribution check from `eval-design.md` §golden sets, run quarterly): what fraction of the suite exercises features/flows that still exist? What fraction of current production intents have any items at all? Also watch for the smell: suite pass rate creeping toward 100% and staying — a suite the system has saturated is no longer steering (either the system finished improving, or the suite stopped asking hard questions; check which by sampling production failures).
- **Fix:** retire items for removed features (retire = archive with reason, keep the historical scores; never in-place delete or trend lines lie); add strata for new surfaces before or with the feature launch, not after the first incident — "eval items for new surface" belongs in the feature's definition of done.
- **Prevention:** suite ownership is a named role, not a commons; quarterly coverage review on the calendar; the incident→golden-set pipeline (`production-offline-gap.md`) keeps fresh failures flowing in so the suite tracks reality by default instead of by heroics.

### 4. Versioning: eval sets, judges, and baselines drifting apart

**War story.** "The suite dropped 5 points overnight." No product change had merged. Investigation: a teammate had *improved* 40 golden-set expected outputs (genuinely — they were better labels) directly in the shared fixtures bucket. Every historical comparison silently became apples-to-oranges; the baseline run being compared against had been scored on the old labels. Three days of regression-hunting a regression that was actually a *measurement instrument change*. The labels were better; the uncommunicated in-place mutation was the sin. Same failure shape as the judge-prompt story in `llm-as-judge.md` §5 — the instrument moved, the dashboard blamed the product.

- **Detection:** if you can't answer "exactly which items+labels+judge-config produced this score?" with a hash, you have this problem latently; the overnight-mystery-delta is just when it invoices you. Harness check: does a score record include set version and judge hash? If either is missing, comparisons are unverifiable.
- **Fix / Prevention (they're the same thing here — versioning is prevention):**
  1. Golden set in version control (or content-addressed store), items immutable per version; edits create a new version with a changelog entry.
  2. Judge model + prompt + params pinned and hashed into every score record.
  3. Baselines are *pinned runs* (set-version + judge-hash + system-commit), not floating "last week's number."
  4. The harness **refuses to render a comparison** across mismatched set-version or judge-hash without an explicit `--incomparable-i-know` flag. Make the wrong thing loud.
  5. When the instrument legitimately changes (better labels, recalibrated judge): re-run the baseline system on the new instrument the same day, establish the new reference point, annotate the discontinuity in the suite CHANGELOG. Cost: one eval run. Alternative cost: your trend history becomes fiction.

### 5. Evals as theater: the gate that never fires (or always fires)

A gate that has never blocked anything is either guarding a system that never regresses (unlikely) or measuring nothing binding. A gate that fires weekly and gets overridden weekly is a slower version of no gate — override friction becomes the real policy.

- **Detection:** count, over the last quarter: gate triggers, overrides, and true-regressions-caught. All zeros → theater. High override ratio → threshold/flake problem (§1, §2) or organizational non-buy-in.
- **Fix:** if flake-driven, fix flake first (nothing else works until trust exists); if buy-in-driven, shrink the blocking surface to the few metrics everyone *agrees* must not regress (safety, format validity, top-intent accuracy) and let the rest warn — a small gate that's respected beats a broad one that's bypassed.
- **Prevention:** overrides require a written reason logged where the team can see them; the quarterly review reads the override log. Overrides are legitimate (urgent fixes exist); *silent* overrides are how gates die.

---

## Wiring diagram (reference implementation shape)

```
PR opened ──► Tier 0: deterministic + smoke (5 min, blocking)
   merge ──► Tier 1: full dev set, judge-scored, paired vs pinned baseline
             │   delta within A/A band → green
             │   delta beyond band → eval-regression-tracer (subagent) clusters
             │   failures, separates significant-vs-noise, reports drivers
             ▼
 release ──► Tier 2: held-out set + human sample + judge recalibration check
             baselines re-pinned; suite CHANGELOG updated
```

The `eval-regression-tracer` subagent (`.claude/agents/eval-regression-tracer.md`) exists because the "delta beyond band" branch is a context-heavy grind — hundreds of transcripts to diff and cluster — that shouldn't be done in your main working context, and *must not* be done by vibes ("looks like tone got worse") when McNemar's discordant set is sitting right there.

---

## Related

- Threshold math and noise-vs-signal: `statistical-rigor.md`
- Set hygiene and dev/held-out tiers: `eval-design.md`, `contamination-and-leakage.md`
- Keeping Tier 1 fast and cheap enough to actually run: `cost-and-scalability.md`
- Sampling production failures into the suite: `production-offline-gap.md`
- Subagent: `.claude/agents/eval-regression-tracer.md`
