# SQL Correctness & Analytical Patterns

**Version 1.0.0 · 2026-07-06 · Core tier — full depth.**
Applies to: ANSI SQL as implemented in modern analytical warehouses (BigQuery
Standard SQL, Snowflake, Redshift, Postgres 14+). Dialect differences are flagged
inline. Standalone doc; the callable procedure built on it is the
`metric-definition-auditor` skill (`.claude/skills/metric-definition-auditor/`).

The queries in this doc are wrong in ways that **return plausible numbers**. That is
the theme: analytical SQL rarely errors — it silently answers a different question
than the one you asked. Every section: failure mode → detection → fix → prevention.

---

## 1. Silent join fan-out (the #1 wrong-number generator)

**Failure mode.** Joining a table at one grain to a table at a finer grain without
realizing it. `orders JOIN order_items` duplicates each order row once per item;
`SUM(orders.amount)` now counts each order's amount N times. The query runs, the
number is plausible, and revenue is inflated 2–3×.

**War story.** A weekly exec dashboard showed subscription revenue growing 40% while
finance showed 12%. Root cause: someone joined `subscriptions` to `payment_attempts`
(1:N — retries!) to add a payment-status filter, and every retried subscription
counted once per attempt. It shipped because the number *went up*, and nobody audits
numbers that go up. Three weeks of decisions were made on it. Detection took an hour;
the trust took a quarter to rebuild.

**Detection.**
```sql
-- Before/after row count: any unexplained increase after a join is fan-out.
SELECT COUNT(*) AS rows, COUNT(DISTINCT order_id) AS orders FROM base;      -- e.g. 1000 / 1000
SELECT COUNT(*) AS rows, COUNT(DISTINCT order_id) AS orders FROM joined;    -- 2400 / 1000 ← fan-out
```
If `rows > COUNT(DISTINCT <grain key>)`, you have duplication at that grain.
Also: check the join key's uniqueness on the *many* side —
`SELECT key, COUNT(*) FROM right_table GROUP BY 1 HAVING COUNT(*) > 1 LIMIT 10`.

**Fix.** Pre-aggregate the finer-grained side to the join grain *before* joining:
```sql
WITH item_totals AS (
  SELECT order_id, SUM(quantity) AS items, SUM(amount) AS item_amount
  FROM order_items GROUP BY 1
)
SELECT o.order_id, o.amount, t.items
FROM orders o LEFT JOIN item_totals t USING (order_id);
```
`COUNT(DISTINCT ...)` "fixes" counts but not sums, and hides the design error — use
it as a diagnostic, not a fix. (Looker's symmetric aggregates solve this inside the
BI layer — `bi-tools.md` §2 — but hand-written SQL has no such safety net.)

**Prevention.**
- Convention: every CTE ends at a **stated grain**, written as a comment
  (`-- grain: one row per order_id`). Reviewers check the claim, not the vibes.
- Peer-review checklist item: "for each join, what is the expected cardinality
  (1:1, 1:N, N:1), and does the aggregation happen at the right grain?"
- In dbt/warehouse tests: uniqueness tests on every model's declared key.

---

## 2. NULL handling in aggregates and filters

**Failure modes** (each returns a plausible wrong number):

| Pattern | What actually happens |
| --- | --- |
| `AVG(score)` | NULLs silently excluded — average of *respondents*, not population. |
| `COUNT(col)` vs `COUNT(*)` | Counts non-NULL values, not rows. Both are legitimate; mixing them mid-report is not. |
| `WHERE status != 'churned'` | Rows with NULL status are dropped from *both* branches — they're not `!= 'churned'` in three-valued logic. |
| `NOT IN (SELECT id FROM x)` | If the subquery returns even one NULL, the whole predicate is never true → **zero rows**, silently. |
| `SUM(a) + SUM(b)` vs `SUM(a + b)` | Row-level `a + b` is NULL if either side is NULL; the second form undercounts. |

**Detection.** Profile NULL rates on every column your query filters or aggregates:
`SELECT COUNT(*) - COUNT(col) AS nulls, COUNT(*) AS total FROM t`. A denominator
that changes when you switch `COUNT(*)` ↔ `COUNT(col)` is a red flag to chase, not
smooth over.

**Fix.** Make NULL policy explicit at the point of use: `COALESCE(status,'unknown')`
*with a comment saying why that default is correct for this business question*;
`NOT EXISTS` instead of `NOT IN`; `WHERE status IS DISTINCT FROM 'churned'`
(Postgres/Snowflake; BigQuery: `IS NOT DISTINCT FROM` ≈ null-safe equal) when NULLs
should count as "not churned."

**Prevention.** Metric specs (`metric-design.md` §2) must state the NULL policy for
every input column. Review question: "for each filtered column, where do the NULLs
go, and is that where the business wants them?"

---

## 3. Time zone bugs in date filters

**Failure mode.** Timestamps stored in UTC, filtered or truncated as if local (or
vice versa). `DATE(created_at)` in a UTC warehouse assigns a purchase made 5 PM
Pacific on the 3rd to the 4th. Daily metrics shift by up to a full day's tail;
"yesterday" reports disagree with app-side analytics; month-end revenue lands in
the wrong month and finance notices.

**Detection.**
- Hour histogram: `SELECT EXTRACT(HOUR FROM created_at), COUNT(*) ... GROUP BY 1`.
  A US-centric product whose traffic "peaks" at 02:00 is storing UTC and being read
  as local (or the reverse).
- Compare one day's total against a source-of-truth system with a known zone; a
  consistent few-percent mismatch that grows on high-variance days is a tz boundary.

**Fix.** Convert explicitly, once, at the point of truncation:
```sql
-- BigQuery
DATE(created_at, 'America/Los_Angeles')
-- Snowflake
DATE(CONVERT_TIMEZONE('UTC','America/Los_Angeles', created_at))
-- Postgres
(created_at AT TIME ZONE 'America/Los_Angeles')::date
```
Never fix with `± INTERVAL '8 hours'` — it breaks twice a year on DST.

**Prevention.** A written, KB-level convention (put it in the metric spec template):
*all storage in UTC; all business-day reporting in one named reporting zone;
conversion happens exactly once, in the semantic layer, never in ad-hoc queries.*
Name the zone in every dashboard's date-axis label ("Day (America/Los_Angeles)").

---

## 4. Off-by-one date-range logic

**Failure mode.** `BETWEEN '2026-06-01' AND '2026-06-30'` on a **timestamp** column
includes June 30 *only at exactly midnight* — the last day is 99.99% missing, the
month is ~3% low, and month-over-month "growth" appears when June's missing tail is
compared to a fully-counted May. The twin failure: `BETWEEN` on dates at both ends of
adjacent ranges double-counts the boundary day.

**Detection.** Daily row counts across the boundary: a final day at ~0.01% of normal
volume is the timestamp-BETWEEN bug. Sum of weekly numbers ≠ monthly number often
indicates boundary double-count or gap.

**Fix & prevention — one convention, no exceptions:** **half-open intervals**:
```sql
WHERE created_at >= '2026-06-01' AND created_at < '2026-07-01'
```
Half-open ranges tile perfectly (no gaps, no double-counts), work identically for
DATE and TIMESTAMP, and make "next period" trivially `start + interval`. Ban
`BETWEEN` on temporal columns in review. This is the single cheapest prevention rule
in this KB relative to bugs avoided.

---

## 5. Window-function patterns (the correct idioms)

Version note: all patterns below are ANSI and run unchanged on BigQuery, Snowflake,
Redshift, Postgres.

**Dedup to latest-per-key** (the right way to collapse an SCD or event log):
```sql
QUALIFY ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC) = 1
-- Postgres (no QUALIFY): wrap in a subquery and filter rn = 1
```
Pitfall: ties in `updated_at` make the result nondeterministic — add a tiebreaker
column to the ORDER BY, always.

**Running totals / moving averages:**
```sql
SUM(revenue) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
```
Pitfall: the default frame with an ORDER BY is `RANGE ... CURRENT ROW`, which groups
*peer rows with equal sort keys* — duplicated dates silently share a value. State
`ROWS` frames explicitly.

**Sessionization (gaps-and-islands),** the pattern behind session metrics:
```sql
WITH flagged AS (
  SELECT *, CASE WHEN ts - LAG(ts) OVER (PARTITION BY user_id ORDER BY ts)
                  > INTERVAL '30 minutes' OR LAG(ts) OVER (...) IS NULL
            THEN 1 ELSE 0 END AS new_session
FROM events)
SELECT *, SUM(new_session) OVER (PARTITION BY user_id ORDER BY ts) AS session_id
FROM flagged;
```

**Percent-of-total without a self-join:**
`revenue / SUM(revenue) OVER () ` — and note that adding a WHERE later changes the
denominator too; if the denominator must be "all", compute it before filtering.

---

## 6. Query performance on large tables (correctness's neighbor)

Slow queries become wrong queries: people sample "temporarily," cache stale extracts,
or query the replica that's a day behind. Performance rules that are also
correctness rules:

| Rule | Why |
| --- | --- |
| Filter on the **raw partition column** (`WHERE event_date >= '...'`), never on a function of it (`WHERE DATE(ts) >= ...` when `ts` isn't the partition key). | Function-wrapped predicates disable partition pruning → full scans; on BigQuery that's also your bill. |
| Never `SELECT *` in anything saved. | Columnar engines charge/scan per column; schema changes silently alter downstream results. |
| Pre-aggregate before joining (see §1). | Same move fixes fan-out *and* shrinks the join. |
| `APPROX_COUNT_DISTINCT` / `HLL` for exploratory distincts; exact only when the number ships. | Exact distinct on billions of rows is the classic "query that never returns," and its timeout is when people start guessing. State approximation in the output name (`users_approx`). |
| LIMIT does not reduce scan cost on BigQuery (full columns still read); use partition filters + `TABLESAMPLE` for cheap exploration. | Prevents the "I LIMITed it, why is the bill huge" surprise. |

---

## Failure-mode summary table (for auditors)

| Failure | Detection | Fix | Prevention |
| --- | --- | --- | --- |
| Join fan-out inflating aggregates | rows vs `COUNT(DISTINCT grain_key)` before/after join | pre-aggregate to join grain | stated-grain comments; cardinality question in review; uniqueness tests |
| NULL mishandling (aggregates, `!=`, `NOT IN`) | NULL-rate profile; `COUNT(*)` vs `COUNT(col)` deltas | explicit `COALESCE`/`NOT EXISTS`/null-safe compare | NULL policy per column in metric spec |
| Timezone misalignment | hour-of-day histogram; cross-system day totals | explicit `AT TIME ZONE`/tz-arg `DATE()` once | UTC-storage + single reporting zone convention; zone named on dashboards |
| Off-by-one ranges | boundary-day volume check; weekly≠monthly sums | half-open intervals | ban temporal `BETWEEN` in review |
| Nondeterministic dedup | rerun query, diff results | full tiebreaker in window ORDER BY | tiebreaker rule in review checklist |
| Silent full scans → stale workarounds | warehouse query history / bytes scanned | raw partition predicates | cost linting; saved-query review |

**Cross-references:** metric spec template that encodes these conventions —
`metric-design.md` §2; the audit procedure that applies this doc to a specific
metric — `metric-definition-auditor` skill; pandas equivalents of §1–2 (merge
fan-out, NaN semantics) — `python-r-analysis.md` §2.
