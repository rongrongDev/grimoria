# Masking & Anonymization

> Last reviewed: 2026-07-09. Applies to: PostgreSQL Anonymizer 2.x, Greenmask 0.2.x, ARX 3.9, commercial platforms (Delphix, Tonic.ai) at feature level; legal references GDPR / HIPAA Safe Harbor & Expert Determination / PCI DSS 4.0.1.
> Standalone doc. Related: `compliance-and-governance.md` (whether you may use prod data at all), `../patterns/production-scale-subsetting.md` (getting the data down to size), `../skills/masking-coverage-reviewer/SKILL.md` and `../agents/pii-field-scanner.md` (the callable reviews).

## The stance

Masking has one honest definition of done: **an informed attacker with the masked dataset and public auxiliary data cannot identify an individual.** Everything short of that is pseudonymization — often the right engineering choice, but it keeps you inside GDPR scope and it keeps the data dangerous. The industry's chronic failure is claiming the first while doing the second. Say which one you're doing, in writing, and design controls for the one you're actually doing.

The second stance: **masking is a pipeline, not a script.** It needs an owner, versioned config, coverage reporting, and a change process wired to schema changes — because the schema *will* change, and failure mode #1 below is what happens next.

## The war story that governs everything here

A healthcare-adjacent client "anonymized" a claims dataset for a vendor demo: names, SSNs, member IDs, all properly masked. Field-level coverage: 100%. During the demo, an analyst joined it against a public voter roll on ZIP + birth date + gender and put a named individual's claim history on screen. This is Sweeney's classic result — those three fields alone identify ~87% of the US population — landing on people who had a coverage checklist and had passed it. Nobody had asked the only question that matters: *what combinations survive?* It was a near-miss (demo audience, NDA) that would have been a reportable breach with one different attendee.

## Technique selection

| Technique | Preserves | Destroys | Reach for it when |
|---|---|---|---|
| **Redaction/nulling** | nothing | everything | Field is sensitive and no test needs it. The default — most fields need *nothing* preserved. |
| **Static substitution** (fake values, random per row) | format | joins, distributions, uniqueness | Display-ish fields tests read but never join or aggregate on. |
| **Deterministic substitution** (keyed HMAC → fake value) | format, joins, cross-table & cross-refresh consistency | nothing tests need — which is why it's the workhorse | FK-ish fields (emails, external IDs) referenced from multiple tables. **Key discipline below.** |
| **Format-preserving encryption** | format + validity (Luhn-valid PANs, checksummed IDs) | — | Downstream systems validate format. PCI note: FPE output is still cardholder-data-scope unless keys are properly segregated. |
| **Shuffling** (permute a column within itself) | exact marginal distribution | row-level truth, cross-column correlation | Perf/analytics realism on a single column. Dangerous on quasi-identifiers — the values still exist. |
| **Generalization/bucketing** (age→range, ZIP→ZIP3, timestamp→week) | statistical shape | precision | The *only* real treatment for quasi-identifiers. This is where k-anonymity is won or lost. |
| **Noise addition** | approximate aggregates | exactness | Numeric analytics data. Naive noise averages out under repeated queries; if you're near differential privacy territory, use a real DP tool (e.g., OpenDP-class), not hand-rolled jitter. |
| **Synthetic replacement** (model-generated table) | learned distributions | provenance link (mostly — models can memorize outliers) | Highest-sensitivity data where subsetting can't be made safe. Verify rare records didn't leak through the model verbatim. |

**Deterministic masking cuts both ways.** It's what keeps referential integrity alive across tables and refreshes — and it's a linkage oracle: same person ⇒ same token everywhere, which is precisely the join an attacker needs, and if the HMAC key leaks, every token in every dataset ever produced with it becomes reversible dictionary-style. Rules: keys live in the secret manager (never in the masking config repo), rotate on schedule *and* on any suspicion — accepting that rotation breaks cross-refresh consistency, which is a feature: it bounds the blast radius of any one key.

## Failure modes

### 1. Incomplete PII coverage — the field nobody flagged

**Failure mode.** The masking config was written against the schema as of two years ago. Since then: new columns, new tables, and — the three chronic escapes — **free-text fields** (support notes containing "call John back at 555-0123"), **JSON/JSONB blobs** (a `metadata` column that grew a `customer_email` key), and **operational side-channels** (audit/history tables, soft-deleted rows, log-shipped tables) that duplicate masked tables in unmasked form.

**Detection.** Never by reading the config — the config is precisely the list of what someone *already thought of*. Scan the schema and *sampled live data*: name-pattern heuristics on columns, value-pattern detection on content (email/phone/PAN/national-ID regexes, NER over free text), JSON key extraction. This is the `pii-field-scanner` subagent's job, and it must diff its findings against the masking config, not against a human's memory.

**Fix.** Mask the found fields; for free text, prefer nulling or synthetic replacement over surgical redaction (you will not win regex whack-a-mole against human-written notes).

**Prevention.** Two gates. (1) **Schema-change tripwire:** CI on migration PRs extracts new/renamed columns and fails until each is classified (`sensitive: <technique>` or `clear: <reason>`) in the masking config — the config becomes exhaustive-by-construction. (2) Scheduled scanner run against prod samples (quarterly at minimum), because classification errors and JSON drift escape gate 1.

### 2. Re-identification through joins and quasi-identifiers

**Failure mode.** Every sensitive field individually masked; the *combination* still identifies (the war story above). Variants: quasi-identifier triples; rare-value pinpointing (the one 94-year-old in a rural ZIP, the single employee with title "CFO"); join escalation (each table safe alone, the join re-identifying); longitudinal linkage (deterministic tokens letting an attacker accumulate one person's history across datasets until the *behavioral pattern* identifies them).

**Detection.** Adversarial, not clerical: enumerate quasi-identifier sets (age/DOB, ZIP/region, gender, job title, dates of events, rare categorical values), then **measure k**: `SELECT <quasi-ids>, count(*) ... GROUP BY <quasi-ids> HAVING count(*) < 5`. Rows in that result are your re-identification exposure, quantified. ARX automates this properly (k-anonymity, l-diversity, risk models) for release-grade datasets. Then attempt the join attack yourself against whatever internal and public datasets an attacker could plausibly hold.

**Fix.** Generalize the quasi-identifiers (bucket ages, truncate ZIPs, week-align dates), suppress the outlier rows entirely (k<threshold rows get dropped — losing 0.1% of rows is cheap), and break unnecessary linkability (deterministic tokens only where a test actually joins).

**Prevention.** The masking pipeline's definition of done includes a *measured* k report, not a coverage checklist. `../skills/masking-coverage-reviewer/SKILL.md` enforces this: its output contract has a mandatory re-identification section that cannot be satisfied by a column list. Target: k ≥ 5 within the test-data trust boundary; release-grade (leaving the boundary) needs the full ARX treatment plus `compliance-and-governance.md` sign-off.

### 3. Masking that destroys the realism tests depend on

**Failure mode.** The opposite direction: masking so aggressive the data stops resembling production, and the tests consuming it silently stop meaning anything. Classic casualties: random substitution breaking FK joins (every query returns zero rows — perf tests become fiction because the planner never touches realistic cardinalities); uniform random values flattening skew (prod has 40% of orders from 1% of customers; masked data is uniform; the hot-partition bug ships); length/charset changes breaking layout and validation tests; date-jitter breaking sequence invariants (`shipped_at` before `created_at` — and every temporal test fails honestly against dishonest data).

**Detection.** Post-mask validation with *statistical* assertions, not row counts: FK-orphan checks (same generated checks as `seeding-and-synthetic-data.md` failure mode #4), top-N frequency and cardinality comparison per key column pre/post mask, business-invariant checks (temporal orderings, sums). Perf-relevant: compare query plans for the suite's top queries against prod plans — plan flips reveal distribution damage cheaply.

**Fix.** Swap techniques per the table above: deterministic substitution where joins matter, shuffling or rank-preserving substitution where distributions matter, coherent date *shifting per entity* (one random offset per customer applied to all their timestamps — preserves intervals and orderings, breaks calendar linkage) instead of per-field jitter.

**Prevention.** Every masked field's config entry declares what must survive (`preserves: [joins, distribution, ordering] | nothing`), and the post-mask validation asserts it. Undeclared is `nothing` — which makes destruction the *deliberate default* and preservation the audited exception. This also documents, forever, why each field got its technique.

### 4. Weak or reversible masking algorithms

**Failure mode.** Masking that looks opaque and isn't: unsalted/unkeyed hashes of low-entropy inputs (every email/phone/SSN hash is a rainbow-table lookup — an unsalted SHA-256 of a 9-digit SSN is enumerable on a laptop in minutes); home-rolled "encryption" (XOR, character rotation); sequential replacement preserving order (`user_0001`… preserving the original sort order, which is itself a quasi-identifier if the original order was signup date); truncation that keeps the identifying part.

**Detection.** Read the transforms in the config with one question per field: *given the output and knowledge of the algorithm, can I recover or meaningfully narrow the input?* Assume the attacker has the algorithm (they do — it's in your repo) and, for hashes, the full plausible input space.

**Fix.** Keyed constructions only (HMAC-SHA-256 with a managed key) where determinism is needed; random substitution where it isn't; real FPE (AES-FF1) where format must survive. Kill anything hand-rolled.

**Prevention.** A short allowlist of approved transforms in the pipeline; the masking tool config is reviewed like crypto code because it *is* crypto code. New transform ⇒ security review, not a PR rubber-stamp.

### 5. Masking performance at production scale

**Failure mode.** The pipeline that worked on the 10 GB pilot takes 30+ hours on the 4 TB production copy. Refresh cadence quietly degrades from weekly to "when it finishes," and stale data (see `data-refresh-and-versioning.md`) becomes the norm — a *correctness* failure caused by a throughput problem. Usual culprits: row-at-a-time UPDATEs, per-row round trips to an external tokenization service, re-masking the full corpus when 2% of rows changed, and NER/regex passes over every free-text field of every row.

**Detection.** Trend the pipeline's runtime per refresh (if you don't chart it, the degradation is invisible until it collides with the refresh schedule); profile which transforms dominate.

**Fix, in order of leverage:** (1) **Subset before masking** — masking 2% of prod is a 50× win and you needed the subset anyway (`../patterns/production-scale-subsetting.md`). (2) Mask in the dump/restore stream (Greenmask-style, transforms applied as data flows) instead of load-then-UPDATE. (3) Incremental masking keyed on watermarks/CDC for the steady state. (4) Batch or cache external tokenization calls. (5) Restrict expensive text analysis to fields the scanner actually flagged.

**Prevention.** Pipeline SLO ("full refresh completes in < N hours") with runtime alerting, set when the pipeline is built — because the dataset only grows.

## The decision tree: is this dataset safe to hand over?

```
Request: give environment/team X a copy of dataset D
├─ Does D derive from production? ── NO → seeding rules apply, not this doc. Done.
├─ Lawful basis + retention + access scope on file? ── NO → compliance-and-governance.md. STOP.
├─ Coverage: scanner run newer than last schema change, zero unclassified fields?
│      ── NO → run pii-field-scanner; classify; re-mask.
├─ Combination risk: measured k ≥ threshold on enumerated quasi-identifiers?
│      ── NO → generalize/suppress; re-measure.
├─ Utility: post-mask validation green (FKs, distributions, invariants declared as preserved)?
│      ── NO → data is safe but useless; fix technique selection (failure mode #3).
└─ All green → release, with lineage recorded: source snapshot ID, masking config
   version, scanner report, k report. That record is what you produce when — not if —
   someone asks "does any test copy contain this person?"
```

## Cross-references

- Whether production data may be used at all, retention, DSAR mechanics: `compliance-and-governance.md`
- Subsetting before masking: `../patterns/production-scale-subsetting.md`
- The callable review: `../skills/masking-coverage-reviewer/SKILL.md`; the schema-wide sweep: `../agents/pii-field-scanner.md`
- Fan-out masking audits across many services, and why an agent must never assume "masked ⇒ safe": `../orchestration/README.md`
