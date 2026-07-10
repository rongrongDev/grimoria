# Cross-Functional Coordination

> **Version 1.0 — 2026-07-06.** Applies to: all programs, more critical as the org scales. Read [feeding-findings-back](./feeding-findings-back.md) first — this doc is about the organizational plumbing that makes the fix loop actually flow.

A finding is only worth the change it causes. The change happens in *other teams'* work — training, classifiers, policy, legal, product. If red-team findings do not translate into those teams' backlogs and priorities, they sit and rot ([core-principles](./core-principles.md) principle 7). Finding failures is the fun part; getting the org to act on them is the hard part, and it is where most programs actually break down.

---

## The teams and what each needs from you

| Team | What they need from a finding | What you need from them |
|---|---|---|
| **Model training / alignment** | The *class* and generalization profile as a training-data spec ([feeding-findings-back](./feeding-findings-back.md)), not a single phrasing | A commitment that classes above a severity bar enter the next training cycle; verification access to checkpoints |
| **Safety classifiers / guardrails** | The mechanism, so a classifier can target meaning not surface | Guardrail updates for fast defense-in-depth; honesty about what the classifier can/can't catch |
| **Policy** | Whether existing policy even covers the behavior; ambiguous cases | Clear policy so "is this a bug" has an answer; policy updates when the taxonomy grows |
| **Legal** | Early notice on catastrophic-potential and child-safety findings; disclosure questions | Handling protocols for restricted categories; disclosure judgment ([reporting-and-disclosure](./reporting-and-disclosure.md)) |
| **Product / deployment** | Which surfaces are affected; system-prompt/harness fixes | Deployment of harness-level fixes; realistic threat model of who uses the surface |

## The translation problem

A red-team finding is written in red-team language: attack class, generalization profile, severity. A training team needs a *data spec*; a policy team needs a *rule*; a product team needs a *config change*. The finding does not translate itself. The most common reason findings die is not disagreement — it is that no one converted the finding into the receiving team's unit of work, so it never entered their prioritization at all.

**The fix:** the red-team program owns translation to the *point of handoff*. For each finding above LOW, produce the receiving team's artifact: the training-data spec, the proposed policy clause, the config diff. Do not throw a red-team report over the wall and hope; hand over something already shaped like their work.

## Standing structures that keep findings moving

- **A single triage forum** where new findings above a severity bar are reviewed jointly by red-team + representatives of training/classifier/policy, and each gets a *named owner on the receiving team* at that meeting ([feeding-findings-back](./feeding-findings-back.md)). Ownership assigned live, not "we'll figure out who."
- **A severity-driven SLA.** Criticals have an immediate, out-of-band path ([severity-and-triage](./severity-and-triage.md)); highs enter the current cycle; mediums the next. The SLA is agreed *across* teams in advance, so escalation is a pre-negotiated contract, not a fight during a crisis.
- **Verification standing.** The red team retains the authority to reopen a "fixed" finding that fails generalization verification. This must be an agreed norm, or "fixed" degrades to "the other team closed their ticket."
- **A shared, honest coverage + fix-throughput dashboard.** Not finding-count (vanity — [program-design](./program-design.md)); cells covered, and time-to-verified-fix by severity. Leadership watches *throughput*, which is what keeps the fix loop resourced.

## Escalation for high-severity findings — the human path

For a critical finding, the coordination path is a people problem before it is a process problem. Pre-establish:
- *Who* gets the out-of-band call (named individuals, not a team alias).
- *What* they are authorized to do (pause a launch, pull a surface, convene legal).
- *How* the restricted content is handled in that call (controlled channel, [reporting-and-disclosure](./reporting-and-disclosure.md)).

Rehearse this once before you need it. The first time you find a launch-blocking critical is the wrong time to discover no one is empowered to block the launch.

## The tensions you will actually navigate

- **Ship pressure vs. open findings.** Product wants to launch; red team has open highs. The resolution is the pre-agreed SLA and severity rubric — criticals block, highs are negotiated against the SLA, and the decision is *documented* with an owner accountable for the residual risk. Never let "we're behind schedule" silently downgrade a severity.
- **"It's not a bug, it's working as intended."** Sometimes a finding reflects a genuine policy gap, not a model defect — the model did what policy allowed, and the policy is wrong. Route these to policy, not training. A red team that can't tell "model broke policy" from "policy is inadequate" wastes the training team's time and misses the real fix.
- **Backlog rot.** Mediums accumulate because nothing forces them. The throughput dashboard and the next-cycle SLA are the only reliable pressure. Absent them, mediums are immortal.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Findings thrown over the wall | Reports filed, nothing changes | Program owns translation to handoff artifact | Produce receiving-team's unit of work |
| No owner on receiving team | "Whose is this?" weeks later | Assign named owner at triage forum | Live ownership assignment, not aliases |
| "Fixed" means ticket closed | Recurrence in deployment | Red team keeps reopen authority | Verification-standing norm |
| Ship pressure downgrades severity | Severity quietly drops near launch | Pre-agreed SLA + documented risk owner | Severity rubric is not negotiable |
| Policy gaps sent to training | Training team can't "fix" allowed behavior | Route policy gaps to policy | Distinguish defect from policy inadequacy |
| Backlog rot | Old mediums never actioned | Throughput dashboard + next-cycle SLA | Watch time-to-verified-fix, not counts |

## Related

- The fix mechanisms these teams own: [feeding-findings-back](./feeding-findings-back.md)
- Severity that drives the SLA and escalation: [severity-and-triage](./severity-and-triage.md)
- Disclosure decisions needing legal/policy: [reporting-and-disclosure](./reporting-and-disclosure.md)
- Restricted-category handling: [harm-taxonomy](./harm-taxonomy.md)
- The dashboard's honest metrics: [program-design](./program-design.md)
