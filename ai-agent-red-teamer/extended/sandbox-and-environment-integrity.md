# Sandbox & Environment Integrity

**Version 1.0 — 2026-07-06.** Extended tier — production-patterns + common-pitfalls depth. Applies to: agents that execute code, run shell commands, manage files, or otherwise act within a runtime environment (code interpreters, computer-use agents, CI/CD agents, dev-environment agents). Framework-agnostic.

> **Safety note.** This doc describes the *risk category and defensive design* of an agent affecting its own execution environment. It contains **no** sandbox-escape techniques, no exploit detail, and no "here's how to break out" content — deliberately, per [DESIGN.md](../DESIGN.md). The value here is knowing what to isolate and what to monitor, not how to break isolation.

---

## Risk in one paragraph

An agent that can run code or commands is acting *inside* an environment, and the boundary of that environment is a security boundary. The risk category: the agent affects its execution environment beyond its intended scope — reaching resources, credentials, networks, or state it was never meant to touch — whether by hijack (injection steering the code-execution tool), by cumulative privilege-gaining steps, or by the environment simply being more permissive than the task required. The agent's *effective* authority includes everything its environment grants it, which is frequently far more than its tool list implies.

## Production patterns (how it shows up)

- **The environment is the real authority.** An agent with a single "run this code" tool, running in an environment that has cloud credentials, network egress, and a mounted filesystem, effectively holds all of that. The tool list says "code execution"; the ceiling of harm is the whole environment. This is ambient/transitive authority ([../principles/excessive-agency.md](../principles/excessive-agency.md) §2) at its most extreme.
- **Injection into the execution tool.** Untrusted content steers the agent into running attacker-chosen operations. The code-execution path is the highest-stakes injection target precisely because its authority is the environment's — which is why least-privilege on injection-reachable tools ([../principles/indirect-prompt-injection.md](../principles/indirect-prompt-injection.md) §4) matters most here.
- **Privilege-gaining chains within the environment** ([../principles/trajectory-evaluation.md](../principles/trajectory-evaluation.md) §4). A sequence of individually-legal operations that walks the agent from its intended scope toward broader environment access. No single command is a violation; the trajectory is.
- **Egress as exfiltration.** An environment with unrestricted network egress lets a hijacked agent send data out. Egress is an action channel, not just a convenience.
- **State bleed across runs/tenants.** A shared or improperly reset environment lets one run's state (files, cached credentials, memory) affect another — including across tenants in a multi-tenant system.

## Common pitfalls

- **Auditing the tool, not the environment.** "It can only run code" understates the risk enormously if the code runs with broad ambient authority. Always inventory what the *environment* grants.
- **Standing credentials in the environment.** Long-lived cloud/API credentials reachable from the execution context are authority the agent holds implicitly and permanently.
- **Unrestricted egress.** Treated as a dev convenience, it's an exfiltration channel for any hijacked run.
- **Reusing environments without a clean reset.** State from a prior (possibly compromised) run persists into the next.
- **Assuming a sandbox exists because there's a container.** A container with host mounts, ambient credentials, and open egress is not isolation; it's a namespace. Isolation is a property you verify, not a checkbox.

## Detection (patterns-level, defensive)

1. **Inventory environment authority:** credentials reachable from the execution context, network egress reachability, filesystem mounts, and any host/orchestrator access. This is the true ceiling of harm.
2. **Intersect with the injection surface:** is the code-execution tool reachable from untrusted content? If yes, the environment's authority is injection-reachable — top priority.
3. **Check isolation properties, don't assume them:** is egress restricted to an allowlist? Are credentials short-lived and scoped? Is the environment reset between runs/tenants? Is there a resource boundary the agent can't cross?
4. **Monitor for privilege-gaining trajectories:** operations that expand the agent's environment access (credential reads, permission changes, network reconfiguration) — flag regardless of per-step legality.

## Fix / prevention (defensive design)

- **Least-privilege environment, matched to the task.** The execution environment holds only what the task needs — no ambient cloud credentials, no broad mounts, no egress the task doesn't require.
- **Short-lived, narrowly-scoped credentials** instead of standing ones; the agent's environment should not be a permanent keyring.
- **Egress allowlisting.** Default-deny outbound network; allow only required destinations. This blunts exfiltration even under hijack.
- **Fresh, isolated environments per run (and per tenant).** Reset state between runs so compromise doesn't persist or bleed.
- **Resource and operation caps + monitoring** on the execution path, so a runaway or hijacked run is bounded and alertable.
- **Treat the execution tool as the most dangerous injection-reachable tool** and design accordingly (gates on environment-affecting actions, dry-run where feasible).

**Related:** [../principles/excessive-agency.md](../principles/excessive-agency.md) (ambient/transitive authority), [../principles/indirect-prompt-injection.md](../principles/indirect-prompt-injection.md) (execution tool as injection target), [../principles/trajectory-evaluation.md](../principles/trajectory-evaluation.md) §4 (privilege-gaining chains).
