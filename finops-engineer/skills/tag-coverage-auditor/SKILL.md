---
name: tag-coverage-auditor
description: Audit a bounded target — one account/project, one team's resources, one IaC module or PR — for tagging completeness, vocabulary compliance, and allocation-policy conformance, returning a graded report with per-resource fixes. Use before a new service ships, on a PR adding infrastructure, when one team's showback looks wrong, or as the quarterly per-account governance backstop. Do NOT use for org-wide unallocated-spend discovery (dispatch the unallocated-spend-scanner subagent — that is a mining job that would bury this conversation), for designing the tag schema itself (follow finops-engineer/principles/cost-visibility-and-allocation.md), or when no written tag policy exists yet — auditing against a policy nobody agreed to produces findings nobody will fix; say so and point at the playbook Step 2 instead.
---

# Tag Coverage Auditor

You are executing the tagging-governance judgment from `finops-engineer/principles/cost-visibility-and-allocation.md` in checklist form (read it if available; this skill is self-sufficient). Governing stance: **a tag scheme is only as real as its enforcement, and a tag can be present, valid, and wrong** — presence, validity, and truth are three separate checks, and most audits stop at one.

**Inputs required:** (1) the written tag policy — mandatory tags, allowed vocabularies, and the shared-cost rules if any; (2) the audit target — an account/project ID, a resource list/export, or an IaC module/PR diff; (3) if available: the service catalog / org chart for truth-checking owner values. If the policy is missing, stop: that absence is the only finding (see do-NOT-use above). If the catalog is missing, run checks 1–4 and mark check 5 as not-performed — do not silently skip it.

## Checklist (run all six)

**1. Presence.** Every resource in scope carries every mandatory tag (`owner`, `service`, `env`, `cost-center` or the policy's equivalent). Count coverage two ways: % of *resources* and % of *spend* (weight by cost if billing data is at hand) — 90% of resources can be 60% of dollars, and the dollar number is the one that matters for allocation.

**2. Vocabulary.** Values against the closed vocabularies, case-sensitively (`prod` ≠ `Prod` ≠ `PROD` — these are three buckets in the billing data). Free-text drift in a supposedly closed field is a schema-enforcement finding, not just a value finding.

**3. Enforcement path.** For an IaC target: are default tags set at provider/stack level (compliance-by-default) and does a CI policy check exist that would *fail* this plan if tags were missing? For an account target: do creation-time controls exist (tag policies + SCPs / Azure Policy deny-or-modify), or is compliance maintained by periodic nagging? Grade: `creation-time` / `scan-only` / `none`. Scan-only compliance decays ~a point a month; say so in those words.

**4. Billing activation (AWS specifically).** Are the mandatory tags activated as cost-allocation tags, and since when? Tags that exist but aren't activated do nothing for allocation, and activation is not retroactive — report the dark window (account age minus activation date).

**5. Truth.** Sample ≥10 resources (or all, if fewer): does the `owner` value name a team that currently exists? Does `env` match reality (a "dev"-tagged resource that prod depends on is a mis-tag with incident potential, not a cosmetic issue)? Copy-paste-from-another-module tag sets (several resources sharing an implausibly identical full tag block across unrelated services) are the classic IaC smell.

**6. Shared-resource conformance.** Any resource in scope that multiple teams consume (shared DB, cluster, NAT, CI): is it covered by a written split rule per the policy, or is its full cost landing on the provisioning team (the misattribution trap)? Flag every shared resource with no rule.

## Output contract (emit exactly this)

```markdown
# Tag Coverage Audit — <target> — <date>
## Grade: PASS | PASS-WITH-FINDINGS | FAIL (one sentence why)
## Coverage: <X>% of resources, <Y>% of spend (or "spend weighting unavailable")
## Enforcement grade: creation-time | scan-only | none — evidence
## Findings
[# | check | severity (blocker/should-fix/note) | resource(s) | fix — concrete tag/value/policy change]
## Dark windows & structural gaps (unactivated tags, missing CI check, shared resources without split rules)
## Checks not performed, and why
```

Blocker = anything that makes allocation *wrong* (mis-tagged owner on significant spend, shared resource silently billed to one team, no creation-time enforcement on a prod account). Should-fix = missing optional-tier tags, vocabulary drift, scan-only enforcement. A clean audit states which checks ran and on what sample — "no findings" without the truth-check sample is an incomplete audit, not a pass.

## References

Full reasoning and war stories: `finops-engineer/principles/cost-visibility-and-allocation.md` · org-wide sweep: `finops-engineer/agents/unallocated-spend-scanner.md` · schema design and negotiation: `finops-engineer/playbooks/build-a-finops-practice-from-scratch.md` (Steps 2–4) · IaC enforcement mechanics: `devops-engineer/principles/infrastructure-as-code.md` · fan-out across many accounts: `finops-engineer/orchestration/README.md`
