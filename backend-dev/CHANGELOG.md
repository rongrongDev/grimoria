# Changelog

All notable changes to the `backend-dev` knowledge base. Entries are dated and name the stack versions each doc was verified against at the time — when a listed version falls out of support or a doc's `Last reviewed` date exceeds 12 months, re-verify before relying on version-specific claims ([DESIGN-NOTES.md](DESIGN-NOTES.md) staleness policy).

**Maintenance protocol for future editors:** one entry per meaningful revision (not per typo); name the doc, what changed, and *why* (new ecosystem fact, incident learning, correction). If a rule is removed, record the reasoning — future maintainers need to know whether it was wrong or merely stale.

## 2026-07-06 — Initial release (v1.0)

Complete initial build, authored as a retirement handoff. All docs stamped `Last reviewed: 2026-07-06`.

### Added — structure & meta
- `README.md` (30-second navigation: task table + symptom table), `GLOSSARY.md` (36 terms, single source of terminology), `DESIGN-NOTES.md` (primitive-selection rationale: docs teach / skills do / subagents isolate; staleness policy; writing rules), this `CHANGELOG.md`.

### Added — principles (9 docs, `principles/`)
- `api-design.md` — REST/GraphQL/gRPC decision tree, versioning, breaking-change catalog, idempotency-key mechanics, keyset pagination, RFC 9457 error contracts.
- `data-layer.md` — expand/contract migrations, Postgres locking hazards, isolation-level decision tree, N+1, connection-pool math, indexing.
- `concurrency.md` — optimistic/pessimistic decision tree, distributed locks & fencing, delivery semantics, idempotent retries, outbox, stampede/herd defenses, per-runtime shared-state races.
- `async-work.md` — queue-vs-sync decision tree, message design, retry/backoff numbers, poison messages & DLQ operations, worker scaling, scheduled-work rules.
- `security.md` — ordered by real-world frequency: BOLA, injection, SSRF, OAuth2/OIDC + JWT pitfalls, secrets, mass assignment, three-kinds-of-rate-limiting.
- `testing.md` — test-tier decision tree, Testcontainers practices, consumer-driven contracts, mutation testing (what score means), the seven under-tested backend behaviors.
- `observability.md` — structured logging, tracing + deadline propagation, SLO/error-budget/burn-rate alerting, degradation patterns, incident/postmortem practice.
- `performance.md` — profile-first method, where backend time actually goes, GC judgment, caching as last resort, load-test methodology (coordinated omission), scaling order.
- `multi-agent-orchestration.md` — shared-state test for parallelizing agent work, planner/implementer/reviewer split criteria, fan-out audit patterns, backend-specific agent failure modes (conflicting migrations, redundant scans, contract drift).

### Added — stacks (`stacks/`)
Core tier, full depth across all §3 technical areas:
- `nodejs.md` (Node 22/24 LTS, Express 4/5, Fastify 5, NestJS 10/11, Prisma 6, pg 8) · `python.md` (Python 3.12/3.13, FastAPI 0.115+, Django 5.1/5.2, SQLAlchemy 2, Celery 5.4) · `go.md` (Go 1.23–1.25, pgx 5, sqlc) · `jvm.md` (JDK 21 LTS/25, Spring Boot 3.3–3.5, Hibernate 6, HikariCP 5/6) · `postgres.md` (PG 15–18) · `redis.md` (Redis 7/8, Valkey 8) · `mongodb.md` (MongoDB 7/8; DynamoDB judgment notes).

Extended tier, production patterns + common pitfalls:
- `rails.md` (Rails 7.1–8.x, Sidekiq 7) · `dotnet.md` (.NET 8 LTS–10, EF Core 8–10) · `messaging.md` (Kafka 3.8–4.x KRaft, RabbitMQ 3.13/4, SQS) · `grpc.md` (protobuf 3/editions, buf 1.x).

### Added — guides (`guides/`)
- `build-from-scratch.md` — Capability A: rate-limited, idempotent transfers API on Postgres (FastAPI reference), from decisions through schema, atomic-invariant endpoint, rate limiting, observability wiring, hammer/crash-window tests, CI gates.
- `analyze-existing-service.md` — Capability B: 4-hour phased playbook (orient → race sweep → data-layer health → contract/security/ops spot checks → prioritized report), evidence-required.

### Added — skills & subagents (`.claude/`)
- Skill `migration-safety-reviewer` — statement-by-statement DDL review: deployment coupling, lock acquisition, rewrites/scans, backfills, destructive ops; BLOCKER/WARN/NOTE verdicts with rewritten safe recipes; self-test cases included.
- Skill `api-contract-auditor` — four-pass audit (breaking changes, idempotency mechanics, pagination, error contract) over OpenAPI/proto/code diffs; self-test cases included.
- Subagent `race-condition-scanner` — read-only whole-codebase sweep for the four consistency shapes; evidence-required (`file:line` + quote), disqualifier-checked, capped at 15 ranked findings.
- Subagent `incident-postmortem-analyzer` — read-only artifact digestion into an evidence-cited timeline; trigger/amplifier/root-condition analysis; blameless-language rules.
