# Data Modeling — grain, dimensional modeling, SCDs, denormalization, batch + streaming

**Applies to:** tool-agnostic (SQL examples target Snowflake; dbt 1.9+ for snapshot mechanics) · **Last verified:** 2026-07-06

Modeling decisions outlive every tool choice. The warehouse you pick will be migrated; the fact/dimension split you design will be copied into the next warehouse verbatim. This doc is the judgment layer: what to decide, in what order, and the traps that produce silently-wrong numbers years later.

---

## 1. Grain first. Everything else second.

The grain is the answer to "what does one row mean?" — one row per *order*? per *order line*? per *order line per day it changed*? Decide it before writing any SQL, write it in the model's docs, and **enforce it with a uniqueness test on the grain columns**. An unenforced grain is a rumor.

**Why it's principle-level:** every aggregate downstream assumes the grain. Join a per-customer table to a per-customer-per-device table and `SUM(revenue)` multiplies by device count. This fan-out is the single most common cause of "the dashboard says 3× reality," and it's silent — no error, no null, just a bigger number. (Core principle #7.)

**Fan-out discipline:** before any join, state both grains. If the right side is finer than the join key, you must aggregate it first or accept row multiplication deliberately. A `LEFT JOIN` that can multiply rows in a fact-building model = review blocker. Detection after the fact: `SELECT key, COUNT(*) ... HAVING COUNT(*) > 1` on what should be the coarse side.

| | |
|---|---|
| **Failure mode** | Undeclared/violated grain → duplicate rows or join fan-out → inflated aggregates, silently |
| **Detection** | Grain uniqueness test; sum of fact ≈ N× control total; row count of joined model > row count of driving table when it shouldn't be |
| **Fix** | Dedup to the declared grain (pick a deterministic winner via `ROW_NUMBER`), or re-declare the grain honestly and version the table (a grain change is a new table — `data-engineer/principles/schema-evolution.md` §1) |
| **Prevention** | Grain stated in every model's YAML description + `unique` test on grain columns as a merge requirement; join review rule above |

## 2. Dimensional modeling: star schema as the default consumer-facing shape

Facts (events/measurements at a declared grain, mostly additive numerics + foreign keys) surrounded by dimensions (the descriptive context: who, what, where). Star — denormalized dimensions — over snowflake-normalized dimensions, because consumer query simplicity and fewer join hops beat storage purity in a columnar warehouse where storage is nearly free and joins are the cost.

Judgment that doesn't appear in the textbook:

- **Layer it:** raw (immutable landing, source shape) → staging (1:1 with source, renamed/typed/deduped) → marts (facts + dims). Consumers touch only marts. The layers are what make schema evolution survivable: you can absorb an upstream rename in staging without touching fifty mart models.
- **Additivity is a design property.** Fully additive measures (amounts, counts) sum along every dimension. Semi-additive (balances, inventory levels) must not be summed over time — enforce with a snapshot-fact pattern and *name the table* so misuse is hard (`fct_account_balance_daily_snapshot`, not `fct_balances`). Non-additive ratios never go in facts; store numerator and denominator, compute the ratio at query time.
- **Surrogate keys** on dimensions (hash or sequence), because natural keys get reused by source systems (a "unique" vendor customer ID recycled after account deletion has broken more joins than any type error) and because SCD2 (§3) requires a key per *version*.
- **Late-arriving dimensions:** a fact can arrive before its dimension row (new product sold in the same batch it's created). Never drop the fact and never inner-join it away: insert a placeholder dimension row (`unknown` member with the natural key), let the next dimension load flesh it out. An `INNER JOIN dim_product` in a fact model is a silent-data-loss bug wearing a tidiness costume — use LEFT JOIN + placeholder, and monitor placeholder counts.
- **Conformed dimensions** (one `dim_customer` shared by all facts) are what make cross-fact analysis possible; every team building its own customer dimension is how you get three answers to "how many customers do we have." One owner, one dimension, contracts on it (`data-engineer/principles/schema-evolution.md` §5).

## 3. Slowly changing dimensions — the decision tree

The question: when a dimension attribute changes (customer moves city, product changes category), what happens to history?

- **Type 1 (overwrite):** when only the current value has business meaning, or history is noise (typo fixes, formatting). Cheapest; destroys as-of analysis. **Warning:** T1 on any attribute used to slice historical metrics silently *rewrites history* — last year's revenue-by-region changes when a customer moves. If anyone asks "why did last quarter's number change," a T1 attribute is suspect #1.
- **Type 2 (versioned rows):** when you need *as-of* truth — the row carries `valid_from`, `valid_to`, `is_current`, and a new surrogate key per version. Facts join to the version current *at event time*. This is the default for anything feeding finance, compliance, or ML training sets (training on today's attributes for last year's events is target leakage).
  - Mechanics: dbt snapshots (`data-engineer/stacks/dbt.md` §5) or MERGE-based upsert closing the old row and opening the new.
  - **The as-of join must actually be as-of:** `JOIN dim ON key AND event_ts >= valid_from AND event_ts < valid_to`. Joining SCD2 on `is_current` reintroduces T1 semantics through the back door — most common SCD2 bug in the wild, and it's silent.
  - Guard test: exactly one current row per natural key; no overlapping/gapping validity windows.
- **Type 3 (previous-value column):** almost never. Only for a single planned transition (a one-time territory realignment where "old vs new" is the whole analysis). It can't handle a second change; don't let it masquerade as history.
- **Hybrid reality:** choose *per attribute*, not per table — T2 on the attributes analysts slice history by, T1 for the rest, in one dimension. Fewer version rows, cheaper joins.

**Cost note:** T2 on a fast-changing attribute (e.g., a mutable `last_seen_at`) explodes row counts — a 10M-customer dimension with a daily-changing tracked column becomes billions of rows. Fast-changing attributes get exiled to their own mini-dimension or a fact, not tracked in SCD2.

| | |
|---|---|
| **Failure mode** | T1 rewriting sliced history; SCD2 joined on `is_current`; overlapping validity windows double-matching facts |
| **Detection** | Published historical metrics restate without cause; SCD2 window-overlap test fails; fact row count inflates after dimension load |
| **Fix** | Rebuild dimension from source history (snapshots/CDC log) if you have it — if you don't, history is *gone*; this is why you snapshot from day one even when nobody has asked for history yet |
| **Prevention** | SCD tests: one-current-per-key, no-overlap, no-gap; as-of join enforced via a reusable macro instead of hand-written predicates; per-attribute SCD choice documented in the model YAML |

## 4. When to denormalize

Denormalization is buying query performance and consumer simplicity with a maintenance liability. In a columnar warehouse the default is *more* denormalized than OLTP instincts allow — but each denormalized copy is a consistency obligation you now own.

Decision tree:
- **Wide star dimensions** (flattening snowflaked lookups into the dim): yes, basically always. This is just star schema.
- **Attributes copied onto facts** (e.g., `customer_region` on the order fact): yes when (a) it's the as-of-event-time value — which *conveniently solves* SCD2-at-query-time for your hottest slice — or (b) a top-3 filter/group column for consumers. No when the attribute must reflect *current* state (then it belongs only in the dimension; a stale copy on 2B fact rows is unfixable without a rebuild).
- **Pre-joined "one big table" (OBT) marts:** yes as a *last-mile* layer for a specific BI/consumer surface, generated from the star by the pipeline. No as a replacement for the star — OBTs multiply grains confusingly, and when two OBTs disagree there's no arbiter unless the star underneath is the source of truth.
- **Pre-aggregation:** see `data-engineer/principles/cost-and-performance.md` §4 (materialize vs compute-on-read) — same tradeoff, cost-flavored.

The failure mode of over-denormalization is always the same: **drift between copies**. Prevention: every denormalized copy is produced by the pipeline from the normalized source (never hand-maintained, never dual-written by an app), and a reconciliation test asserts copy == source on a sample.

## 5. Modeling for both batch and streaming consumption

The mistake to avoid: designing the warehouse model, then bolting streaming on as an afterthought with different keys, different timestamps, and different semantics — yielding two irreconcilable versions of truth.

- **Model events as immutable facts at the stream layer** (append-only, event time carried explicitly, stable `event_id`); derive *state* (current order status) as a projection. Streams-of-events unify the two worlds: batch consumes the same events via the landing table; the "table" is always rebuildable as a fold over the log.
- **Same business keys and event-time semantics on both paths.** If the stream keys on `session_id` and the warehouse on `user_id||day`, reconciliation is impossible by construction and every discrepancy investigation dead-ends.
- **Timestamps:** carry at minimum `event_time` (when it happened, source-assigned) and `ingested_at` (when we got it). Every lateness policy (`data-engineer/principles/pipeline-correctness.md` §4–5) and every incident timeline needs both; a table with one timestamp of ambiguous meaning is a recurring incident generator.
- **Dimensions in streaming joins:** stream-side enrichment joins against a *changelog* of the dimension (CDC topic / compacted topic) hit the same SCD problem as batch — decide as-of-event-time vs current explicitly. Enriching with "current" at process time means replaying the stream tomorrow gives different answers than it gave today: your reprocessing is no longer deterministic. If replays must be faithful, enrich as-of.
- **Lambda-style dual paths (stream for fresh, batch for correct) need a reconciliation job** and a stated hand-off point ("intraday numbers are stream-derived and provisional; T+1 the batch restates"). If you can keep one path (increasingly viable — see `data-engineer/stacks/flink-and-streaming-sql.md` and `lake-table-formats.md`), do; two implementations of the same metric *will* diverge and you will spend weekends explaining which is right.

---

**See also:** `data-engineer/principles/schema-evolution.md` (changing models safely once built) · `data-engineer/principles/data-quality.md` (the tests that enforce grain/SCD invariants) · `data-engineer/stacks/dbt.md` (layering + snapshots in practice) · `data-engineer/GLOSSARY.md` (grain, SCD, additivity, conformed dimension).
