# Parallelization & Sharding

**Stamped:** 2026-07-06 · Applies to: Playwright 1.50 workers/shards, Selenium Grid 4.27, CI-level sharding on GitHub Actions.

All large-suite speed comes from parallelism. Everything else — trimming waits, API-based setup — buys percentages; parallelism buys multiples. But parallelism is *purchased with hermeticity*: every shared mutable thing is a landmine that detonates only under concurrency, as a flake, on someone else's PR. This doc is the engineering discipline that makes the purchase safe.

**The 90→8 minute case study, itemized** (1,100-test Playwright suite, referenced throughout this KB):

| Change | Wall-clock effect |
|---|---|
| Baseline: serial, 1 worker, UI login per test | 90 min |
| API login + storage-state reuse (`framework-architecture.md`) | −11 min → 79 |
| Sleep purge, ~340 hard waits removed (`waiting-and-synchronization.md`) | −17 min → 62 |
| Hermetic data refactor (three months, the real work — below) | ±0, *enables next rows* |
| 4 workers × 4 shards = 16-way | 62 → ~9 min |
| Duration-balanced sharding (was file-count) | 9 → 8 min (shard variance 6→1.5 min) |

Note the shape: two-thirds of the win was unlocked by the unglamorous data refactor that itself saved zero minutes.

## Test independence: the four prerequisites

A test may run in parallel iff:

1. **Own data** — creates or uniquely owns every entity it mutates. Unique-per-test via factories (`test-data-management.md`); never "the" test user.
2. **No app-level global mutations** — feature flags, org settings, pricing tables, anything singleton in the app. A test that flips a global flag fails *other* tests. Options, in order: scope the flag per-user/per-org (ask app team — usually easy), give such tests a serial isolated project/stage, or mock the flag source.
3. **No process-global test state** — static singletons, env-var mutation, shared temp paths, fixed ports. Per-worker resources keyed by worker index.
4. **Order-independence** — no test consumes another's leftovers. Found by execution, not review: nightly random-order run (below).

## Parallelism math and topology

Two layers multiply: **workers** (processes per machine) × **shards** (machines). Speedup is Amdahl-bounded by your longest test and per-shard fixed cost:

`wall_clock ≈ setup_cost + max(shard_durations)`, and `min possible ≈ setup_cost + longest_single_test`.

- **Workers per machine:** start at CPU cores ÷ 2 for browser tests (each browser is multi-process); raise until p95 test duration degrades >20% vs serial — that's resource contention manufacturing timing flakes. On 4-vCPU CI runners, 3–4 workers is the usual ceiling. Contention flakes look like app slowness; check worker-count sensitivity before blaming the app.
- **Shard count:** `(target_wall_clock − setup) × shards ≥ total_test_minutes`, then round up and add one. Diminishing returns kick in when setup (checkout, deps, browser install, app boot — call it 2–3 min with good caching, `ci-cd-integration.md`) approaches shard runtime: at 2 min setup and a 5-min budget, more than ~12 shards for a 60-test-minute suite is just burning runners.
- **A 40-minute single test caps you at 40 minutes forever.** Split it or drop it from the blocking set.

## Sharding strategy

```
How to split tests across shards?
├─ By file, naive (alphabetical / round-robin)     → fine to start; variance
│                                                     grows with file-size skew
├─ By duration (bin-pack on recorded timings)      → the workhorse. Needs a
│     timing store from previous runs; rebalance      weekly or on drift.
│     Playwright does this within a machine automatically (longest-first to
│     workers); across machines you bin-pack file lists yourself or accept
│     --shard's file-count split.
├─ By historical flakiness                          → don't shard by it — fix or
│     quarantine flaky tests instead (`ci-cd-integration.md`). One valid use:
│     pin known-resource-heavy tests away from each other.
└─ By feature/team ownership                        → never for speed (skew),
      but fine as *reporting* dimension on top of duration-based sharding.
```

Balance target: `max(shard) − min(shard) < 20% of mean`. Worse than that = you're paying for idle runners; check for one whale file.

## Shared-state pitfalls (the complete catalog from my incident notes)

- **Database:** two tests mutate the same row → intermittent assertion failures under load only. Fix: unique entities per test; for the stubborn tail, per-worker DB schemas/databases (cheap in Postgres: `CREATE DATABASE test_w${WORKER}` in worker setup).
- **Test accounts:** "the admin user" gets concurrent sessions, hits rate limits, or one test changes its password (I've seen a whole suite lock itself out at 2 a.m. — password-change test + 15 concurrent logins of the same account = account lockout policy triggered). Fix: account pool with checkout/checkin, or per-worker accounts created in global setup.
- **Feature flags / app config:** the classic "passes alone, fails in suite." See prerequisite 2.
- **External sandboxes (payment, email):** shared Stripe test account hits rate limits; email assertions read someone else's mail. Fix: unique idempotency keys and recipient addresses (`test+{uuid}@`), per-worker API keys where the vendor allows.
- **The filesystem and ports:** downloads to a fixed path, servers on fixed ports. Key everything by worker index/test id.
- **Session/token invalidation:** shared storage-state where one test's logout invalidates everyone's token. Fix: per-worker auth states.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Order-dependent test | Passes solo/in-order, fails shuffled | Give it its own data; find what it was leeching from the prior test | **Nightly random-order + max-parallelism run** — the single best prevention in this doc. New tests must pass it before joining the blocking set |
| Shared-account collision | Flakes correlate with worker count; auth/rate-limit errors in traces | Account pool or per-worker accounts | Scanner greps for hardcoded credentials/user IDs (`agents/suite-wide-antipattern-scanner.md`); factories are the only sanctioned user source |
| Global-flag mutation | "Fails only in full suite" reports; flag-touching tests implicated | Per-org flag scoping or serial stage | Tag tests that touch globals `@serial`; CI runs them in an isolated stage; review gate on new `@serial` tags (it's a smell, budget it) |
| Resource-contention flakes | p95 duration degrades with worker count; timeouts cluster on heavy specs | Lower workers, or bigger runners (cost math: bigger runner is usually cheaper than engineer-hours re-triaging flakes) | Record per-test duration vs worker count in the timing store; alert on degradation |
| Shard imbalance | One shard 2× the others in the CI timeline | Duration-based bin-packing; split whale files | `ci-runtime-profiler` agent reports balance quarterly; alert when max−min > 20% |
| Cross-shard fixed cost creep | Setup time × shard count dominates | Cache deps/browsers (`ci-cd-integration.md`); prebuilt images | Profiler tracks setup:test ratio per shard |

## Cross-references

- Data discipline that makes hermeticity real: `test-data-management.md`
- CI wiring (matrix sharding, report merging): `frameworks/github-actions/README.md`
- Playwright worker/project mechanics, Selenium Grid sizing: respective framework docs
- Finding which tests flake under parallelism across CI history: `@quality-dev/` `ci-flake-history-scanner`
