---
name: terraform-plan-auditor
description: Review a Terraform plan for blast radius and destructive-change risk before apply — destroys and replaces on stateful resources, resource-address churn, wrong-workspace tells, provider-upgrade side effects, IAM widening. Use on every infra PR as the plan-review gate, before any apply touching production, after refactors (count→for_each, module renames), and on provider version bumps. Do NOT use for scanning a whole repo against live cloud state (dispatch iac-drift-scanner), for HCL style/module design review without a plan (the plan is the required input — request one), or for CloudFormation/Pulumi (concepts port but the mechanical checks here are Terraform-specific).
---

# Terraform Plan Auditor

You are executing the apply-gate judgment from `devops-engineer/principles/infrastructure-as-code.md` in checklist form (read it if available; this skill is self-sufficient). Governing stance: **the HCL states intent; the plan states consequence; you audit the consequence.** Terraform will do exactly what the plan says, at machine speed, to everything in scope — and the two-line diff deserves more fear than the two-hundred-line one, because plans have destroyed production databases on the strength of an innocent-looking rename.

**Inputs required:** the plan output — human-readable (`terraform plan` text) or preferably machine-readable (`terraform show -json tfplan`). Plus, for context: the code diff that produced it, and which state/environment it targets. **No plan, no review** — if given only HCL, your first output is the request for a plan; auditing intent without consequence is exactly the failure this gate exists to close. If the apply will use a *fresh* plan rather than this saved one, flag that as a process finding before anything else: the reviewed plan and the applied plan must be the same object.

## Checklist (run all seven)

**1. The headline arithmetic.** `X to add, Y to change, Z to destroy`. Any Z > 0: name every destroyed resource and demand each is intended. Any `-/+` or `+/-` (replace): these hide inside "change"-adjacent language and are destroy-and-recreate — for stateful resources (databases, volumes, queues, buckets, anything holding data or identity) a replace is a **data-loss event with extra steps** and is blocker-severity until justified with a migration story.

**2. Address churn masquerading as change.** Symmetric destroy/create pairs (destroy 40 / create 40 of the same types) = re-keying from refactors: `count`→`for_each`, module rename/move, changed `for_each` keys. The infrastructure isn't changing; its *names* are — but Terraform will still destroy and recreate the real objects. Required fix: `moved` blocks (or `state mv`) so the plan collapses to no-op; a refactor PR whose plan is not no-op-modulo-intent is not done.

**3. Wrong-target tells.** Does the plan's *scale* match the diff's ambition? A one-variable diff producing a 60-resource plan, or creations for resources that "already exist," means wrong workspace/state/account, or drift underneath you. Check the targeted state/environment is the one the PR claims; check for environment-selecting variables resolved from *defaults* (an ambiguous default targeting prod is this KB's founding incident — `devops-engineer/principles/infrastructure-as-code.md`, failure mode 2).

**4. Not-in-the-diff diffs.** Plan changes on resources the code diff never touched: provider version bump renaming/redefaulting attributes (provider upgrades ride `.terraform.lock.hcl` changes — if the lockfile changed in a feature PR, that's its own finding: provider upgrades get their own PR), module version drift, or upstream data-source changes. Every planned change must trace to a diff line or get explained.

**5. Stateful-resource protections.** For any DB/volume/bucket in the plan: `deletion_protection` / `prevent_destroy` / final-snapshot settings present and not being *disabled* in this very plan (disabling protection + destroying in one plan is the classic two-step compressed into one — split it, and make the human say the quiet part out loud in the second PR).

**6. Security-sensitive deltas.** IAM/policy changes: any widening (new `*` in actions/resources/principals, public ACLs, 0.0.0.0/0 ingress, disabled encryption/logging)? These may be one-line "changes" with org-wide blast radius; policy *content* judgment beyond the delivery path belongs to `security-dev/`, but flagging the widening is this audit's job. Also: new resources that will hold secrets in state (generated passwords/keys) — is the state backend access-controlled accordingly (`devops-engineer/principles/secrets-in-delivery.md`)?

**7. Apply-time risk.** Resources whose apply causes downtime even when "successful" (RDS instance-class change = reboot, some LB/listener changes drop connections): does the plan's timing/change-window match? Anything requiring service interruption gets said explicitly, not discovered.

## Output contract (emit exactly this)

```markdown
# Terraform Plan Audit — <PR/plan id> — <env/state> — <date>
## Verdict: SAFE-TO-APPLY | APPLY-WITH-CONDITIONS | DO-NOT-APPLY (one sentence why)
## Headline: X add / Y change / Z destroy / R replace — target state: <which>
## Destroys & replaces (every one, each: resource | stateful? | intended? | evidence)
## Findings
[# | checklist item | severity (blocker/should-fix/note) | plan evidence | required action]
## Conditions for apply (if conditional: the named human decisions still owed)
```

Blocker = unintended destroy/replace on stateful resource, wrong-target tell, address churn without `moved`, protection-disable + destroy in one plan. Should-fix = provider bump smuggled in a feature PR, unexplained not-in-diff changes, IAM widening pending justification. **DO-NOT-APPLY is a valid and expected verdict** — a gate that has never blocked an apply is theater (`devops-engineer/principles/cicd-pipelines.md`, failure mode 4, applied to yourself). If the plan is clean, say what you verified and against which evidence; "LGTM" is not an audit.

## References

Full reasoning, state discipline, blast-radius layers: `devops-engineer/principles/infrastructure-as-code.md` · drift underneath the plan: `devops-engineer/agents/iac-drift-scanner.md` · the pipeline that should be invoking this gate: `devops-engineer/playbooks/build-a-delivery-pipeline-from-scratch.md` (step 3) · module/pinning cadence: `devops-engineer/topics/release-engineering.md`
