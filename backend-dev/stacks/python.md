# Python Backend — Production Judgment

**Tier:** Core (full depth). **Verified against:** Python 3.12/3.13, FastAPI 0.115+, Django 5.1/5.2, SQLAlchemy 2.x, psycopg 3.x, Celery 5.4+, uvicorn/gunicorn current. **Last reviewed:** 2026-07-06.
**Read with:** the [principles docs](../principles/) — this file covers only what is *specific to Python*.

Python gives you two distinct concurrency worlds — sync workers (Django/WSGI) and asyncio (FastAPI/ASGI) — and the worst bugs live at the boundary between them.

---

## 1. Concurrency model — pick one world per service, know its trap

- **Sync/WSGI (classic Django, Flask):** concurrency = OS processes × threads (gunicorn workers). Simple failure model, memory-hungry, capacity capped by worker count: a slow downstream holds a whole worker — 8 workers + 9 slow requests = the 9th user waits. Right choice for CRUD apps where the DB is the bottleneck anyway.
- **Async/ASGI (FastAPI, Starlette, Django-async):** one loop, thousands of concurrent I/O-bound requests — and the Node failure model ([stacks/nodejs.md](nodejs.md) §1): **one blocking call stalls everyone.**
- **The #1 async Python production bug — sync-in-async:** `requests.get(...)`, `time.sleep()`, a sync DB driver, or heavy CPU inside an `async def`. Under load, p99 explodes across all endpoints. *Detection:* py-spy dump on a live process shows every coroutine parked behind one blocking frame; blocked-loop watchdogs (`asyncio` debug mode in staging: `PYTHONASYNCIODEBUG=1` logs slow callbacks). *Fix:* async clients (httpx, psycopg3 async / asyncpg, redis-py async) or push sync work to `run_in_executor`/threadpool. *Prevention:* lint bans (`flake8`/ruff plugins flag `requests`/`time.sleep` in async contexts); dependency review for any sync client entering an async service.
- **FastAPI subtlety:** a plain `def` endpoint runs in a threadpool (safe-ish, bounded ~40 threads); `async def` runs on the loop. An `async def` calling sync code is strictly worse than honest `def`. Choose per-endpoint deliberately.
- **The GIL protects nothing you care about:** check-then-act across threads or across any `await` still races ([concurrency.md](../principles/concurrency.md) §7). And free-threaded builds (3.13+ experimental, 3.14+ maturing) remove even bytecode-level atomicity — never encode "the GIL makes this safe" in a comment or a design.
- Uniqueness/invariants live in the database, never in a Python check. `get_or_create` in Django is check-then-act — it races; rely on the unique constraint and catch `IntegrityError` (which, note, poisons the current transaction in Postgres — catch it *outside* `atomic()` or use a savepoint).

## 2. Deployment & process model

- ASGI: uvicorn workers under gunicorn (or uvicorn's own multiprocess); WSGI: gunicorn. Workers ≈ cores (sync: 2–4× cores threads for I/O-bound). **Always set `--timeout`** (gunicorn default 30s kills stuck workers — good; know it exists before it "mysteriously" kills your slow export endpoint) and a graceful shutdown drain.
- Memory creep in long-lived workers is endemic (fragmentation + caches): `max_requests` + `max_requests_jitter` (jitter, or all workers recycle simultaneously — a self-inflicted herd, [concurrency.md](../principles/concurrency.md) §6) is a legitimate mitigation, not an embarrassment. Investigate real leaks with `tracemalloc`.
- Containers: match worker memory math to the container limit; a gunicorn fork-bomb of 8 workers × 500MB in a 2GB container is a recurring OOMKilled mystery.

## 3. Django specifics

- **The ORM's lazy QuerySet is an N+1 factory:** template/serializer touches `obj.related` → query per row. *Detection:* `django-debug-toolbar` in dev, `assertNumQueries` in tests ([data-layer.md](../principles/data-layer.md) §3), `nplusone` lib. *Fix:* `select_related` (FK joins) / `prefetch_related` (M2M/reverse). *Prevention:* per-view query budgets in tests; DRF serializers reviewed with the queryset that feeds them.
- **`transaction.atomic` gotchas:** `ATOMIC_REQUESTS=True` wraps every view in a transaction — convenient, and it means every slow view holds a transaction (locks, `idle in transaction`, pool pressure — [data-layer.md](../principles/data-layer.md) §2). Prefer explicit `atomic()` around the write section only. **Never call external APIs inside `atomic()`** (same doc §4). Side effects that must follow commit go in `transaction.on_commit()` — enqueueing Celery tasks *inside* a transaction that then rolls back is the classic "task ran for a row that doesn't exist" bug; conversely task-after-commit-crash needs outbox thinking ([concurrency.md](../principles/concurrency.md) §5).
- **Migrations:** Django happily generates unsafe DDL (`ALTER TABLE ... SET NOT NULL`, index without `CONCURRENTLY`). Review every generated migration against [data-layer.md](../principles/data-layer.md) §1; the `migration-safety-reviewer` Skill knows Django's operations. Long-term: keep migrations squashed and deployable-independently; `RunPython` backfills must be batched (see the backfill rules) — the auto-generated single-statement data migration will lock the table.
- `select_for_update(skip_locked=True)` exists and is the right tool for DB-backed work claiming; `F()` expressions give atomic increments (`qty=F('qty')-1`) — use them instead of read-modify-write.

## 4. FastAPI / SQLAlchemy specifics

- **Pydantic v2 models at both boundaries** — request *and* response (`response_model=`). Returning ORM objects directly leaks fields the moment someone adds one ([security.md](../principles/security.md) §6).
- **SQLAlchemy 2.x:** explicit `session.begin()` scope per unit of work; a session is not thread-safe and not shareable across tasks. Async sessions with asyncpg/psycopg3-async; watch lazy-loading in async (raises on I/O outside a greenlet context — configure `lazy="raise"` deliberately and eager-load; the error is your N+1 detector, treat it as a feature).
- Dependency-injected session-per-request is the correct default pattern; keep transaction boundaries visible in the endpoint, not hidden in repositories.
- Connection pool: SQLAlchemy defaults (`pool_size=5, max_overflow=10`) per process — do the fleet math ([data-layer.md](../principles/data-layer.md) §4). Set `pool_pre_ping=True` (survives DB failovers) and `pool_recycle` under any NAT/LB idle timeout between app and DB.

## 5. Background work — Celery (and honest alternatives)

- Celery defaults you must change: `acks_late=True` + idempotent tasks (default acks-early *loses* the task if the worker dies mid-run — at-most-once by default!, inverting [async-work.md](../principles/async-work.md)'s assumption); `task_time_limit` set (or a hung task holds a worker forever); `prefetch_multiplier=1` for long tasks (default 4 hoards tasks on busy workers while others idle — head-of-line blocking in miniature).
- Pass **ids, not objects** ([async-work.md](../principles/async-work.md) §2) — pickled ORM objects are stale on arrival and break on deploy.
- Retries: `autoretry_for` retryable exceptions only, `retry_backoff=True` + `retry_jitter=True`, `max_retries` then dead-letter (Celery has no first-class DLQ — build the terminal-failure handler + alert yourself or you have silent loss; [async-work.md](../principles/async-work.md) §4).
- Simpler and often better at < 100 jobs/s: **Postgres-backed queues** (`procrastinate`, or hand-rolled `FOR UPDATE SKIP LOCKED`) — transactional enqueue with your data kills the dual-write problem outright.

## 6. Observability & performance specifics

- **structlog** (or stdlib logging with JSON formatter) + **contextvars** to bind `trace_id`/`user_id` once per request ([observability.md](../principles/observability.md) §1); OTel auto-instrumentation covers Django/FastAPI/psycopg/redis/celery.
- **py-spy is the first profiling tool** — attach to a live prod process, no code change, no restart (`py-spy dump` for "what is it doing *right now*" during an incident; `py-spy record` for flames). GC is almost never your problem in Python; serialization, N+1, and sync-in-async are (see the priority order in [performance.md](../principles/performance.md) §1).
- JSON: stdlib `json` is slow at scale — `orjson` for hot paths (FastAPI: `ORJSONResponse`); at 10k+ RPS serialization is routinely the top CPU item.

## 7. Testing specifics

- **pytest + Testcontainers** for the integration tier; Django's `TransactionTestCase`/pytest-django `transactional_db` when the code under test manages transactions ([testing.md](../principles/testing.md) §2's rolled-back-transaction warning applies to Django's default `TestCase` — it masks commit/`on_commit` behavior; use `django_capture_on_commit_callbacks` or transactional tests for those paths).
- `assertNumQueries` / `django_assert_num_queries` on top endpoints — the N+1 CI gate.
- Mutation testing: **mutmut** on critical modules, incremental ([testing.md](../principles/testing.md) §4). Property-based testing with **hypothesis** is unusually cheap in Python and brutal on parsers/money/state-machine code — use it there.
- `freezegun`/`time-machine` for clocks; concurrency hammer tests via `asyncio.gather` or `ThreadPoolExecutor` — invariant endpoints require them ([testing.md](../principles/testing.md) §5).

## Failure-mode quick table

| Failure | Detection | Fix / Prevention |
|---|---|---|
| Sync call in async path | py-spy shows loop blocked; p99 up on all routes | Async client or executor; ruff/flake8 ban list |
| Celery task lost on worker death | Missing effects, no error | `acks_late=True` + idempotent handlers |
| Task enqueued, transaction rolled back | Task errors on missing row | `transaction.on_commit()` for enqueues |
| N+1 via lazy QuerySet/relationship | debug-toolbar; `assertNumQueries` fails | `select_related`/`prefetch_related`; `lazy="raise"` in SQLAlchemy |
| Django auto-migration locks table | Deploy-time latency spike; lock waits | `migration-safety-reviewer` on every migration; `CONCURRENTLY` + batched RunPython |
| `IntegrityError` poisons transaction | "current transaction is aborted" errors after catch | Catch outside `atomic()` / savepoint; prefer upsert |
| Worker memory creep → OOM | RSS slope per worker | `max_requests`+jitter; `tracemalloc` for real leaks |
| All workers recycle at once | Periodic latency spikes | `max_requests_jitter` (herd rule) |
| Gunicorn timeout kills slow endpoint | Worker SIGKILL logs at exactly timeout | Know the timeout; move slow work to a queue |
