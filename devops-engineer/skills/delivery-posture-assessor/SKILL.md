---
name: delivery-posture-assessor
description: Assess an unfamiliar CI/CD + IaC estate and produce a graded scorecard, top-ten risk list, and three-horizon remediation plan covering pipeline trust, reproducibility, IaC blast radius, drift, secrets exposure, deploy/rollback reality, and environment parity. Use when inheriting or auditing a delivery setup, before building on top of one, for periodic delivery health reviews, or as the coordinating frame that dispatches the per-area skills and subagents. Do NOT use for reviewing one pipeline change (pipeline-flakiness-reviewer), one plan (terraform-plan-auditor), or for live drift measurement across a big estate in your own context (dispatch iac-drift-scanner and consume its report) — and do NOT use it to fix anything an assessment that mutates its subject measures nothing.
---

# Delivery Posture Assessor

You are executing `devops-engineer/playbooks/assess-an-existing-delivery-setup.md` in compressed, agent-executable form (read it if available; this skill is self-sufficient). Governing stance: **grade honesty, not sophistication** — a plain rolling deploy with a tested rollback outranks an untested canary pipeline; a green dashboard is a claim, not evidence. You are read-only by contract: request read access, cite evidence for every finding, record "could not determine" as a finding in itself, and change nothing.

**Inputs required:** read access to app/infra/deploy repos, CI definitions (and run history if available), and — if offered — cloud audit logs and state-backend metadata. Also ask the team two calibration questions and record answers verbatim: _"how do you deploy a one-line fix to prod, start to finish?"_ and _"when did you last roll back, and how did it go?"_ If access to an area is unavailable, that area's grade is `UNKNOWN` — never inferred.

## Procedure (seven areas; each gets a grade A–F/UNKNOWN + one-sentence justification + evidence)

**1. Pipeline trust.** Re-run culture (same-SHA pass/fail pairs, re-run rates if history available); theater audit — grep every workflow for `|| true`, `continue-on-error`, `allow_failure`, swallowed exits; zero-test assertions; smoke tests asserting content vs. reachability. Depth per workflow: invoke `devops-engineer/skills/pipeline-flakiness-reviewer/` on the 2–3 most load-bearing workflows and fold in its verdicts.

**2. Reproducibility & artifact integrity.** Lockfiles enforced; bases/actions pinned (digest/SHA); build-once-promote-by-digest or rebuild-per-env (any rebuild between test and prod = automatic headline risk); cache keys that could feed stale content into shipped artifacts; registry tag-immutability on/off.

**3. IaC state & blast radius.** Backend remote+locked+versioned; state readable by whom (it holds secrets); prod state/account separation; environment-selecting variables with defaults; `prevent_destroy`/`deletion_protection` on stateful resources; apply gated on reviewed _saved_ plan vs. plan-and-apply-in-one-breath; provider/module pinning + committed lockfile.

**4. Drift.** Small estate: run `terraform plan -detailed-exitcode` per root module yourself. Large estate: dispatch `devops-engineer/agents/iac-drift-scanner.md` and consume its inventory — do not mine plan output in this context. If audit logs are readable: 30-day write-calls by non-CI principals = the out-of-band change rate, which grades whether the repo is the system of record.

**5. Secrets exposure.** History-inclusive secret scan on all repos (a past "removal" commit = exposed, goes on the list as live-until-rotated); long-lived cloud keys in CI vs. OIDC federation; job-global secrets; shared identities across environments/purposes; fork-PR access to secrets or privileged runners; state-backend and log-sample sweeps. Per critical credential, the enumeration test: where does it live / who reads it / last rotation / what breaks if rotated now. Active-compromise indicators → flag for handoff to `security-dev/`, don't investigate.

**6. Deploy & rollback reality.** Strategy vs. the decision tree in `devops-engineer/principles/deployment-strategies.md`; probe honesty (liveness probes touching dependencies; readiness probes that can't fail); canary-that-never-failed check; rollback in three parts — documented? independent of green CI? last exercised when? Untested rollback is graded as **no rollback capability**, in those words.

**7. Environment parity.** Rendered-manifest diff staging↔prod; parity budget document exists or differences accrete silently; environment-name literals in app code/templates; same-artifact-all-envs confirmed by digest comparison.

## Output contract (return exactly this, ≤100 lines)

```markdown
# Delivery Posture Assessment — <estate> — <date> — repos: N, workflows: N, root modules: N

## Calibration answers (verbatim)

## Scorecard

[area | grade | one-sentence justification | key evidence]

## Top risks (ranked by likelihood × blast radius, MAX TEN)

[# | risk | evidence | failure it predicts | owning doc: devops-engineer/...]

## Remediation plan

### This week (cheap, huge blast-radius cuts): [item | prove-it test]

### This quarter: [item | prove-it test]

### Ongoing monitors: [drift scan / reproducibility rebuild / dependency bot / flake budget — which exist, which don't]

## Could-not-determine (access gaps that cap this assessment's confidence)
```

The ten-risk cap is the assessment: a 60-finding dump is data, not judgment — cutting to ten forces the ranking that makes the report actionable. Every remediation item carries its prove-it test (a fix without verification recreates the theater this skill exists to catch). Where a risk needs deep-dive follow-up, name the tool: per-workflow → `pipeline-flakiness-reviewer`, per-plan gate → `terraform-plan-auditor`, estate drift → `iac-drift-scanner`, unexplained failed deploys → `deployment-failure-tracer`.

## References

Full human-led procedure with reasoning: `devops-engineer/playbooks/assess-an-existing-delivery-setup.md` · area depth: `devops-engineer/principles/cicd-pipelines.md`, `devops-engineer/principles/infrastructure-as-code.md`, `devops-engineer/principles/secrets-in-delivery.md`, `devops-engineer/principles/deployment-strategies.md`, `devops-engineer/topics/environment-parity.md` · fan-out across many estates: `devops-engineer/orchestration/README.md`
