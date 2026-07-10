# Kafka — topics, delivery semantics, schema registry, consumers, the warehouse hand-off

**Applies to:** Apache Kafka 3.6–4.x (4.0 GA March 2025, KRaft-only — ZooKeeper removed; consumer rebalance protocol KIP-848 GA in 4.0); Confluent Schema Registry 7.x · **Last verified:** 2026-07-06

Kafka is the core-tier streaming substrate: the durable, replayable event log between producers and everything downstream. Most "Kafka problems" in data platforms are actually *contract* problems (schemas, §5) or *hand-off* problems (Kafka→warehouse, §6) — the broker itself is usually the healthiest component in the room.

---

## 1. The mental model

- **A topic is a replayable log, not a queue.** Messages aren't deleted on consumption; consumers track their own **offsets** per partition. This is the property everything else in this KB leans on: reprocessing = rewind offsets and replay (the streaming twin of backfills), and multiple consumers read the same stream independently.
- **Ordering exists per partition only.** Messages with the same key go to the same partition (hash-partitioned) and stay ordered; across partitions there is no order. Every ordering bug traces to violating this: keying by the wrong thing, or letting a topic's partition count change (rehashing scatters keys to new partitions — plan partition counts generously up front; changing them later breaks key→partition stability mid-stream).
- **Consumer groups** split partitions among members: max useful parallelism = partition count. Rebalances (member join/leave/crash) are the moment duplicates and reordering happen — design consumers assuming a rebalance can interrupt *anything* (KIP-848's incremental protocol in 4.x makes rebalances far less disruptive, not less real).
- **Retention is a policy, not forever:** time/size-based deletion, or **compaction** (keep latest per key — the changelog shape that backs "current state" topics and CDC). The retention window bounds your replay horizon: if the warehouse hand-off breaks for longer than retention, data is *gone* — size retention to your worst realistic recovery time, not to the storage bill alone (tiered storage, production-ready in 3.9/4.x, makes long retention cheap; use it for anything you'd ever replay).

## 2. Topic and key design

- **Key choice = ordering + skew decision in one.** Key by the entity whose updates must be ordered (order_id, user_id). High-skew keys (one whale customer) create hot partitions — same pathology as Spark skew (`stacks/spark.md` §3), same fixes conceptually (composite keys where ordering allows, or accept and provision for the whale).
- **Event design carries the modeling discipline:** stable `event_id` (dedup key — `data-engineer/principles/pipeline-correctness.md` §1 pattern 3), `event_time` distinct from broker timestamp (`principles/data-modeling.md` §5), schema-registered payload (§5). Events are immutable facts — "correcting" an event means emitting a compensating event, not editing history.
- **Topic granularity:** one topic per event type per domain as the default (`orders.order_placed`). The everything-bus topic forces every consumer to deserialize everything and makes schema governance per-message-type impossible; the topic-per-tenant explosion (thousands of topics) strains metadata — both extremes are known failure modes.
- Partition count: provision for target throughput ÷ per-partition throughput (measure; order-of-magnitude 10s of MB/s per partition), rounded up generously because of the rehashing trap above.

## 3. Consumer correctness — where the duplicates and losses are born

The offset-commit-vs-effect ordering is the whole game (`principles/pipeline-correctness.md` §2):

- **Commit after effect** (at-least-once, the default posture): crash between effect and commit → redelivery → the effect must be idempotent (dedup key in sink, upsert semantics). **Commit before effect = at-most-once** — silent loss on crash; this is what auto-commit (`enable.auto.commit=true`, the *client default*) does to you: offsets commit on a timer regardless of processing state. Disable auto-commit in anything that matters; commit explicitly after the effect.
- **Rebalance discipline:** long processing without polling triggers `max.poll.interval.ms` eviction → rebalance → the work you were doing is redelivered to someone else while you may still be finishing it (duplicate side effects even though "nothing failed"). Keep per-poll work bounded; heavy work goes to a downstream stage.
- **Consumer lag is the freshness vital sign of streaming** (`principles/observability-and-lineage.md` §2): monitor lag per group per partition (burrow/exporter), alert on trend (lag growing = falling behind) not just absolute. Per-partition matters: aggregate lag hides one stuck partition — which is also what freezes downstream watermarks (`principles/pipeline-correctness.md` §5).
- **The poison pill:** one malformed message crashes the consumer, it restarts on the same offset, crashes again — the whole partition is blocked behind one message. Every production consumer needs a dead-letter path (catch, publish to `<topic>.dlq` with error metadata, commit, continue) plus a DLQ volume monitor — an unmonitored DLQ is silent data loss with better manners (quarantine consequence-level, `principles/data-quality.md` §1).

| | |
|---|---|
| **Failure mode** | Loss via auto-commit/early-commit; duplicates via rebalance or crash-after-effect; partition blocked by poison pill; lag silently growing until retention expires unread data |
| **Detection** | Sequence-gap checks per key downstream; dedup-collision metrics; lag + DLQ monitors; reconciliation counts vs producer-side (`principles/data-quality.md` §2 control totals) |
| **Fix** | Loss: replay from source/backup for the window (retention permitting). Duplicates: dedup rebuild downstream. Blocked: DLQ the pill, then fix the parser |
| **Prevention** | Explicit commit-after-effect as code-review rule; DLQ scaffolded into every consumer; lag alerting from day one; retention ≥ worst-case recovery time |

## 4. Exactly-once semantics — what it covers and what it doesn't

- **Idempotent producer** (`enable.idempotence=true`, default since 3.0): dedups broker-side *per producer session per partition* — eliminates retry-duplicates from the producer path. Leave it on; it's nearly free.
- **Transactions / EOS**: atomic produce-to-multiple-topics + offset commit — gives exactly-once for **Kafka-in → process → Kafka-out** (Kafka Streams `processing.guarantee=exactly_once_v2`, or manual transactional producer + `read_committed` consumers). Real, works, bounded: **the guarantee dies at the boundary of the Kafka cluster.** The moment the effect is a warehouse row, an email, an API call — you're at-least-once again and back to idempotent-sink discipline (`principles/pipeline-correctness.md` §2's decision tree). Teams that believe "we have exactly-once" while running a JDBC sink into a warehouse have exactly-once *up to the exact point where it stopped mattering to them*.
- Even with EOS end-to-end inside Kafka, **keep `event_id`s in the payload** — someday someone will replay the topic on purpose (backfill, migration, disaster recovery) and application-level dedup is what makes replays safe.

## 5. Schema Registry — the contract enforcement point

This is `data-engineer/principles/schema-evolution.md` §2/§4 with teeth: the registry checks every new schema version against the topic's compatibility mode *at registration*, so an incompatible producer change fails in CI/deploy instead of in every consumer at 2am.

- **Compatibility mode:** `BACKWARD_TRANSITIVE` minimum; **`FULL_TRANSITIVE` for any topic with consumers you don't control.** Non-transitive modes check only adjacent versions — v3↔v2 compatible, v3↔v1 broken is exactly the hole transitive closes (consumers replaying history read *old* data with *new* readers).
- **Format judgment:** Avro and Protobuf both fine (Avro dominant in data-platform land, Proto where gRPC estates exist); **JSON Schema is the weak option** — optional-by-default semantics and loose typing make "compatible" checks pass changes that break consumers semantically. Whichever format: **defaults on every new field** is what makes evolution actually work (backward compat for added fields comes *from the default*, not from hope).
- **The registry can't see semantics** (cents→dollars in the same `long amount` — the worst change class from `schema-evolution.md` §1). Contract = registry compatibility + semantic conventions in field docs + value-level DQ downstream. Registry passing is necessary, never sufficient.
- Ops notes: schema-per-topic subject strategy default; never delete subjects with historical data still in retention (old messages become undeserializable — the registry is part of your *data's* dependency chain, back it up like one).

## 6. The Kafka→warehouse hand-off — where streams meet this KB's batch discipline

The highest-incident-density seam in modern platforms. Options, with the judgment:

- **Kafka Connect sinks** (Snowflake connector w/ Snowpipe Streaming, S3/Iceberg sinks, BigQuery): managed-ish, at-least-once by default → **land as append + dedup downstream on `event_id`** (`stacks/snowflake.md` §3's land→stage→merge). Connect's own failure modes: connector task stuck while others run (partial partitions landing — volume monitors catch what connector status hides), DLQ config (`errors.tolerance` + DLQ topic) off by default, and SMT-mangled payloads that "work" while corrupting.
- **Iceberg-native landing** (S3/Iceberg sink connectors; increasingly the default pattern by 2025–26): stream lands in a table format with real transactions; batch and streaming consumers share one copy (`stacks/lake-table-formats.md`). Watch commit frequency → small files (`stacks/spark.md` §5): commit intervals of minutes, plus scheduled compaction.
- **Flink/Spark streaming jobs** when the hand-off needs transformation/windowing en route (`stacks/flink-and-streaming-sql.md`).
- Whatever the transport: **reconciliation count producer-vs-warehouse per window** is the test that catches everything the transport hides (`principles/data-quality.md` §2 lens 3), and the lateness the hand-off introduces feeds the downstream watermark/lookback policy (`principles/pipeline-correctness.md` §4).

## 7. Governance and retention specifics

- **PII in topics:** long retention + immutable log = you cannot delete a subject's events row-wise. Options, decided *before* the first deletion request (`principles/security-and-governance.md` §3): short retention on PII-bearing raw topics (land to governed storage fast, expire the topic), or crypto-shredding (per-subject keys, destroy key to erase — the only workable answer for long-retention/compacted topics). Compacted topics *can* tombstone per key (`null` value deletes) — works when the key *is* the subject; useless for event topics keyed otherwise.
- **ACLs per principal per topic** (produce/consume separately); the "one service account every team shares" pattern makes access history meaningless and incident attribution impossible — same least-privilege logic as `security-and-governance.md` §2.

## 8. Operational failure modes (broker/platform level)

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| **Retention expires unread data during a long consumer outage** — silent permanent loss | Lag vs retention-window headroom monitor ("time until oldest-unread expires") | If tiered storage / upstream copy exists, replay; otherwise it's gone — declare the gap honestly | Retention ≥ recovery time; headroom alert at 50% |
| **Hot partition** — one whale key saturates one broker/consumer | Per-partition throughput + lag spread | Re-key (composite), or isolate the whale's processing | Key-skew review at topic design; per-partition dashboards |
| **Rebalance storms** — flapping consumer (GC pauses, crash loops) rebalances the group continuously; throughput craters | Rebalance-rate metric; generation id churn | Fix the flapping member; static membership (`group.instance.id`) for stable fleets | KIP-848 protocol (4.x) + static membership + sane `max.poll.interval.ms` |
| **Unmonitored DLQ swallowing a feed** | DLQ volume alert (absolute + share-of-topic) | Drain: fix parser, replay DLQ to main path | DLQ monitor scaffolded with every consumer (it's quarantine, and quarantine gets a monitor — `principles/data-quality.md` §1) |
| **ZooKeeper-era runbooks against KRaft clusters** (4.x) | Upgrade planning review | Rewrite ops runbooks; KRaft quorum ops differ materially | Treat the 3.x→4.x jump as an ops-retraining project, not a version bump |

---

**See also:** `data-engineer/principles/pipeline-correctness.md` §2/§5 (delivery semantics + watermarks — the theory §3–4 implement) · `principles/schema-evolution.md` (the contract judgment §5 enforces) · `stacks/flink-and-streaming-sql.md` (stream processing on top) · `stacks/lake-table-formats.md` + `stacks/snowflake.md` §3 (the landing zones) · `data-engineer/GLOSSARY.md` (offset, consumer group, compaction, DLQ, EOS).
