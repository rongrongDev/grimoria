# Glossary — Test Data & Environment Engineering

> Last reviewed: 2026-07-09. Single source of truth for terms used across this KB. Adjacent KBs: `../quality-dev/GLOSSARY.md`, `../test-automation-engineer/GLOSSARY.md`.

**Anonymization** — Irreversibly transforming data so individuals cannot be identified, *including via combination with other data*. Legally meaningful: truly anonymized data falls outside GDPR. Almost everything teams call "anonymization" is actually pseudonymization. See re-identification risk.

**Pseudonymization** — Replacing identifiers with substitutes while a means of re-linking exists (a mapping table, a deterministic key). Still personal data under GDPR; reduces but does not remove obligations.

**Masking** — Umbrella term for transforming sensitive values in a dataset (redaction, substitution, shuffling, hashing, format-preserving encryption). "Masked" is a claim about individual fields; it is *not* a claim that the dataset is safe. See quasi-identifier.

**Deterministic masking** — The same input always maps to the same output (e.g., keyed HMAC of an email). Preserves joins and referential integrity across tables and refreshes — and preserves linkability, which is exactly what a re-identification attack needs.

**Format-preserving encryption (FPE)** — Encryption whose output has the same format as the input (a 16-digit PAN encrypts to a 16-digit number). Lets masked data pass format validation in downstream systems.

**Tokenization** — Replacing a sensitive value with a token, with the real value held in a separate vault. Common in PCI scope reduction.

**Quasi-identifier** — A field that is not identifying alone but is in combination (ZIP code, birth date, gender famously re-identify ~87% of the US population). The reason field-level masking coverage ≠ dataset safety.

**Re-identification risk** — The probability that a "de-identified" record can be linked back to a person, via quasi-identifiers, joins to other datasets, or unique value distributions (the one 94-year-old in a rural ZIP).

**k-anonymity** — A dataset property: every record is indistinguishable from at least k−1 others on its quasi-identifiers. The floor metric for release-grade anonymization; extended by l-diversity and t-closeness.

**PII / PHI / PAN** — Personally identifiable information (GDPR scope); protected health information (HIPAA scope); primary account number (PCI DSS scope). Different regimes, different technical obligations — see `principles/compliance-and-governance.md`.

**Subsetting** — Extracting a referentially-consistent slice of a large dataset (e.g., 50k of 80M customers *plus every row they touch*). The hard part is walking the foreign-key closure without pulling in the whole database.

**Referential integrity** — Every foreign key points at an existing row. Generation, masking, and subsetting can all silently break it; broken RI in test data produces failures that look like product bugs.

**Synthetic data** — Data generated from rules or models rather than derived from production. Compliance-clean by construction; realistic only if someone encodes the realism.

**Seed data** — The minimal, version-controlled dataset an environment or test needs to function (reference tables, canonical accounts, scenario fixtures). Distinct from bulk/volume data.

**Golden dataset** — A curated, versioned, named dataset with documented properties ("100 customers, 3 in arrears, 1 with a disputed chargeback") that tests can rely on by contract.

**Data lineage** — Where a dataset came from and what transformations produced it. For test data: which production snapshot, which masking config version, which subset rules. Without lineage you cannot answer "does any test copy still contain this person?"

**Environment-as-code** — The full definition of an environment (infra, service versions, config, seed data) lives in version control and can be rebuilt from scratch. The opposite of a snowflake environment.

**Snowflake environment** — An environment that exists only because of its history of hand-applied changes; cannot be rebuilt, only preserved. The single biggest source of environment drift.

**Environment drift** — Accumulated divergence between a test environment and production (versions, config, data shape, dependencies). Produces both false passes ("works in test, fails in prod") and false failures.

**Environment parity** — Deliberate, *measured* similarity to production on the axes that matter for the tests being run. Parity is a per-purpose judgment, not "identical to prod."

**Ephemeral environment** — Created on demand (per PR, per test run), destroyed after use. Trades spin-up cost for isolation and zero drift.

**Environment reservation / scheduling** — Access control over shared environments (booking systems, locks, namespaces) to prevent teams colliding on the same substrate.

**State leakage** — Data or state persisting from one test run into another (rows not cleaned up, caches, queues, files), making test outcomes depend on history. The dominant root cause of "flaky" integration tests.

**Test isolation** — The property that a test's outcome depends only on its own setup. Achieved through unique data, namespacing, transactions, or ephemeral environments — see `principles/cleanup-and-isolation.md`.

**Teardown / cleanup ordering** — Deleting test data in reverse dependency order so foreign-key constraints don't reject (and silently abort) cleanup.

**Orphaned resource** — Anything a test or pipeline created and failed to destroy: rows, S3 buckets, namespaces, VMs, DNS entries. Accumulates cost and state leakage.

**Data refresh** — Replacing a test environment's data with a newer copy (masked production, regenerated synthetic). Safe refresh must not run under in-flight tests.

**Schema/seed drift** — Seed data and reference fixtures falling behind schema migrations or production reality, so tests pass against a world that no longer exists.

**TTL (time-to-live)** — An expiry attached to a resource at creation so reapers can destroy it without human judgment. The only cleanup mechanism that survives crashed pipelines.

**Service virtualization / stubbing** — Simulating an external dependency (payment gateway, partner API) so tests can run without it. Cheap until the stub drifts from reality — see `patterns/service-virtualization.md`.

**Contract drift** — A stub or virtual service diverging from the real service it represents, so tests verify conversations the real integration no longer has. Countered by contract testing (see `../quality-dev/principles/contract-and-integration-testing.md`).

**Test data platform / catalog** — Self-service tooling that lets teams request compliant datasets and environments without a human gatekeeper — see `patterns/test-data-platforms.md`.

**DSAR (Data Subject Access Request)** — A GDPR right-to-access/erasure request. Test copies of production data are in scope; every snapshot you keep is a place you must be able to find and erase a person.

**Data retention policy** — How long data (including masked test data) may be kept and when it must be destroyed. Masking does not exempt data from retention rules unless it achieves true anonymization.
