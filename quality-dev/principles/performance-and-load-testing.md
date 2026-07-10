# Performance & Load Testing — what "passing" actually licenses you to claim

**Applies to:** concept doc; examples use k6 1.x · **Last verified:** 2026-07-06
**Standalone:** yes. Definitions: *latency* = time to serve one request (reported as percentiles: p50/p95/p99); *throughput* = requests served per second; *open workload model* = requests arrive at a set rate regardless of how the system responds; *closed model* = a fixed pool of virtual users each waits for a response before sending the next request; *coordinated omission* = the measurement error where a slow system causes the load generator to sample it less, flattering the numbers.
**Related:** `quality-dev/tools/k6.md` (mechanics), `quality-dev/principles/ci-cd-integration.md` (where load stages run).

## The claim a load test makes — be precise or be lying

A load test that "passed" licenses exactly one sentence: *"Under this specific traffic shape, on this specific environment, the system met these specific thresholds."* Every generalization beyond that sentence is where production surprises live. The three places the sentence usually breaks:

1. **The traffic shape was invented, not derived** (below).
2. **The environment wasn't production-like** — half-size DB, cold caches, no background jobs, no neighbors. A test that passes on an idle staging cluster has measured staging's idleness.
3. **The thresholds tested means, not tails.** Averages are where latency problems go to hide: a system serving 95% of requests in 80 ms and 5% in 8 s has a *fine average* and furious users. Assert on p95/p99, per endpoint class.

## Designing realistic load profiles

**Derive, don't invent.** Pull from production telemetry: requests/sec over a week (find true peak, not average), endpoint mix by proportion (that 3% of traffic hitting search may generate 60% of DB load), payload-size distribution, session arrival pattern, cache-hit ratio. Encode *that* — peak shape, mix, think time between user actions — as the profile. A profile of "hammer POST /login at max speed" answers a question nobody asked.

**Open vs closed model — the decision that invalidates more load tests than any other.** With a closed model (fixed VU pool), when the system slows down, your virtual users obligingly slow their sending rate to match — the generator and the system negotiate a comfortable lie, and you get coordinated omission in the results. Real users don't negotiate: they keep arriving. **Default to open model (arrival-rate executors) for any capacity question.** Closed model is right only when the real workload genuinely is a fixed worker pool (batch consumers, connection-pooled internal RPC).

The war story: a ticketing client load-tested a launch at "500 VUs, passed easily." Launch day arrivals behaved like an open model — the site brownout lasted four hours. Their closed-model test had measured the system's ability to slow its own callers, which is precisely the property production traffic doesn't have.

**Include the ugly parts:** think time (or every VU is a scripted DoS), abandonment (real users leave after ~10 s and *retry*, adding load exactly when you're slowest), cold-cache windows, and the background jobs/cron that share the box at peak.

## Latency vs throughput regressions — different diseases, different diagnoses

- **Latency regression at constant throughput** (p95 rose, RPS unchanged): the per-request path got slower — new query, N+1, serialization bloat, lock contention on a hot row. Diagnose with tracing on the slow percentile, not the average.
- **Throughput ceiling regression** (system saturates at lower RPS than before): a resource shrank — pool size, connection limits, CPU per request, GC pressure. Find it by ramping an open-model test until the knee, and compare knee location across builds.
- **The coupled case:** latency climbing *as* throughput approaches the ceiling is queueing theory doing its job (utilization → queue growth). Not a per-request bug; the fix is capacity or admission control. Teams waste weeks "optimizing" request code when the real finding was "the knee is at 800 RPS and peak is 1,000."

Track both independently in CI trend dashboards; a single "performance score" hides which disease you have.

## What "passing" means for production readiness

A launch-readiness verdict needs all five, not just #1:

1. **SLO thresholds met at expected peak × safety factor** (1.5–2× for organic growth; more for marketing-driven spikes) on a prod-like environment. Thresholds are the SLOs, stated per endpoint class: `p95 < 300ms, error rate < 0.1% at 2× peak`.
2. **Graceful degradation beyond the ceiling:** push past the knee deliberately. Passing = latency rises, load-shedding/backpressure engages, error responses are fast and clean, and the system *recovers when load drops*. Failing = connection pile-up, OOM, cascade into dependencies, or requiring a restart to recover. A system that dies at 2.1× when specced for 2× is not "passing with margin"; it's one viral tweet from an incident.
3. **Sustained-duration soak** (hours, not minutes): finds leaks, pool exhaustion, log-disk fill, TTL herd effects. The 10-minute spike test structurally cannot.
4. **Dependency behavior under your load:** your test is a load test *of* your dependencies too — rate limiters, shared DBs. Coordinate or sandbox; a "successful" run that ate the payment provider's staging rate limit is two incidents.
5. **Observability confirmed under stress:** dashboards and alerts fired correctly during the test. A load test is a free fire drill for your monitoring; if alerts stayed quiet while p99 hit 8 s, you have a monitoring bug filed for free.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Coordinated omission flattering results | Closed-model executor + reported latency that contradicts user complaints | Switch to arrival-rate (open) executors | Load-test review checklist: capacity questions require open model; `quality-dev/tools/k6.md` executor table |
| Invented traffic shape | Profile doc cites no production data | Derive mix/peak/think-time from telemetry | Profile file includes source query + date; refreshed quarterly |
| Asserting on averages | Thresholds reference `avg` | Re-threshold on p95/p99 per endpoint class | Threshold lint in test configs; dashboards show percentiles only |
| Staging-idle results generalized to prod | Env spec diff vs prod (size, data volume, cache state, neighbors) | Prod-like env or documented scaling caveat on the verdict | Verdict template requires environment statement; no env statement, no sign-off |
| Cliff-edge past the ceiling | Never tested beyond target load | Overload + recovery scenario per release cycle | "Degradation & recovery" is a named scenario in the suite, not optional |
| Leaks invisible to short tests | Metrics drift over hours (RSS, pool wait, disk) | Add soak scenario | Nightly/weekly soak in CI with trend alerts; see `quality-dev/principles/ci-cd-integration.md` |

## Where this runs

Load tests never gate merges (too slow, env-dependent): smoke-level perf check per merge at most; full profiles nightly/pre-release on schedule — placement details in `quality-dev/principles/ci-cd-integration.md`, scripting mechanics in `quality-dev/tools/k6.md`.
