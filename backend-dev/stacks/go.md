# Go Backend — Production Judgment

**Tier:** Core (full depth). **Verified against:** Go 1.23–1.25, net/http (1.22+ routing), chi 5.x, database/sql + pgx 5.x, sqlc 1.27+. **Last reviewed:** 2026-07-06.
**Read with:** the [principles docs](../principles/) — this file covers only what is *specific to Go*.

Go's model: cheap goroutines, real parallelism, explicit errors, one binary. The language removes whole failure classes (event-loop stalls, GC drama) and replaces them with two of its own: **goroutine/context lifecycle bugs** and **shared-memory races** — both of which the tooling can catch if you let it.

---

## 1. Goroutines, context, and the leaks that page you

- **Every goroutine you start needs a defined way to stop.** `go func(){ ... }()` without a cancellation path is a leak; leaks accumulate until OOM or port/conn exhaustion — typically discovered at week 3, not in review. The canonical leak: goroutine blocked forever sending to a channel nobody reads (a `select` with `ctx.Done()` or a buffered channel fixes it).
- *Detection:* `runtime.NumGoroutine()` as a dashboard metric (a climbing slope is a leak, full stop); `pprof` goroutine profile groups leaked stacks for you — the count next to one stack frame is your culprit. *Prevention:* `goleak` in tests of anything that spawns; every `go` statement in review answers "how does this exit?"
- **`context.Context` is the deadline/cancellation rail** ([observability.md](../principles/observability.md) §2) — first parameter of everything that does I/O, passed *through*, never stored in a struct. `http.Server` gives you a per-request context; when the client disconnects it cancels — your DB queries (pgx respects ctx) stop doing work nobody wants. Breaking the chain (`context.Background()` mid-stack "to be safe") re-creates the work-for-dead-callers problem.
  - Sharp edge: a context that cancels *too much* — using the request ctx for work that must complete after the response (audit write, cache fill) gets it killed on client disconnect. Detach deliberately (`context.WithoutCancel`, 1.21+).
- **Panics in a goroutine you spawned kill the whole process** — `net/http` recovers panics in *handlers*, but not in goroutines handlers start. Any `go` in a request path needs its own `defer recover()` (wrapped in a helper, e.g. a `SafeGo` util) if the work is best-effort.

## 2. Races — the tooling is non-negotiable

- **`-race` in CI, always** (and in a soak/canary environment — the detector only sees races that *execute*; sequential unit tests exercise few interleavings, so give it concurrent load: run your hammer tests ([testing.md](../principles/testing.md) §5) under `-race`). A data race in Go is not "stale read" — concurrent map writes crash, torn struct writes corrupt.
- The usual suspects the `race-condition-scanner` subagent greps for: package-level `var` maps/slices mutated in handlers; struct fields written by multiple goroutines without mutex; captured loop variables in `go func` (fixed as a footgun in 1.22 loops, still present in older code and in manual closures); check-then-act on shared state — the fix is a mutex around the *whole* read-decide-write, or restructure to channels/single-owner, or push the invariant into the database where it belongs ([concurrency.md](../principles/concurrency.md) §1).
- `sync.Once` for lazy init; `errgroup.WithContext` for fan-out with cancellation ("first error cancels siblings") — it should be the *only* fan-out pattern in your codebase; hand-rolled WaitGroup+error-channel variants are where the bugs live. **Bound your fan-out** (`errgroup.SetLimit`) — unbounded `go` per item over a 100k-slice is a self-inflicted thundering herd against your own DB ([concurrency.md](../principles/concurrency.md) §6).

## 3. HTTP server & client hygiene

- **Server:** `net/http` + 1.22 pattern routing (or chi for middleware ergonomics) is the default; you don't need a framework. Set `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout`, `IdleTimeout` — **the zero values are infinite**, which is a slowloris invitation and a connection leak. `http.MaxBytesReader` on bodies ([security.md](../principles/security.md) §7).
- **Client:** `http.DefaultClient` has **no timeout** — an outage of any dependency hangs your handlers fleet-wide; this is the single most common Go production incident I've seen. Always a custom client: `Timeout` (or per-request ctx deadlines), and a tuned `Transport` — `MaxIdleConnsPerHost` defaults to **2**, which serializes any real service-to-service call volume into connection churn (symptom: high latency + huge `TIME_WAIT` counts). Reuse one client; **close response bodies always** (`defer resp.Body.Close()`, and drain before close to enable keep-alive reuse) — unclosed bodies leak connections and goroutines.
- Graceful shutdown: `srv.Shutdown(ctx)` on SIGTERM with a drain deadline; stop the listener, finish in-flight, close pools ([async-work.md](../principles/async-work.md) §5 for workers).

## 4. Data layer specifics

- **pgx over database/sql for Postgres** (native types, batching, `CopyFrom` for bulk, better error detail). If you stay with `database/sql`: `SetMaxOpenConns` (default **unlimited** — the pool-exhaustion story of [data-layer.md](../principles/data-layer.md) §4 with no guardrail at all), `SetMaxIdleConns` ≈ max-open, `SetConnMaxLifetime` under any LB idle timeout.
- **`sqlc` is the sweet spot** for Go+Postgres: write real SQL, get typed functions, no ORM lazy-loading to N+1 you. GORM's conveniences (hooks, auto-migration, lazy assocs) are where its production incidents come from — if you use it, disable auto-migration in prod (migrations are reviewed artifacts — [data-layer.md](../principles/data-layer.md) §1) and treat association loading as explicitly as sqlc would force you to.
- Transaction pattern: `tx, err := pool.Begin(ctx)` + `defer tx.Rollback(ctx)` (no-op after commit) + explicit `tx.Commit(ctx)` — the defer-rollback idiom makes early-return leaks impossible; make it the template.
- `sql.ErrNoRows` is a normal outcome, not an error to 500 on — handle it explicitly at the repository boundary.

## 5. Errors, logging, observability

- **Wrap with context at each boundary:** `fmt.Errorf("charging order %s: %w", id, err)`; check with `errors.Is/As`. A bare `return err` five layers deep produces the unactionable log line `pq: deadlock detected` with no idea *which* query — the wrapping discipline is your stack trace.
- Log **once**, at the top of the handler, with the wrapped chain ([observability.md](../principles/observability.md) §1) — not at every return.
- **slog** (stdlib, structured) is the default logger now; attach request-scoped fields via a handler that reads them from ctx. OTel SDK for traces; propagate ctx everywhere and you get the distributed story nearly free.
- **pprof is the crown jewel: expose it** (`net/http/pprof` on an internal-only port — it's a DoS/info surface publicly; [security.md](../principles/security.md)) — live CPU/heap/goroutine/block profiles from production during the incident. Continuous profiling (Parca/Pyroscope) plugs straight in.
- GC: rarely the problem; when latency-sensitive, watch allocation rate (`pprof -alloc_space`), consider `GOMEMLIMIT` (right way to fit a container; prevents OOM-vs-GC thrash) before touching `GOGC` ([performance.md](../principles/performance.md) §3).

## 6. Testing specifics

- Table-driven tests + `t.Run` subtests are the idiom; `t.Parallel()` where safe (it also feeds the race detector interleavings).
- **Testcontainers-go** for real Postgres/Redis/Kafka ([testing.md](../principles/testing.md) §2); `httptest.Server` for HTTP seams; `goleak` for goroutine hygiene.
- Interfaces for seams are defined **by the consumer**, small (1–3 methods), which keeps hand-written fakes trivial — you rarely need a mocking framework, and mock-heavy Go tests are a smell twice over ([testing.md](../principles/testing.md) §1).
- Mutation testing options are weak (community `go-mutesting`); compensate with the race detector, fuzzing (`go test -fuzz` — native, cheap, brutal on parsers/validators), and hammer tests.

## Failure-mode quick table

| Failure | Detection | Fix / Prevention |
|---|---|---|
| Goroutine leak | `NumGoroutine` slope; pprof goroutine profile | Cancellation path per goroutine; `goleak` in tests |
| No client timeout → fleet hang | All handlers slow when dependency X is down | Custom `http.Client` with timeout; forbid `http.Get`/DefaultClient by lint |
| Unclosed response bodies | Conn/goroutine growth; `TIME_WAIT` storm | `defer resp.Body.Close()` + drain; review rule |
| Data race | `-race` report; corrupt state; map-write crash | Mutex whole read-decide-write; DB constraint for real invariants |
| Unbounded fan-out | DB/downstream saturation spikes with input size | `errgroup.SetLimit`; reviewer asks "what bounds this loop?" |
| `database/sql` unlimited conns | DB `max_connections` exhausted under load | `SetMaxOpenConns` per fleet math; conn metrics + alert |
| Panic in spawned goroutine kills process | Process restarts with panic stack in logs | `SafeGo` wrapper with recover for best-effort work |
| Server zero-value timeouts | Slowloris; idle conn buildup | Set all four server timeouts in the service template |
| Request-ctx cancels must-finish work | Audit/cache writes missing on client disconnects | `context.WithoutCancel` for post-response work |
