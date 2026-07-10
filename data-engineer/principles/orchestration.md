# Orchestration — DAG design, retries, backfill orchestration, cross-team dependencies

**Applies to:** orchestrator-agnostic judgment; concrete syntax in `data-engineer/stacks/airflow.md` (core) and `stacks/prefect-and-temporal.md` (extended) · **Last verified:** 2026-07-06

The orchestrator's job is to make the *only* run patterns your pipeline can experience be patterns your pipeline is correct under. Retries, catchup, backfills, manual re-triggers — orchestration design is deciding what those do *before* they happen at 3am.

---

## 1. Design tasks for the orchestrator's actual behavior

Non-negotiables, orchestrator-agnostic:

- **Tasks are idempotent units aligned to logical windows.** Each task instance owns (task, logical window) and produces the same state on every execution — the write patterns from `data-engineer/principles/pipeline-correctness.md` §1. The orchestrator *will* re-run tasks without asking your code's permission; retries are configured on that assumption, not bolted onto tasks that "shouldn't fail twice."
- **Logical time, not wall-clock time.** All windowing derives from the run's logical interval (Airflow `data_interval_start/end`), never `NOW()`/`CURRENT_DATE` inside task code. Wall-clock windows make retries and backfills process the wrong slice — the bug is invisible until the first backfill, which is the worst time to discover it. (Grep any inherited codebase for `datetime.now`, `CURRENT_DATE`, `GETDATE` in task code — it's the highest-yield single check in a pipeline audit.)
- **Tasks are small enough to retry cheaply.** A monolithic 4-hour task that fails at minute 230 retries from zero. Split at the natural checkpoint boundaries (extract / load / transform / validate) so a retry repeats minutes, not hours. Corollary: **no hidden state between tasks** — anything task B needs from task A goes through durable storage (object store, table), not in-memory/XCom-sized payloads, or B can't be retried without A.
- **Retries with exponential backoff + jitter, and a cap.** Retrying instantly against a struggling warehouse is a self-inflicted stampede. Retries only help transient failures; a deterministic bug retried 5 times is 5× the cost and 5× the duplicate-risk surface for non-idempotent side effects. Alert on *final* failure, log on retry (alerting every retry trains on-call to ignore you — see `data-engineer/principles/observability-and-lineage.md` §4).
- **Timeouts on everything.** A task that hangs forever holds its slot, blocks the DAG, and breaches the SLA silently. Execution timeout ≈ P99 duration × 2, plus an SLA-level alert independent of task state (§ freshness monitoring) so "running but stuck" is caught even when the timeout is misconfigured.

## 2. DAG shape

- **One DAG = one cohesive dataset/domain with one schedule and one owner.** The 400-task company-wide mega-DAG fails as a unit, backfills as a unit, and pages one team for everyone's bugs. Split by domain; connect across DAGs with the dependency mechanisms in §5.
- **Dependencies express data readiness, not just execution order.** "Task A finished" is a weaker statement than "the data A produces exists and passed checks for window W." Where the orchestrator supports data-aware scheduling (Airflow Datasets/assets, Dagster's asset graph), prefer it — it makes the DAG say what's true, not just what ran. Where it doesn't, insert explicit validation gates: a check task between load and transform, so downstream never builds on an unvalidated layer (`data-engineer/principles/data-quality.md` §1).
- **No cycles, obviously — but also no hidden cycles**: task code that reads a table its own DAG writes later (self-reference through the warehouse) works until the schedule shifts, then deadlocks or reads stale. If a model needs its own prior state (incremental models), make that explicit as reads-previous-window semantics, and confirm the backfill story (rebuilding window N requires N−1: serialized backfills — dbt incremental + `--full-refresh` interactions, `data-engineer/stacks/dbt.md` §4).
- **Branching/skip logic is a correctness trap:** skipped tasks propagate skip-state in surprising ways (Airflow trigger rules); an "if no new data, skip load" branch that also skips the *freshness check* converts an upstream outage into silence. Checks never sit downstream of a skippable branch.

## 3. Catchup and scheduling semantics

Every orchestrator has a policy for "the schedule says these windows should have run and didn't." Decide it explicitly per DAG:

- **Catchup ON** (run every missed window) for windowed-idempotent pipelines feeding history-sensitive tables — correct, but see §4 for the storm risk.
- **Catchup OFF + lookback reprocessing** (each run rebuilds trailing N windows) for pipelines where only recent state matters — simpler, self-healing for small gaps, cost scales with N.
- The disaster is the *mismatch*: catchup ON with non-idempotent tasks (each missed window loads twice against overlapping wall-clock reads), or catchup OFF with a table that needs every window (permanent silent gap after any outage). The second is nastier — nothing fails; a week of data is just missing until an analyst notices.

| | |
|---|---|
| **Failure mode** | Outage ends; catchup floods 300 queued runs (see §4) or silently skips a gap forever |
| **Detection** | Volume monitors per window (`data-engineer/principles/data-quality.md` §2 lens 1) catch gaps; warehouse queue/cost alerts catch floods |
| **Fix** | Gaps: targeted backfill of missing windows. Floods: pause DAG, cap concurrency, let it drain |
| **Prevention** | Catchup policy + concurrency cap reviewed together as a pair in every new DAG's PR; a DAG-level comment stating the policy and why |

## 4. Backfill orchestration without resource storms

The correctness half of backfills lives in `data-engineer/principles/pipeline-correctness.md` §3 (idempotency, cost estimate, anachronisms, downstream plan). The orchestration half:

- **Concurrency is capped at the shared-resource level, not per-DAG.** Airflow pools / Prefect concurrency limits scoped to "the warehouse" or "the vendor API" — a per-DAG cap of 4 doesn't help when six teams backfill simultaneously into the same warehouse. Shared resources get named, pooled, and sized once, platform-wide.
- **Backfills run as the same DAG/task code as scheduled runs** — parameterized by window — never as a copy-pasted "backfill script." The copy diverges from the real pipeline within a month, and then your backfilled history was computed by different logic than your live data (an anachronism you *created*). If the orchestrator's backfill UX pushes you toward separate scripts, resist.
- **Priority: production first.** Backfill tasks get lower priority weight / a separate pool so today's SLA-bearing runs preempt history repair. Nobody thanks you for yesterday's data arriving while today's is late.
- **Depth-first vs breadth-first, deliberately:** for multi-layer backfills, complete each window through *all* layers (depth-first) when consumers need any-complete-window early; complete each layer across all windows (breadth-first) when warm-cache/batch efficiency dominates and nothing reads until the end. Breadth-first + an eager consumer = consumers reading half-built windows; if consumers can see intermediate state, depth-first with per-window validation gates.
- **Watch the seams:** where the backfill range meets live scheduled runs, the same window can be processed by both. Idempotent overwrite makes this converge; if there's any doubt, exclude the live edge (backfill through T−2, let the schedule own the rest).

## 5. Dependency management across teams' pipelines

Cross-team dependencies are where orchestration meets politics, and where most platform-wide 9am-data-is-late incidents originate.

- **Depend on data, not on schedules.** "Their DAG finishes by 6am so we start at 6:30" is a dependency on a *coincidence*; it breaks the first time their runtime grows past the gap, and it breaks *silently* — you compute on yesterday's upstream. Mechanisms, best-first: data-aware triggers (Airflow Datasets / asset sensors — producer's completion *publishes*, consumer subscribes); sensors/pollers on a readiness signal (partition exists + `_SUCCESS` marker or an audit row stating window W passed checks); worst-but-honest, a schedule gap with a *freshness check on the upstream table as the first task* so staleness fails loudly instead of propagating.
- **Readiness = data present AND validated.** Triggering on "table updated" starts consumers on unvalidated loads; the signal to publish is emitted *after* the producer's DQ gate. (One shared pattern: producer writes a row to an `audit.window_ready` table; consumers sense that. It's crude, portable across orchestrators, and outlives all of them — and it degrades gracefully when half the company migrates orchestrators and the other half hasn't.)
- **The producer's SLA is the consumer's dependency contract:** publish freshness SLAs per shared table (`data-engineer/principles/observability-and-lineage.md` §2), and alert the *producer* when they miss it — the consumer's alert fires too, but the pager that matters is the one attached to the team that can fix it.
- **Sensor hygiene:** every sensor has a timeout + an escalation ("upstream not ready by 8am → page producer team, notify consumers") rather than polling forever into a missed morning. Reschedule/deferrable modes over worker-occupying poll loops (`data-engineer/stacks/airflow.md` §4) — a hundred sensors busy-holding worker slots is a self-inflicted capacity outage.

| | |
|---|---|
| **Failure mode** | Consumer runs on stale/absent upstream (schedule-gap coincidence broke); or upstream's delay cascades unannounced into ten teams' mornings |
| **Detection** | First-task freshness checks; cross-DAG lineage view of the morning's critical path; consumers' volume tests catching "yesterday's data twice" |
| **Fix** | Re-run consumers after upstream lands (in dependency order); switch the coincidence-dependency to a data-aware trigger this sprint, not someday |
| **Prevention** | Platform rule: no cross-team dependency without a readiness signal or first-task freshness gate; producer-owned SLA alerts on shared tables |

## 6. The orchestrator is not the transformation engine

Workers orchestrate; warehouses and clusters compute. Pandas-in-a-worker-task pipelines fall over at 10× data size, and orchestrator workers are the most expensive, least observable place to burn CPU. Push compute to Snowflake/Spark/warehouse (`data-engineer/principles/cost-and-performance.md`); the task submits, monitors, validates. Exception: genuinely small glue (an API pull of thousands of rows) — but write the size assumption down, because "small" is a point-in-time claim and nobody re-checks it until a worker OOMs.

---

**See also:** `data-engineer/stacks/airflow.md` (all of this made concrete) · `data-engineer/principles/pipeline-correctness.md` (the idempotency the orchestrator assumes) · `data-engineer/principles/multi-agent-orchestration.md` §4 (agents triggering backfills — the same storm risks, faster) · `pipeline-idempotency-auditor` skill (reviews DAG diffs against §1–4).
