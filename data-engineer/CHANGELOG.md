# Changelog — `data-engineer/` knowledge base

Tracks content changes against the dated tool versions each doc was verified against. When a tool ships a change that invalidates guidance, the fix lands here with the version that caused it.

## 2026-07-06 — Initial release (v1.0)

Full KB authored. Tool versions verified against:

| Tool | Version(s) covered | Notes |
|---|---|---|
| Apache Airflow | 2.7–2.10, 3.x (3.0 GA 2025-04) | 2.x deltas flagged inline; `execution_date` removal, Assets, task-isolation covered |
| dbt Core | 1.8–1.10 | microbatch (1.9+), unit tests (1.8+), contracts/versions (≥1.5) |
| Apache Spark | 3.5.x, 4.0 (GA 2025-05) | AQE-default behavior assumed (≥3.2) |
| Snowflake | continuous (verified mid-2026) | Snowpipe Streaming, Dynamic Tables, tag-based masking covered |
| Apache Kafka | 3.6–4.x (4.0 GA 2025-03, KRaft-only) | KIP-848 rebalance protocol noted; Confluent Schema Registry 7.x |
| Prefect | 3.x (GA 2024-09) | extended tier |
| Temporal | server 1.2x, SDKs 1.x | extended tier |
| Amazon Redshift | RA3 + Serverless (mid-2026) | extended tier |
| Apache Flink | 1.20 LTS, 2.x (2.0 GA 2025-03) | extended tier; ksqlDB treated as legacy for new builds |
| Iceberg / Delta / Hudi | Iceberg 1.5+ (spec v2), Delta 3.x/4.x, Hudi 0.15/1.x | extended tier |
| Great Expectations (GX Core) | 1.x | referenced in data-quality + dq-test-planner |

**Added:**
- `README.md`, `GLOSSARY.md`, `DESIGN-NOTES.md`, this file
- `principles/` — core-principles, pipeline-correctness, schema-evolution, data-modeling, data-quality, orchestration, observability-and-lineage, cost-and-performance, security-and-governance, multi-agent-orchestration
- `stacks/` — core tier: airflow, dbt, spark, snowflake, kafka; extended tier: prefect-and-temporal, redshift, flink-and-streaming-sql, lake-table-formats
- `guides/` — build-a-pipeline-from-scratch, analyze-existing-platform
- Skills (`.claude/skills/`): `schema-change-impact-reviewer`, `pipeline-idempotency-auditor`, `dq-test-planner`
- Subagents (`.claude/agents/`): `lineage-blast-radius-scanner`, `data-quality-incident-tracer`

**Revision policy:** each doc carries `Applies to:` versions + `Last verified:` date in its header. Re-verify a doc when: a covered tool ships a major version; a doc's guidance fails in practice (file the incident here with the correction); or the date stamp exceeds ~12 months for core-tier stacks (warehouse features and orchestrator APIs move fast — treat older stamps as "verify before relying on syntax-level claims"; the judgment-level content decays much slower than the syntax).
