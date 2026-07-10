# Pact — consumer-driven contracts, mechanically

**Applies to:** pact-js 12.x+ (V3/V4 spec), Pact Broker (OSS) / PactFlow (SaaS) · **Last verified:** 2026-07-06
**Standalone:** yes. Definitions: the *consumer* calls an API; the *provider* serves it. A *pact* is a JSON file of interactions the consumer verified against a Pact mock; *provider verification* replays those interactions against the real provider; the *broker* stores pacts/verification results and answers `can-i-deploy`. A *provider state* is a named precondition ("user 42 exists") the provider sets up before replay.
**Related principles:** when contracts beat E2E and the expand→migrate→contract versioning strategy — `quality-dev/principles/contract-and-integration-testing.md` (read first; this doc is mechanics).

## Consumer side — record only what you rely on

```ts
const provider = new PactV4({ consumer: 'checkout-web', provider: 'orders-api' });

it('fetches an order', () =>
  provider
    .addInteraction()
    .given('an order with id 42 exists')                 // provider state, by name
    .uponReceiving('a request for order 42')
    .withRequest('GET', '/orders/42', b => b.headers({ Accept: 'application/json' }))
    .willRespondWith(200, b =>
      b.jsonBody({
        id: integer(42),          // matcher: type, not literal
        status: regex(/^(pending|paid|shipped)$/, 'paid'),
        total: decimal(99.5),
        // NOTHING ELSE — only fields this consumer actually reads
      }))
    .executeTest(async mock => {
      const order = await orderClient(mock.url).get(42);  // the REAL client code
      expect(order.status).toBe('paid');
    }));
```

The three disciplines that make this worth having:

1. **Matchers over literals** (`integer`, `like`, `regex`, `eachLike`) except where the literal *is* the requirement (status codes, enum values). Literal-matching everything turns every benign provider change into a cross-team fire drill — the over-specification failure in `quality-dev/principles/contract-and-integration-testing.md`.
2. **Exercise the real client module**, not raw fetch in the test — the pact then certifies the code that runs in production, serialization bugs included.
3. **Every matched field must be traceable to consumer code that reads it.** Reviewers should reject `jsonBody` fields nobody consumes; each one is future friction for the provider team.

Publish on CI merge: `pact-broker publish ./pacts --consumer-app-version=$GIT_SHA --branch=$BRANCH`. Version = git SHA, always — human-invented versions can't answer "which commit is safe to deploy."

## Provider side — verification and states

```ts
await new Verifier({
  provider: 'orders-api',
  providerBaseUrl: 'http://localhost:8080',          // real app, test config
  pactBrokerUrl, consumerVersionSelectors: [
    { mainBranch: true }, { deployedOrReleased: true } // verify what main has AND what's live
  ],
  publishVerificationResult: true,                    // CI only, never local runs
  providerVersion: process.env.GIT_SHA,
  stateHandlers: {
    'an order with id 42 exists': async () =>
      seedOrder({ id: 42, status: 'paid', total: 99.5 }),  // hermetic per-verification data
  },
}).verifyProvider();
```

- **State handlers seed hermetic data** into the provider's own test DB (Testcontainers, same rules as `quality-dev/tools/api-testing.md`). A state handler that reaches into shared staging reimports every flakiness mode contracts exist to remove.
- **`consumerVersionSelectors` with `deployedOrReleased: true`** is the difference between "compatible with consumers' main branches" and "compatible with what is actually running in prod" — you need both to deploy safely.
- Verification failure means: *this provider change breaks checkout-web, specifically the order-status field* — named consumer, named field, at PR time. That sentence replacing a production incident is the entire ROI.

## `can-i-deploy` — the gate that makes the rest matter

```bash
pact-broker can-i-deploy --pacticipant orders-api --version $GIT_SHA \
  --to-environment production
# deploys only if the broker matrix shows all consumer/provider pairs verified
pact-broker record-deployment --pacticipant orders-api --version $GIT_SHA \
  --environment production   # AFTER the deploy succeeds — keeps the matrix truthful
```

Both consumer and provider pipelines run `can-i-deploy` before deploy and `record-deployment` after. Skipping `record-deployment` silently rots the matrix until `can-i-deploy` answers from fiction. Wire **broker webhooks** so a newly published pact triggers the provider's verification build immediately — without this, consumers wait for the provider's next scheduled build to learn they're incompatible, and the feedback loop dies.

## Common pitfalls

| Pitfall | Consequence | Instead |
|---|---|---|
| Asserting whole responses literally | Provider can't change anything; teams abandon Pact | Matchers + only-consumed-fields rule |
| Provider states hitting shared envs | Flaky verification; cross-team data collisions | Hermetic state handlers, own test DB |
| No broker (pacts as repo files passed by hand) | No matrix, no `can-i-deploy`, no webhooks — folder of JSON | Broker/PactFlow from day one |
| Human version strings | Matrix can't map to deployable commits | `--consumer-app-version=$GIT_SHA` everywhere |
| `publishVerificationResult` from laptops | Matrix polluted with unreproducible local runs | Publish only from CI |
| Missing `record-deployment` | `can-i-deploy` consults stale reality | Deploy scripts pair the two commands, always |
| Contracting third-party APIs you don't operate | You can't verify a provider you don't run | Contracts only across *your* org's seams; wrap third parties with recorded fixtures (`quality-dev/principles/contract-and-integration-testing.md`, mock drift) |
| Using Pact for semantic guarantees (units, meaning) | Shape passes, meaning breaks | Provider-side semantic tests + versioning discipline |

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Provider breaks a consumer | Verification red on provider PR (the system working) | Expand→migrate→contract, never break-and-coordinate | `can-i-deploy` gate in both pipelines |
| Contract drift from real consumer behavior | Prod incident on a field no pact mentions | Add the missing interaction from the incident | Review rule: client-code reads ⇒ pact fields, kept in same PR |
| Matrix rot | `can-i-deploy` passes, deploy breaks | Audit `record-deployment` calls | Deployment pipeline owns recording; alert on env with no recent recordings |
| Verification latency (consumer waits days) | Time from pact publish → verification result | Broker webhook → provider verification job | Webhook configured per provider; dashboard on verification lag |
