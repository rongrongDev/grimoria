# Observability & Reliability — Operating the Thing You Built

**Last reviewed:** 2026-07-06. Tooling-agnostic; OpenTelemetry (OTel) assumed as the instrumentation standard (stable for traces/metrics/logs as of 2025).
**Operationalized by:** the `incident-postmortem-analyzer` Subagent (`.claude/agents/incident-postmortem-analyzer.md`).
**Related:** [performance.md](performance.md) (what to measure), [async-work.md](async-work.md) (queue alerting), [api-design.md](api-design.md) (trace ids in error contracts).

The test of observability is one question: **at 3am, can the on-call engineer go from "checkout error rate is up" to the failing dependency and the affected blast radius in under ten minutes, using only what's already collected?** Everything in this doc serves that question. Dashboards that demo well but can't answer it are decoration.

---

## 1. Structured logging

- **JSON logs, one event per line, from day one.** Retrofitting structure onto `printf` logs is a quarter-long project; starting structured is free.
- **Every log line carries:** `timestamp` (UTC, RFC 3339), `level`, `service`, `version` (git SHA — "which deploy did this" is the first incident question), `trace_id`, and the domain keys (`user_id`, `order_id`, `tenant_id`). Bind these once per request in context (MDC / contextvars / AsyncLocalStorage / zap fields — per-stack details in stack docs), not hand-passed to every call site: hand-passing guarantees the one log line you need during the incident is the one missing the order id.
- **Log events, not narration.** `{"event":"payment_declined","reason":"insufficient_funds","order_id":...}` is queryable; `"Something went wrong in payment :("` is not. Wide events — one rich line per request with duration, status, user, and key decisions — beat ten breadcrumb lines; you can aggregate and slice wide events like metrics.
- Levels with teeth: `ERROR` = a human should eventually look (and error-log rate is alertable); `WARN` = degraded-but-handled; `INFO` = state changes worth reconstructing; `DEBUG` = off in prod, toggleable at runtime. The team that logs `ERROR` for expected validation failures has trained itself to ignore `ERROR` — I've watched a real outage scroll by unnoticed inside a wall of fake errors.
- **Never log:** credentials, tokens, full card/PII fields, or full request bodies by default ([security.md](../principles/security.md)). Central redaction in the logger config, because someone *will* log the request object during a debugging session and forget to remove it.
- Exceptions once, at the boundary, with stack trace and context — not at every layer of the call stack (triple-logged errors triple your error counts and your noise).

## 2. Distributed tracing

Tracing answers what logs and metrics can't: **"where did this request's 3 seconds go, across services?"**

- OTel auto-instrumentation for HTTP/DB/queue layers gets you 80% in a day. Add manual spans only around meaningful business units of work.
- **Context propagation is the whole game** — W3C `traceparent` headers across HTTP/gRPC, *and through queues* (inject trace context into message headers; the trace should span producer → consumer or your async paths are dark exactly where debugging is hardest).
- **Sample smart:** 100% at low traffic; at scale, tail-based sampling (keep errors and slow traces, sample the boring). Head-based 1% sampling keeps 1% of the traces you'll want and discards 99% of the interesting ones by definition.
- Put the `trace_id` in every log line and in every error response ([api-design.md](api-design.md) §6) — the join between a support ticket, the logs, and the trace is where debugging speed comes from.
- **Deadline propagation** rides the same rails: pass the remaining time budget downstream (gRPC deadlines do this natively; HTTP needs a header convention). Without it, a service spends 30s computing a response for a caller that timed out at 5s — under load, the fleet is busy doing work nobody is waiting for, which is how a slowdown becomes an outage. Cancel work when the caller gives up.

## 3. Metrics, SLOs, and error budgets

For every service, the four golden signals: **latency (as percentiles), traffic, errors, saturation.** Non-negotiables:

- **Percentiles, never averages.** Average latency of 80ms with a p99 of 8s means your best customers (the ones making the most requests hit the tail most often) are having a terrible time while your dashboard smiles. Alert on p95/p99. Never average percentiles across instances (mathematically meaningless — aggregate histograms instead).
- **Cardinality discipline:** metric labels multiply (`endpoint × status × tenant` = explosion). No unbounded labels (user id, request id) on metrics — that's what traces and logs are for. I've seen a Prometheus taken down by one label on one counter (`path` with raw URLs including ids).

**SLOs make reliability a number instead of a feeling.** Define per user-journey (not per host): "99.9% of checkout requests succeed in < 500ms, measured over 28 days." The **error budget** (the 0.1%) is the management tool: budget healthy → ship fast; budget burned → reliability work takes priority over features, *by prior agreement* — the SLO's real function is ending the ship-vs-stabilize argument with arithmetic. And the corollary most teams miss: an SLO tells you when to stop — 99.9% when users can't perceive better than 99.5% through their own ISP is money set on fire, and it forbids the next nine's worth of complexity.

**Alerting: page on symptoms, not causes; alert on burn rate, not point-in-time.**

- Page when **users are affected**: SLO burn-rate alerts (fast-burn: 14× budget rate over 5m+1h → page; slow-burn: 6× over 30m+6h → ticket). Multi-window burn rate is the standard because it catches both cliffs and slow bleeds without paging on blips.
- Causes (CPU high, one pod restarting, disk 70%) are dashboards and tickets, not pages — *unless* they're deterministic imminent-outage signals (disk will fill in 4h, cert expires in 7d, DLQ depth > 0 per [async-work.md](async-work.md), connection pool ≥ 80% per [data-layer.md](data-layer.md)).
- **Every page must be actionable and urgent.** The alert-fatigue death spiral: noisy alert → acknowledged reflexively → real page in the noise gets acknowledged reflexively → 40-minute outage that an alert *did* fire for. I have watched exactly this. Ruthless hygiene: every page gets a weekly review — was it actionable? did a human do something? — two "no"s and it's deleted or demoted. A pager that fires < 2×/week and is always real beats one that fires nightly and is usually noise, *even if the quiet one occasionally misses something*: an on-call who trusts the pager investigates fast; one who doesn't investigates nothing.
- Every alert links a **runbook**: what it means, how to confirm, what to do, who to escalate to. An alert without a runbook is a riddle at 3am.

## 4. Graceful degradation & circuit breakers

Design the degraded modes **before** the incident, because during it you'll improvise badly:

- **Timeouts on every outbound call** — no exceptions, no infinite defaults (many HTTP clients default to none; audit yours — per-stack notes in stack docs). Budget them: if you promise 500ms and call two dependencies serially, they get ~200ms each, propagated as deadlines (§2).
- **Circuit breakers** on every dependency that can hurt you: after N failures, fail fast (open) for a cooldown, then trial (half-open). The point isn't just protecting you — it's giving the *struggling dependency* room to recover instead of hammering it with the retries + timeouts that turn its brownout into a blackout. Pair with [concurrency.md](concurrency.md) §4's jittered-retry rules; breakers and retries are one system, tuned together (retries inside an open breaker = nothing; retries without a breaker = amplification).
- **Bulkheads:** separate connection pools/thread pools/concurrency limits per dependency, so the slow recommendation service can't consume every thread and take checkout down with it. The "one slow non-critical dependency starves the critical path" incident is a classic in every thread-pool runtime.
- **Degrade by design:** recommendations down → serve popular items; search down → category browse; rate-limit tightens under load (shed the bulk API before the checkout API). Decide *what's load-bearing vs decorative* per page/endpoint in design review, and test the degraded paths (fault injection — [testing.md](testing.md) §5.4); an untested fallback is a rumor.
- **Health checks, two kinds:** *liveness* = "restart me if this fails" (process wedged) — must NOT check dependencies; *readiness* = "route traffic to me" — checks what's needed to serve. The classic self-inflicted total outage: liveness probe checks the DB → DB blips 10 seconds → orchestrator restarts every pod simultaneously → cold caches, connection storms, 20-minute outage from a 10-second blip.

## 5. Incidents and postmortems

- Severity levels + an incident-commander habit, even at 10 engineers: someone runs the incident, someone communicates, others debug. Everyone debugging + nobody deciding = the 4-hour version of a 40-minute incident.
- **Mitigate first, understand later:** roll back, shed load, fail over. The urge to understand before acting costs the most user-minutes. Rollback should be the *reflex* — which requires deploys to be rollback-safe always ([data-layer.md](data-layer.md) §1's expand/contract exists for exactly this).
- Blameless postmortem for every user-facing incident: timeline (from telemetry — the `incident-postmortem-analyzer` subagent drafts this), contributing causes (plural — there is never exactly one), user impact quantified against the SLO, and action items **with owners and dates, tracked like features**. A postmortem whose actions die in the backlog is a rehearsal for the repeat incident. "Root cause: human error" is banned — humans err at a constant rate; systems determine whether an error becomes an outage.

## Failure-mode index

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Can't trace a user report to a cause | Support ticket → no trace id → grep archaeology | Trace id in error responses + logs, joined | Wide events + trace propagation as service-template defaults |
| Alert fatigue → missed real page | Ack-without-action rate; weekly alert review | Delete/demote noisy alerts | Burn-rate SLO alerts only; runbook required to create a page |
| Retry+timeout storm during dependency brownout | Dependency latency up, *your* traffic to it also up | Circuit breaker + jittered retry, tuned together | Resilience config is shared library, reviewed as a unit |
| Liveness-probe cascade restart | All pods restart simultaneously on dependency blip | Liveness ≠ readiness; remove deps from liveness | Probe review in deploy checklist |
| Async paths invisible | Traces stop at the producer | Propagate context through message headers | OTel queue instrumentation in the consumer template |
| Metrics cardinality explosion | Prometheus/TSDB memory blowup | Drop unbounded labels | Label allowlist lint on metric definitions |
| Postmortem actions evaporate | Repeat incidents with same signature | Track actions in the feature tracker with dates | Monthly review of open postmortem actions |
