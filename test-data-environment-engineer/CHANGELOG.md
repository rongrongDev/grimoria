# Changelog — test-data-environment-engineer KB

All notable changes to this knowledge base. Dates are ISO-8601. Each entry records the tool/platform versions content was validated against, so future readers can judge staleness.

## 2026-07-09 — Initial release (v1.0)

Full KB authored as the retiring-principal knowledge capture. Contents:

- **Root:** `README.md`, `DESIGN.md`, `GLOSSARY.md`, `CHANGELOG.md`
- **Principles (core tier, full depth):** `core-principles.md`, `seeding-and-synthetic-data.md`, `masking-and-anonymization.md`, `environment-provisioning.md`, `environment-lifecycle-and-contention.md`, `data-refresh-and-versioning.md`, `cleanup-and-isolation.md`, `compliance-and-governance.md`
- **Patterns (extended tier):** `service-virtualization.md`, `environment-scheduling.md`, `test-data-platforms.md`, `production-scale-subsetting.md`
- **Guides:** `build-a-platform-from-scratch.md`, `assess-an-existing-setup.md`
- **Skills:** `masking-coverage-reviewer`, `environment-parity-auditor`, `seed-dataset-designer`
- **Subagents:** `pii-field-scanner`, `state-leak-tracer`
- **Orchestration:** `orchestration/README.md`

Validated against (as of this date): PostgreSQL 16/17, MySQL 8.4, PostgreSQL Anonymizer 2.x, Greenmask 0.2.x, Faker (Python) 33.x / @faker-js/faker 9.x, Testcontainers (Java 1.20, Python 4.x, Node 10.x), Docker Compose v2.29+, Kubernetes 1.31+, vcluster 0.20+, Terraform 1.9 / OpenTofu 1.8, Flyway 10.x, Liquibase 4.29, dbt-core 1.8, WireMock 3.x, Mountebank 2.9 (maintenance mode), Pact specification V4, LocalStack 3.x, Jailer 16.x, ARX 3.9. Regulatory references: GDPR (as amended through 2025), HIPAA Privacy/Security Rules, PCI DSS 4.0.1.

### Revision protocol for future editors

1. When updating a doc, refresh its `Last reviewed:` stamp and re-verify the tool versions it names.
2. Add an entry here: date, files touched, what changed and *why* (a rule that changed deserves the incident or evidence that changed it).
3. If a rule is removed, record the removal and the reasoning — future readers must be able to distinguish "we learned better" from "we forgot."
4. Keep `GLOSSARY.md` and `README.md` navigation in sync with structural changes.
