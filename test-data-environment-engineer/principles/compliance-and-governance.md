# Compliance & Governance for Test Data

> Last reviewed: 2026-07-09. Regulatory references: GDPR (as amended through 2025), HIPAA Privacy & Security Rules, PCI DSS 4.0.1. **This doc encodes engineering judgment about compliance, not legal advice — its output is the *defensible position you bring to* counsel and your DPO, never a substitute for them.**
> Standalone doc. Related: `masking-and-anonymization.md` (the technical controls this doc's decisions require), `data-refresh-and-versioning.md` (the manifest/lineage mechanism), `../guides/build-a-platform-from-scratch.md` (where these gates land in a build).

## The stance

**Production-derived data in a test system is a legal event.** Engineering treats "copy prod to staging" as a convenience decision; regulators treat it as a *processing* decision, with all the obligations that word carries. Your job is to make the engineering path and the compliant path the same path — because if compliance is a toll gate beside a free dirt road, engineers take the dirt road, and you find out during an audit or a breach.

The second stance: **"it's only test data" is the most expensive sentence in this field.** Test systems have prod-grade data with dev-grade controls: broader access, weaker monitoring, forgotten copies. Attackers know this; auditors have learned it. Every control below exists because the test estate is the soft target.

## The regime map — what changes by regulation

Judgment summary, not legal text. The pattern to internalize: **all three regimes converge on the same engineering controls** (minimize, mask, scope access, retain briefly, inventory everything); they differ in vocabulary and in which failure hurts most.

| | GDPR (EU personal data) | HIPAA (US health data) | PCI DSS (card data) |
|---|---|---|---|
| Core question | Lawful basis + purpose limitation: prod data was collected for service delivery, not testing — using it for tests needs its own justification | Is the test copy still PHI? | Is the test system in CDS scope? |
| Masking's legal effect | Pseudonymized data is still personal data (all obligations apply, reduced risk). Only true anonymization — combination-resistant, per `masking-and-anonymization.md` — exits scope | **De-identification is a defined term**: Safe Harbor (remove the 18 enumerated identifiers) or Expert Determination. Properly de-identified ⇒ no longer PHI. Safe Harbor is checklist-auditable — use it as the floor for any health-adjacent data | PCI DSS 4.0.1 is blunt: **live PANs are prohibited in test/dev.** No masking debate — synthetic or test-issued card numbers, full stop. A real PAN in staging puts staging (and what touches it) in assessment scope |
| Sharpest edge | DSARs and erasure reach *every copy*, including test snapshots. Data-subject rights don't stop at the staging boundary | Test copies with real PHI need BAAs with every vendor whose systems touch them (your cloud, your SaaS test tools) | Scope contagion: one real PAN makes test infra auditable at prod stringency |
| Typical fine pattern | % of global revenue; enforcement has repeatedly cited unsecured non-production copies | Per-record penalties + corrective action plans | Fines via acquirer + potential loss of card processing |

If multiple regimes apply, engineer to the strictest per field class: PANs are synthetic (PCI), health fields are Safe-Harbor-clean (HIPAA), everything person-linked carries GDPR obligations until proven anonymized.

## Failure modes

### 1. No legal basis — the unexamined prod copy

**Failure mode.** The nightly prod→staging copy predates everyone's tenure; no documented justification, no DPO awareness, often no masking. It isn't a decision anyone made; it's a decision nobody *un*-made. Surfaces during: vendor security review, audit, breach response, or a new hire asking "wait, is this real customer data?"

**Detection.** Inventory question per environment: "what is the provenance of this data?" Any answer of "prod-derived" without a pointer to a documented basis + masking sign-off is this failure mode. The data manifest (`data-refresh-and-versioning.md` failure mode #4) makes the inventory a query; without it, it's an expedition.

**Fix.** Triage by exposure: unmasked prod data in broadly-accessible environments gets remediated *now* (mask or destroy), not scheduled. Then build the documented path: what data classes, what masking, what basis, signed by the DPO/counsel — the record that turns "we think it's fine" into "here is our position."

**Prevention.** Prod-derived data reaches test systems only through the masking pipeline, and the pipeline *writes the paper trail as a side effect* (manifest: source snapshot, config version, validation reports). The compliant path is the automated path; the dirt road is closed by making the highway free.

### 2. Retention — masked data kept forever

**Failure mode.** Refreshes create snapshots; snapshots never die. Fourteen staging dumps spanning three years, each a copy of production-past. Pseudonymized data (which is what most "masked" data legally is — see the regime map) retains retention obligations; even ignoring law, every copy widens the breach surface and is one more place a DSAR must reach.

*The incident:* an erasure request (GDPR Art. 17) was executed against production, correctly, within SLA. A junior engineer then asked the question that stopped the room: "…do the staging snapshots count?" Nobody knew how many snapshots existed. The eventual inventory found fourteen, across two clouds and one engineer's laptop (the laptop is always part of this story), several predating the masking pipeline entirely. The person's data was in eleven of them. What saved the org: the newer snapshots had manifests, so scoping those was a query — the pre-manifest ones took three weeks of archaeology. That asymmetry, experienced once, is the entire argument for lineage.

**Detection.** Snapshot/backup inventory across all storage (object stores, DB snapshot lists, CI artifact caches) with ages. Anything older than the retention policy — or existing where no policy exists — is a finding.

**Fix.** Destroy expired copies; register survivors in the manifest system.

**Prevention.** TTL on every prod-derived artifact *at creation*, reaper-enforced — the same default-to-death polarity as environments (`environment-lifecycle-and-contention.md` failure mode #2). Retention windows per data class, written down. Refresh replaces rather than accumulates (blue/green refresh in `data-refresh-and-versioning.md` does this naturally: the old world is dropped when lease-free, not archived).

### 3. Access control — everyone can read staging

**Failure mode.** Prod access is locked down; staging — holding masked-prod data at k≥5, or sometimes not-actually-masked data — is readable by every engineer, most contractors, and a handful of CI service accounts with org-wide tokens. The masking pipeline's residual risk calculation assumed a bounded audience; the access reality voids the assumption.

**Detection.** Enumerate who *can* read each environment's data (IAM/DB grants), not who does. Compare against the masking sign-off's assumed trust boundary. The gap is the finding.

**Fix & prevention.** Scope by *data class, not environment name*: environments holding only synthetic data can be broadly accessible (this is a feature — it's why synthetic is the default in the master decision tree, `core-principles.md`); environments holding prod-derived data get need-based grants, time-boxed for humans, least-privilege for service accounts, with access logged. The strategic move: **make the broadly-accessible tier synthetic-only, and demand for prod-derived access collapses to the few use cases that genuinely need it** (perf, migration rehearsal, search relevance).

### 4. The DSAR that reaches test systems

**Failure mode.** Erasure/access request arrives; production complies; test copies don't — because nobody can enumerate them (failure mode #2) or because "masked" was assumed to mean "out of scope" without anyone verifying the masking met the anonymization bar (it almost never does — `masking-and-anonymization.md`).

**Detection/readiness test.** Tabletop-exercise it *before* it's real: "produce every copy of data about person X across all non-production systems, within 72 hours." If the answer isn't a manifest query, you are not ready.

**Fix & prevention.** Two acceptable positions per dataset, chosen deliberately: (a) **"provably anonymized"** — combination-resistant per the k-measurement discipline, signed off, therefore out of DSAR scope; or (b) **"pseudonymized, inventoried, short-lived"** — in scope, but every copy is manifest-registered with a TTL shorter than the response SLA, so the honest answer is "all copies self-destroy within N days; here is the inventory." Most datasets should be (b) — position (a) is expensive to prove and most test data doesn't need to leave the trust boundary anyway. What's *not* acceptable is the common third position: unexamined confidence.

## Decision tree: may this data enter a test system?

```
Proposed test dataset D
├─ Fully synthetic / authored fixtures?
│   → YES: clear. No basis, retention, or DSAR burden. This exit is why
│     synthetic is the default (core-principles.md master tree). DONE.
├─ Contains card data? → PANs must be synthetic/test-issued regardless of
│     anything else (PCI). Strip/replace, then continue.
├─ Prod-derived. Does the use case genuinely need it?
│   (perf shape, search relevance, migration rehearsal — not "easier than seeding")
│   ├─ NO → back to synthetic. Convenience is not a lawful basis.
│   └─ YES ↓
├─ Health data involved? → HIPAA de-identification (Safe Harbor floor) before
│     it moves; verify vendor/BAA chain for wherever it lands.
├─ Masking pipeline: coverage + k-measurement + utility validation green?
│     (masking-and-anonymization.md decision tree) — NO → fix first.
├─ Landing environment: access scoped to the audience the residual-risk
│     sign-off assumed? — NO → fix grants first (failure mode #3).
├─ TTL + manifest registration wired? — NO → not until they are.
└─ All green → document (basis, config version, k report, scope, TTL),
   get the DPO/counsel signature, release. The signature is the point:
   this decision is made WITH the accountable function, never for them.
```

## Cross-references

- The technical controls every branch above depends on: `masking-and-anonymization.md`
- Manifest/lineage mechanics: `data-refresh-and-versioning.md` failure mode #4
- TTL/reaper mechanics: `environment-lifecycle-and-contention.md`, `cleanup-and-isolation.md`
- Where these gates land in a greenfield build: `../guides/build-a-platform-from-scratch.md` phase 2; in an assessment: `../guides/assess-an-existing-setup.md` (compliance findings outrank everything else in its report)
- Agents must treat "masked" as a claim to verify, not a property to assume: `../orchestration/README.md` failure mode #3
