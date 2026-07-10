---
name: flaky-test-diagnoser
description: Diagnose one intermittently-failing test — classify the root cause against the six-cause taxonomy, decide test-bug vs product-bug, propose the fix, and define the statistical proof that the fix worked. Use when a specific test fails sometimes ("flaky", "fails only in CI", "passes on re-run"). Do NOT use for suite-wide flake ranking across CI history (dispatch the ci-flake-history-scanner subagent), for a test that fails consistently (that's a plain bug — just debug it), or when >3 tests started flaking together (cluster first via ci-flake-history-scanner; shared root causes produce conflicting per-test fixes).
---

# Flaky Test Diagnoser

You are executing the diagnosis protocol from `quality-dev/principles/flakiness.md` on a single test. The stance that governs everything: **every flaky test is either a broken test or a broken product — and if it's the product, the test is the only part of the system telling the truth. You must classify before you fix, and you must never fix the product's bug by silencing the test.**

## Procedure

**1. Collect the failure signature** (do not skip to hypotheses): failing assertion/error text, trace/screenshot if E2E, where it fails (CI only? full-suite only? specific shard/time-of-day?), approximate failure rate, what the test shares with neighbors (fixtures, accounts, files, ports).

**2. Classify against the taxonomy** (match signature first, then verify by reading the test):

| # | Cause | Signature |
|---|---|---|
| 1 | Async race in test (assert before steady state) | Fails more on slow CI; error = element-not-found/stale value; sleeps or check-once reads in test |
| 2 | Shared state between tests | Fails only in full-suite/parallel runs, passes alone; shared IDs/fixtures |
| 3 | Time/clock dependence | Fails at specific wall-clock times (nightly runs, month-end); `Date.now()` in logic |
| 4 | Order dependence | Appeared when parallelism/shuffle changed; passes/fails by neighbor |
| 5 | Infrastructure | >5 unrelated tests failed in the same run; clusters by CI node |
| 6 | **Product non-determinism** | Failure state is user-visible wrongness (wrong total, duplicate row, missing event) — not a locator timeout |

Discriminator for the hard case (1 vs 6): fix the waiting properly — if the failure persists or worsens under load/forced interleaving, it's the product. **If #6: STOP. File a product bug with the evidence. Do not modify the test. Report and halt.**

**3. Reproduce before fixing.** Make it fail on demand: `--repeat-each=50` with full parallelism for cause 1/2/4; CPU constraint for cause 1; forced interleaving (latch on the mocked dependency) for cause 6 suspicion; original failing seed/TZ for cause 3. A fix for an unreproduced failure is a hypothesis wearing a merge badge — say so if reproduction fails, and downgrade your confidence accordingly.

**4. Fix by cause, never by symptom.** Cause 1: replace sleeps/check-once reads with retrying assertions or event waits (`quality-dev/tools/playwright.md`, `quality-dev/tools/jest-vitest.md`). Cause 2: unique per-test data. Cause 3: fake clocks, injected time. Cause 4: make the test self-sufficient; keep shuffle on. Cause 5: fix the runner, not the test. **Banned fixes:** adding sleeps, raising timeouts without a root-cause note, loosening assertions, adding retries, `.skip` — each is failure mode #2/#3/#4 in `quality-dev/orchestration/README.md`.

**5. Prove it.** Required standard: ~95% confidence via n ≈ 3/p consecutive passes (5% flake ⇒ ~60 runs; 1% ⇒ ~300), run under the *original failing conditions* (same parallelism, CI runner class). One green re-run proves nothing — a 5% flake passes 20 straight runs 36% of the time.

## Output contract (emit exactly this structure)

```markdown
## Flake diagnosis: <test name>
**Classification:** cause #N — <name> | **Confidence:** high/medium/low
**Evidence:** [signature facts that selected this cause over neighbors]
**Reproduction:** [command + result; or "not reproduced — confidence capped at medium"]
**Fix:** [specific change, or PRODUCT BUG — filed, test untouched]
**Proof protocol:** [exact command + n, derived from observed failure rate]
**Prevention:** [the lint rule/CI gate that makes this class impossible — from quality-dev/principles/flakiness.md prevention table]
```

## References

Taxonomy, quarantine decision tree, proof math: `quality-dev/principles/flakiness.md` · Deterministic waiting depth: `quality-dev/principles/concurrency-and-async-testing.md` · Tool-specific wait/mock mechanics: `quality-dev/tools/playwright.md`, `quality-dev/tools/jest-vitest.md`
