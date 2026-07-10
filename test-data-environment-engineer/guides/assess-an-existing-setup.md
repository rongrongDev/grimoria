# Guide: Assess an Existing Test Data & Environment Setup

> Last reviewed: 2026-07-09. A bounded-time playbook for walking into an unfamiliar setup and producing a defensible risk picture. Designed for a human engineer or an AI agent given repo + environment access.
>
> **Time budget: ~2 days focused work (or one agent session per step, fanned out — see `../orchestration/README.md`).** The budget is a feature: an unbounded assessment becomes a re-architecture proposal nobody asked for. You are producing a *prioritized risk report*, not fixing anything yet.
>
> **Deliverables (the four artifacts, templates at bottom):** ① masking-coverage & re-identification assessment, ② environment-parity gap analysis, ③ data-lifecycle & cleanup risk list, ④ prioritized remediation plan.

## Ground rules

- **Evidence over testimony.** What people tell you the setup does is the setup's *intent*; you are assessing its *behavior*. Every finding cites a query result, a config line, a log — never "the team said."
- **Read-only.** You will be tempted to fix the swallowed exception you find in step 4. Don't — you don't yet know what's load-bearing. (Agents: this is a hard constraint; see the tool allowlists on `../agents/`.)
- **Sensitive data discipline.** The assessment itself touches potentially-unmasked data. Sample minimally, never copy samples into reports — report *patterns* ("column `notes` contains phone numbers, 3 of 50 sampled rows"), not values.

## Step 1 — Inventory (2h): what exists?

Build the map everything else hangs on: every test environment (CI-ephemeral, shared staging-class, perf, UAT, demo), and for each: provenance of its data (synthetic / prod-derived / unknown — *unknown is a finding*), who can access it, who consumes it (check connection sources, not the wiki — `pg_stat_activity`, gateway logs), owner, age, rebuild story ("if this vanished, how long to rebuild, from what?" — the snowflake detector from `../principles/environment-provisioning.md`).

Also inventory the *copies*: DB snapshots, object-store dumps, CI artifact caches. Snapshot sprawl is where step-2 and step-6 findings hide. If manifests exist (`../principles/data-refresh-and-versioning.md`), this step is queries; if not, that absence is itself a top-tier finding.

## Step 2 — Masking coverage & re-identification (half day) → deliverable ①

Only for environments holding prod-derived data (per step 1; if none — record that happy fact and move on).

1. Locate the masking config/pipeline. No pipeline + prod data present = **stop-the-assessment finding**; report immediately, don't wait for the final report.
2. Dispatch `../agents/pii-field-scanner.md` (or execute its procedure manually): schema + sampled-content sweep, diffed against the config. Chronic escapes to check by hand even if the scan is clean: free-text columns, JSON blobs, audit/history tables, soft-deleted rows.
3. Run the combination analysis per `../principles/masking-and-anonymization.md` failure mode #2: enumerate quasi-identifiers, measure k, attempt the obvious join attack. A column-coverage checkmark without a k-number is *not* a completed step 2.
4. Check the algorithms (failure mode #4): unsalted hashes of low-entropy fields, home-rolled transforms, order-preserving substitution.

`../skills/masking-coverage-reviewer/SKILL.md` packages this step; its output contract is deliverable ①'s format.

## Step 3 — Environment parity (half day) → deliverable ②

For each environment class that gates releases (don't audit the demo env): run the five-layer diff from `../principles/environment-provisioning.md` — versions, config (the `SHOW ALL`-diff with an expected-differences allowlist; config drift outnumbers version drift), topology (replica counts!), dependencies (real/sandbox/stub — and for stubs, when last verified against reality: `../patterns/service-virtualization.md` pitfall #1), data shape (volume ratios, enum coverage vs. prod — this doubles as the staleness check from `../principles/data-refresh-and-versioning.md`).

`../skills/environment-parity-auditor/SKILL.md` packages this step. If no parity *declaration* exists (nobody ever wrote down what's supposed to match), record that as the root finding — undeclared parity is unmeasured parity.

## Step 4 — Lifecycle & cleanup risks (half day) → deliverable ③

The forensic sweep, in evidence order:

1. **Growth curves:** DB size and per-table row counts over time on anything long-lived (monotonic growth on a test DB = leakage — the 400 GB story in `../principles/cleanup-and-isolation.md` was found exactly this way).
2. **The greps:** swallowed exceptions around teardown/deletes; unseeded RNG and `now()` in seed code (`../principles/seeding-and-synthetic-data.md`); TTL/owner tags on cloud resources (absence = orphan machinery missing).
3. **Reconciliation sample:** list actual resources vs. any record of expected — count the unexplained.
4. **Refresh vs. runtime collision:** overlay refresh schedules on suite schedules and on flake timestamps (the 02:00-wall query from `../principles/data-refresh-and-versioning.md` failure mode #3 — minutes to run, months of mystery flakes explained when it hits).
5. **Shared-state exposure:** from step 1's consumer map — any environment with >1 consumer and no registry/credentials/leases is carrying `../principles/environment-lifecycle-and-contention.md` failure mode #1 as latent risk, whether or not it has fired yet. If there's a live flaky-suite complaint, `../agents/state-leak-tracer.md` turns it into evidence.

## Step 5 — Determinism & seed health (2h)

The double-build test: build two environments from the same commit, diff the data. Then: seed-vs-migration coupling (same repo? gated?), fixture time-rot (absolute dates), validation epilogue existence. Cheap checks, high-frequency findings.

## Step 6 — Compliance posture (2h)

Against `../principles/compliance-and-governance.md`: documented basis for any prod-derived flow (or the unexamined nightly copy?); retention — ages of step 1's snapshot inventory vs. any stated policy; access — who *can* read prod-derived environments vs. the audience any masking sign-off assumed; DSAR readiness — "could they scope person X across test copies?" (manifest query, or archaeology?).

## Step 7 — The report → deliverable ④

Findings ranked by **severity of what's true now**, not effort to fix:

- **P0 — active legal/data exposure:** unmasked prod data, k=1 populations, prohibited PANs, unbounded-access prod-derived environments. Named-owner escalation *on discovery*, not report day.
- **P1 — false confidence generators:** parity gaps on release-gating environments, stale data with green suites, stubs unverified for months, non-deterministic seeds. These are shipping bugs *today*, invisibly.
- **P2 — running costs & latent risk:** leakage growth, orphan populations, snapshot sprawl, contention-without-registry, snowflake rebuild risk.
- **P3 — hygiene:** everything else.

Each finding: evidence (query/file/number) → risk in one honest sentence → remediation pointer into this KB (the fix procedures live in the principles docs and `build-a-platform-from-scratch.md` phases; do not re-derive them in the report). Sequence the plan: P0 immediately; P1 ordered by which release-gating suite lies most; P2 as scheduled work with owners; P3 as the standing-operations table from the build guide.

### Report skeleton

```markdown
# Test data & environment assessment — <system> — <date>
Assessor: · Time spent: · Access level: · Steps abbreviated (if any):

## Environment & data inventory        [step 1 table]
## ① Masking & re-identification       [config version · scanner diff · measured k · algorithm findings]
## ② Parity gaps                       [per env class × five layers · declared-vs-measured]
## ③ Lifecycle & cleanup risks         [growth curves · greps · reconciliation count · collision overlay · contention map]
## Determinism & compliance notes      [steps 5–6]
## ④ Remediation plan                  [P0/P1/P2/P3 · evidence · owner · KB pointer each]
```

## When the budget doesn't fit

Cut scope, not depth: assess the release-gating environment fully rather than everything shallowly. Steps 2 and 6 are never the ones cut — a fast wrong answer about data exposure is worse than no answer. Fan-out across agents parallelizes steps 2–5 cleanly (one environment or service per agent) — coordination rules in `../orchestration/README.md`.
