# gRPC — Production Patterns & Common Pitfalls

**Tier:** Extended (production patterns + pitfalls; not full-depth). **Verified against:** gRPC current majors across languages, protobuf 3 / editions, buf CLI 1.x. **Last reviewed:** 2026-07-06.
**Read with:** [api-design.md](../principles/api-design.md) (when gRPC is the right choice — §1; contract-evolution judgment), [observability.md](../principles/observability.md) (deadlines).

gRPC buys you a typed contract, HTTP/2 multiplexing, and native deadlines/streaming. It bills you in three currencies: **load balancing you must now think about, proto evolution discipline, and debuggability** (no curl, binary wire format — invest in grpcurl + reflection on internal services from day one).

## Production patterns

- **Proto evolution rules (the whole contract game):**
  - **Never reuse or renumber a field number.** Numbers, not names, are the wire contract; reusing a dead number silently misparses old data as the new type — a data-corruption class bug with no error anywhere. Renaming is free; renumbering is never.
  - Deleted fields: mark `reserved` (number *and* name) so no future edit can reuse them. Removing a field without reserving is a delayed-fuse incident.
  - All fields are effectively optional; **never make business logic depend on proto3 scalar defaults** (you cannot distinguish "sent 0" from "unset" — use wrapper types/`optional` where the distinction matters, e.g. "set price to 0" vs "don't change price").
  - Enums: first value = `_UNSPECIFIED = 0` (the default when unset — if your zero value is a meaningful state like `ACTIVE`, every unset field silently means that); consumers handle unknown values ([api-design.md](../principles/api-design.md) §3's enum rule, wire-enforced here).
  - **`buf breaking` in CI on every proto change** — it's `oasdiff` for protos and non-negotiable; `buf lint` for the style/evolution rules above. Protos live in one repo/module of truth, generated code is build output, never hand-edited.
- **Deadlines are the killer feature — use them:** every client call sets a deadline; servers **check `ctx` and propagate the *remaining* budget** downstream automatically ([observability.md](../principles/observability.md) §2 — gRPC does deadline propagation natively; this is half the reason to adopt it). A fleet without deadlines has infinite default timeouts ([observability.md](../principles/observability.md) §4's cardinal sin, protobuf edition). Server must *stop working* on expired contexts, or you keep the zombie-work problem anyway.
- **Load balancing needs a decision, not a default:** HTTP/2 = one long-lived connection multiplexing everything, so an L4 (connection-level) balancer sends **all** of a client's RPCs to one backend — the "we scaled to 10 pods and one gets 90% of traffic" incident, plus traffic pinned to old pods across deploys. Options: client-side LB with a resolver (`round_robin` over endpoints), a service mesh / L7 proxy (Envoy/Linkerd — the usual right answer in K8s), or a gRPC-aware LB. Also set client keepalive + server `MAX_CONNECTION_AGE` (with grace) so connections rebalance after scaling events.
- **Error contract:** use the canonical status codes correctly — clients build retry policy on them ([api-design.md](../principles/api-design.md) §6): `UNAVAILABLE`/`DEADLINE_EXCEEDED` retryable (with jitter — [concurrency.md](../principles/concurrency.md) §4), `INVALID_ARGUMENT`/`FAILED_PRECONDITION`/`PERMISSION_DENIED` never. Rich details via `google.rpc.Status` + error-details protos, not strings. **`UNIMPLEMENTED` from a live service usually means a deploy-order bug** (new client method, old server) — contract tests / `buf breaking` + rollout ordering catch it.
- **Streaming judgment:** unary until proven otherwise. Server-streaming for large result sets (with flow control — respect backpressure, don't buffer the world) and watch-style feeds; bidi streaming is a distributed-systems commitment (reconnection, resumption, ordering are *your* application logic now) — require a design review. Long-lived streams + LB/proxy idle timeouts = mysterious mid-stream drops; align keepalives with every hop's idle timeout.

## Common pitfalls

| Pitfall | What happens | Fix / Prevention |
|---|---|---|
| Field number reuse | Silent misparse of old data — corruption, no errors | `reserved` on every deletion; `buf breaking` gate |
| Meaningful zero enum/scalar | Unset fields silently mean a real state | `_UNSPECIFIED = 0`; wrappers/`optional` for set-vs-unset |
| L4 balancer + HTTP/2 | One backend gets all load; deploys strand traffic | Mesh/L7 proxy or client-side LB; `MAX_CONNECTION_AGE` |
| No deadlines anywhere | Zombie work; cascading hangs during brownouts | Client deadline mandatory (lint interceptor); server honors ctx |
| Retrying non-idempotent RPCs on `UNAVAILABLE` | Duplicate effects (send *can* succeed while ack fails) | Idempotency keys in requests ([concurrency.md](../principles/concurrency.md) §4); retry config per-method, not blanket |
| Unbounded message sizes | OOM on 100MB responses; default 4MB limit hit as a prod error | Explicit max sizes; paginate/stream large results |
| Binary opacity during incidents | Nobody can poke the API at 3am | Server reflection on internal services + grpcurl in runbooks; OTel interceptors for traces/metrics on every service ([observability.md](../principles/observability.md)) |
| gRPC to browsers/third parties | Doesn't work natively / integration friction | grpc-web/Connect for browsers; REST gateway (grpc-gateway) or plain REST for public APIs ([api-design.md](../principles/api-design.md) §1) |
| Auth assumed from "internal network" | Any pod can call any service | mTLS/mesh identity + per-method authZ interceptors ([security.md](../principles/security.md) §8) |
