# Ruby on Rails — Production Patterns & Common Pitfalls

**Tier:** Extended (production patterns + pitfalls; not full-depth). **Verified against:** Rails 7.1–8.x, Ruby 3.3+, Puma 6.x, Sidekiq 7.x. **Last reviewed:** 2026-07-06.
**Read with:** the [principles docs](../principles/) — every rule there applies; this file is the Rails dialect.

Rails optimizes for developer speed by hiding the machinery. In production, the hidden machinery is the incident. The pitfalls below are all "convention did something at scale you didn't know it was doing."

## Production patterns

- **Concurrency model:** Puma = processes × threads; ActiveRecord pool must be ≥ threads per process (`pool:` in database.yml) or you get pool-checkout timeouts under load — the Rails-flavored [data-layer.md](../principles/data-layer.md) §4, and the fleet math still applies on the Postgres side. Ruby's GVL means threads help I/O-bound work only; CPU-bound scaling = more processes.
- **Background jobs:** Sidekiq (or Rails 8's Solid Queue — DB-backed, transactional enqueue, a genuinely good default at moderate scale per [async-work.md](../principles/async-work.md) §1). Sidekiq is **at-least-once — jobs must be idempotent** ([concurrency.md](../principles/concurrency.md) §4); enqueue-inside-transaction is the classic dual-write ([concurrency.md](../principles/concurrency.md) §5 — use `after_commit` or Solid Queue's same-DB transactionality). Pass ids, not objects (GlobalID does this right; still re-check the record exists — it may be deleted by run time).
- **N+1 defense in depth:** `strict_loading` (model-level or per-query, raise in dev/test), `bullet` in dev, `includes`/`preload` deliberately. Rails makes N+1 easier to write than anywhere else; make it fail loudly before production ([data-layer.md](../principles/data-layer.md) §3).
- **Migrations:** ActiveRecord happily generates unsafe DDL. `strong_migrations` gem is non-negotiable — it's the `migration-safety-reviewer`'s rules ([data-layer.md](../principles/data-layer.md) §1) as a Rails guardrail. `ddl_transaction` disabled for `CONCURRENTLY`; backfills in batches via `in_batches`, never in the migration itself (migrations run at deploy under time pressure; backfills are jobs).
- **Serialization by allowlist:** jbuilder/serializer classes (`ActiveModel::Serializer`, `alba`), never `render json: @user` (dumps every column — [security.md](../principles/security.md) §6). Strong params on input — this is the framework that *invented* the mass-assignment lesson (GitHub 2012).

## Common pitfalls

| Pitfall | What happens | Fix / Prevention |
|---|---|---|
| Callbacks doing I/O (`after_save` sends email/HTTP) | Slow/failing external calls inside the request+transaction; untestable action-at-a-distance; callback cascades nobody can trace | Business logic in explicit service objects/jobs; callbacks for data integrity only; `after_commit` for side effects |
| `default_scope` | Every query silently filtered (incl. `unscoped` surprises in joins); the "where did my rows go" archaeology | Never use it; named scopes explicitly |
| Validations as the only guard (`validates_uniqueness_of`) | Check-then-act race — duplicates under concurrency ([concurrency.md](../principles/concurrency.md) §1) | DB unique index + rescue `RecordNotUnique`; DB constraints for every invariant validations claim |
| `update_all`/`delete_all`/raw SQL skip callbacks+validations | "But the callback should have..." — it didn't run | Know which methods bypass; grep for them in review when invariants live in callbacks (then move the invariants to the DB) |
| Fat models / God objects (`User` at 3,000 lines) | Every change risks everything; test suite crawls | Service objects, POROs, domain modules; review line-count trends |
| `Current`/thread-local state leaking across requests | Cross-request data bleed under threaded Puma ([concurrency.md](../principles/concurrency.md) §7) | `ActiveSupport::CurrentAttributes` (reset per request) only; never raw `Thread.current` |
| Sidekiq retries replay non-idempotent jobs | Double emails/charges after transient failures | Idempotency keys/dedup in every job ([concurrency.md](../principles/concurrency.md) §4); dead-set monitoring + alert ([async-work.md](../principles/async-work.md) §4) |
| Memory bloat in Puma workers | RSS climbs; OOM kills at peak | jemalloc (or `MALLOC_ARENA_MAX=2`); `puma_worker_killer`-style rolling restarts with jitter as mitigation; find the allocation with memory_profiler |
| `Rails.cache` without the stampede kit | Hot-key expiry brownouts | `race_condition_ttl` (built-in stale-serving!) + TTL jitter ([concurrency.md](../principles/concurrency.md) §6) |
| Slow boot masking deploy problems | 60s+ boot = slow rollbacks, autoscaling lag | bootsnap; track boot time as a metric; keep rollback fast ([observability.md](../principles/observability.md) §5) |

**Testing notes:** transactional fixtures mask commit/`after_commit` behavior ([testing.md](../principles/testing.md) §2's warning) — use non-transactional mode for those paths; `assert_queries`-style N+1 gates on top endpoints. FactoryBot factories calling real validations keep seeds honest.
