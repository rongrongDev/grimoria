# Prefect & Temporal — extended tier: production patterns + common pitfalls

**Applies to:** Prefect 3.x (GA Sept 2024); Temporal server 1.2x / SDKs 1.x as of mid-2026 · **Last verified:** 2026-07-06 · Depth tier: **extended** — patterns and pitfalls only. The orchestration judgment these tools implement is `data-engineer/principles/orchestration.md`; read that first, it applies verbatim.

## When each one is the right call (vs. Airflow)

- **Prefect**: Python-native, dynamic-by-default workflows — flows are real Python, control flow included, no DAG-shape ceremony. Right when: workflows are genuinely dynamic (shape decided at runtime), the team is Python-first and small, or you're orchestrating ML/DS work that chafes under scheduler-parse-loop constraints. Wrong when: you need the enormous Airflow provider/operator ecosystem, platform-scale multi-team governance conventions, or you're hiring for the largest orchestrator talent pool.
- **Temporal**: durable execution for *transactional, long-running, stateful* workflows — order sagas, provisioning, payment flows, human-in-the-loop steps spanning days. It replays workflow code deterministically from an event history, making state survive any crash. Right when: the workflow's *state machine itself* is the hard part and exactly-once-effect discipline matters more than data-flow tooling. **Wrong as a data-pipeline orchestrator**: no data-aware scheduling, no backfill semantics, no lineage/asset model — teams that route nightly ELT through Temporal rebuild Airflow badly on top of it. Use it for the operational workflows *around* the platform (e.g., the deletion-propagation saga from `principles/security-and-governance.md` §3 is a perfect Temporal fit).

## Prefect 3.x — production patterns

- **Windowed, parameterized flows:** pass the logical window as a flow parameter (defaulted from the schedule); never compute it from `datetime.now()` inside tasks — same wall-clock rule as everywhere (`principles/orchestration.md` §1). Prefect won't force this discipline the way Airflow's data intervals nudge you; you must bring it.
- **Idempotency via task cache keys:** `cache_key_fn` on (task, window) inputs gives safe-rerun-without-recompute; the *write* patterns still come from `principles/pipeline-correctness.md` §1 — a cache is not idempotency, it's memoization that hides its absence until the cache expires.
- **Concurrency limits** (global, tag-based) are Prefect's pools: create one per shared resource (warehouse, vendor API) and tag every task touching it — identical judgment to Airflow pools (`stacks/airflow.md` §5), different spelling.
- **Deployments + work pools** separate definition from execution infrastructure; pin worker environments (image digests, not `latest`) — Prefect's flexibility here is where environment drift sneaks in.

**Prefect pitfalls:**
| Pitfall | Consequence | Prevention |
|---|---|---|
| Dynamic flows make run identity fuzzy — "the run for July 1" may not exist as a first-class thing | Backfills and gap-detection get hand-rolled, inconsistently | Explicit window parameter + a run-ledger table (window → status) your flows write; gap checks query the ledger |
| No catchup semantics out of the box | Outage gaps silently never fill (`principles/orchestration.md` §3's nastier branch) | Volume-per-window monitors + a scheduled gap-filler flow reading the ledger |
| `.submit()`/async fan-out without limits | Self-inflicted warehouse stampede | Tag-based concurrency limits on every external resource, from day one |
| Results/artifacts stored by default config | Large payloads through the API/result store (the XCom mistake, new spelling) | Pass pointers (paths/table names); configure result storage deliberately |

## Temporal — production patterns

- **Workflow code must be deterministic** — it is *replayed* against history on every recovery: no wall-clock reads (use `workflow.now()`), no random, no direct I/O. **All side effects live in activities**, which are retried by the platform and therefore **must be idempotent** — Temporal gives exactly-once *workflow state transitions*, and explicitly at-least-once *activity execution*. Idempotency keys on every external call an activity makes (`principles/pipeline-correctness.md` §1 applies inside every activity).
- **Heartbeats + timeouts on long activities** (start-to-close especially): a hung activity without a timeout is invisible-stuck, the Temporal spelling of the zombie task.
- **Versioning discipline:** changing workflow code while executions are in flight breaks replay determinism — use the versioning/patching APIs for any change to a workflow with live long-running executions. This is the tax for durable execution; budget for it in review.

**Temporal pitfalls:**
| Pitfall | Consequence | Prevention |
|---|---|---|
| Treating activities as exactly-once | Duplicate emails/charges/API effects on retry | Idempotency keys per activity invocation; review rule: every activity states its dedup story |
| Data payloads through workflow histories | History size limits hit; replay slows; costs balloon | Pointers in workflows, data in object storage/warehouse |
| ELT scheduled as Temporal cron workflows | Rebuilt Airflow without backfills, lineage, or data-awareness | Boundary rule: datasets → Airflow/Prefect/dbt; stateful operational sagas → Temporal |
| Non-deterministic code sneaking into workflows (a logging call reading env, a dict-ordering assumption) | Replay failures during incidents — i.e., at the worst moment | SDK static analysis/lint (workflow sandbox in Python SDK); replay tests in CI against recorded histories |

---

**See also:** `data-engineer/principles/orchestration.md` (all the judgment, tool-free) · `stacks/airflow.md` (the core-tier orchestrator these are alternatives to) · `principles/pipeline-correctness.md` (idempotency both tools assume but neither provides).
