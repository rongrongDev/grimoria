# API Testing — in-process HTTP tests, schema validation, and the authz matrix

**Applies to:** supertest 7.x (in-process), Postman/Newman & Bruno (collection runners), zod 3.x / OpenAPI 3.1 validation, Testcontainers · **Last verified:** 2026-07-06
**Standalone:** yes. Scope: testing *your own* HTTP API at the integration layer — real routing, middleware, serialization, and database; external third parties faked at the network boundary. Cross-*service* agreement is contract testing and lives in `quality-dev/tools/pact.md`.
**Related principles:** layer choice — `quality-dev/principles/test-strategy.md`; hermetic data — `quality-dev/principles/contract-and-integration-testing.md`; authz ownership — `quality-dev/principles/security-testing.md`.

## The default architecture: in-process, real stack, ephemeral DB

The highest-fidelity-per-millisecond pattern for a JS/TS service:

```ts
// supertest drives the real app object — real middleware order, real serializers,
// real error handlers — without binding a port.
const app = buildApp({ db: containerDb, paymentGateway: fakeGateway });

it('rejects cross-tenant order access with an unrevealing 404', async () => {
  const { id } = await seedOrder({ tenant: 'a', db: containerDb });
  const res = await request(app)
    .get(`/api/orders/${id}`)
    .set(authAs({ tenant: 'b', role: 'admin' }));
  expect(res.status).toBe(404);                       // not 403: don't confirm existence
  expect(res.body).toEqual({ error: 'not_found' });   // and the body leaks nothing
});
```

Load-bearing choices: **real DB** (Testcontainers Postgres, migrations applied once per suite) because mocked repositories can't fail on the SQL that will fail — I've reviewed too many green suites over broken joins; **fakes only at unownable edges** (payment gateway, email) injected through the same seams production uses; **unique per-test data** created by the test (`quality-dev/principles/contract-and-integration-testing.md`, data rules) so parallel workers never collide.

## What to assert per endpoint — the five-line contract

For each endpoint, the minimum honest set: **status code** (exact, incl. error cases); **body shape+values** (`toEqual` on the object or schema-validate — not `toBeDefined()` field pokes); **persisted effect** (query the DB: the thing the 201 claimed happened, happened — response-only assertions pass while the transaction rolls back; I've shipped that bug); **negative space** (what must NOT change: failed request ⇒ no row, no event); **headers that are contract** (cache-control on cacheables, content-type, pagination links).

## Schema validation — kill drift between spec and server

If you publish OpenAPI, your tests should fail when the implementation drifts from it — otherwise the spec is marketing. Cheapest robust pattern: response-validate in test against the spec (jest-openapi / openapi-response-validator style, or zod schemas shared between handler and test). Run a **spec-diff check** (oasdiff-class) in CI: breaking-change in the diff ⇒ blocks merge unless the version strategy says expand-contract (`quality-dev/principles/contract-and-integration-testing.md`). Schema validation proves *self-consistency*; it does not prove consumers are safe — that's Pact's job (`quality-dev/tools/pact.md`). Run both; they catch disjoint failures.

## The authz matrix, concretely

The principle and its rationale live in `quality-dev/principles/security-testing.md`; the implementation is a data-driven table iterated in one file:

```ts
const matrix = [
  // resource,        actor,               op,       expect
  ['order.own',       'owner',             'GET',    200],
  ['order.own',       'owner',             'DELETE', 204],
  ['order.otherUser', 'sameTenantUser',    'GET',    403],
  ['order.otherTenant','admin',            'GET',    404],  // cross-tenant: hide existence
  ['order.any',       'anonymous',         'GET',    401],
  // … every deny cell enumerated
] as const;

test.each(matrix)('%s as %s %s → %i', async (resource, actor, op, expected) => { /* seed, act, assert status + non-leaky body */ });
```

Adding a resource without adding rows fails review by inspection. The deny cells are the point — allow cells get tested by development happening.

## Postman/Newman & Bruno — where collection runners belong

Collections excel at **exploration, documentation, and ops smoke checks** — and rot as regression suites: JS-in-JSON assertions escape lint/typecheck/review tooling, share no fixtures with your codebase, and drift from the app they describe. Decision rule: if it gates a merge, it's code (supertest/Vitest) in the repo; Newman-run collections are acceptable as *deployed-environment smoke probes* (post-deploy Stage 2, `quality-dev/principles/ci-cd-integration.md`). Bruno's git-native plain-text format fixes review-ability and is the better collection tool in 2026 — the boundary stays the same. Keep any collection ≤ smoke-sized (~dozen requests); I inherited a 900-request Newman "suite" that took 40 minutes and nobody could say what a failure meant — it was deleted, not migrated.

## Common pitfalls

| Pitfall | Consequence | Instead |
|---|---|---|
| Mocked repo/DB in "integration" tests | Green suite over broken SQL | Testcontainers real engine |
| Response-only assertions on mutations | Passes while transaction rolls back | Assert persisted state too |
| Shared seed users/records | Parallel flakiness (taxonomy #2) | Per-test unique data, factory helpers |
| `toBeDefined()` field pokes | Assertion-free-adjacent; survives wrong values | `toEqual`/schema validation |
| Testing error paths only via impossible inputs | Real failure modes (timeout mid-transaction, dup key) untested | Fault-inject at the fake edges; duplicate-key and timeout cases explicit |
| Status-code-only authz checks | Body leaks existence/details on deny | Assert body opacity on every deny cell |
| Collection runner as merge gate | Unreviewable, drifting assertions | In-repo code gates; collections for smoke only |

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Spec/server drift | Response-validation failures; oasdiff breaking hits | Fix impl or version via expand-contract | Spec-diff gate in PR stage |
| IDOR gaps | Empty deny cells in the matrix | Add cell + fix the check | PR template: new resource ⇒ new matrix rows |
| Phantom persistence | Mutation tests (Stryker) show `BlockStatement` survivors in handlers; prod data anomalies | Add persisted-effect assertions | Handler-test checklist (five-line contract above) |
| Env-coupled API tests | Fails against staging drift, passes locally | In-process app + containers; kill staging dependence | Rule: merge-gating API tests may not reach shared envs |
