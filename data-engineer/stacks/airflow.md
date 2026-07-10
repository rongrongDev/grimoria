# Airflow — production patterns, failure modes, the judgment layer

**Applies to:** Airflow 2.7–2.10 and 3.x (3.0 GA April 2025; deltas flagged inline — most production fleets in 2026 still run 2.9/2.10) · **Last verified:** 2026-07-06

Airflow is what you will inherit: the dominant orchestrator by installed base, with fifteen years of accumulated footguns and fixes. The orchestrator-agnostic judgment lives in `data-engineer/principles/orchestration.md`; this doc is where that judgment meets Airflow's actual APIs and actual failure modes.

---

## 1. The mental model that prevents most Airflow bugs

- **A DAG run represents a *data interval*, not a moment.** The run "for" July 1 executes *after* July 1 ends (schedule `@daily` → run with `data_interval_start=Jul 1 00:00`, `data_interval_end=Jul 2 00:00`, starting Jul 2). Half of all beginner Airflow bugs are this: using `execution_date`-era intuition or `datetime.now()` and processing the wrong day. **Always window task work by `data_interval_start`/`data_interval_end`** (template vars `{{ data_interval_start }}`); never wall clock. (`execution_date` is deprecated since 2.2 and removed in 3.0 — treat any code still referencing it as a migration TODO and a bug risk.)
- **The scheduler parses DAG files continuously.** Top-level DAG-file code runs every parse loop (~every 30s), not once — a top-level DB query or API call at import time is a DDoS you run against yourself. Top level: only DAG/task *definitions*. All real work inside task callables/operators.
- **Tasks execute on ephemeral workers with no shared memory.** Data between tasks goes through durable external storage. **XCom is for small metadata** (row counts, file paths, run IDs — kilobytes) — it lives in the metadata DB; pushing DataFrames through XCom (even with custom backends) couples your data path to your control plane's database. Pass *pointers*, not payloads.

## 2. DAG definition patterns

```python
# Airflow 2.7+/3.x idiomatic shape
from airflow.decorators import dag, task
from pendulum import datetime

@dag(
    schedule="@daily",
    start_date=datetime(2026, 1, 1, tz="UTC"),
    catchup=False,                    # explicit, always — see §5
    max_active_runs=3,               # cap self-stampedes
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=5),
        "retry_exponential_backoff": True,
        "max_retry_delay": timedelta(minutes=60),
        "execution_timeout": timedelta(hours=1),   # every task, no exceptions
        "owner": "team-orders",                     # a team, never a person's username
    },
    tags=["orders", "tier1"],
)
def orders_daily(): ...
```

- **`start_date` is static and timezone-aware.** A dynamic `start_date=days_ago(1)` makes run identity unstable — the same logical window maps to different runs on different parse days. Pin it; use pendulum with an explicit tz.
- **Idempotent task bodies:** every write follows `data-engineer/principles/pipeline-correctness.md` §1 (partition overwrite keyed on `data_interval_start`, MERGE, or append+dedup). The `pipeline-idempotency-auditor` skill reviews DAG diffs for exactly this.
- **Task granularity:** split at retry-boundary seams (extract / load / validate / transform), not per-SQL-statement. 200-task DAGs where 40 tasks wrap one query each are scheduler load and UI noise; monoliths that re-run 4 hours on retry are the opposite failure (`principles/orchestration.md` §1).
- **Dynamic task mapping (`.expand()`)** for fan-out over a runtime-known list (files, partitions, tenants). Cap it: `max_active_tis_per_dag`, and remember each mapped instance is a scheduler row — mapping over 10k items works far worse than mapping over 100 batches of 100. If the fan-out list comes from a query, that query runs in a task (not top-level — §1).
- **Deprecated-pattern radar** (things you'll meet in inherited DAGs, all fixable mechanically): `SubDagOperator` (deadlock generator; replace with TaskGroups), `provide_context=True` / `**kwargs` pulls (implicit in 2.x TaskFlow), `schedule_interval` (→ `schedule`), `execution_date` (→ `logical_date`/`data_interval_*`), bare `PythonOperator` where `@task` is clearer.

## 3. Airflow 3.x deltas that matter (migrating or greenfield)

- **DAG versioning:** 3.0 tracks DAG code versions per run — mid-run code changes no longer silently execute mixed versions (a real 2.x incident class: a deploy landing mid-run means tasks 1–3 ran old code, tasks 4–9 new).
- **`execution_date` removed**; `logical_date`/data intervals only. 2.x DAGs still using it break at upgrade, not before — grep for it now.
- **Task execution API / task isolation:** workers no longer need metadata-DB credentials (tasks talk to an API server). Big security win (`principles/security-and-governance.md` §2 least-privilege finally applies to workers); changes how custom operators that touched the session must be written.
- **Assets** (renamed/evolved from 2.x Datasets) are first-class: asset-triggered scheduling is the preferred cross-DAG dependency mechanism (§6), with `@asset` decorators converging toward Dagster-style asset thinking.
- **UI/scheduler rewrites** change ops muscle memory but not judgment. Upgrade path: get clean on 2.10 deprecation warnings first; the 2→3 jump is mostly mechanical after that.

## 4. Sensors and deferrable operators

Polling-in-a-worker-slot is the classic Airflow capacity leak: 100 `mode="poke"` sensors = 100 occupied worker slots doing nothing.

- Default: **`mode="reschedule"`** (frees the slot between pokes) for anything polling minutes-to-hours.
- Better, 2.6+: **deferrable operators / triggers** (async, run on the triggerer process) — `DateTimeSensorAsync`, deferrable versions of most cloud sensors. Use for anything long-poll at scale; one triggerer replaces hundreds of slots.
- **Every sensor gets a `timeout` + failure escalation.** A sensor waiting forever converts "upstream is late" into "nobody found out" (`principles/orchestration.md` §5). Timeout ≈ SLA-relevant deadline, and its failure pages the *producing* team's channel.
- `ExternalTaskSensor` couples you to another team's DAG *structure* (dag_id, task_id, matching logical dates — the classic silent bug: mismatched schedules mean it waits on a run that never exists). Prefer asset/dataset triggers or a readiness-table poll (`audit.window_ready` pattern), which survive the producer refactoring their DAG.

## 5. Catchup, backfills, pools — the resource-storm controls

- **`catchup=False` unless the DAG is windowed-idempotent and you *want* gap-filling** (`principles/orchestration.md` §3). With catchup on, a paused-then-unpaused DAG schedules every missed interval at once: bound it with `max_active_runs`, and remember `depends_on_past=True` serializes runs (useful for incremental models; also the classic reason a DAG "mysteriously" stops — one old failure blocks everything after it, forever, quietly).
- **Backfills:** 2.x `airflow dags backfill` CLI runs *outside* normal scheduler loops with surprising interactions; 3.0 made backfills scheduler-native (UI/API-triggerable, bounded). Either way the discipline is `principles/pipeline-correctness.md` §3 (idempotency proof, cost estimate, seam validation) plus **pools**:
- **Pools are the platform's shared-resource throttles** — create one per external resource (`snowflake_elt`, `vendor_api_x`), size it to what the resource tolerates, assign every task touching that resource. Per-DAG concurrency does not protect a warehouse from six DAGs; pools do. Backfill tasks get lower `priority_weight` so production runs preempt history repair.
- **`max_active_tasks` (DAG-level) and parallelism (installation-level)** are the blunt backstops; pools are the precise instrument.

## 6. Cross-DAG and cross-team dependencies

Preference order (rationale in `principles/orchestration.md` §5):
1. **Asset/Dataset-triggered scheduling** (2.4+ Datasets, 3.x Assets): producer task declares `outlets=[Asset("snowflake://db/schema/fct_orders")]`; consumer DAG schedules on the asset. Decoupled from producer DAG internals. Caveat: a Dataset event fires on task *success*, so emit it from (or after) the DQ-gate task, not the raw load — otherwise you've built "trigger consumers on unvalidated data" with extra steps.
2. **Readiness-table sensor** (deferrable poll on `audit.window_ready`): crude, portable, survives orchestrator migrations and mixed-orchestrator organizations.
3. `ExternalTaskSensor` / `TriggerDagRunOperator`: accepts structural coupling; document the coupling in both DAGs' headers so the producer team knows they can break you.

## 7. Operational failure modes

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| **Scheduler starvation** — DAG-file parse times balloon (top-level code, giant dynamic DAG factories); tasks schedule late platform-wide | `dag_processing.total_parse_time` metric; scheduling delay (queued→running lag) trending up | Find slow files (`airflow dags report`); move top-level work into tasks; split mega-factories | CI check on parse time per DAG file; no network/db calls at import (lint for it) |
| **Metadata DB bloat** — years of task instances/XCom/logs; UI slow, scheduler slow, upgrades scary | DB size monitoring; slow UI as the human symptom | `airflow db clean` (2.3+) with retention window; archive first | Scheduled db-clean job from day one; XCom kept to pointers (§1) |
| **Zombie/orphaned tasks** — worker dies mid-task; task shows running forever; SLA quietly missed | Zombie-detection logs; freshness vital-sign on the *table* catches what task state hides (`principles/observability-and-lineage.md` §2) | Clear the task instance; investigate worker OOM/eviction | `execution_timeout` everywhere; worker resource headroom; heartbeat tuning |
| **One old failure + `depends_on_past` freezes a DAG for weeks** | "DAG hasn't produced data since <date>" freshness alert (task-state monitoring won't fire — nothing is failing *now*) | Clear/mark-success the blocking instance after validating the window | Freshness monitors per output table, not per DAG; alert on no-successful-run-in-N |
| **Retry-duplicates side effects** — retried task re-sends emails / re-posts to API / double-appends | Duplicate complaints; dedup-key collisions downstream | Make the effect idempotent or gate it (sent-ledger); *then* clear | `pipeline-idempotency-auditor` on every DAG PR; retries assume idempotency, so verify it before configuring them |
| **Connection/secret sprawl** — creds in Variables in plaintext, per-DAG duplicated connections | Security review; grep DAG code for hardcoded secrets | Move to a secrets backend (Vault/cloud secret manager) | Secrets backend from day one; connections named per service+env; no secrets in DAG code, ever |

## 8. Testing DAGs

- **Parse test (the floor):** `DagBag(include_examples=False)` in CI asserting zero import errors — catches the syntax error that would otherwise take down *every* DAG's scheduling at deploy time.
- **Structural asserts** for load-bearing wiring: DQ gate sits between load and transform; every task has an owner/timeout; catchup policy explicit. Cheap, and they stop review regressions.
- **Task-callable unit tests:** business logic lives in plain functions imported by tasks (thin-operator pattern), tested without Airflow. If logic is only testable through a DAG run, it's in the wrong layer.
- **The data itself** is tested by the DQ layer (`principles/data-quality.md`), not by Airflow tests — don't build a parallel assertion universe in pytest.

---

**See also:** `data-engineer/principles/orchestration.md` (the judgment this implements) · `principles/pipeline-correctness.md` (idempotent task bodies) · `stacks/prefect-and-temporal.md` (when the alternatives fit better) · `data-engineer/guides/build-a-pipeline-from-scratch.md` (a full worked DAG).
