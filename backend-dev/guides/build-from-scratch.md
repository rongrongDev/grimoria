# Build From Scratch: A Rate-Limited, Idempotent Payments API on Postgres

**Last reviewed:** 2026-07-06. Reference implementation in Python 3.12+ / FastAPI 0.115+ / psycopg 3 / pytest + Testcontainers — chosen for readability; every step maps 1:1 to Node/Go/JVM via the [stack docs](../stacks/). Postgres 16+.
**This guide is Capability A of the KB:** follow it top to bottom and you get a minimal but architecturally sound service. Every "why" links to the principles doc that owns it — read the link when you want the reasoning, not to complete the build.

The service: `POST /transfers` moves money between accounts. It is the smallest API that exercises everything that matters: an invariant under concurrency (no overdrafts), an operation that must never run twice (idempotency), abuse protection (rate limiting), safe migrations, and tests that would catch the bugs that page you.

---

## Step 0 — Decisions before code (10 minutes, written down)

| Decision | Choice here | Why / reference |
|---|---|---|
| API style | REST + JSON, no version prefix needed yet (single controlled client) | [api-design.md](../principles/api-design.md) §1–2 |
| Store | Postgres only | [data-layer.md](../principles/data-layer.md) §6 |
| Money | `BIGINT` minor units (cents). Never floats. | float money is a bug that compounds |
| IDs | `id BIGINT GENERATED ALWAYS AS IDENTITY` internal; `public_id TEXT` prefixed random (`trf_<22 base62 chars>`) external | [api-design.md](../principles/api-design.md) §7 |
| Error shape | RFC 9457 Problem Details + stable `code` | [api-design.md](../principles/api-design.md) §6 |
| Concurrency stance | Invariant enforced *in the database*, hammer-tested | [concurrency.md](../principles/concurrency.md) §1 |

## Step 1 — Repository skeleton & migrations infrastructure

```
transfers-api/
├── migrations/            # raw SQL, numbered, applied by a migration tool (e.g. dbmate/alembic)
├── app/
│   ├── main.py            # FastAPI app + middleware wiring
│   ├── db.py              # pool, transaction helper
│   ├── routes/transfers.py
│   ├── ratelimit.py
│   └── errors.py          # the single error serializer
├── tests/
└── docker-compose.yml     # postgres:16 for local dev — pin the version to prod's
```

Migration tool rules regardless of tool: migrations are **raw SQL or reviewable-as-SQL**, numbered, immutable once merged, and every one starts with `SET lock_timeout = '5s';` ([data-layer.md](../principles/data-layer.md) §1).

## Step 2 — Schema (migration 001)

```sql
SET lock_timeout = '5s';

CREATE TABLE accounts (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id  TEXT NOT NULL UNIQUE,
    balance    BIGINT NOT NULL,
    version    INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT balance_non_negative CHECK (balance >= 0)
);

CREATE TABLE transfers (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id       TEXT NOT NULL UNIQUE,
    from_account_id BIGINT NOT NULL REFERENCES accounts(id),
    to_account_id   BIGINT NOT NULL REFERENCES accounts(id),
    amount          BIGINT NOT NULL CHECK (amount > 0),
    status          TEXT NOT NULL CHECK (status IN ('completed','failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- FK columns get indexes or parent-row ops seq-scan (data-layer.md §5)
CREATE INDEX idx_transfers_from ON transfers (from_account_id, created_at DESC);
CREATE INDEX idx_transfers_to   ON transfers (to_account_id, created_at DESC);

CREATE TABLE idempotency_keys (
    key             TEXT NOT NULL,
    endpoint        TEXT NOT NULL,
    request_hash    TEXT NOT NULL,
    response_status INT,
    response_body   JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (key, endpoint)
);
```

Load-bearing choices: the **`CHECK (balance >= 0)` is the overdraft invariant's last line of defense** — even if every application path is buggy, Postgres refuses the corrupt state ([concurrency.md](../principles/concurrency.md) §1: invariants live in the database). `idempotency_keys` implements [api-design.md](../principles/api-design.md) §4 exactly. Keyset-pagination-ready indexes from day one ([api-design.md](../principles/api-design.md) §5).

## Step 3 — DB access layer

```python
# app/db.py
from psycopg_pool import AsyncConnectionPool

pool = AsyncConnectionPool(
    conninfo=settings.database_url,
    min_size=2, max_size=8,          # fleet math: instances × 8 ≤ 70% max_connections (data-layer.md §4)
    timeout=5,                        # checkout timeout: fail fast, don't hang the fleet
    kwargs={"options": "-c statement_timeout=10s"},
)
```

Rules encoded here, all from [data-layer.md](../principles/data-layer.md) §4: small pool, short checkout timeout, statement timeout as a global backstop. The transaction helper (`async with pool.connection() as conn, conn.transaction():`) is the *only* way app code touches the DB — one obvious safe path.

## Step 4 — The transfer endpoint, correctness-first

```python
# app/routes/transfers.py  (shapes: Pydantic models both directions — security.md §6)
class TransferIn(BaseModel):
    from_account: str; to_account: str; amount: PositiveInt   # explicit allowlist, no extras

@router.post("/transfers", status_code=201)
async def create_transfer(body: TransferIn, idem_key: str = Header(alias="Idempotency-Key")):
    req_hash = sha256_of_canonical_json(body)
    async with pool.connection() as conn, conn.transaction():
        # 1. Claim the idempotency key INSIDE the business transaction (api-design.md §4)
        row = await conn.execute(
            """INSERT INTO idempotency_keys (key, endpoint, request_hash)
               VALUES (%s, 'POST /transfers', %s)
               ON CONFLICT (key, endpoint) DO NOTHING RETURNING key""",
            (idem_key, req_hash)).fetchone()
        if row is None:                                   # key exists: replay or reject
            prior = await fetch_prior(conn, idem_key)     # (FOR UPDATE — blocks on in-flight twin)
            if prior.request_hash != req_hash:
                raise ProblemError(422, "IDEMPOTENCY_KEY_REUSED")
            return replay(prior)                          # same status, same body

        # 2. Atomic debit — the whole invariant in one statement (concurrency.md §1)
        debited = await conn.execute(
            """UPDATE accounts SET balance = balance - %s, version = version + 1
               WHERE public_id = %s AND balance >= %s RETURNING id""",
            (body.amount, body.from_account, body.amount)).fetchone()
        if debited is None:
            raise ProblemError(422, "INSUFFICIENT_FUNDS")   # or 404 — existence check first

        credited = await conn.execute(
            """UPDATE accounts SET balance = balance + %s, version = version + 1
               WHERE public_id = %s RETURNING id""",
            (body.amount, body.to_account)).fetchone()
        if credited is None:
            raise ProblemError(404, "ACCOUNT_NOT_FOUND")    # rolls back the debit too

        transfer = await insert_transfer(conn, debited.id, credited.id, body.amount)
        await store_response(conn, idem_key, 201, transfer)  # step 3 of api-design.md §4
        return transfer
```

Why this shape survives production:
- **Debit is one atomic statement** — no read-then-write window; two concurrent transfers from the same account serialize on the row and the second sees the post-debit balance. No isolation-level ceremony needed ([data-layer.md](../principles/data-layer.md) §2's decision tree, branch 1).
- **Idempotency key insert, business writes, and response storage share one transaction** — the crash-window analysis in [api-design.md](../principles/api-design.md) §4. A crash anywhere rolls back *everything*; the client's retry starts clean.
- Deadlock note: transfers A→B and B→A concurrently can deadlock (row lock ordering). Acceptable here because Postgres kills one (`40001`/`40P01`) and a **retry-on-serialization-failure wrapper** around the transaction (3 attempts, jittered — [concurrency.md](../principles/concurrency.md) §1) absorbs it. Alternative: lock accounts in ascending-id order. Do one or the other, deliberately, in a comment.
- No external calls inside the transaction — and if step N+1 someday publishes an event, it goes through an **outbox row in this same transaction**, not a publish-after-commit ([concurrency.md](../principles/concurrency.md) §5).

## Step 5 — Rate limiting

Single instance: in-process token bucket. The moment you run two replicas, per-instance limits multiply by fleet size — shared state in Redis ([security.md](../principles/security.md) §7, [stacks/redis.md](../stacks/redis.md) §4):

```python
# app/ratelimit.py — token bucket, one atomic Lua call per check
# bucket: capacity 20, refill 10 tokens/min per API key → allows bursts, caps sustained rate
```

Middleware order matters: request-id/logging → rate limit (cheap reject before body parse) → auth → routes. On limit: `429`, `Retry-After`, `RateLimit-*` headers ([api-design.md](../principles/api-design.md) §7). Decide now: limiter outage → **fail open** here (availability over strictness for a transfer API with idempotency; auth endpoints would fail closed — [security.md](../principles/security.md) §7).

## Step 6 — Errors and observability wiring

- One exception handler produces every error body (RFC 9457 + `code` + `trace_id`) — endpoints raise typed errors, never hand-roll JSON ([api-design.md](../principles/api-design.md) §6).
- Structured JSON logs; bind `trace_id`/`request_id` via contextvars middleware once ([observability.md](../principles/observability.md) §1); OTel auto-instrumentation for FastAPI + psycopg.
- `/healthz` liveness = process-only; `/readyz` = one cheap `SELECT 1` — liveness must NOT check the DB ([observability.md](../principles/observability.md) §4).
- Metrics day one: request rate/latency histogram/error rate by route; pool checkout wait; and a **business invariant metric**: `SUM(balance)` drift check as a periodic job — total money is conserved or you have a bug/alert ([observability.md](../principles/observability.md) §3).

## Step 7 — Tests (the ones that catch what pages you)

Testcontainers Postgres 16, real migrations applied per suite ([testing.md](../principles/testing.md) §2). In priority order:

1. **Happy path + error contract:** 201 shape; insufficient funds → 422 with `code`; unknown account → 404.
2. **The hammer** ([testing.md](../principles/testing.md) §5.1): account with balance 100; **fifty concurrent** transfers of 10 (`asyncio.gather`); assert exactly 10 succeed, 40 get 422, final balance 0, `SUM(balance)` conserved. This single test would have caught every oversell incident I've reviewed.
3. **Idempotency, three cases:** same key + same body twice → one transfer, identical responses; same key + different body → 422; concurrent same-key pair → exactly one transfer.
4. **Crash window:** simulate failure after debit-before-response-store (inject via a test hook or kill the task); assert the transaction rolled back and the retry with the same key succeeds cleanly.
5. **Migration reversibility:** CI job runs migrations against a copy, then runs the *previous* commit's tests against the new schema (expand/contract compliance — [data-layer.md](../principles/data-layer.md) §1).
6. Rate limit: 21 rapid requests → 21st is 429 with `Retry-After`.

## Step 8 — CI/CD gates (the "done" bar)

Blocking pipeline (< 10 min — [testing.md](../principles/testing.md) §6): lint + type-check → unit → integration (Testcontainers) → `migration-safety-reviewer` Skill on any `migrations/` diff → `oasdiff` breaking-change check on the OpenAPI diff (`api-contract-auditor` Skill for the judgment layer). Deploy: migrations applied as their own step *before* code rollout, single runner; rollback = redeploy previous image (schema stays compatible by construction).

## Step 9 — What you deliberately did NOT build (write this list down)

No microservices (one service until the team, not the architecture, demands a split), no cache (measure first — [performance.md](../principles/performance.md) §4), no message broker (no async work yet; when it arrives: outbox + [async-work.md](../principles/async-work.md)), no GraphQL, no sharding. Each has its trigger condition documented in the linked doc. Boring by default is the architecture.

**Definition of done for the whole service:** all Step-7 tests green under `-race`-equivalent concurrency; p99 < 100ms at 10× expected load in a constant-arrival-rate test ([performance.md](../principles/performance.md) §5); dashboards + burn-rate alert live; runbook page exists with the blocking-tree query and pool-exhaustion playbook.
