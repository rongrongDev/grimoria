# Security & Governance — PII handling, column-level access control, retention & deletion compliance

**Applies to:** warehouse-agnostic patterns; syntax examples: Snowflake (dynamic data masking, row access policies, tags), GDPR/CCPA-class obligations as of 2026 · **Last verified:** 2026-07-06 · *Not legal advice — patterns here implement what your counsel decides.*

Data platforms concentrate exactly the data attackers and regulators care about, and pipelines *copy* it — every landing zone, staging model, dev clone, and debug extract is another place PII lives. Governance in a pipeline world is controlling the copies, not just the source.

---

## 1. PII handling — the pipeline-shaped rules

- **Classify at ingestion, not retroactively.** Every new source/table declares its sensitivity (none / internal / PII / regulated-special-category) *in the PR that adds it*, as machine-readable tags (Snowflake object tags, BQ policy tags, dbt `meta`). Retroactive classification projects scan millions of columns, cost a quarter, and are stale on arrival. The classification is what every downstream control (§2, §3) keys off.
- **Minimize at the boundary.** The highest-leverage act: don't ingest what you don't need. Every PII column that never enters the platform is a column you never mask, audit, or delete. Pull-based ingestion selecting explicit columns beats "replicate the whole source DB" defaults (which is how the `users.password_hash` column ends up in a warehouse — I have found it there, twice, at different companies).
- **Pseudonymize early:** hash/tokenize direct identifiers in the landing→staging hop where analytics doesn't need the raw value (it usually needs *joinability*, not the email itself). Keyed hashing (HMAC with a managed secret), not bare SHA — bare-hashed emails are reversible by dictionary and regulators treat them accordingly. Keep the token↔identity map in one locked, audited vault table; that map is now your crown jewel and your deletion lever (§3).
- **PII in the shadows** is where audits fail: query result caches, task logs (`print(row)` in an extraction script — log *counts and keys*, never payloads), error messages carrying sample rows into your incident tool, dev/staging clones of prod, ML feature stores, BI extracts to spreadsheets. The platform rule: dev environments get masked or synthetic data by default, and log scrubbing is part of pipeline scaffolding, not a per-team virtue.

| | |
|---|---|
| **Failure mode** | PII sprawls into logs/dev/exports; a breach or audit finds copies nobody governed |
| **Detection** | Periodic PII scanners over column names + content sampling (they find what tagging missed); access-history queries for bulk reads of tagged columns to unusual destinations |
| **Fix** | Contain (revoke, rotate, purge the copy), then trace how it got there and close the path — the copy is a symptom of an ungoverned flow |
| **Prevention** | Classification-at-ingestion as a merge gate; masked dev data; log-scrubbing scaffold; egress allowlist (which tools may export at all) |

## 2. Access control on sensitive columns

Table-level grants fail exactly where it matters: analysts *need* the orders table, and it has the shipping address on it. The workable model:

- **Roles by function, grants to roles, humans in roles** (RBAC). Direct user grants are unauditable drift; I've never audited a warehouse with per-user grants and found them all justified. Access is requested, ticketed, and *expires* — standing broad access accretes monotonically otherwise.
- **Column-level: dynamic masking over duplicate tables.** Masking policies (Snowflake `MASKING POLICY`, BQ policy tags + data masking) show full value to privileged roles, masked/hashed/null to everyone else — one table, one lineage, no synchronization problem. The legacy alternative (parallel `orders_pii` / `orders_clean` tables) doubles storage and *will* drift. Attach policies to the classification **tags** (§1), not column-by-column, so a new PII column inherits masking on arrival instead of after the next audit. Test masking like code: a CI check that a non-privileged role SELECTing tagged columns gets masked values — policies get dropped in migrations and nobody notices, because everything still *works*.
- **Row-level** (row access policies) for tenant/region isolation — mandatory where data residency or customer contracts demand it; otherwise prefer schema-per-tenant marts for their auditability.
- **Pipelines are principals too:** service accounts scoped per pipeline with least privilege (read sources, write own outputs — not `ACCOUNTADMIN` because setup was annoying). The pipeline account that can read everything is the single credential whose leak is a total breach; it's also how an agent-run pipeline (see `data-engineer/principles/multi-agent-orchestration.md` §5) must be constrained.
- **Audit access, not just grants:** grants say who *could*; access history says who *did*. The quarterly review that matters: privileged-role reads of sensitive columns, sampled and justified.

## 3. Retention and deletion compliance

Deletion requests (GDPR erasure, CCPA) are where pipeline architecture meets law, and where naive architectures fail structurally: you cannot delete what you cannot find, and pipelines have spent years making copies.

**The patterns that make deletion tractable:**

1. **Deletion by key, planned at design time.** Every table containing personal data must be *addressable by subject identifier* — directly, or via the token map (§1). The design question for every new table: "given user_id X, what do I run to erase them here?" If the answer requires a full-table scan of unpartitioned JSON blobs, the design is non-compliant *now*, not at request time.
2. **Crypto-shredding for immutable/archival stores:** where physical deletion is impractical (append-only logs, cold archives, backups), encrypt per subject (or per subject-cohort) and destroy the key to erase. This — not row deletes — is the sane answer for Kafka topics with long retention and for backup archives. Decide it *before* the first deletion request, because retrofitting per-subject encryption onto years of archives is effectively impossible.
3. **Deletion propagates like data:** a deletion-requests table/stream that every downstream store subscribes to, with per-store completion tracked and *verified* (a scheduled probe: does subject X still appear anywhere tagged personal? — sampled, automated). One-shot delete scripts miss the copies (§1's shadows) and the tables created after the script was written.
4. **Retention schedules as pipeline config, not policy documents:** per-classification TTLs (raw PII: 90 days; pseudonymized events: 2 years; aggregates: indefinite) implemented as scheduled partition drops / lifecycle rules, monitored like any other job. A retention policy without a cron job attached is a wish. Bonus: enforced retention shrinks the §1 copy problem and the storage bill simultaneously.
5. **Snapshots/time-travel/backups are in scope:** warehouse time-travel and fail-safe windows, lake-format snapshots (`data-engineer/stacks/lake-table-formats.md` §5 — old snapshots retain "deleted" rows until expired), and backup rotation must be shorter than or crypto-shredded within your deletion SLA. "We deleted it, except it's in every nightly snapshot for 13 months" has actually been said to a regulator, and it did not go well.

| | |
|---|---|
| **Failure mode** | Deletion request arrives; data survives in shadows/snapshots/backups; or retention policy exists on paper while storage grows forever |
| **Detection** | Automated deletion-verification probes; retention-job monitoring; DSAR (subject access request) dry-runs — practice finding one user everywhere *before* a regulator asks |
| **Fix** | Build the deletion-propagation pipeline as remediation priority #1; crypto-shred where physical deletion can't reach |
| **Prevention** | "Deletable by key" as a design-review question for every new personal-data table; retention TTLs as code; snapshot/backup windows sized to the deletion SLA |

## 4. Governance that engineers don't route around

The governance program that works is the one embedded in the paths engineers already walk: classification in the ingestion PR template, masking inherited from tags, access via short-lived role requests, retention as scaffolded config, contracts carrying sensitivity labels (`data-engineer/principles/schema-evolution.md` §5). Governance imposed as a separate review board with a two-week queue produces exactly one outcome — shadow pipelines that bypass it — and shadow pipelines are *ungoverned by construction*. Make the safe path the fast path; that is the entire art.

---

**See also:** `data-engineer/principles/observability-and-lineage.md` §3 (access history — the audit substrate) · `data-engineer/stacks/snowflake.md` §6 (masking/tag syntax) · `data-engineer/stacks/kafka.md` §7 (topic retention + crypto-shredding) · `data-engineer/guides/analyze-existing-platform.md` Phase 4 (auditing an inherited platform against this doc).
