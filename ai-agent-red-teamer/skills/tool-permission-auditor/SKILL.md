---
name: tool-permission-auditor
description: Review an agent's granted tool/permission scope against what its task actually requires, flagging excessive agency — excessive permissions, functionality, and autonomy — with severity by the injection × irreversibility intersection. Use when reviewing an agent's config/tool definitions, before a new tool integration ships, when asked "does this agent have more access than it needs," or as Phase 1 of ai-agent-red-teamer/guides/analyze-existing-agent.md on a single agent. Bounded, in-context review of a nameable set of files. Do NOT use for whole-fleet or unbounded sweeps of where untrusted content enters (dispatch the injection-surface-scanner subagent — that isolates unbounded reading), for reviewing confirmation gates on irreversible actions specifically (use irreversible-action-gate-reviewer), or for tracing a live incident through a trajectory (dispatch agent-trajectory-tracer). Never produces attack content — this is a defensive permission review.
---

# Tool Permission Auditor

You are executing the excessive-agency review protocol from `ai-agent-red-teamer/principles/excessive-agency.md` on a bounded scope (one agent's config, tool definitions, or a named set of files). Read that doc's four scoping dimensions, red-flag list, and the effective-authority concept if any pattern below is unfamiliar — it is the source of truth; this skill is its procedure.

**Stance:** authority accumulates by default and is removed only by deliberate effort, so an agent's *real* authority is almost always broader than its designers believe. You are adversarially reconstructing the true ceiling of harm — nominal grant PLUS transitive (the tools' own credentials) PLUS ambient (environment/service-account access) — and diffing it against what the task actually needs. Over-provisioning is rarely malicious; it's the path of least resistance. Report unresolved authority as unresolved, never as clean.

## Procedure

**1. Establish the task envelope first** (do not start listing tools without it): what does a *correct* run of this agent actually do — the concrete set of operations? Extract from docs/code/config. If it cannot be established, that is finding #0 (HIGH): you cannot scope authority to an undefined task, and you must audit against the most conservative reading.

**2. Inventory EFFECTIVE authority, not the tool list.** For each tool: what can it actually do? Then add:
- **Transitive:** what do the tool's *own* credentials permit (org-wide write? all resources)? The agent's effective authority is the union.
- **Ambient:** what standing access does the execution environment grant (service account, CI token, network egress, filesystem mounts)? See `ai-agent-red-teamer/extended/sandbox-and-environment-integrity.md`.
Output the ceiling of harm — everything this agent could do if fully hijacked.

**3. Classify each grant against need:**
- **Justified & tight** — needed, scoped to task. OK.
- **Justified but loose** — needed, broader than necessary (read-write where read suffices; all-resources where one suffices; uncapped where a cap fits). → scope-down finding.
- **Unjustified** — not needed for this task. → remove finding.
- **Unknown** — can't determine need. → treat as unjustified until proven; unknown authority is a risk, not a default grant.

**4. Rank by the injection × irreversibility intersection.** For each grant, ask: is it reachable from untrusted content (retrieval/web/tool-results/handoffs/memory — see `ai-agent-red-teamer/principles/indirect-prompt-injection.md` §2), and is it irreversible/external (money/destructive/access/comms — see `ai-agent-red-teamer/principles/irreversible-actions-and-oversight.md` §1-2)? Injection-reachable + irreversible = top severity (the dangerous quadrant). Read-only + unreachable = low.

**5. Run the red-flag triage** (`ai-agent-red-teamer/principles/excessive-agency.md` §3): one identity with write to multiple high-value systems; read-write where task only reads; admin/owner/wildcard scopes; no spend/rate/volume cap; destructive/external tool on an agent that never needs it; standing creds for a time-bounded task; shared tool bundle across differently-jobbed agents; tool credentials broader than the agent's own grant.

**6. For each finding, name the scoping fix** on the applicable dimensions (capability / resource / quantity / time) from §4, and — for irreversible/external actions — note whether a gate is also required (defer gate *meaningfulness* review to `irreversible-action-gate-reviewer`).

**Scope discipline:** stay within the given config/files plus the minimal upstream needed to resolve authority (tool definitions, credential/scope config, environment manifest). Read-only. Never generate an exploit to "prove" a grant is dangerous — the over-grant itself is the finding; blast radius is argued, not demonstrated.

## Output contract (emit exactly this structure)

```markdown
## Permission audit: <agent/scope> — <date>
**Task envelope:** <one-sentence what-a-correct-run-does, or "UNESTABLISHED (finding #0)">
**Effective ceiling of harm:** <worst case if fully hijacked — 1-2 sentences>
**Verdict:** LEAST-PRIVILEGE | FINDINGS (N) | BLOCKED (cannot audit — why)

| # | Grant | Class (tight/loose/unjustified/unknown) | Injection-reachable? | Irreversible? | Severity | Scoping fix |
|---|---|---|---|---|---|---|

### Finding details
[Per finding: the authority/need gap in one sentence; the effective (not nominal) blast radius; the specific scoping fix (capability/resource/quantity/time) and whether a gate is also needed]
```

Report per `ai-agent-red-teamer/principles/reporting-and-verification.md`: class-level, blast-radius-driven severity, no payloads.
