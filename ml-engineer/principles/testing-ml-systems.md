# Testing ML Systems

**Version 1.0 — 2026-07-06.** Examples verified against pytest 8.x, scikit-learn 1.6–1.7, Great Expectations 1.x / pandera 0.20+. Standalone. Related: [data-leakage.md](data-leakage.md), [train-serve-skew.md](train-serve-skew.md), [mlops-and-versioning.md](mlops-and-versioning.md) (where these tests run as gates).

---

ML code has a testing problem software doesn't: the output isn't specified. You can't assert `predict(x) == 0.73`. Teams respond by testing nothing ("it's stochastic, you can't test it") — which is wrong in a specific, fixable way. **You can't test that the model is right, but you can test that the pipeline isn't lying to it.** Nearly every disaster in this KB — leakage, skew, silent schema drift, broken retrains — is a *pipeline* bug, and pipeline bugs are deterministic and testable. The model is the one part you can't unit-test; it's also the part that fails least often.

## 1. Unit-testing feature engineering code

**Failure mode.** Feature code is "tested" by running the notebook and eyeballing a dataframe. Then an edge case — null user, empty history, single-event history, timezone boundary, unicode name — produces a garbage value that's a perfectly valid float. The model trains on it. Nothing errs, ever. (A `days_since_signup` that returns −1 for null signup dates is a real bug I found *two years* after it shipped; the model had learned that −1 meant "corporate test account.")

**What to test — the checklist per feature/transform:**
- **Hand-computed golden cases:** 3–5 tiny input fixtures with outputs computed by hand (not by running the code and freezing the answer — that enshrines the bug). This is where the units-mismatch class dies.
- **Edge inputs:** empty frame, single row, all-null column, entity with no history, duplicate events, out-of-order timestamps, DST/timezone boundaries if time is involved, unicode/whitespace if strings are.
- **Point-in-time correctness** (the leakage unit test, [data-leakage.md](data-leakage.md) §1): entity whose events all post-date the as-of timestamp → every feature must return null/default. Cheap, and the single highest-value test in this doc.
- **Invariants/properties:** counts ≥ 0, rates in [0,1], `output rows == input entities`, aggregate over a window ≤ aggregate over a superset window. Property-based testing (hypothesis) pays off unusually well here because feature code is pure-function-shaped.
- **Determinism:** same input → identical output, twice. Catches accidental dependence on dict/set ordering, current time (`datetime.now()` hiding in a feature is a skew bomb), or unseeded sampling.

Structural prerequisite: features must be *functions* — extracted from notebooks and pipelines into importable, pure(ish) units. Untestable feature code is an architecture finding, not a testing finding.

## 2. Data validation tests (schema + distribution)

Code tests catch wrong logic; data tests catch wrong *inputs* — the upstream breakage your logic faithfully propagates. Two tiers, run at every pipeline boundary (ingest → features → training; and the serving boundary per [train-serve-skew.md](train-serve-skew.md) §3 — same contract file, both enforcement points):

- **Schema (hard gate, fail the run):** column presence, dtypes, nullability, enum domains, primary-key uniqueness, value ranges (age ∈ [0,120], not [0, 2³¹]). Tooling: pandera for dataframe-shaped pipelines (schemas as code, composable with pytest), Great Expectations when you need suite management and data-docs across many tables; a hand-rolled assertion module is fine at small scale — the *contract existing* is the feature, the framework is convenience.
- **Distribution (soft gate, block-and-alert on threshold):** null rate per column vs. historical band, category frequency shifts, mean/percentile drift vs. trailing window, row count vs. expected (the day the upstream export truncated to 100k rows exactly, a row-count band was the only thing that noticed), label base rate band (a fraud rate jumping 0.8%→4% is either an attack or a labeling bug — either way, don't silently train on it).

**The training-set gate specifically:** retraining CD ([mlops-and-versioning.md](mlops-and-versioning.md) §2) validates every new snapshot *before* training. A model trained on a bad snapshot passes all code tests and can even pass eval (if eval data shares the breakage) — the data gate is the only place to stop it. Also assert the *leakage invariants* here: train∩test = ∅ on IDs and content hashes, zero group overlap, split time-ordering ([data-leakage.md](data-leakage.md) §2/§4).

## 3. Training-loop and model tests

The model can't be asserted, but the training *mechanics* can:

- **Smoke training:** full pipeline on a frozen ~1k-row fixture in CI on every PR — asserts it runs, loss decreases, and final metric lands in a recorded band (loose: ±20%; you're catching "broken," not "worse"). Catches the refactor that silently drops a transform or freezes the wrong layers. Minutes of CI, and the single best defense against "the scheduled retrain has been broken for a month."
- **Overfit-one-batch:** the model must reach ~zero loss on a single batch. Fails → wiring bug (loss, labels misaligned, gradients not flowing, LR broken). The classic first test of any new architecture ([../topics/pytorch-training.md](../topics/pytorch-training.md)).
- **Shuffled-label canary** (as a periodic test, not just a debugging move): permuted labels → validation at chance. Beats chance → pipeline leaks. Automate it monthly or on feature-set changes ([data-leakage.md](data-leakage.md)).
- **Serialization round-trip:** save → load → `predict` on a fixture equals in-memory predictions (exact for trees/linear; atol≈1e-6 for NN). Catches custom-object pickling loss, device-dependent state, and version-pin drift before the registry does.
- **Determinism/reproducibility test:** two runs, same seed, same fixture → metrics within tolerance (bit-exact if you've opted in — [training-and-reproducibility.md](training-and-reproducibility.md) §1).

## 4. Integration tests: training-to-serving

**Failure mode.** Every component tested, the *seam* broken: training emits features in one order, serving assembles another (silent in dict-based paths, catastrophic in array-based); preprocessing inside training but hand-reimplemented in the service; model artifact loads in the training env but not the serving image (dependency skew).

**The tests, in increasing strength:**
1. **Signature check:** serving-assembled payload validates against the model artifact's input schema (names, dtypes, order). Runs in deployment CD per [mlops-and-versioning.md](mlops-and-versioning.md) §2.
2. **Golden-prediction test:** N fixture entities scored through the *training-side* path (offline features + model) with outputs frozen; CI scores the same entities through the *serving* path (real service container, real feature retrieval against a fixture store) and asserts equality within tolerance. This is the skew integration test — it mechanically enforces [train-serve-skew.md](train-serve-skew.md)'s "one definition" rule at the boundary where it's most violated. Divergence = a skew bug found in CI instead of three weeks into production.
3. **End-to-end pipeline test (pre-merge for pipeline changes):** fixture data → features → train → register → deploy to a local/staging server → score → assert. Slow (tens of minutes); run on pipeline-code changes and nightly, not every PR.
4. **Shadow deployment** is the integration test against reality itself ([deployment-and-serving.md](deployment-and-serving.md) §4) — the last layer, not a substitute for 1–3, because by shadow time a failure costs a rollout cycle instead of a CI cycle.

## 5. What NOT to test (negative guidance keeps suites alive)

- Exact metric values on real training runs (flaky by construction — assert *bands*).
- The framework itself (sklearn's math is not your job).
- Frozen full-model prediction snapshots on real data as "regression tests" — they fail on every legitimate retrain and get deleted or auto-updated within a quarter, teaching the team that red is noise. Golden tests belong on *fixtures* with *frozen models* (seam tests, §4), not on living models.
- Anything asserting randomness is "random enough."

## 6. Review protocol (test-suite review for an ML repo)

1. Are features functions? (If not, stop — that's finding #1 and blocks everything else.)
2. Per-feature: golden cases? edges? the point-in-time test? determinism?
3. Data contracts: schema gate at each boundary? distribution bands on the training snapshot? leakage invariants asserted in CI?
4. Training mechanics: smoke training in PR CI? serialization round-trip? seed-repro test?
5. The seam: signature check in deploy CD? golden-prediction skew test? any e2e path?
6. Report gaps ordered by which production incident each would have prevented — this doc's sections are that mapping.
