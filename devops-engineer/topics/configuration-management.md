# Configuration Management (Ansible) — Extended Tier: Patterns & Pitfalls

**Applies to:** Ansible Core 2.17–2.18 / ansible-lint (verified 2026); idempotency/inventory concepts port to Salt/Chef · **Last verified:** 2026-07-14

**Where this sits in 2026:** containers and IaC ate most of config management's old job — if your workloads are containerized, the image *is* the configured host and Ansible should not be templating app configs onto VMs. What legitimately remains: configuring hosts that can't be containers (hypervisors, appliances, GPU/DB metal, legacy estates), bootstrap of what IaC provisions (Terraform makes the VM exist; Ansible makes it correct), and orchestrated operational procedures (rolling OS patching). If you're reaching for Ansible to *deploy an app to Kubernetes*, stop — that's `devops-engineer/topics/gitops.md` or the pipeline's job.

## Production patterns

- **Idempotency is the contract.** A playbook run twice must change nothing the second time (`changed=0`). Every `shell`/`command` task is guilty until proven idempotent: give it `creates:`/`removes:` or a `when:` guard, or use the real module instead — the module knows desired-state; your shell one-liner knows only "run." The test: CI runs the playbook twice against a fresh target and fails on any second-run `changed` (with `--check --diff` as the cheap pre-gate). A playbook that isn't idempotent isn't configuration management; it's a script with an inventory.
- **Inventory is generated, never hand-maintained.** Dynamic inventory from the cloud API / CMDB, grouped by tags that IaC assigns (`devops-engineer/principles/infrastructure-as-code.md` owns the tags). A hand-edited hosts file drifts from reality within a month, and then your "configure all web hosts" run misses the two newest ones — the exact hosts most likely to need it.
- **Roles are versioned modules.** Same rules as Terraform modules: a role encodes a decision, pins its collection dependencies (`requirements.yml` with versions), gets tagged releases, and consumers pin the tag. Galaxy roles from strangers are supply-chain inputs — vendor and pin them (`devops-engineer/topics/supply-chain-integrity.md`).
- **Secrets:** Vault-lookup at runtime beats `ansible-vault` files (a shared symmetric password in CI is sprawl with extra steps — `devops-engineer/principles/secrets-in-delivery.md`); if `ansible-vault` anyway, per-environment vault IDs and never the password in the repo.
- **Rolling execution for fleets:** `serial:` with `max_fail_percentage` so a bad change stops at 10% of the fleet instead of finishing it — this is the canary principle (`devops-engineer/principles/deployment-strategies.md`) applied to host config.

## Common pitfalls

- **Configuration drift between runs.** Ansible is *point-in-time*: it enforces state only when it runs, so a host hand-edited on Tuesday is drifted until the next run — there is no reconciliation loop (the fundamental contrast with GitOps). *Detection:* scheduled `--check` runs reporting would-change counts per host (that report is the drift monitor); *prevention:* scheduled *enforcing* runs, which only become safe once idempotency is genuinely held — a scheduled non-idempotent playbook is a scheduled outage.
- **The snowflake playbook.** `when: inventory_hostname == "web-07"` exceptions accumulating until the playbook is a biography of the fleet's scars. Each host-specific branch is unmanaged drift wearing YAML. Fix the host or fix the role; don't immortalize the exception.
- **Check mode that lies.** `--check` can't see through `shell` tasks or `when: result.changed` chains, so the dry-run diverges from the real run exactly where the risk lives. Treat check-mode-incompatible tasks as review findings.
- **Ordering/handler traps.** Handlers run at play end, not at notify time — a config change whose service restart is deferred can leave a window where half the change is live; `flush_handlers` where sequencing matters. A failed task skips later handlers by default (`--force-handlers` for restarts that must happen).
- **Root everywhere.** The default of running whole playbooks as `become: true` gives every role, collection, and Galaxy import root on the fleet. Scope `become` per-task; the blast-radius reasoning is `devops-engineer/principles/secrets-in-delivery.md` failure mode 2 on different hardware.

## References

Provision-then-configure seam: `devops-engineer/principles/infrastructure-as-code.md` · why app deployment left this tool: `devops-engineer/principles/containers-and-orchestration.md`, `devops-engineer/topics/gitops.md` · pinned third-party roles: `devops-engineer/topics/supply-chain-integrity.md`
