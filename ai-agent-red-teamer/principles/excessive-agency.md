# Excessive Agency & Permission Scoping

**Version 1.0 — 2026-07-06.** Applies to: any tool-using agent with granted permissions (API scopes, file/DB access, code execution, external communications, financial or account actions). Framework-agnostic. Core-tier, full depth.

> Excessive agency is the **blast-radius** half of agentic risk. [indirect-prompt-injection.md](indirect-prompt-injection.md) is how an agent gets steered; excessive agency is how much damage the steering can do. Read them together — neither is a complete risk picture alone.

---

## 1. What it is

**Excessive agency** is the gap between what an agent *can* do and what its task *needs* it to do. Every unit of that gap is authority the agent holds but doesn't require — and every unit is blast radius available to a mistake, a hallucination, or a hijack.

Break the gap into three components you can audit independently:

- **Excessive permissions** — the agent holds scopes/access beyond the task (read-write when read-only suffices; all repos when it touches one; unlimited spend when the task caps out at $50).
- **Excessive functionality** — the agent has tools it doesn't need for its task (a support agent with a shell tool; a summarizer with a send-email tool), often inherited from a shared tool bundle.
- **Excessive autonomy** — the agent can execute high-stakes actions without a gate that the task's risk warrants (see [irreversible-actions-and-oversight.md](irreversible-actions-and-oversight.md)).

The reason this is a first-class risk and not just "sloppy config": **an agent's authority is the ceiling on the harm of every other failure.** A perfect injection defense that fails once, on an agent with narrow authority, is contained. The same failure on an over-provisioned agent is an incident. You reduce the *impact* of the entire risk surface by reducing authority — which is why least privilege is the mitigation that shows up in every other doc.

## 2. Failure mode — how agents end up over-provisioned

Over-provisioning is almost never malicious; it's the path of least resistance. The recurring stories:

- **"Grant broad so we don't have to change it later."** A time-saving decision at integration that becomes permanent. The agent gets admin-equivalent scope because tightening it "can wait," and it never does.
- **Shared tool bundles.** Every agent in the system is handed the same toolbelt because it's one config. The summarizer inherits the transactor's tools. Functionality it never uses is authority an injection can reach.
- **Scope inflation via OAuth/API convenience.** The available scope is coarse (the API only offers "full mailbox access," not "read one label"), so the agent takes the coarse scope and nobody revisits whether the task justified it.
- **Capability creep.** The agent's task grows over releases; tools get added; nobody ever *removes* one. Authority ratchets up and never down.
- **Ambient credentials.** The agent runs in an environment (a CI runner, a service account, a developer's shell) that already has broad standing access, and the agent inherits all of it implicitly — authority it was never explicitly granted but fully holds.
- **Transitive authority.** A tool the agent calls itself holds broad permissions; the agent's *effective* authority is the union of everything its tools can do, which is usually far more than its own grant suggests.

The through-line: **authority accumulates by default and is removed only by deliberate effort.** An agent's real authority is almost always broader than its designers believe, because they reason about the grant they wrote, not the effective union they actually exposed.

## 3. Detection — auditing for the authority/need gap

You are answering one question per grant: *does the task in front of this agent actually require this, at this scope?* Method:

**Step 1 — Establish the task envelope.** Write down, concretely, what the agent is *for*: the set of operations a correct run performs. If you can't get a crisp task definition, that's finding #1 — you cannot scope authority to an undefined task, and an undefined task tends to accrete undefined authority.

**Step 2 — Inventory *effective* authority, not nominal.** Enumerate every tool, then for each tool enumerate what it can actually do — including the permissions the *tool's own* credentials carry (transitive authority, §2) and any ambient/environment access. The output is the true ceiling of harm, which is usually wider than the tool list suggests.

**Step 3 — Diff need against grant.** For each grant, classify:
- **Justified & tight** — needed, scoped to the task. Fine.
- **Justified but loose** — needed, but broader than necessary (read-write where read suffices, all-resources where one suffices, uncapped where a cap fits). *Finding: scope down.*
- **Unjustified** — not needed for this task at all. *Finding: remove.* (Most excessive-functionality findings live here.)
- **Unknown** — you cannot determine whether it's needed. *Finding: treat as unjustified until proven; unknown authority is a risk, not a default-grant.*

**Step 4 — Rank by the injection/irreversibility intersection.** A loose-but-read-only grant unreachable from untrusted content is low priority. A grant that is (a) reachable from the injection surface ([indirect-prompt-injection.md](indirect-prompt-injection.md) §2) and (b) irreversible/external is the top of the list — that's the dangerous quadrant from [core-principles.md](core-principles.md) §3.

**Red flags in a permission audit** (fast triage — any of these is worth a closer look):
- A single agent identity with write access to more than one high-value system.
- Read-*write* where the task only reads.
- "Admin," "owner," "full access," or wildcard scopes.
- No spending/rate/volume cap on an action that costs money or touches many records.
- A destructive/external tool present on an agent whose stated task never needs it.
- Standing (non-expiring) credentials for a time-bounded task.
- The same tool bundle across agents with clearly different jobs.
- Tool credentials broader than the agent's own stated grant (transitive authority).

The `tool-permission-auditor` skill runs this on a bounded config; the `injection-surface-scanner` subagent maps the reachability half.

## 4. Fix — scoping methodology

Scope along four independent dimensions; a well-scoped grant is tightened on all that apply:

- **Capability** — the narrowest verb that does the task. Read-only over read-write. A single-purpose tool over a general one (a "refund up to $X" tool instead of a general "modify account" tool). Prefer tools whose *worst case is bounded by design*.
- **Resource** — the smallest set of objects. One repo/table/mailbox/account, not all. Resource-level allowlists (which recipients, which domains, which paths) turn a broad tool into a task-scoped one.
- **Quantity** — caps. Spending limits, rate limits, per-run volume limits. Caps convert "unbounded harm" into "bounded, alertable harm" and are often the cheapest high-leverage control (they also blunt the cumulative-effect attack from [trajectory-evaluation.md](trajectory-evaluation.md) §privilege-escalation).
- **Time** — expiry and revocability. Task-scoped, time-boxed grants that expire when the task ends. An operator must be able to revoke authority mid-run. Standing authority for episodic tasks is a standing liability.

**The scoping default:** start from zero and add only what a demonstrated task step requires; never start from "broad" and try to subtract. Subtraction from broad-by-default almost never happens under deadline pressure — you must design so the tight scope is the *easy* path.

For the highest-authority irreversible actions, scoping is not enough on its own; pair it with a gate ([irreversible-actions-and-oversight.md](irreversible-actions-and-oversight.md)).

## 5. Prevention — keep authority from creeping back up

- **Least-authority as a review gate, not a cleanup task.** Every new tool/scope on an agent goes through a permission review (the `tool-permission-auditor` protocol) *before* rollout, with the task-need justification recorded. No justification, no grant.
- **Default-deny for injection-reachable paths.** Any path that ingests untrusted content starts with zero irreversible authority; each addition is a reviewed exception with a gate.
- **Periodic re-audit + expiry-by-default.** Grants expire and must be re-justified. This turns capability creep (which is silent) into a recurring, visible decision. An agent that has quietly accumulated ten tools over a year gets that surfaced.
- **Separate identities for separate authority.** Don't run the read-only summarizer and the transactor under one service account. Distinct identities keep the effective-authority union small and make the audit tractable.
- **Cap by default.** Money, volume, and rate caps on every action that has them available, set to the task envelope. A cap you can loosen later is safer than an absent cap you forget to add.
- **Document effective authority, not just the grant.** The system's own docs should state the *ceiling of harm* (including transitive and ambient authority), so reviewers reason about reality, not the intended grant.

## 6. Common pitfalls

- **Auditing the tool list, missing the transitive union.** The agent has three tools, but one of them runs under a credential with org-wide write. The effective authority is enormous; the tool list looks modest. Always inventory what the *tools* can do, not just which tools exist.
- **Ignoring ambient authority.** The agent inherits the environment's standing access (service account, CI token, developer session). Nobody granted it explicitly, so nobody audited it, but the agent holds it fully.
- **Scoping capability but not quantity.** A correctly read-write-limited tool with no volume cap still enables bulk harm one legal call at a time (the cumulative-effect problem). Caps are a distinct dimension.
- **Treating scoping as a substitute for a gate.** For irreversible/external actions, tight scope reduces but doesn't eliminate the need for human confirmation. A perfectly scoped "send email to allowlisted domain" tool still shouldn't fire an externally-visible message under injection without a gate.
- **One-time audit.** Authority creeps up between audits. Without expiry-by-default and periodic re-justification, last quarter's clean audit says nothing about today.

## Review protocol

1. Get a crisp **task envelope** (what a correct run does). Undefined task = finding #1.
2. Inventory **effective** authority: every tool × what it can actually do, including transitive credentials and ambient access.
3. Diff need vs. grant; classify each as justified-tight / justified-loose / unjustified / unknown. Loose→scope, unjustified & unknown→remove.
4. Rank findings by the **injection × irreversibility** intersection ([core-principles.md](core-principles.md) §3).
5. For each keep-but-tighten, scope on all four dimensions (capability, resource, quantity, time).
6. For irreversible/external actions, confirm a **gate** exists too ([irreversible-actions-and-oversight.md](irreversible-actions-and-oversight.md)).
7. Confirm **prevention**: review-gate on new grants, expiry-by-default, separate identities, caps-by-default.
8. Report per [reporting-and-verification.md](reporting-and-verification.md): the gap, the blast radius, the scoped-down target — no exploit needed to justify tightening.

**Related:** [indirect-prompt-injection.md](indirect-prompt-injection.md) (the steering half), [irreversible-actions-and-oversight.md](irreversible-actions-and-oversight.md) (gates for the highest authority), [trajectory-evaluation.md](trajectory-evaluation.md) (cumulative effect within granted authority). Skill: `tool-permission-auditor`.
