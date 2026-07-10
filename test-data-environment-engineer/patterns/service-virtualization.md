# Service Virtualization & API Stubbing

> Last reviewed: 2026-07-09. Applies to: WireMock 3.x, Mountebank 2.9 (maintenance mode — prefer WireMock/Hoverfly for new builds), Pact specification V4, LocalStack 3.x.
> **Extended-tier doc:** production patterns + common pitfalls. Contract-testing theory and consumer-driven-contract workflow belong to `../../quality-dev/principles/contract-and-integration-testing.md` and `../../quality-dev/tools/pact.md`; this doc owns the *substrate judgment* — when to virtualize a dependency, and how to keep the virtual one honest.

## The judgment: when to stub, when to go real

Stub a dependency when the **cost of the real thing distorts testing more than the stub's dishonesty does.** That's the whole rule; the table is its expansion.

| Virtualize when... | Go real when... |
|---|---|
| The real dependency meters per call (payment gateways, KYC providers, LLM APIs) and test volume would cost real money | The test's *subject is the integration itself* — auth handshakes, pagination behavior, error semantics. A stub here tests your assumptions against your assumptions |
| The sandbox is unreliable/slow and its flakiness would dominate your signal | The dependency is cheap and fast to hit (your own other service in an ephemeral env — just deploy it) |
| You need failure injection the real service can't produce on demand (timeouts, 503s, malformed payloads, slow-drip responses) — this is virtualization's killer feature, not a consolation prize | Before any release that changed the integration surface: at least one real-sandbox pass, always |
| The partner rate-limits or requires booking (bank sandboxes) and would serialize your CI | The dependency's *data* matters (search indexes, ML scoring) — a stub returns what you told it to; that's fiction, not test data |

The trap position is the unexamined default in either direction: stubbing everything (fast suite, tests nothing real) or realing everything (honest suite, too slow and flaky to run).

## The war story

A payment stub, hand-written in 2022, returned `{"status": "success"}`. The real gateway's v3 API — migrated to in 2023 — returned `{"state": "SUCCEEDED"}`. The client code handled both during migration, then a cleanup PR removed the legacy path... except the stub still spoke v2, so every test kept passing against a dialect that no longer existed in production. The next release broke payments for four hours. The postmortem's sentence that stuck: **"our tests verified that we could talk to a service we had written ourselves."** No one had assigned the stub an owner, so no one owned noticing the drift.

## Production patterns

**1. Record/replay as the source of truth, hand-written stubs as the exception.** Record real sandbox conversations (WireMock recording mode, Hoverfly capture) and replay them; re-record on a schedule and on any partner changelog event. Hand-written stubs encode what you *believe*; recordings encode what the service *said*, with a timestamp you can reason about. Hand-write only what recording can't capture (failure injection, hypothetical error shapes) and mark those mappings as assumptions.

**2. Contract verification as the drift alarm.** Recordings still stale-date. Where you control both sides, Pact-style consumer contracts verified against the real provider in *its* CI catch drift at the source (`../../quality-dev/tools/pact.md` owns the mechanics). Where the provider is external: a scheduled thin "canary" suite hitting the real sandbox with the same requests your stubs answer, diffing response *shapes* (fields, types, status codes — not values). The stub answers CI; the canary audits the stub. Canary red = stop trusting green until re-recorded.

**3. Stubs are versioned artifacts with owners.** Stub mappings live in the repo beside the client code they impersonate (same-PR evolution), carry the recorded-from date and the real API version, and have a named owning team. An unowned stub is the war story on a timer.

**4. Failure-injection catalog as a first-class deliverable.** The virtualized layer's biggest honest value: a maintained set of named scenarios — `gateway-timeout-30s`, `http-503-with-retry-after`, `success-after-2-retries`, `malformed-json`, `slow-drip-1kbps` — that chaos-ish integration tests reference by name. Wire them into the same stub infrastructure so they can't drift apart from the happy-path mappings.

**5. Emulators are declared parity gaps.** LocalStack-class emulators (whole-cloud virtualization) are legitimate for local/CI speed, but their fidelity is approximate and IAM/security behavior especially so. Record them in the environment's parity declaration (`../principles/environment-provisioning.md`, layer 4) and require a real-cloud pass for anything IAM-adjacent.

## Common pitfalls

- **Stub drift (the war story).** Detection: shape-diff canary against the real sandbox; re-record cadence with a staleness alarm on recording age. Prevention: patterns 1–3 above. A stub with no verification mechanism is a test frozen at its recording date.
- **Stubbing the thing under test.** The suite "passes" because the integration it exists to verify was replaced by a mapping file. Review question for any new stub: *is any test in this suite responsible for the real conversation this stub replaces?* If no — add the canary/real-pass before the stub merges, not after.
- **Optimistic-only stubs.** Only happy paths mapped, so the client's error handling is untested fiction — usually discovered during the partner's first real outage. The failure catalog (pattern 4) is the prevention; "every stub ships with its failure scenarios" is a reviewable rule.
- **Stateful stubs growing into a second implementation.** A stub that accumulates business logic (balances that update, inventories that decrement) becomes a parallel service you now maintain and debug — its bugs produce test failures indistinguishable from real ones. Keep stubs as dumb as the tests allow (scenario-selected canned responses, WireMock state machines at most); if tests genuinely need rich stateful behavior, that's a signal the test belongs against the real sandbox instead.
- **Shared stub servers as contention points.** A central WireMock instance shared by parallel runs is shared mutable state (one run's mapping edits hit another's requests) — the same disease as `../principles/environment-lifecycle-and-contention.md` failure mode #1. Stub servers are per-run, in-process or per-container. They're cheap; there is no reason to share them.

## Cross-references

- Contract testing theory & Pact workflow: `../../quality-dev/principles/contract-and-integration-testing.md`, `../../quality-dev/tools/pact.md`
- Where the real-vs-virtual choice slots into environment design: `../principles/environment-provisioning.md` (parity layer 4)
- Assessing an existing setup's stub honesty: `../guides/assess-an-existing-setup.md` step 5
