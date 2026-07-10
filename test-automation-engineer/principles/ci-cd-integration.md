# CI/CD Integration

**Stamped:** 2026-07-06 · Applies to: CI-agnostic policy; concrete implementation in `frameworks/github-actions/README.md`.

CI is where a test suite becomes an institution or a nuisance. The same tests, wired badly — no budget, silent retries, artifacts nobody can find — train the whole org to ignore red. This doc is policy; the GitHub Actions doc is mechanism.

## The pipeline shape

```
PR opened/updated
├─ static gates (lint incl. automation lint rules, types)        < 2 min
├─ unit/integration (owned by @quality-dev/ strategy)
├─ E2E BLOCKING SET — sharded, budgeted                          ≤ 10 min
│    smoke + critical journeys + tests selected by the diff
└─ merge → main
     ├─ E2E FULL SET on main (every merge or batched)            ≤ 30 min
     ├─ nightly: random-order max-parallelism run (order/parallel hazards),
     │           full browser/device matrix, long-tail + quarantine re-runs
     └─ weekly: dependency/tool canary (below)
```

The split matters: the blocking set buys *merge confidence per minute*; the full set buys *coverage per day*. Which tests belong in which is strategy (`@quality-dev/` test-strategy material); *enforcing the budget* is engineering, and it's ours.

## Runtime budget enforcement

A budget nobody enforces is a graph nobody looks at (core law 3). Mechanism:

- **Hard gate:** a CI check fails when blocking-set wall-clock exceeds budget (e.g., 10 min) for N consecutive runs on main. Failing the build for slowness sounds harsh; the alternative — 90 minutes via thirty-second creep — is harsher. The gate converts "the suite feels slow" into a ticket with a deadline.
- **Attribution, not just alarm:** the gate's output names the top-5 slowest tests and the setup:test time ratio (from `agents/ci-runtime-profiler.md`), so the response is targeted, not a shrug.
- **Budget the shards, not just the suite:** one whale shard breaks the wall-clock while the average looks fine (`parallelization-and-sharding.md` §balance).

## Retry policy — the dangerous convenience

Retries make dashboards green and suites dishonest. A real intermittent product bug — a race in checkout — fails exactly like a flake, and retry-then-pass ships it. My settled policy:

1. **Retry at most once**, in CI only (`retries: 1`; local runs 0 so developers *see* their flakes).
2. **Every pass-on-retry is recorded as a flake event** — test name, failure signature, artifacts from the *failed* attempt kept. Playwright's `flaky` status gives this for free; Selenium suites need the harness to emit it.
3. **Flake events feed a tracked rate with a threshold.** Per-test: >2 flake events/week → auto-file quarantine ticket. Suite: flake rate trending up two weeks running → framework investigation, not test whack-a-mole (correlated flakes usually share one cause — infra, app perf regression, contention; `@quality-dev/`'s `ci-flake-history-scanner` does the clustering).
4. **Never retry 2+ times.** A test that needs two retries to pass is a coin you're flipping until it lands heads; information yield ≈ 0, and each retry rewards writing flaky tests.

## Flaky-test quarantine automation

Quarantine is containment with an SLA — the mechanism that keeps the blocking set trustworthy while fixes queue:

- **Enter:** automatically, on crossing the flake threshold — bot PR moves the test to the quarantine tag/project, files a ticket assigned to the owning team (code owners on the spec path). Humans approve the PR; the *detection* must not depend on someone noticing.
- **While in:** quarantined tests still run (non-blocking, nightly) — you need the signal to confirm any fix, and the coverage gap is visible in reports rather than silent.
- **Exit:** fix confirmed by N consecutive clean runs in quarantine (I use 20; statistical reasoning for the number lives with `@quality-dev/`'s `flaky-test-diagnoser`), then bot PR restores it.
- **Expiry:** quarantine older than 30 days escalates: fix it or delete it (core law 10). An unbounded quarantine is a graveyard — I inherited one with 140 tests "temporarily" disabled up to four years; nobody could say what coverage remained. That's the failure mode this SLA exists to prevent.

## Caching strategy

The difference between a 2-minute and an 8-minute shard setup is caching, and at `setup × shards × runs/day` it's real money and real latency:

- **Dependencies:** lockfile-keyed cache (`node_modules`/pip/gradle). Standard, do it first.
- **Browser binaries:** the one everyone misses — Playwright browsers are ~400MB+ per engine and reinstall on every uncached run. Cache the browser directory keyed on the Playwright version, or bake browsers into a runner image. (Mechanics + the `--with-deps` gotcha: `frameworks/github-actions/README.md`.)
- **App build:** build once per pipeline, ship the artifact to E2E shards — 16 shards each rebuilding the app is the most common waste the `ci-runtime-profiler` finds; it's pure critical-path fat.
- **Cache honesty:** every cache is a staleness bug waiting; version-key everything, and the weekly canary run executes with caches disabled to detect "works only cached" and "broken only on cold" drift.

## Artifacts & publishing

Policy (contents/triage: `reporting-and-observability.md`): artifacts for **failed and flaky tests always** — trace, screenshot, video if enabled, from the *failing* attempt; passing tests keep lightweight timing/log data only (traces `on-first-retry`, not `on` — full tracing on green runs is gigabytes of nothing). Retention ≥ 14 days (a flake investigated Friday is archaeology by the next sprint). Reports merge across shards into **one** report per run (`frameworks/allure/README.md`, `frameworks/github-actions/README.md` §merge) — sixteen partial reports is how failures get missed. The PR gets one comment/status with failure summary + deep link; nobody hunts through CI logs.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Budget creep | Wall-clock trend on main (profiler tracks) | Profile → cut critical path: cache, shard, split whales | Hard budget gate with attribution |
| Retries masking a product race | Flake telemetry shows one test's signature recurring; trace shows app (not test) misbehaving | Treat as product bug — hand trace to owning team | Policy rules 2–3 above; flake events are triaged, not archived |
| Quarantine graveyard | Quarantine count grows monotonically; entries > 30 days | Fix-or-delete sweep, then keep the SLA | Expiry escalation automated; quarantine size on the team dashboard |
| Sixteen-shard rebuild | Profiler: per-shard setup dominated by app build | Build-once, artifact-download per shard | Profiler's setup:test ratio alert |
| Stale cache poisoning | "Works in CI, broken locally" or vice versa; cold-start weekend failures | Version-keyed caches; purge | Weekly cache-off canary run |
| Red-on-main normalization | main's E2E status ignored in standups; failures > 1 day old | Revert-or-fix-forward rule with an on-call rotation for suite health | main E2E red pages the rotation, not a channel nobody reads |

## Cross-references

- Mechanism for all of the above on GitHub Actions: `frameworks/github-actions/README.md`
- What's *in* the failure report: `reporting-and-observability.md`
- Shard math: `parallelization-and-sharding.md`
- Flake clustering & per-test diagnosis: `@quality-dev/` `ci-flake-history-scanner`, `flaky-test-diagnoser`
