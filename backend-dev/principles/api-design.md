# API Design — Contracts You Can't Take Back

**Last reviewed:** 2026-07-06. Version-independent principles; protocol specifics reference HTTP/1.1+HTTP/2, GraphQL June-2018 spec, gRPC in [stacks/grpc.md](../stacks/grpc.md).
**Operationalized by:** the `api-contract-auditor` Skill (`.claude/skills/api-contract-auditor/`).
**Related:** [concurrency.md](concurrency.md) (idempotency mechanics), [security.md](security.md) (authZ per endpoint).

The core truth of API design: **a database schema you can migrate; a published API you cannot.** Every client that integrates against your API freezes your mistakes in place. I have spent more engineering-years maintaining compatibility shims for APIs designed in an afternoon than on any other single category of work. Design slowly; ship deliberately.

---

## 1. REST vs GraphQL vs gRPC — the actual decision tree

- **Public API, third-party consumers, or you can't control client upgrade cadence** → REST + JSON. It's debuggable with curl, cacheable by every CDN, and every language has a client. Boring wins.
- **Internal service-to-service, both ends deployed by you, latency or payload size matters** → gRPC. You get a typed contract, streaming, and ~5–10x smaller payloads. See [stacks/grpc.md](../stacks/grpc.md) for the pitfalls (load balancing, deadline propagation).
- **One backend serving many heterogeneous UIs (web + iOS + Android + partners) that each need different slices of the same graph** → GraphQL earns its cost. That cost is real: query cost analysis, N+1 resolvers, persisted queries, and cache invalidation you now own instead of the CDN.
- **GraphQL as a default for a single web client** → No. You've bought resolver complexity, an authorization surface where *every field* is an endpoint, and given up HTTP caching, to solve an over-fetching problem you don't have yet.

**War story:** A team I supported adopted GraphQL for a two-consumer internal API "for flexibility." Eighteen months later: an unbounded `posts { comments { author { posts ... } } }` query from a partner script took the primary DB to 100% CPU. There was no query-depth limit because nobody knew they needed one. If you run GraphQL: **depth limits, cost analysis, and persisted-queries-only for external callers are day-one requirements, not hardening.**

## 2. Versioning strategy

Decision tree:

- **You control all clients** (internal APIs, mobile with forced upgrade): don't version. Evolve additively (see §3), and delete fields only after telemetry shows zero readers for 30+ days.
- **You don't control clients** (public API): version in the URL path (`/v2/orders`). Header-based versioning (`Accept: application/vnd.x.v2+json`) is more "correct" and I've watched it fail everywhere except payment giants with dedicated API teams — it breaks curl reproduction, CDN cache keys, and every junior integrator's mental model.
- **Never** version per-endpoint (`/orders/v2` next to `/users/v1`). Clients end up on a matrix of versions no one can reason about, and cross-resource invariants ("v2 orders reference v1 users?") become undefined.

The failure mode of versioning is not too few versions — it's **too many live at once**. Publish a deprecation policy with dates *before* you ship v1, and instrument per-version traffic so deprecation is an evidence-based negotiation, not a guess.

## 3. Breaking vs non-breaking changes — memorize this list

Non-breaking (safe to ship anytime):
- Adding a response field (clients must ignore unknown fields — state this in your API docs as a contract term).
- Adding an *optional* request field with a default preserving old behavior.
- Adding a new endpoint or enum *input* value.

Breaking (requires a new version or a coordinated migration):
- Removing/renaming any field, changing a type, or changing nullability from non-null → nullable *in responses*.
- Tightening request validation ("we now reject strings > 255 chars" breaks whoever was sending 300).
- **Adding a new enum value to a *response* field.** This one gets people: clients wrote `switch` statements with `default: throw`. If a response enum may grow, document "clients MUST handle unknown values" from day one, or it's forever frozen.
- Changing error codes/shapes, changing default sort order, changing pagination page size. Yes, sort order — clients depend on everything observable (Hyrum's Law). *Detection:* you usually can't detect these breakages server-side; the client just misbehaves. That's why the review has to catch them — run the `api-contract-auditor` Skill on every API diff.

## 4. Idempotency keys — the pattern, precisely

Any endpoint that creates a resource or moves money/state **must** accept an `Idempotency-Key` header. The mechanics matter; half-implementations are worse than none:

1. Client generates a UUID per *logical operation* (not per HTTP attempt) and retries with the **same** key.
2. Server, in the **same transaction** as the business write, inserts the key into an `idempotency_keys` table with a unique constraint: `(key, endpoint)` → stores request-body hash, response status, response body.
3. On conflict: if stored request hash matches the incoming one, replay the stored response (same status, same body). If the hash *differs*, return `422` — the client is reusing a key for a different operation, which is a client bug you must surface, not absorb.
4. In-flight duplicate (first request still executing): return `409` with `Retry-After`, or block on the row lock. Do not run the operation twice concurrently.
5. Expire keys (24h is the industry norm) or the table grows forever.

**Failure mode if you skip step 2's same-transaction rule:** the operation commits, the process crashes before recording the key, the client retries, and you double-charge. *Detection:* duplicate side effects with identical client-supplied metadata within seconds of each other; alert on it. *Prevention:* the key insert and the business write share one transaction — make it a code-review checklist item and an integration test that kills the process between the two writes. The full concurrency reasoning is in [concurrency.md](concurrency.md) §4; a working implementation is in [guides/build-from-scratch.md](../guides/build-from-scratch.md).

## 5. Pagination correctness

**Offset pagination (`?page=3&limit=50`) is broken for anything that mutates.** Two failure modes: (a) rows inserted/deleted during traversal shift the window — clients see duplicates or miss rows; (b) `OFFSET 500000` makes Postgres scan-and-discard half a million rows — I've seen a nightly export job walk offset pagination into a full-table meltdown at page ~10,000.

Use **cursor (keyset) pagination**: `WHERE (created_at, id) < ($cursor_ts, $cursor_id) ORDER BY created_at DESC, id DESC LIMIT 51`. Rules that make it *correct*, not just fast:

- The sort key must be **unique and immutable** — always append `id` as tiebreaker. Cursor on `updated_at` alone skips or repeats rows that share a timestamp; cursor on a mutable column loses its place when the row moves.
- Fetch `limit+1` rows to compute `has_more` without a second query.
- The cursor is an **opaque token** (base64 of the tuple, optionally HMAC'd). The moment you document it as "the last item's timestamp," clients construct their own, and your sort key is now a public API you can never change.
- Offset pagination is acceptable only for: small bounded lists, admin UIs needing "jump to page 47," and truly immutable datasets.

*Prevention:* lint/review rule — any new list endpoint ships with keyset pagination unless the PR states why not; load tests (see [performance.md](performance.md)) must include deep-pagination access patterns.

## 6. Error contract design

Errors are API surface. Design them once, globally, before endpoint one. Use RFC 9457 (Problem Details) or an equivalent fixed envelope:

```json
{
  "type": "https://api.example.com/errors/insufficient-funds",
  "title": "Insufficient funds",
  "status": 422,
  "detail": "Balance 12.50 is less than transfer amount 100.00",
  "instance": "/transfers/req_8f3a",
  "code": "INSUFFICIENT_FUNDS",
  "trace_id": "abc123"
}
```

Rules earned the hard way:

- **`code` is a stable machine-readable string; clients branch on it, never on `detail` text.** The week someone "improves" an error message and breaks a partner's regex-based error handling is the week you adopt this rule.
- Status code discipline: `400` malformed request, `401` who are you, `403` you can't, `404` doesn't exist *or you can't know it exists* (don't leak existence via 403-vs-404 — see [security.md](security.md)), `409` state conflict, `422` understood-but-invalid, `429` rate limited (with `Retry-After`), `5xx` *our* fault. Clients build retry logic on this split: **retrying a 4xx is a client bug; not retrying a 503 is a client bug.** If your server returns `500` for validation errors, you've trained every client to retry validation failures.
- Always include `trace_id` so a support ticket can be joined to your traces ([observability.md](observability.md)).
- Validation errors return **all** field failures in one response, not one per round-trip.

## 7. The rest of the day-one checklist

- **Rate limiting** is part of the contract: document limits, return `429` + `Retry-After` + `RateLimit-*` headers. Mechanics in [security.md](security.md) §7 and [concurrency.md](concurrency.md) §6.
- **Timeouts and retry guidance are contract**: publish your server timeout; state which endpoints are idempotent and thus retry-safe. If you don't say, clients guess, and they guess "retry everything."
- **Request size limits** stated and enforced at the edge (not discovered at the JSON parser OOM).
- **Timestamps**: RFC 3339 UTC with offset, always. Epoch-seconds vs epoch-millis confusion has caused more integration bugs than any other single data-format issue I've debugged.
- **IDs**: opaque strings externally, even if internally numeric — prefixed IDs (`ord_8f3aK2`) make logs, support tickets, and grep unambiguous, and free you to change internal ID generation. Never expose auto-increment integers publicly (enumeration attacks + growth-rate disclosure).

## Prevention summary (gate these in CI/review)

| Hazard | Gate |
|---|---|
| Breaking change slips into a release | `api-contract-auditor` Skill on every OpenAPI/proto diff; `oasdiff`/`buf breaking` in CI |
| Missing idempotency on unsafe endpoint | Review checklist: every `POST` that isn't safely re-runnable requires `Idempotency-Key` support + the kill-between-writes test |
| Offset pagination on a growing table | Lint on `OFFSET` in query layer; deep-pagination case in load tests |
| Error shape drift | Contract tests pinning the error envelope; a single error-serializer module — endpoints may not hand-roll error JSON |
| Enum-growth breakage | Docs contract: unknown-value handling required; contract tests send unknown enum values to reference clients |
