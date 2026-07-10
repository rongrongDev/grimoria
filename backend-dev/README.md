# backend-dev — A Principal Engineer's Knowledge Base

Twenty-plus years of building and operating backend systems, encoded for the people (and models) who come after. Judgment first: every rule here exists because something broke without it, and the docs say what broke. **Maintained per [DESIGN-NOTES.md](DESIGN-NOTES.md); revision history in [CHANGELOG.md](CHANGELOG.md); terms in [GLOSSARY.md](GLOSSARY.md).**

## Find what you need in 30 seconds

**"I'm about to do X"** — start here:

| You are about to...                                        | Go to                                                                                                                                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design or change an API                                    | [principles/api-design.md](principles/api-design.md); audit a diff with the **`api-contract-auditor`** skill                                                                        |
| Write or review a schema migration                         | [principles/data-layer.md](principles/data-layer.md) §1 → run the **`migration-safety-reviewer`** skill                                                                             |
| Build a new service from zero                              | [guides/build-from-scratch.md](guides/build-from-scratch.md) (complete walkthrough)                                                                                                 |
| Take over / assess an unfamiliar codebase                  | [guides/analyze-existing-service.md](guides/analyze-existing-service.md); sweep with the **`race-condition-scanner`** agent                                                         |
| Add a queue, worker, or scheduled job                      | [principles/async-work.md](principles/async-work.md) + your broker in [stacks/messaging.md](stacks/messaging.md)                                                                    |
| Touch money, inventory, or any "count must be right" logic | [principles/concurrency.md](principles/concurrency.md) — before you write code                                                                                                      |
| Add caching / a distributed lock / rate limiting           | [concurrency.md](principles/concurrency.md) §2, §6 · [performance.md](principles/performance.md) §4 · [security.md](principles/security.md) §7 · [stacks/redis.md](stacks/redis.md) |
| Set up auth, or handle user input                          | [principles/security.md](principles/security.md)                                                                                                                                    |
| Decide what/how to test                                    | [principles/testing.md](principles/testing.md)                                                                                                                                      |
| Set up logging/alerts/SLOs, or design for failure          | [principles/observability.md](principles/observability.md)                                                                                                                          |
| Make something faster / plan a load test                   | [principles/performance.md](principles/performance.md)                                                                                                                              |
| Run a postmortem                                           | [observability.md](principles/observability.md) §5 → draft with the **`incident-postmortem-analyzer`** agent                                                                        |
| Orchestrate AI agents on backend tasks                     | [principles/multi-agent-orchestration.md](principles/multi-agent-orchestration.md)                                                                                                  |

**"Something is broken right now"** — every principles and stack doc ends with a **failure-mode index** (failure → detection → fix → prevention). Match your symptom:

| Symptom                                                  | Likely doc                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Latency cliff, DB looks idle, timeouts everywhere        | [data-layer.md](principles/data-layer.md) §4 (pool exhaustion)                            |
| Impossible data: negative stock, double charge, oversell | [concurrency.md](principles/concurrency.md)                                               |
| Deploy caused a DB outage / lock pileup                  | [data-layer.md](principles/data-layer.md) §1, [stacks/postgres.md](stacks/postgres.md) §2 |
| Queue deep, workers busy, nothing moving                 | [async-work.md](principles/async-work.md) §4 (poison message)                             |
| Periodic brownouts on the hour                           | [concurrency.md](principles/concurrency.md) §6 (stampede/herd)                            |
| p99 spiked on ALL endpoints at once                      | your runtime's stack doc §1 (event loop / thread pool / GIL)                              |
| Everything about one slow dependency                     | [observability.md](principles/observability.md) §4                                        |

## Structure

```
backend-dev/
├── principles/        # judgment: why, tradeoffs, decision trees, war stories (9 docs)
├── stacks/            # per-technology mechanics. Core tier (full depth): nodejs, python,
│                      #   go, jvm, postgres, redis, mongodb. Extended tier (patterns +
│                      #   pitfalls): rails, dotnet, messaging (Kafka/RabbitMQ/SQS), grpc
├── guides/            # end-to-end capabilities: build-from-scratch, analyze-existing-service
├── GLOSSARY.md        # one definition per term, linked from everywhere
├── DESIGN-NOTES.md    # why docs vs skills vs subagents; maintenance rules
└── CHANGELOG.md       # dated revisions per doc
└── skills/            # executable procedures: migration-safety-reviewer, api-contract-auditor
└── agents/            # context-isolated sweeps: race-condition-scanner, incident-postmortem-analyzer
```

**How to read:** principles docs teach the judgment (stack-agnostic, stable); stack docs give your technology's mechanics and cite the principles; skills/agents _execute_ the checklists. Every doc stands alone — start anywhere, follow links only when you want depth. If you read only three: [concurrency.md](principles/concurrency.md), [data-layer.md](principles/data-layer.md), [observability.md](principles/observability.md) — they cover the incidents that actually page people.

**Freshness:** every stack doc carries `Verified against:` versions and a `Last reviewed:` date. Stack docs older than 12 months: verify version-specific claims before relying on them (rule in [DESIGN-NOTES.md](DESIGN-NOTES.md)). Principles docs age much more slowly — isolation levels and idempotency outlive frameworks.
