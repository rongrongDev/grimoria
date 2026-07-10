# Spark — partitioning, skew, shuffle, OOM diagnosis, small files

**Applies to:** Spark 3.5.x and 4.0 (4.0 GA May 2025; AQE-on-by-default since 3.2; examples use PySpark + Spark SQL) · **Last verified:** 2026-07-06

Spark is where the platform's *distributed-processing* judgment lives: this doc carries the full failure→detection→fix→prevention depth for partitioning, shuffle, skew, memory, and small files. The unifying model: **almost every Spark performance and stability problem is a data-distribution problem** — the engine is fine; your keys are not.

---

## 1. The execution model you must hold in your head

Driver plans; executors run tasks over partitions; **stages** break at shuffle boundaries. A *shuffle* physically redistributes every row across the network by key — it is the most expensive thing Spark does, and wide operations (`join`, `groupBy`, `distinct`, `repartition`, window functions over non-aligned partitions) each buy one.

Three numbers explain most jobs: **partition count** (parallelism), **partition size distribution** (skew), **shuffle bytes** (cost). The Spark UI's stage view shows all three; learn to read task-duration percentiles there — *max ≫ median task time is skew, full stop* (§3).

**AQE (Adaptive Query Execution, on by default 3.2+)** re-plans at runtime: coalesces tiny shuffle partitions, converts sort-merge joins to broadcast when the built side turns out small, and splits skewed partitions (`spark.sql.adaptive.skewJoin.enabled`). AQE fixes the *easy* versions of §2–3 automatically — know it exists so you don't cargo-cult 2015-era manual tuning, and know its limits: it can't fix skew in aggregations-before-join or a fundamentally wrong key choice.

## 2. Shuffle cost — the optimization hierarchy

In order; each level beats tuning the one below (same shape as the SQL list in `data-engineer/principles/cost-and-performance.md` §2, because it's the same physics):

1. **Don't shuffle: prune first.** Filter and select columns *before* wide operations. Predicate pushdown into Parquet/Iceberg does this for free **if** filters are on partition/sorted columns and not function-wrapped.
2. **Don't shuffle: broadcast the small side.** Dimension-to-fact joins should broadcast the dimension (`broadcast(dim)` hint; auto under `spark.sql.autoBroadcastJoinThreshold`, default 10MB — raise it deliberately for known 100MB dims, don't disable it). A broadcast join replaces a full shuffle of the fact table with a copy of the small table to each executor. **The OOM caveat:** broadcasting something that *isn't actually small* (an unfiltered "dimension" that grew 50× since the code was written) OOMs the driver or executors — the classic "job that ran for two years then started dying."
3. **Shuffle less: pre-aggregate before joining.** `groupBy` each side to the join grain first — shuffling aggregates is orders cheaper than shuffling raw events (and it's the fan-out guard from `principles/data-modeling.md` §1 in Spark clothing).
4. **Shuffle once: align partitioning with the operation sequence.** Repeated joins/aggregations on the same key should share one repartition. For repeated *batch* jobs over the same tables, bucketing (or Iceberg sorted/bucketed layout) pre-pays the shuffle at write time.
5. **Then tune:** shuffle partition count (`spark.sql.shuffle.partitions`, default 200, wrong for almost everyone; AQE coalescing mostly obsoletes hand-setting it — set the *initial* high for big jobs and let AQE shrink), compression, off-heap. Tuning a job that shuffles 40TB it didn't need to shuffle is polishing a sinking ship.

| | |
|---|---|
| **Failure mode** | Job shuffles raw width/volume it never needed; runtime and cluster cost grow superlinearly with data; eventually hits §3/§4 failures |
| **Detection** | Spark UI: shuffle read/write bytes per stage vs input size (shuffle ≈ input on a job that "just aggregates" means a missing pre-aggregation or exploding join); cost-per-run trend (`principles/observability-and-lineage.md` §5) |
| **Fix** | Apply the hierarchy top-down; check the query plan (`df.explain()`) for join strategies actually chosen |
| **Prevention** | Plan review on new heavy jobs: expected shuffle bytes stated in the PR; broadcast-size assumptions written down next to the hint that encodes them |

## 3. Skew — the straggler factory

One key (the null key, the "unknown" user, the mega-tenant, today's date in an event stream) holds 100× the median partition's rows; one task runs for hours while 399 finish in minutes; the stage is as slow as its fattest key, and you bill for 400 executors' idle time (`principles/cost-and-performance.md` §1).

**Detection:** stage task-duration max ≫ P50 in the UI; a "hanging" job whose last task never finishes; executor OOMs concentrated on specific tasks. Then find the key: `df.groupBy(key).count().orderBy(desc("count")).show(20)` — the offender is usually obvious and usually semantically meaningful (nulls, defaults, a bot, your biggest customer).

**Fixes, in order of preference:**
1. **Handle the degenerate keys semantically.** Null/unknown join keys can't match anything — filter them out of the join and union them back (or salt only them). This is the fix ~half the time, and it's free.
2. **Let AQE skew-join handle it** (3.2+): verify `skewJoin.enabled` and that thresholds fit your partition sizes. Works for join skew; not for aggregation skew.
3. **Salting** for genuinely hot keys in joins: append a random salt (0..N) to the hot side's key, replicate the small side N ways, join, strip. For aggregation skew: two-phase aggregate (partial agg on salted key, then final agg).
4. **Isolate the whale:** process the top-K keys in a dedicated path (broadcast or single-key job), union with the well-behaved bulk. Ugly, honest, effective for the one-mega-tenant shape.

**Prevention:** key-cardinality/frequency profile as part of new-pipeline design (the `dq-test-planner`'s volume profiling doubles as this); a standing top-key monitor on tables known to grow whales — skew is usually *acquired*, not born: the pipeline was fine until one customer 100×'d.

## 4. Out-of-memory — a diagnosis tree, not a memory-bump ritual

The reflex "increase `spark.executor.memory` and rerun" works just often enough to have destroyed more debugging discipline than any other knob in data engineering. Diagnose by *where* it died:

- **Driver OOM** → the job pulled data to the driver: `collect()`/`toPandas()` on something big (grep for them; `toPandas` on an unbounded frame is the #1 notebook-to-production killer), a broadcast that outgrew its assumption (§2), or millions-of-tasks metadata (§5 small files). Fix the pull, not the driver size.
- **Executor OOM, concentrated on few tasks** → skew (§3). Memory bumps just move the death threshold; fix the key distribution.
- **Executor OOM, broad** → partitions too large for the memory-per-core math: `executor_memory / cores_per_executor` is what one task actually gets, and halving cores doubles per-task memory at constant cluster cost — often the *right* "moar memory" move. Causes: too few input partitions (huge unsplittable gzip files — recompress to zstd/snappy or splittable formats), `maxPartitionBytes` too high, an `explode()` inflating rows mid-task, or a window function over a giant unbounded frame per key (reframe or pre-bucket).
- **OOM after "caching everything"** → `cache()`/`persist()` of frames larger than cluster memory evicts, respills, thrashes. Cache only what's reused ≥2× *and* fits; `unpersist()` when done; `MEMORY_AND_DISK` as the default persist level, not `MEMORY_ONLY` heroics.
- **Container killed by YARN/K8s (exit 137) but heap was fine** → off-heap/overhead (Python workers in PySpark UDFs, netty buffers): raise `spark.executor.memoryOverhead` — this one *is* legitimately a memory-config fix, and knowing that it's the *only* branch where that's true is the point of the tree. (Heavy Python UDFs also deserve scrutiny per se: prefer native Spark functions or pandas/Arrow UDFs; a row-at-a-time Python UDF serializes every row across the JVM↔Python boundary — 10–100× slower and an overhead-OOM factory.)

**Prevention:** memory-per-core stated in the job's config comments; `collect`/`toPandas` linted against in pipeline code; partition-size sanity (target 100–500MB in-memory per partition) checked when input volume grows past design assumptions.

## 5. Small files — death by metadata

Thousands of KB-scale files per partition (born from over-parallel writes: 200 shuffle partitions × 365 date partitions = 73k files per year per table; or streaming micro-batches landing every 30s). Every reader then pays per-file listing/open/footer overhead that can dwarf data time; the driver burns memory planning millions of splits; the object store throttles LIST calls.

- **Detection:** file count and avg file size per partition (table-format metadata or storage inventory); job spends minutes in "listing files"; driver OOM on planning.
- **Fix:** compact — rewrite partitions to target sizes (Iceberg `rewrite_data_files`, Delta `OPTIMIZE`; plain-Parquet dirs need a rewrite job). One-time fix decays immediately if the writer keeps sprinkling; fix the *writer*: `coalesce(n)`/AQE-coalesced final stage sized to output volume, fewer/larger micro-batches, or write through a table format whose maintenance jobs you schedule.
- **Prevention:** target file size 128MB–1GB; **compaction as a scheduled job, not an annual archaeology dig** (`stacks/lake-table-formats.md` §4); file-count monitor per table with the vital signs.

## 6. Writing safely — where Spark meets pipeline correctness

- **Idempotent writes:** `INSERT OVERWRITE` partitions with `spark.sql.sources.partitionOverwriteMode=dynamic`. **Static mode (the default!) truncates every partition of the table before writing the ones you supplied** — the config difference between "re-ran one day" and "deleted three years"; it has done exactly that. Set dynamic at the session level in every batch job template. Table formats (Iceberg/Delta) make this transactional and add `MERGE` — strongly prefer them for any mutable table (`stacks/lake-table-formats.md`).
- **No half-written reads:** plain-Parquet directory writes are non-atomic (readers see partial files mid-write; a killed job leaves debris). Table formats fix this with snapshot isolation; if you're stuck on plain directories, write-to-staging-then-rename and `_SUCCESS` markers are the legacy discipline.
- **Determinism traps for retries:** a retried/re-run job should produce identical output (`principles/pipeline-correctness.md` §1) — `rand()`, `monotonically_increasing_id()`, and unseeded sampling are not deterministic across runs/partitionings; anything keyed on them reshuffles identity on every retry. Use content-derived keys (hashes) instead.
- **Streaming (Structured Streaming):** exactly-once to a sink = checkpointing + idempotent/transactional sink; the watermark judgment is `principles/pipeline-correctness.md` §5 verbatim (`withWatermark` per stream, lag monitoring, stalled-source idleness). Never delete the checkpoint dir to "fix" a stuck stream without understanding you're choosing a reprocess-or-skip (see the offsets discussion in `stacks/kafka.md` §3).

## 7. When not to use Spark

The honest sizing question, because Spark's operational tax is real: **if the working set fits one big machine (~hundreds of GB), DuckDB/Polars/plain warehouse SQL is faster to run, faster to debug, and an order of magnitude cheaper to operate.** Spark earns its complexity at: multi-TB batch, streaming+batch unification needs, ML feature pipelines coupled to distributed training, or when the lake *is* the platform. "We might need scale later" is how teams pay the distributed tax for years on gigabyte data — and conversely, warehouse SQL pushed past ~10TB-per-transform economics is how bills explode; the crossover is a cost calculation, not an identity.

---

**See also:** `data-engineer/principles/cost-and-performance.md` (the money view of the same physics) · `principles/pipeline-correctness.md` (write patterns §6 implements) · `stacks/lake-table-formats.md` (the storage layer that fixes atomicity/compaction) · `stacks/kafka.md` (the streaming source) · `data-engineer/GLOSSARY.md` (shuffle, skew, AQE, salting).
