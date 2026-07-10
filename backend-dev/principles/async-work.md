# Async & Background Work — Queues Are Where Failures Go to Multiply

**Last reviewed:** 2026-07-06. Broker-agnostic principles; Kafka/RabbitMQ/SQS specifics in [stacks/messaging.md](../stacks/messaging.md); Postgres-as-queue in [stacks/postgres.md](../stacks/postgres.md).
**Related:** [concurrency.md](concurrency.md) (idempotency, delivery semantics — read it first; every rule here assumes it), [observability.md](observability.md) (queue alerting).

A queue converts a synchronous failure ("the request errored, the user saw it, someone retried") into an asynchronous one ("the job failed at 2am, nobody saw it, and 40,000 more just like it are behind it"). That trade is usually right — but only if you build the failure half deliberately. Most teams build the happy path and discover the failure half during an incident.

---

## 1. Should this be a queue at all?

- **User needs the result to proceed** (payment authorization, availability check) → synchronous. Queueing it just adds a polling loop and a worse error story.
- **Work is slow, retryable, or bursty, and the user needs only an acknowledgment** (emails, exports, webhooks, thumbnailing, fan-out) → queue.
- **Work must survive process death** → queue with persistence. In-process `setTimeout`/`asyncio.create_task`/bare goroutines are **not** background job systems; every deploy silently discards them. I've seen "we lose some welcome emails every deploy" persist for a year because the loss was invisible.
- **Ordering across all messages required** → reconsider; global ordering serializes throughput. Usually you need ordering *per entity* (per order, per user) → partition/message-group by that key.
- **< ~100 jobs/sec and you already run Postgres** → a Postgres-backed queue (`FOR UPDATE SKIP LOCKED`) is operationally free and transactional with your data — you get exactly-once-ish enqueue via the outbox for nothing. Move to a real broker when throughput, fan-out, or retention demands it, not before.

## 2. Queue design decisions that are expensive to change later

- **Message = intent + reference, not payload.** Put `{"type":"order.paid","order_id":123,"occurred_at":...}` on the queue, not the whole order document. Fat messages go stale (consumer acts on old data), blow broker limits (SQS 256KB — I've seen a team discover this in production when order #40,001 had too many line items), and leak PII into broker storage/DLQs with different retention rules than your DB. Consumer re-reads current state by id. Exception: event-sourced pipelines where the event *is* the record.
- **Version your message schema from day one** (`"v":1` field or schema registry). The first breaking change without it requires draining the queue during a deploy — an operation with no good execution.
- **One queue per work type, not one mega-queue.** Separate queues get separate concurrency, separate DLQs, separate alerting, and a slow work type can't starve a fast one. Also split by priority/latency-class: bulk exports must never sit ahead of password-reset emails.
- **Backpressure at enqueue:** unbounded queues turn overload into multi-hour delay instead of fast failure. Bound depth (or age) and shed/reject at the producer when exceeded — a user told "try later" at t=0 is better than an email delivered 6 hours late.

## 3. Retry / backoff policy (the concrete numbers)

Defaults I'd deploy anywhere, then tune: **5 attempts, exponential backoff base 30s factor 4 with full jitter (≈30s, 2m, 8m, 32m), then DLQ.** Rationale: the first retry catches blips; minute-scale gaps ride out deploys and failovers; five attempts bounds the blast radius of a poison message to minutes of worker time.

- Classify errors: **retryable** (timeout, 5xx, deadlock, connection reset) vs **terminal** (validation failure, 404 on the referenced entity, deserialization error). Terminal errors go **straight to DLQ on attempt 1** — retrying a message that failed schema validation five times is just heating the datacenter and delaying the queue behind it.
- Retry counters must live **with the message** (delivery count header, SQS `ApproximateReceiveCount`), not in worker memory — workers restart.
- Visibility timeout / ack deadline **> worst-case processing time**, or the broker redelivers *while you're still working* and you process everything twice at exactly the worst moment (when you're slow). Prefer heartbeat/extension APIs for variable-length jobs.

## 4. Poison messages and dead-letter queues

A **poison message** fails deterministically every attempt — bad data, missing entity, a bug in the handler. Without a DLQ it either loops forever at the head of the queue (blocking everything behind it — the classic "queue is 4 hours deep but workers are 100% busy" page) or gets dropped silently. Both are worse than the failure itself.

DLQ rules that make it an instrument instead of a landfill:

1. **A DLQ with no alert is a data-loss device with extra steps.** Alert on DLQ depth > 0 (or rate > baseline) within minutes. The DLQ message *is* the incident signal.
2. Store alongside the message: the exception, stack trace, attempt count, first/last failure time, trace id. Debugging a bare payload three days later is archaeology.
3. **Build redrive before you need it:** a tool/runbook to replay DLQ messages (after the fix ships) with rate limiting, and to *purge* selectively. Redrive without rate limiting re-creates the original overload.
4. DLQ retention ≥ your realistic fix latency (14 days, not 4). And remember DLQ contents are production data — same PII handling as the DB ([security.md](security.md)).
5. Track poison-message *causes*. Three DLQ entries with the same stack trace are a bug ticket, not three replays.

## 5. Worker scaling

- **Scale on queue metrics, not CPU.** The right autoscaling signal is *backlog age* (age of oldest message, or depth ÷ processing rate = minutes-behind), because it encodes your latency SLO directly. CPU-based scaling of workers is wrong in both directions: I/O-bound workers show 15% CPU while the queue is an hour deep.
- **Know your downstream ceiling.** Workers amplify: scaling from 10 → 100 workers turns "queue is slow" into "database is down." Every worker pool needs a concurrency cap derived from what the DB/API it hits can absorb (connection-pool math from [data-layer.md](data-layer.md) §4 applies — workers count against `max_connections` too). The worst queue incident I've attended was an autoscaler responding to backlog by tripling workers, which saturated the DB, which slowed the *web* tier sharing it, whose timeouts enqueued retry jobs, which grew the backlog. Recovery required scaling workers **down**.
- Per-entity ordering under concurrency: partition by entity key (Kafka partitions, SQS FIFO message groups) so one entity's messages are serial while the fleet is parallel. Beware hot keys: one huge tenant = one hot partition = one maxed worker while 63 idle. Monitor per-partition lag, not just total.
- **Graceful shutdown is mandatory:** on SIGTERM stop *fetching*, finish in-flight work within the deploy grace period, then exit; anything unfinished must be safely redeliverable (which it is, because every handler is idempotent — [concurrency.md](concurrency.md) §4 — right?). Workers that die mid-job on every deploy are the #1 source of "mysterious" duplicate processing.
- **Long-term half-life warning:** any queue consumer fleet slowly accretes work types until one deploy's slow handler blocks another team's critical path. Revisit the one-queue-per-type rule (§2) whenever a new work type is added to an existing worker.

## 6. Scheduled & recurring work

- Cron across a fleet needs a **single-runner guarantee**: distributed lock (Postgres advisory lock is ideal — [concurrency.md](concurrency.md) §2) or a scheduler that owns this (K8s CronJob with `concurrencyPolicy: Forbid`). "It runs on both nodes sometimes" is how double-billing happens.
- Every scheduled job needs: a **missed-run detector** (dead-man's switch — alert when the job *didn't* run; jobs that silently stop are found weeks later via data staleness), idempotency (it will overlap or double-run eventually), and jitter if many instances/tenants schedule the same wall-clock time ([concurrency.md](concurrency.md) §6 — top-of-the-hour herds).
- Backfill/catch-up semantics: decide explicitly whether a job that missed 6 runs executes 6 times or once. Default to once (make the job "process everything since last watermark," not "process the last hour").

## Failure-mode index

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Poison message blocks queue | Oldest-message age grows while throughput normal | DLQ it; fix handler; redrive | Max-attempts + DLQ on every queue at creation time; terminal-error fast-path |
| Silent job loss (in-process tasks) | Users report missing emails/exports; no error anywhere | Move to persistent queue | Ban fire-and-forget for anything that matters; deploy-survival test |
| Redelivery mid-processing | Duplicate effects clustered at slow periods | Raise visibility timeout / heartbeat | Timeout ≥ p99.9 processing time; idempotent handlers |
| Worker scale-up kills DB | DB saturation correlated with worker count | Cap worker concurrency; scale down to recover | Downstream-ceiling math in every worker's config review |
| Backlog with idle-looking workers | Backlog age alert; per-partition lag | Find the hot partition / head-of-line blocker | Partition-key cardinality review; per-type queues |
| Scheduled job silently stops | Dead-man's switch fires | Re-enable; investigate scheduler | Every cron registers a missed-run alert at creation |
| DLQ as landfill | DLQ depth alert (you *do* have one) | Triage by stack trace; redrive after fix | DLQ alert + redrive runbook are part of "done" for any new queue |
