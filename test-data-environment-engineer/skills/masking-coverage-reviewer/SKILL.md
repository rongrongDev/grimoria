---
name: masking-coverage-reviewer
description: Review a data-masking pipeline/config against its schema and (where accessible) sampled data, producing a coverage table, a measured re-identification risk assessment (k-anonymity on quasi-identifiers), and an algorithm-strength review. Use when asked to review masking before prod-derived data enters a test environment, after schema changes touching sensitive tables, as the recurring gate in a refresh pipeline, or as step 2 of an existing-setup assessment. Do NOT use for the initial schema-wide *discovery* of sensitive fields on a large/unfamiliar schema (dispatch the pii-field-scanner subagent — hundreds of tables of scan output would poison this context; this skill *consumes* its report), to design a pipeline from scratch (principles/masking-and-anonymization.md + the build guide phase 2), or to decide whether prod data may be used at all (principles/compliance-and-governance.md — a legal question this review cannot answer).
---

# Masking Coverage Reviewer

You are executing the review protocol from `test-data-environment-engineer/principles/masking-and-anonymization.md`. The stance that governs everything: **field-level coverage is necessary and radically insufficient — a dataset is unsafe until the *combinations* are measured.** A review that produces a column checklist and no k-number is theater; refuse to stop at the checklist.

## Inputs (ask for what's missing before starting)

1. The masking config/pipeline definition (and its version/commit).
2. The schema it claims to cover (DDL, catalog access, or schema dump).
3. If available: read-only access to a masked output sample, and the `pii-field-scanner` report if one was run. Without data access, mark the review **"config-level only — combination risk not measured"** in the verdict; never let a config-only review pass as a full one.
4. The declared trust boundary: who can access the masked output (from the environment's access grants or the compliance sign-off).

## Procedure

**1. Coverage diff.** Build the field universe from the *schema* (never from the config — the config is the list of what someone already thought of). Every column lands in exactly one bucket: `masked (technique)` / `explicitly cleared, with reason` / `UNCLASSIFIED`. Unclassified ≠ cleared: any unclassified field containing person-linked data is a finding; any unclassified field at all means the schema-change tripwire (prevention #1 in the principles doc) is missing or broken — say so.

**2. The chronic escapes, checked by name.** Free-text columns (sample for phones/emails/names if data access allows), JSON/JSONB blobs (extract keys, classify each), audit/history/log tables shadowing masked tables, soft-deleted rows, columns added since the config's last touch (diff config version date vs. migration history).

**3. Combination risk — the mandatory half.** Enumerate quasi-identifiers surviving masking (DOB/age, geography, gender, job title, event dates, rare categoricals). Measure k: `SELECT <qids>, count(*) ... GROUP BY <qids> HAVING count(*) < 5` on the masked output. List every k<5 population with its size. Then reason through the join attack: what internal or public dataset shares these fields? Note deterministic tokens that preserve cross-table/cross-dataset linkability and whether each is justified by a declared join need. If the artifact is a *subset*, verify k was measured on the subset, not inherited from the full corpus (`test-data-environment-engineer/patterns/production-scale-subsetting.md` pattern 5).

**4. Algorithm strength.** Per masked field, the one question: *given output + algorithm + plausible input space, can the input be recovered or narrowed?* Flag: unkeyed/unsalted hashes of low-entropy inputs (SSNs, phones, emails — rainbow-trivial), home-rolled transforms, order/length-preserving substitutions leaking sort position or magnitude, truncations keeping the identifying part, HMAC keys stored beside the config.

**5. Utility spot-check** (only if post-mask validation reports exist or data access allows): FK-orphan count, top-N frequency comparison on join keys, declared `preserves:` assertions green. Destroyed utility is a real finding (failure mode #3) but never trades against safety findings — report both, trade neither.

## Output contract (emit exactly this structure)

```markdown
# Masking coverage review — <dataset/pipeline> — <date>
**Config version:** <sha/version> | **Schema as of:** <migration id/date> | **Review depth:** full / config-level only
**Verdict:** PASS / PASS WITH FINDINGS / FAIL — <one sentence>

## Coverage
| Fields | masked | cleared w/ reason | UNCLASSIFIED |
Unclassified list (each: table.column, sampled content pattern if known, proposed class)
Chronic-escape checks: free-text ▢ JSON ▢ audit/history ▢ soft-delete ▢ post-config columns ▢

## Combination risk (mandatory — never omit)
Quasi-identifier sets considered: …
Measured k: min=…, populations with k<5: [n populations, m rows total] (or: NOT MEASURED — no data access; review is incomplete)
Join-attack reasoning: … | Deterministic-token linkability: justified / unjustified per token

## Algorithm findings
[field → weakness → attack sketch in one line → replacement]

## Utility notes
[orphans / distribution damage / preserves-assertions, or "not assessed"]

## Required before release  (blocking)
## Recommended  (non-blocking)
```

**Verdict rules (not judgment calls):** any unclassified person-linked field, any k=1 population, any recoverable algorithm on sensitive input, or combination risk not measured on a dataset leaving the trust boundary ⇒ **FAIL**. Findings with compensating controls (k<5 but ≥2 inside a tightly-scoped boundary, utility damage) ⇒ **PASS WITH FINDINGS**, each finding carrying an owner-ready remediation line.

## Self-test (how to verify this skill works)

Run against a fixture schema with planted defects: an unmasked `notes` column containing a phone number, a JSON blob with an `email` key, an unsalted-SHA256 SSN, a zip+dob+gender triple left clear, one k=1 row. A correct execution FAILs with all five, each in its designated section. If any is missed, the execution — not the fixture — is wrong.
