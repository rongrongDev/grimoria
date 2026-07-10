---
name: api-contract-auditor
description: Audit an API change (OpenAPI/proto/GraphQL schema diff, or a code diff touching routes/handlers/DTOs) for breaking changes, idempotency gaps, pagination and error-contract defects before release. Use when the user asks to review an API change/diff/PR for compatibility, before publishing a new API version, or when route/serializer/schema files change in a PR.
---

# API Contract Auditor

You are auditing an API diff as the engineer who maintains the compatibility shims for every mistake that shipped. The judgment lives in `backend-dev/principles/api-design.md` (cite section numbers in findings); this skill is the procedure.

**When NOT to use this skill:** reviewing internal function signatures or module APIs (ordinary code review); reviewing *database* changes (use `migration-safety-reviewer`); designing a new API from scratch (read `backend-dev/principles/api-design.md` and `backend-dev/guides/build-from-scratch.md` instead). For proto files, run `buf breaking` first if available and audit what tools can't judge (semantics, idempotency); this skill complements, not replaces, `oasdiff`/`buf`.

## Inputs you need

1. The diff: OpenAPI/proto/GraphQL SDL before-and-after, or the code diff touching routes/handlers/serializers/DTOs. If only code is available, reconstruct the contract change from route definitions and response shapes — say you did so and flag lower confidence.
2. Consumer context if determinable: external/public consumers, other internal teams, or same-team only. **Unknown ⇒ audit as if external consumers exist.**

## Audit procedure

### Pass 1 — Breaking-change scan (against `api-design.md` §3's list)

For every changed endpoint/message, classify each delta:

**BREAKING (requires new version or coordinated migration):**
- Removed/renamed field, endpoint, or enum value; changed type, format, or units; response field nullability loosened (non-null → nullable); required-ness added to a request field.
- Tightened request validation (max length, stricter pattern, newly rejected values).
- **New enum value in a response field** — breaking unless the contract documents that clients must tolerate unknown values (check; absence of that clause = finding).
- Changed error codes/shapes/status codes; changed default sort order; changed pagination defaults or token format; changed rate limits downward.
- Proto-specific: field number reuse or renumbering (**data corruption class** — flag maximum severity), removed `reserved` markers, changed field types even when wire-compatible-looking (`backend-dev/stacks/grpc.md`).
- Auth changes: newly required scopes/permissions on an existing endpoint.

**SAFE (additive):** new optional request field with behavior-preserving default; new response field; new endpoint; new *request* enum value. Verify "optional" is real: a new field the server now requires in practice (validated downstream) is breaking regardless of the schema saying optional.

### Pass 2 — Idempotency audit (against `api-design.md` §4)

For every **new or modified unsafe endpoint** (POST/PATCH/DELETE that creates state, moves money, or triggers side effects):
- Does it accept an idempotency key? If not: does natural idempotency hold (absolute-value PUT, upsert semantics)? Neither = **finding**, severity by side effect (external money/email/webhook = HIGH).
- If keys are implemented, check the four mechanics: (a) key claim in the **same transaction** as the effect, (b) stored-response replay with matching request hash, (c) mismatched-hash reuse → 422, (d) concurrent in-flight duplicate handled (block or 409). Each missing mechanic is its own finding — half-implemented idempotency fails exactly under the retry storms it exists for.
- Retry guidance: are retryable vs non-retryable responses distinguishable by status code (5xx/429 vs 4xx)? Validation errors returning 500 = **finding** (trains clients to retry validation failures).

### Pass 3 — Pagination & list correctness (against `api-design.md` §5)

For every new/changed list endpoint: offset pagination on a mutable dataset = **finding** (duplicates/skips under concurrent writes; deep-offset DB load). Cursor-based: is the sort key unique+immutable (id tiebreaker)? Is the cursor opaque? Is there a maximum page size enforced (unbounded `limit` = DoS vector, `security.md` §8)?

### Pass 4 — Error contract & hygiene (against `api-design.md` §6–7)

- New error responses conform to the service's single error envelope? Stable machine-readable `code` present? `trace_id` included?
- Status-code semantics: 401 vs 403 vs 404 correct; existence not leaked via 403-vs-404 on resources the caller can't know about; 409 vs 422 used consistently with the rest of the API.
- Timestamps RFC 3339 UTC; 64-bit ids serialized as strings; no auto-increment ids newly exposed.

## Output format

```
## API Contract Audit: <diff reference>
Consumer assumption: <external / internal / same-team — stated or assumed>

### Verdict: COMPATIBLE / COMPATIBLE WITH FINDINGS / BREAKING

### Breaking changes
| Endpoint/field | Change | Who breaks and how | Required action |

### Idempotency findings
### Pagination / error-contract findings
### Safe changes (one line each, for the record)
```

For every breaking change, name the concrete consumer failure ("clients with `switch` on `status` throw on the new value"), and the migration path (version bump, deprecation window + dual support, or additive redesign). Findings without a consumer-failure story are hygiene notes, not breaking changes — don't inflate.

## Self-test

A correct implementation flags: widening `quantity: int32 → int64` in a *response* as breaking for typed clients; a new `status` enum value in a response as breaking absent an unknown-tolerance clause; a new `POST /refunds` without idempotency keys as HIGH; `?page=&per_page=` on `/orders` as a pagination finding. It does **not** flag: a new optional response field, or a new endpoint. If your audit of those differs, re-read the passes.
