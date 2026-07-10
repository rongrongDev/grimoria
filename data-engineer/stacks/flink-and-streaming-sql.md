# Flink & Streaming SQL — extended tier: production patterns + common pitfalls

**Applies to:** Apache Flink 1.20 LTS / 2.x (2.0 GA March 2025); Kafka Streams 3.x/4.x; ksqlDB (maintenance-mode reality as of 2026); Spark Structured Streaming cross-references · **Last verified:** 2026-07-06 · Depth tier: **extended**. The watermark/lateness/delivery judgment is `data-engineer/principles/pipeline-correctness.md` §2, §4–5 — it applies verbatim; this doc is engine mapping + pitfalls.

## Choosing the engine

- **Flink**: the reference implementation of event-time stream processing — real watermarks, large keyed state, exactly-once via checkpoint barriers + 2PC sinks. Choose it for stateful streaming at scale (sessionization, streaming joins, CEP) where correctness under lateness/failure is the whole point. Cost: the highest operational skill floor in this KB (state backends, checkpoint tuning, savepoint discipline) — a Flink job is a *stateful service you operate*, not a query you schedule.
- **Kafka Streams**: a library, not a cluster — stream processing embedded in your service, state in RocksDB + changelog topics. Choose for service-scoped, Kafka-to-Kafka transformations owned by an app team. Wrong for platform-scale analytics jobs (scaling/ops coupled to app deployment).
- **Spark Structured Streaming**: micro-batch (100ms+ latency floor); right when the team is already Spark-deep and latency needs are seconds-not-milliseconds — one engine for batch + streaming is a real operational win (`stacks/spark.md` §6).
- **Streaming SQL layers** (Flink SQL — the healthy one; ksqlDB — treat as legacy for new builds): Flink SQL is the production choice for declarative pipelines; it compiles to the same runtime, so *every pitfall below still applies* — SQL syntax does not repeal state physics.
- **Or don't stream:** if the consumer reads it hourly/daily, a 5-minute micro-batch or Snowflake Dynamic Table (`stacks/snowflake.md` §5) delivers "fresh enough" at a tenth of the operational cost. Streaming is a latency SLA you pay for continuously — demand evidence someone needs it (the honest question that kills half of proposed streaming projects).

## Production patterns

- **Checkpointing is the correctness substrate** (Flink): exactly-once state via periodic distributed snapshots; end-to-end exactly-once only with transactional sinks (Kafka txn, Iceberg commit) — the boundary caveat of `stacks/kafka.md` §4 applies unchanged. Checkpoint interval trades recovery time vs. overhead (start ~1 min); **alert on checkpoint duration/failure trend** — growing checkpoints are the leading indicator of state growth and the classic pre-OOM signal.
- **Savepoints for every deploy:** stop-with-savepoint → deploy → restore. State schema evolution is constrained (POJO/Avro state evolution rules) — changing state types casually strands the accumulated state; plan state-schema changes like DB migrations (`principles/schema-evolution.md` thinking applied to operator state).
- **Watermarks:** per-source, delay from measured lateness P99, `withIdleness` for quiet partitions, watermark-lag on every job dashboard — all four rules from `principles/pipeline-correctness.md` §5, which was written from Flink scars.
- **State TTL on everything unbounded:** any keyed state without TTL (or windows without allowed-lateness bounds) grows monotonically with key cardinality. Every "Flink job OOMs after N weeks" postmortem I've read ends at an unbounded `MapState` keyed on user_id.
- **Streaming joins need bounded buffers:** interval joins (bounded time range) or temporal joins (versioned dimension lookup — the streaming SCD as-of join, `principles/data-modeling.md` §5) — an unbounded regular join in Flink SQL buffers *both streams forever* and is the #1 Flink SQL cost/OOM surprise, trivially easy to write and syntactically innocent.
- **Sink to table formats** (Iceberg/Delta with transactional commits) for the lake hand-off; commit interval tuned against small files (`stacks/lake-table-formats.md` §4, `stacks/spark.md` §5).

## Common pitfalls

| Pitfall | Symptom | Fix / prevention |
|---|---|---|
| Unbounded state (no TTL, unbounded SQL join, giant allowed-lateness) | Checkpoints grow week over week → slow recovery → OOM "after nothing changed" | State TTL policy per operator at design review; checkpoint-size trend alert; interval/temporal joins only |
| Watermark frozen by one idle source/partition | Windows stop emitting; downstream freshness dies while the job runs "green" | `withIdleness`; watermark-lag alert (the `principles/pipeline-correctness.md` §5 table) |
| Restart-from-scratch instead of savepoint during an incident | Weeks of keyed state gone; aggregates silently restart from zero — a *data* incident dressed as an ops action | Savepoint-first runbook; state-restore verification step; treat checkpoint dirs as data, not temp |
| Event-time skew between joined streams | Temporal/interval join buffers the fast stream to wait for the slow one — state balloons | Monitor per-stream watermark spread; bound the join interval to business-honest windows |
| Kafka Streams repartition-topic sprawl | Every re-key writes a full copy through Kafka; broker bills and lag surprise the app team | Review topology (`describe()`); co-partition by designing keys upstream (`stacks/kafka.md` §2) |
| "It's just SQL" staffing for Flink SQL | Correct-looking queries with unbounded state, no savepoint discipline, no watermark tuning | Staff/train for the runtime, not the syntax; every Flink SQL job gets the same design review as a coded job |

**Failure-mode framing:** streaming jobs fail as **state incidents** (growth → checkpoint decay → OOM; detection: checkpoint size/duration trends; prevention: TTL + bounded joins) and **time incidents** (watermark stalls/skew → silent output stop or drops; detection: watermark lag + dropped-late counters; prevention: idleness config + lateness-derived delays). Wire both metric families into the vital-signs layer (`principles/observability-and-lineage.md` §2) before launch, not after the first weekend page.

---

**See also:** `principles/pipeline-correctness.md` §5 (the watermark judgment) · `stacks/kafka.md` (the substrate) · `stacks/spark.md` §6 (the micro-batch alternative) · `stacks/lake-table-formats.md` (the sink).
