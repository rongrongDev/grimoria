# Infrastructure as Code: The Plan Is the Contract

**Applies to:** Terraform 1.x (verified at 1.11; OpenTofu 1.9 equivalent unless noted); state/blast-radius concepts port to Pulumi/CloudFormation with renamed nouns · **Last verified:** 2026-07-14

**The one-sentence philosophy:** IaC's promise is that infrastructure becomes reviewable, repeatable, and recoverable — and every unreviewed apply, every ambiguous default, every manual console change quietly converts that promise back into the artisanal server-wrangling it was supposed to replace. The tool will do exactly what the code says, at machine speed, to everything in scope. That's the feature. It's also why the two-line diff deserves more fear than the two-hundred-line one: I have watched `terraform apply` destroy a production database because a module refactor changed a resource address and nobody read past the first screen of the plan.

**Vocabulary this doc assumes:** *state* — Terraform's record mapping declared resources to real cloud objects; *plan* — the computed diff between code, state, and reality; *drift* — reality diverging from state/code via out-of-band change; *blast radius* — everything a single apply can touch.

## State: the crown jewel you must never hand-edit

- **Remote state with locking, from day one, even solo.** S3+DynamoDB lock (or S3 native locking in recent Terraform), GCS, or Terraform Cloud/HCP. Two concurrent applies against unlocked state is a corrupted-state incident, and local state on a laptop is a bus-factor-of-one incident scheduled for later.
- **State contains secrets in plaintext** (DB passwords, generated keys — anything a provider returns). Encrypt the backend, restrict read access as tightly as the secrets themselves, and never commit state or its backups to git. Full secrets model: `devops-engineer/principles/secrets-in-delivery.md`.
- **Surgery goes through the CLI, never the editor:** `terraform state mv` for refactors, `import`/`removed` blocks for adoption/abandonment, `moved` blocks *in code* (preferred — they're reviewed like any diff). Hand-edited state JSON is how a "quick fix" becomes an afternoon of `state rm` archaeology.
- **Split state by blast radius and cadence, not by file count.** One monolithic state = every apply risks everything and plans take ten minutes. Practical split: per environment *always* (prod state physically separate from staging, ideally separate accounts), then per lifecycle-layer (network/foundation ← changes yearly; data stores ← changes monthly, guarded; app/services ← changes daily). Cross-layer references go through remote-state data sources or explicit outputs, which makes the dependency reviewable.

## The apply gate: how changes get to reality

The non-negotiable flow, encoded as pipeline (see `devops-engineer/playbooks/build-a-delivery-pipeline-from-scratch.md`):

1. PR carries the code diff; CI posts the **saved plan** (`terraform plan -out=tfplan`) as the review artifact. Reviewers review the *plan*, not just the HCL — the HCL says intent, the plan says consequence, and they diverge exactly when it matters.
2. Plan review runs the `devops-engineer/skills/terraform-plan-auditor/` checklist: destroys, replaces, count/for_each churn, provider-version-induced diffs, wrong-workspace tells.
3. Merge applies **that saved plan file**, not a fresh plan — a fresh plan at apply time can differ from what was reviewed (someone else merged; drift happened). If the saved plan is stale, Terraform refuses; that refusal is the system working.
4. Humans never run `apply` from laptops against shared environments. Laptop `plan` for iteration: fine. Laptop `apply`: that's a console change with extra steps, and it holds credentials no laptop should have.

## Failure modes

### 1. Concurrent applies corrupting or racing state

- **Failure mode:** two applies (two engineers, or engineer + CI, or two CI runs) mutate the same state; without locking you get lost updates or corrupted state; with locking but no queueing you get confusing lock-timeout failures that people "fix" with `force-unlock`.
- **Detection:** lock-acquisition failures in CI logs; resources in state that no code declares; `terraform plan` showing creations for things that already exist.
- **Fix:** if state is corrupted — stop all applies, pull the backend's versioned history (this is why the backend bucket has versioning enabled), restore the last-good state, re-plan and reconcile. `force-unlock` only after confirming the holding process is truly dead, never to "unstick" a running one.
- **Prevention:** locking backend (mechanism); applies only via the pipeline, serialized per state (gate); backend bucket versioning on (recovery); `force-unlock` requires a second engineer confirming (process gate).

### 2. Blast radius of a bad apply

- **Failure mode:** an apply destroys or replaces something it shouldn't. The classic causes, each from a real incident: **ambiguous variable defaults** (`variable "environment" { default = "prod" }` — a module invoked without the var quietly targets prod; the apply-to-wrong-environment incident in this KB's founding prompt is this one); **replaces hiding as changes** (changing an immutable attribute — subnet of an instance, name of a DB — reads as an innocent update in HCL but is destroy-and-recreate in the plan); **resource-address churn** (refactoring `count` → `for_each`, or renaming a module, re-keys every instance: plan says destroy 40 / create 40, and for stateful resources that's data loss); **unscoped workspace/backend** (right code, wrong state).
- **Detection:** entirely at plan review — this failure mode has a 100%-effective detection point and every occurrence is a review that didn't happen or didn't look. `Plan: X to add, Y to change, Z to destroy` — any Z > 0 or any `-/+` (replace) on a stateful resource is a stop-and-justify.
- **Fix:** post-incident, the honest fix is restoring from backup (which is why `deletion_protection`, `final_snapshot`, and tested restores — `reliability-engineer/topics/disaster-recovery.md` — are IaC's safety net, not someone else's problem).
- **Prevention, layered:** no defaults on environment-selecting variables — make the caller state the target (mechanism); `prevent_destroy` lifecycle on stateful resources, `deletion_protection` on databases (mechanism); `moved` blocks mandatory for refactors so address churn is declared, not discovered (review rule); plan audit gate via `devops-engineer/skills/terraform-plan-auditor/` with destroy-count hard-stop in CI — a plan destroying >N resources requires a second approver (pipeline gate); prod state in a separate account with separate credentials, so "wrong environment" requires *two* mistakes, not one (structure).

### 3. Drift between declared and actual state

- **Failure mode:** someone changes reality out-of-band — console hotfix at 2am, a script, another team's tool — and now code, state, and reality are three different things. The next apply either reverts a change someone needed (re-breaking what they fixed) or collides with it. Drift compounds: each undetected instance teaches the team the console is fine, until the repo is fiction.
- **Detection:** scheduled `terraform plan -detailed-exitcode` per root module (exit 2 = drift) — this is exactly `devops-engineer/agents/iac-drift-scanner.md`, isolated because the evidence is enormous and the useful output is one inventory. Also: cloud audit logs (CloudTrail-class) filtered for non-CI principals making write calls is the drift-*attribution* tool.
- **Fix:** triage each drifted resource three ways: reality is right → codify it (update code to match, plan-to-no-op); code is right → revert reality via apply, *after* telling whoever made the change; resource shouldn't be managed → `removed` block / `state rm`, documented. Never blind-apply over drift — that 2am console change was someone's incident mitigation, and reverting it un-mitigates their incident.
- **Prevention:** write access to the cloud restricted to the pipeline's role plus a break-glass path (mechanism); break-glass usage pages the owning team to codify within 24h (process gate — the console isn't forbidden, *unrecorded* console use is); weekly drift scan with results to the owning team, not a dashboard nobody reads (monitor).

### 4. Module design: too rigid or too permissive

- **Failure mode:** two ways to die. *Too rigid:* a module hardcoding region/naming/sizing that fits exactly one use case; consumers fork it, and now you maintain nine divergent copies (the worst infra codebase I ever inherited was 14 forks of one VPC module, each "temporarily" patched). *Too permissive:* a module exposing 90 variables including `allow_public_access` — a config surface so wide the module guarantees nothing, and review burden just moved from HCL to tfvars.
- **Detection:** fork count and copy-paste rate of module code (rigidity); variable count and "how do I…" questions answered with "set these 12 vars" (permissiveness); modules whose defaults alone produce something insecure or non-compliant.
- **Fix/prevention:** a module encodes a *decision*, not a wrapper — "our VPC, our way" with the org's non-negotiables (encryption on, private by default, tagging enforced) hardcoded and only genuine per-consumer variation exposed. Version modules (git tags/registry) and pin consumers to versions, so module evolution doesn't ambush downstream applies (`devops-engineer/topics/release-engineering.md` for pinning cadence). Policy-as-code (OPA/Sentinel/`terraform test`-class checks) in the pipeline enforces the non-negotiables even when a module doesn't (gate).

## Provider and version discipline

Pin the Terraform version (`required_version`) and provider versions (`required_providers` with `~>` at minimum, lockfile `.terraform.lock.hcl` committed). An unpinned provider means `terraform init` on a Tuesday changes what your unchanged code does — provider majors rename attributes and *that shows up as resource replaces*. Provider upgrades are their own PR with their own plan review, never a side effect of a feature change.

## References

Plan review procedure: `devops-engineer/skills/terraform-plan-auditor/` · repo-wide drift audit: `devops-engineer/agents/iac-drift-scanner.md` · pipeline that enforces the apply gate: `devops-engineer/playbooks/build-a-delivery-pipeline-from-scratch.md` · GitOps-managed infra and its drift model: `devops-engineer/topics/gitops.md` · state-secret handling: `devops-engineer/principles/secrets-in-delivery.md` · backup/restore reality checks: `reliability-engineer/topics/disaster-recovery.md`
