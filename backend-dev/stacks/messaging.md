# Kafka / RabbitMQ / SQS — Production Patterns & Common Pitfalls

**Tier:** Extended (production patterns + pitfalls; not full-depth). **Verified against:** Kafka 3.8–4.x (KRaft), RabbitMQ 3.13/4.x, SQS (2026 API). **Last reviewed:** 2026-07-06.
**Read with:** [async-work.md](../principles/async-work.md) and [concurrency.md](../principles/concurrency.md) §3–5 — the semantics (at-least-once, idempotency, outbox, DLQ) live there and apply to **all three** brokers. This doc is choosing between them and their specific traps.

## Choosing (decision tree)

- **Task queue** — jobs consumed once, retried, dead-lettered (emails, webhooks, thumbnails) → **SQS** if on AWS (zero ops, per-message visibility/DLQ/delay built in), else **RabbitMQ**.
- **Event stream** — multiple independent consumers, replay, ordering per key, high throughput (event sourcing, CDC, analytics feed, cross-team event bus) → **Kafka**. Retention + replay + consumer groups are the point; per-message ack/retry/delay are *not* natural there.
- **Complex routing** (topic exchanges, per-tenant queues, priorities, TTL-then-requeue tricks) → **RabbitMQ**.
- **Anti-pattern:** Kafka as a task queue (you'll fight per-message retry/DLQ/delayed-delivery — all bolt-ons) or RabbitMQ as an event log (no replay; a consumer added Tuesday missed Monday forever). Pick per workload; running two brokers for two genuinely different workloads is *less* complexity than forcing one to do both. And below ~100 jobs/s with a Postgres already in place, remember the DB-as-queue option ([async-work.md](../principles/async-work.md) §1).

## Kafka — the traps that page you

- **Partition count = max consumer parallelism per group**, and partitions are the unit of ordering (per-key ordering via key hashing). Choosing partition count is capacity planning ([async-work.md](../principles/async-work.md) §5): too few caps you (raising it later **breaks key→partition mapping** — plan generously up front); hot keys make hot partitions — monitor **per-partition** lag, not just total.
- **Rebalance storms:** a slow consumer misses `max.poll.interval.ms` (processing too long between polls) → kicked from group → rebalance → duplicates + pause; under sustained slowness this loops ("rebalance loop" — the fleet processes almost nothing while lag climbs). *Fix:* smaller `max.poll.records`, longer poll interval, cooperative-sticky assignor, move heavy work off the poll thread (with manual offset management). *Detection:* rebalance-rate metric + consumer-lag alert together.
- **Offset-commit discipline decides your delivery semantics:** auto-commit can commit offsets for messages you haven't finished (crash = **message loss** — at-most-once by accident). Commit **after** processing (at-least-once + idempotent handler — [concurrency.md](../principles/concurrency.md) §4), never before.
- **"Exactly-once" (EOS/transactions) covers Kafka→Kafka only.** Kafka→DB is the outbox/idempotency problem you already own ([concurrency.md](../principles/concurrency.md) §5). Consumer `isolation.level=read_committed` required to not see aborted transactional writes.
- Schema evolution: schema registry + compatibility mode (BACKWARD for consumer-first upgrades) from day one ([async-work.md](../principles/async-work.md) §2); "we'll add the registry later" ends with a poison-schema incident.
- Retention ≠ backup: `retention.ms` expiry silently deletes data a slow/broken consumer never read — lag alert thresholds must be **far** inside the retention window (lag measured in *time*, not messages).
- Producer: `acks=all` + `enable.idempotence=true` for anything that matters (defaults are this in modern clients — verify, don't assume); `linger.ms`/batching for throughput.

## RabbitMQ — the traps that page you

- **Unbounded queue growth kills the broker for everyone:** memory/disk alarms block *all* publishers cluster-wide — one team's stuck consumer stops every team's publishing (the shared-broker blast radius). *Prevention:* max-length or TTL on every queue + queue-depth alerts ([async-work.md](../principles/async-work.md) §2 backpressure); quorum queues (the modern default — use them, classic mirrored queues are deprecated) have saner flow control but the physics stand.
- **Prefetch (`basic.qos`) tuning:** unset = broker floods one fast consumer's buffer (others starve, and a crash redelivers a huge batch); 1 = safe but slow. Start ~10–50 for quick tasks, 1 for long tasks (Celery's `prefetch_multiplier` story in [stacks/python.md](python.md) §5 is this same knob).
- **Ack discipline:** manual acks after processing; `requeue=true` on a deterministic failure = **infinite hot loop** on the poison message ([async-work.md](../principles/async-work.md) §4) — always pair with delivery-count limit (quorum queues track `x-delivery-count`) → DLX. Configure the dead-letter exchange *at queue declaration*; retrofitting DLX means re-declaring queues.
- Connection/channel hygiene: connections are expensive (heartbeats, file descriptors), channels are cheap but **not thread-safe**; the connection-churn anti-pattern (open-publish-close per message) melts brokers. Long-lived connections, pooled channels, publisher confirms for anything that matters (fire-and-forget publish = silent loss on broker hiccup).

## SQS — the traps that page you

- **Visibility timeout vs processing time** is the whole game: timeout < worst-case processing = redelivery mid-work = duplicates at exactly your slowest moments ([async-work.md](../principles/async-work.md) §3). Set ≥ p99.9 processing time; heartbeat-extend (`ChangeMessageVisibility`) for variable jobs.
- **Standard queues re-order and duplicate by design** — at-least-once, best-effort ordering; if you assumed order, that's your bug, not AWS's. FIFO queues: ordering *per MessageGroupId* and 300–3,000 msg/s throughput ceilings (high-throughput mode raises it; check current quotas) — and **one slow message blocks its whole group** (head-of-line, by design — that's what ordering *means*; keep groups fine-grained).
- **DLQ via `maxReceiveCount` + redrive policy on every queue at creation** ([async-work.md](../principles/async-work.md) §4 — SQS makes the right thing a checkbox; teams still skip it). Alert on DLQ depth ≥ 1.
- Long polling (`WaitTimeSeconds=20`) always — short polling burns money and misses messages on sparse queues. Batch send/receive/delete (10×) for cost and throughput.
- **Delete-after-success only:** delete the message *after* the effect is durable, never on receive. Crash-after-receive-before-delete is the redelivery your idempotency ([concurrency.md](../principles/concurrency.md) §4) exists for.
- 256KB message cap: reference-not-payload ([async-work.md](../principles/async-work.md) §2); the S3-pointer extended-client pattern when you truly must ship blobs.

## Cross-broker pitfalls (all of them, every time)

| Pitfall | Applies to | Prevention |
|---|---|---|
| Handler not idempotent | all | [concurrency.md](../principles/concurrency.md) §4 — dedup key per message; redelivery test in CI ([testing.md](../principles/testing.md) §5) |
| Publish-after-commit dual write | all | Outbox ([concurrency.md](../principles/concurrency.md) §5) |
| No DLQ/poison plan at queue creation | all | Queue-creation checklist; DLQ depth alert day one |
| Lag/depth alert missing or measured wrong | all | Alert on **age/time-lag**, thresholds inside retention/SLA |
| Trace context dropped at the broker | all | Propagate via message headers ([observability.md](../principles/observability.md) §2) |
| Consumer deploys drop in-flight work | all | Graceful shutdown drain ([async-work.md](../principles/async-work.md) §5) |
