# Reporting & Observability

**Stamped:** 2026-07-06 · Applies to: Playwright 1.50 traces, Allure Report 2.32; policy is tool-agnostic.

The suite's product is not green checkmarks — it's *fast, correct diagnosis when something is red*. Core law 9: a failure report must answer "test bug or product bug?" in two minutes, because triage cost × failure count is the real price of a big suite, and when that price gets too high, humans stop paying it and start clicking re-run.

## Anatomy of a useful failure report

In descending value-per-byte, from thousands of triages:

1. **The failing step in intent language** — "clicking 'Submit order' timed out waiting for enabled" beats a raw stack trace. This is bought at architecture time: intent-level page-object methods (`framework-architecture.md`) produce intent-level failures. Suites with selectors in test bodies produce `waiting for locator('div.x-3f') to be visible` — undiagnosable by design.
2. **Trace** (Playwright) — DOM snapshots per action + network + console, time-travel debuggable. The single highest-value artifact; it replaced "re-run locally and stare" for my teams. Capture `on-first-retry` (the failed attempt is what matters; tracing green runs is gigabytes of nothing — `ci-cd-integration.md` §artifacts).
3. **Screenshot at failure** — the 10-second first cut: spinner? error toast? blank page? wrong page entirely?
4. **The app's own telemetry, correlated** — console errors, failed network calls with status codes; gold tier is a test-run ID header (`X-Test-Run-Id`) injected into app requests so a test failure links straight to backend logs/traces for that exact session. One integration, enormous triage payoff — it's the difference between "checkout button did nothing" and "POST /orders returned 500, here's the backend trace."
5. **Context stamps** — app version/commit, framework version, browser+version, environment, worker/shard index, timing. Cheap, and the *only* way to spot "fails only on shard 7" or "started with app release 342."
6. **Video** — cheap insurance for the failures whose trigger predates the failing step; lower value than trace, keep on-failure-only.

**Noise, explicitly:** full DOM dumps as text, passing-step verbose logs, driver protocol chatter, all-green screenshots. Every byte of noise raises the cost of finding signal; report bloat is a real failure mode — I've seen 2GB-per-run artifact bills where nobody could find the screenshot.

## The two-minute triage decision tree

Teach this to every engineer; put it in the report UI if you can:

```
Open failure →
1. Same test failing across many PRs/branches?
   → infra or app regression on main, not the PR. Check main's status first.
   (This is why per-PR reports must show main's health — saves the whole tree.)
2. Screenshot/trace: is the app visibly broken (error page, 500 toast, crash)?
   → PRODUCT BUG. File with trace + backend correlation attached. Done.
3. App looks fine but test timed out waiting?
   → check the trace's network/console at that moment:
      failed request → product bug (probably).
      request fine, element there but selector missed it → TEST BUG (selector).
      element genuinely late but arrives after timeout → timing:
         app got slower (product perf) vs test assumed too much
         (test bug — waiting-and-synchronization.md). Compare step
         duration against its history if you have it.
4. Fails only in parallel / only on some shards / only at certain times?
   → shared state or contention → TEST/FRAMEWORK BUG
     (parallelization-and-sharding.md); check worker-index correlation.
5. Passed on retry?
   → flake event; the FAILED attempt's artifacts are the evidence.
     Diagnosis taxonomy: @quality-dev/ flaky-test-diagnoser.
```

If step 3's "probably" bothers you, good — that residual ambiguity is why correlation with app telemetry (item 4 above) is worth the integration cost.

## Observability of the suite itself

The suite is a production system; instrument it like one. Beyond per-run reports, keep a **run-history store** (Allure history, or a plain DB of test/run/duration/status/failure-signature):

- **Flake telemetry** — pass-on-retry events with signatures (`ci-cd-integration.md` owns the policy; this store is the mechanism).
- **Duration trends per test** — a test that drifted 8s→28s is telling you something about the app or the environment; also feeds duration-based sharding (`parallelization-and-sharding.md`) and the runtime-budget attribution (`ci-cd-integration.md`).
- **Failure-signature clustering** — 40 failures = one selector broken in one shared component, or 40 problems? Group by normalized failure step + error class before humans look; it's the difference between one ticket and a wasted morning. (Suite-wide historical clustering: `@quality-dev/` `ci-flake-history-scanner`.)
- **Suite-health dashboard** — the four rot metrics (`maintainability-and-tech-debt.md`), flake rate, wall-clock trend, quarantine census. One page, reviewed quarterly.

Reporting-layer mechanics — merging sharded results into one report, history trend wiring, Allure categories for auto-classifying failure types (product-vs-test-vs-infra by error signature): `frameworks/allure/README.md`; CI publishing: `frameworks/github-actions/README.md`.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Undiagnosable failures (raw selector timeouts) | Triage time ≫ 2 min; every failure needs a local re-run | Intent-level steps + traces (architecture fix, not reporting fix) | Report-quality bar in definition-of-done for framework work; sample-audit triage time quarterly |
| Artifact bloat | Storage bill; report load time; nobody opens artifacts | Failure-only capture; trim retention to 14–30 days | Capture policy in config, reviewed with cost dashboard |
| Sharded reports never merged | Engineers open 16 partial reports; failures on shard 12 missed | Merge step in CI (blob/allure merge) → one report | Merge is part of the pipeline definition, not optional |
| Failure wave = one cause, triaged as N | Same normalized signature across many tests | Signature clustering before human triage | Clustering in the report pipeline; "top signatures" section first in report |
| Test-run ↔ app-logs correlation missing | Every product-bug handoff is "can you repro with logging on" | Inject `X-Test-Run-Id`; link from report to backend trace query | Make it a framework fixture — on by default for every test |
| History amnesia (each run an island) | Nobody can answer "when did this start / is it getting worse" | Stand up the run-history store; backfill from CI API | History retention part of the reporting layer's SLA |

## Cross-references

- Artifact/retention/publishing policy: `ci-cd-integration.md` · Mechanics: `frameworks/allure/README.md`, `frameworks/github-actions/README.md`
- Trace-first debugging workflow: `frameworks/playwright/README.md` §traces
- Flake diagnosis from the artifacts this doc mandates: `@quality-dev/` `flaky-test-diagnoser`
