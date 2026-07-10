---
name: migration-safety-reviewer
description: Review a database schema migration (SQL file, Django/Alembic/ActiveRecord/EF/Prisma migration, or a diff containing DDL) for locking hazards, expand/contract violations, and unsafe backfills before it ships. Use when the user asks to review/check a migration, when a PR/diff touches a migrations directory, or before applying DDL to a production database.
---

# Migration Safety Reviewer

You are reviewing a schema migration as the engineer who has watched an innocent-looking `ALTER TABLE` take checkout down for 40 minutes. The judgment behind every rule here lives in `backend-dev/principles/data-layer.md` §1 and `backend-dev/stacks/postgres.md` §5 — cite those paths in findings so humans can read the why.

**When NOT to use this skill:** reviewing *application* code that happens to query the DB (use general code review or the `race-condition-scanner` agent); designing a schema from scratch (read `backend-dev/principles/data-layer.md` instead); non-relational stores (Mongo index builds have different rules — `backend-dev/stacks/mongodb.md`). Rules below assume Postgres semantics; for MySQL, flag that lock behavior differs materially and lower your confidence.

## Inputs you need

1. The migration file(s) or DDL diff. If given a whole PR, extract the migration parts; also note the *code* changes shipping alongside (check 0 below).
2. Context — ask (or infer from the repo) if unknown: approximate size / write rate of affected tables, and whether deploys are rolling. **If table size is unknown, review as if the table is large and hot** — say you assumed so.

## Review procedure

Walk every statement against this checklist, in order. Report by statement.

**Check 0 — Deployment coupling (the one that causes the most outages):**
- Does the same deploy contain code that *requires* the new schema, or a migration that breaks code currently running (drop/rename of anything still referenced)? Old and new code run simultaneously during a roll — every migration must serve both. Renames and drops must follow expand→migrate→contract across separate deploys.

**Check 1 — Lock acquisition:**
- Any `ALTER TABLE`, `DROP`, `CREATE INDEX` (non-concurrent), `VACUUM FULL`, `CLUSTER`, or constraint addition ⇒ what lock does it take, and is `lock_timeout` set (in the migration or by the tool) before it? Missing `lock_timeout` on DDL against a live table = **BLOCKER**: the DDL queues behind any long query and everything queues behind the DDL.
- `CREATE INDEX` without `CONCURRENTLY` on an existing table = **BLOCKER** (blocks writes for the whole build). Verify the tool runs it outside a transaction (Alembic `op.execute` with autocommit block; Django `atomic = False`; Rails `disable_ddl_transaction!`); flag if it can leave an `INVALID` index and whether cleanup is handled.

**Check 2 — Table rewrites and scans under lock:**
- `ALTER COLUMN TYPE` ⇒ almost always a full rewrite under `ACCESS EXCLUSIVE` = **BLOCKER** unless the specific change is binary-compatible (e.g. `varchar(n)` widening). Safe path: new column + dual-write + backfill + swap.
- `SET NOT NULL` directly on an existing column = **BLOCKER** on large tables (full scan under lock). Safe recipe: `ADD CONSTRAINT ... CHECK (col IS NOT NULL) NOT VALID` → `VALIDATE CONSTRAINT` (separate statement/deploy) → `SET NOT NULL`.
- `ADD COLUMN ... DEFAULT`: constant default is metadata-only on PG11+ (**OK**); volatile default (`now()`, `gen_random_uuid()`) rewrites = **BLOCKER** — add nullable, backfill, then set default for new rows.
- New `FOREIGN KEY` or `CHECK` on existing data without `NOT VALID` + later `VALIDATE` = **WARN** (validation scan under lock), **BLOCKER** if the table is large.

**Check 3 — Backfills / data migrations:**
- Any `UPDATE`/`DELETE`/`INSERT ... SELECT` touching unbounded rows inside a migration = **BLOCKER**. Backfills are batched (1k–10k rows by PK range, not OFFSET), resumable, idempotent, run as a job/script — not in the deploy-time migration path. Check for `RunPython`/`execute` blocks hiding this.

**Check 4 — Destructive operations:**
- `DROP TABLE/COLUMN`, `TRUNCATE`, constraint drops: is there stated evidence of zero readers/writers (query logs, `pg_stat_statements`, a prior release removing the last reference)? Un-evidenced drops = **BLOCKER**. Drops belong in their own deploy (contract phase), independently revertible.

**Check 5 — Consistency & hygiene:**
- New FK column without an index = **WARN** (parent deletes seq-scan the child under lock).
- Redundant index (left-prefix of an existing composite) = **NOTE**.
- Unique constraint added to a column with possible duplicates: is there a dedup step + `CREATE UNIQUE INDEX CONCURRENTLY` first? Direct `ADD CONSTRAINT UNIQUE` builds the index under lock = **WARN/BLOCKER** by size.
- Down-migration present and honest? (A `down` that drops a column full of data is not a rollback, it's a second incident — **NOTE** it.)
- Migration numbering conflicts with concurrently-open PRs if visible = **WARN** (see `backend-dev/principles/multi-agent-orchestration.md` §4).

## Output format

```
## Migration Safety Review: <file(s)>
Assumptions: <table sizes/traffic assumed; deploy model assumed>

### Verdict: SAFE / SAFE WITH CHANGES / UNSAFE

| # | Statement | Finding | Severity | Safe recipe |
|---|-----------|---------|----------|-------------|

### Required changes (for each BLOCKER: the exact rewritten SQL/migration code)
### Deploy plan (which statements ship in which deploy, and what order vs code)
```

Severity: **BLOCKER** (will or can cause an outage/data loss — must change), **WARN** (risk that depends on stated assumptions — needs a decision), **NOTE** (hygiene). Always produce the rewritten safe version for BLOCKERs — a review that says "unsafe" without the safe alternative is half a review.

## Self-test (run mentally before reporting)

A correct implementation of this skill flags: `ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'active'` as **OK on PG11+** (constant default) *but* checks Check 0 for code coupling; `CREATE INDEX idx_orders_user ON orders(user_id)` as **BLOCKER → CONCURRENTLY**; `UPDATE orders SET total_cents = total * 100` as **BLOCKER → batched job**. If your review of those three differs, re-read the checklist.
