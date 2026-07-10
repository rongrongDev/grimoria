# Schema Evolution — compatibility, breaking-change detection, contracts

**Applies to:** tool-agnostic (registry examples: Confluent Schema Registry 7.x, Avro/Protobuf/JSON Schema; warehouse examples: Snowflake, dbt 1.9+) · **Last verified:** 2026-07-06

A schema is an API whose consumers you mostly can't see. This doc gives you the compatibility rules, the change taxonomy, how to detect breakage *before* it ships, and how to make producer/consumer teams safe by contract rather than heroics. The in-PR review procedure is the `schema-change-impact-reviewer` skill; whole-warehouse impact sweeps are the `lineage-blast-radius-scanner` agent. This doc is the judgment they encode.

---

## 1. The change taxonomy — memorize this table

| Change | Batch/warehouse consumers | Streaming (Avro/Proto) consumers | Verdict |
|---|---|---|---|
| Add nullable column / optional field | Safe (invisible until used) | Backward-compatible if it has a default | **Safe by default** |
| Add column `NOT NULL` w/o default | Breaks producers of the table (inserts fail loudly) | Breaks old producers | **Coordinate** |
| Widen type (int→bigint, varchar(50)→varchar(200)) | Usually safe; breaks strict-typed extracts (Parquet readers, ML feature stores pinned to int32) | Avro: promotable types only (int→long→float→double); others break | **Check consumers** |
| Narrow type / change type (string→int) | **Breaking** — casts fail or, worse, coerce silently | **Breaking** | Expand/contract only |
| Rename column/field | **Breaking, and silently** — `SELECT *` keeps working, joins/filters on the old name return null-matches, not errors | **Breaking** (rename = delete + add) | Expand/contract only |
| Drop column/field | Breaking for any reader of it | Backward-compatible only if consumers use defaults | Contract phase only, after verified zero readers |
| Change semantics, same name/type (cents→dollars, UTC→local, gross→net) | **The worst one.** Undetectable by any schema tool; only value-level tests catch it | Same | Treat as a new column with a new name; never repurpose |
| Change enum value set (add/remove/rename values) | Breaks `CASE WHEN` exhaustiveness silently — unknown values fall into `ELSE NULL` buckets | Avro enum add breaks old readers without a default | **Coordinate**; add accepted-values tests |
| Change table grain (one-per-order → one-per-order-line) | **Catastrophic and silent** — every downstream `SUM` inflates | n/a | This is a new table. Name it as one |
| Change partitioning/clustering | Not semantic — but can 10× consumer costs | n/a | Announce; check cost-sensitive consumers |

Two rules fall out of the table:

- **Silent breaks outrank loud breaks in danger.** A dropped column that crashes a dashboard gets fixed today. A renamed column that null-fills a join gets fixed after decisions were made on the wrong numbers (this is the incident behind core principle #2).
- **Semantic changes are invisible to every schema tool you own.** The only defenses are naming discipline (`amount_cents`, `_utc` suffixes; a repurposed column is forbidden) and value-level DQ tests (`data-engineer/principles/data-quality.md` §2).

## 2. Backward / forward compatibility, precisely

Terms trip people up; fix them once (registry semantics, Confluent convention):

- **Backward compatible:** *new reader* can read *old data*. Needed when consumers upgrade first, or when reprocessing history (a backfill is a new reader over old data — this is why compatibility matters even in batch).
- **Forward compatible:** *old reader* can read *new data*. Needed when producers upgrade first — the normal case for event streams, where you don't control consumer deploy order.
- **Full:** both. What you want on any topic/table with >1 consuming team, because you *never* actually control deploy order.

Registry enforcement modes to use: `BACKWARD_TRANSITIVE` at minimum, `FULL_TRANSITIVE` for shared topics — the `_TRANSITIVE` part matters because pairwise compatibility across versions does not compose; v3 can be compatible with v2 yet break v1 readers. Details and Avro/Protobuf specifics: `data-engineer/stacks/kafka.md` §5.

**Warehouse tables have no registry**, so you emulate the same guarantee with process: the expand → migrate → contract sequence.

## 3. Expand → migrate → contract (the only safe way to make a breaking change)

1. **Expand:** ship the new shape *alongside* the old. New column next to old column; new v2 topic/table next to v1; view with the old name over the new structure. Nothing breaks because nothing existing changed.
2. **Migrate:** move consumers one by one, at their own pace, with a deadline. You find the consumers via lineage (§ below); the deadline is what makes this finite. Dual-write or dual-populate during this phase; add a reconciliation check that old and new agree (a dual-write that drifts is two wrong tables instead of one).
3. **Contract:** remove the old shape only after *evidence* of zero readers — warehouse query history (`SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY`, BigQuery `INFORMATION_SCHEMA.JOBS`), consumer-group lag/absence on the old topic — not after the deadline alone. Evidence, then delete.

**The rename shortcut that actually works:** for warehouse tables, rename the physical column and immediately create/replace a view exposing *both* names, then contract the view later. Consumers see zero downtime; you get your clean name. dbt makes this a one-PR pattern.

**Grain changes and semantic changes don't get to use expand/contract on the same object** — they get a *new object* (`fct_orders_v2`, `order_lines`) and a full migration, because there's no way for two grains to coexist in one table.

## 4. Breaking-change detection before it hits downstream

Layers, cheapest first — a platform should have all four:

1. **Diff-time (CI on the producing repo):** schema files are code. dbt: compare compiled catalog against production manifest (`dbt-coves`/`recce`/state comparison — see `data-engineer/stacks/dbt.md` §7); migrations: any `ALTER/DROP/RENAME` statement in a PR triggers mandatory impact review. This is where the `schema-change-impact-reviewer` skill runs: it takes the diff + known consumers and applies §1's table.
2. **Registry-time (streams):** compatibility check on schema registration — the producer literally cannot publish an incompatible schema. Non-negotiable for any topic with an external consumer. `data-engineer/stacks/kafka.md` §5.
3. **Contract tests (cross-team CI):** consumer teams publish assertions about what they depend on (columns, types, enum values, grain) — as dbt tests in the consuming project against the source, GE suites, or an explicit contract file (dbt model contracts, `data-contract-specification` YAML). Producer CI runs consumer contracts; a red contract test is a conversation *before* the merge instead of an incident after. This is the machine positioned to say no (core principle #11).
4. **Runtime drift detection (last resort, still mandatory):** nightly schema snapshot per table, diffed; alert on any change not tied to an announced migration. Catches the changes that bypassed process — vendor feeds, manual DDL, "hotfixes." When this fires, you're in incident mode: `data-quality-incident-tracer` agent.

| | |
|---|---|
| **Failure mode** | Rename/type-change/semantic-change lands in production; downstream joins null out or sums shift; nobody alerted because nothing errored |
| **Detection** | Layers 1–3 above pre-merge; layer 4 + value-anomaly monitors post-merge; sudden null-rate spike on a join key is the classic signature |
| **Fix** | Revert the schema change if <hours old (restore the old name/type via view immediately — stops the bleeding while you plan expand/contract); then rebuild affected windows downstream |
| **Prevention** | Compatibility enforcement on every shared interface; expand/contract as the *only* path for breaking changes; contract tests owned by consumers; `schema-change-impact-reviewer` as a required PR check on schema-touching diffs |

## 5. Contract testing between producer and consumer teams — the working arrangement

What twenty years of cross-team incidents distills to:

- **The contract lives with the interface, is versioned, and both sides' CI runs it.** A wiki page is not a contract; a test that fails a build is.
- **Contract minimum:** column/field names + types, nullability, enum value sets, grain (as a uniqueness assertion), freshness SLA, and semantic units in the description (`amount_cents INTEGER — integer cents, USD`).
- **Producer owns compatibility; consumer owns their own assertions.** The producer team may not edit a consumer's contract test to make their change pass — that edit *is* the breaking change, made visible. (You will see this attempted. The review rule exists because it happens.)
- **Deprecation window is part of the contract** (e.g., 90 days from announce to contract), so producers aren't hostage to a consumer who never migrates, and consumers aren't ambushed.
- **Unknown consumers are the residual risk** — the analyst querying your table directly. You can't contract with who you can't see; you *can* reduce the unknowns by publishing marts (access-controlled, contracted) and locking raw layers down (`data-engineer/principles/security-and-governance.md` §2). Query history sweeps find the rest at contract time.

---

**See also:** `data-engineer/principles/data-modeling.md` (grain, and why grain changes are new tables) · `data-engineer/principles/observability-and-lineage.md` §3 (finding consumers) · `data-engineer/stacks/kafka.md` §5 (registry mechanics) · `data-engineer/stacks/dbt.md` §7 (model contracts, state-diff CI) · skills/agents: `schema-change-impact-reviewer`, `lineage-blast-radius-scanner`.
