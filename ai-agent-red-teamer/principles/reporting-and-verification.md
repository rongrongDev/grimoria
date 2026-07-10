# Reporting & Fix Verification

**Version 1.0 — 2026-07-06.** Applies to: writing up any agent red-team finding, and verifying a proposed mitigation. Framework-agnostic. Core-tier.

> The output of red-teaming an agent is a **finding**, not an attack. This doc is about writing findings that a product team can act on without the finding itself becoming a usable weapon — and about verifying a fix actually closed the *class*, not just the reported instance.

---

## 1. The reporting tension, stated honestly

A good vulnerability report is reproducible enough to fix and specific enough to trust. But in this domain, "fully reproducible" can mean "a working exploit," and a report that contains a working exploit is an attack artifact — it can be copied, misused, and it will outlive the vulnerability in ticket systems, chat logs, and email. The audience for these reports includes systems and models with no other safeguards.

**The resolution: report the *mechanism, surface, and blast radius* at a level that lets an engineer find and fix the class — never the *payload* that triggers it.** A product team does not need the exact injection string to fix an injection surface; they need to know *which channel lacks provenance separation* and *what authority it can reach*. If your finding can't be acted on without the working payload, the finding is under-analyzed, not under-specified — do the analysis (which architectural control is missing) rather than attaching the exploit.

This is the same discipline `ai-model-red-teamer/` applies to jailbreak reports; the principle is identical, so the base-model version of responsible-disclosure norms lives there — link to it rather than restating.

## 2. What a finding must contain

A red-team finding is actionable and safe when it has:

- **Risk class** — which category from this KB (indirect injection / excessive agency / missing-or-meaningless gate / trajectory blindness / cumulative escalation / handoff propagation / etc.). Naming the class points the team at the right principles doc and the right fix family.
- **Surface** — *where* it lives: which channel, which tool, which agent, which handoff. Concrete enough to locate (the retrieval path, the `send_email` tool on agent B, the ticket-body field), without the triggering content.
- **Authority reached / blast radius** — what the worst authorized outcome is if this is exploited: what action, what scope, reversible or not, how many records/dollars/recipients. This is what sets severity; it's the intersection of injection surface and authority ([core-principles.md](core-principles.md) §3).
- **Evidence, sanitized** — how you know it's real, at the safe level: a benign-marker probe's *behavioral* result ("the marker instruction embedded in a test document changed the agent's tool calls"), a trajectory excerpt showing the divergence turn, a permission diff showing the over-grant. Behavioral evidence, not a runnable payload.
- **Remediation** — the specific architectural control that closes the *class*: the least-privilege scoping, the provenance separation, the gate, the cap. Cite the principles doc's fix section.
- **Verification criteria** — how the team (and you) will know the fix worked at the class level (§4).

## 3. Severity classification for agentic findings

Severity is driven by blast radius and reachability, not by how clever the technique was. A rough rubric:

```
CRITICAL — untrusted content can reach an irreversible/external high-stakes action
           (money, destructive, access change, customer-facing) with no meaningful gate.
           The dangerous quadrant, fully open.
HIGH     — untrusted content reaches irreversible action but a gate exists (meaningfulness
           in question), OR excessive authority on an injection-reachable path, OR
           trajectory/logging blindness that would hide such an event.
MEDIUM   — excessive agency not currently injection-reachable, OR a meaningful gate that
           is rubber-stampable under load, OR cumulative-effect exposure with partial caps.
LOW      — over-broad scope contained to reversible/internal effects; hygiene issues;
           missing logging on low-stakes paths.
```

Two calibration rules learned the hard way:

- **A missing control is a finding at the severity of what it would have caught.** You do not need a *demonstrated* successful attack to file CRITICAL — an irreversible action reachable from untrusted content with no gate is CRITICAL on the architecture alone. The absence *is* the vulnerability.
- **Don't inflate on cleverness or deflate on "we couldn't fully demonstrate it."** Severity tracks blast radius × reachability. A dull technique reaching a wire transfer outranks an elegant one reaching a scratch file.

## 4. Fix verification — did it close the class or just the instance?

The most common way an agent fix fails: it patches the *reported instance* and leaves the *class* open. This is the whack-a-mole trap ([indirect-prompt-injection.md](indirect-prompt-injection.md) §6, and the base-model analog in `ai-model-red-teamer/`). Verification exists to catch that.

**Verify at the class level:**

- **For an injection finding:** the fix is verified only if it's *architectural* — the injection-reachable path lost the dangerous authority, or provenance gating now blocks untrusted-origin instructions from authorizing the action. If the "fix" is a new system-prompt line telling the model to ignore injected instructions, or a filter that blocks the specific probe wording, it is **not** verified — re-probe with *different benign markers and different channels* and confirm the behavioral effect is gone across all of them, not just the reported one.
- **For an excessive-agency finding:** re-inventory *effective* authority after the change (including transitive/ambient), not just the nominal grant. Confirm the scope-down actually reduced the ceiling of harm and didn't just move the broad credential somewhere else.
- **For a gate finding:** confirm the gate now renders the real action, requires trusted-provenance approval, fails closed, and — critically — isn't fired so often it'll be rubber-stamped ([irreversible-actions-and-oversight.md](irreversible-actions-and-oversight.md) §4). A gate added but rubber-stampable is not a verified fix.
- **For a cumulative-effect finding:** confirm the cap/accounting is enforced structurally and test the aggregate, not a single step.

**Verification methodology:**
1. **Re-test with variation, not the original probe.** The fix must hold across nearby phrasings/channels/entry points, or it's instance-level. Generalization testing is the whole point (borrow the methodology from `ai-model-red-teamer/`'s robustness-evaluation doc).
2. **Add a regression test to CI.** A benign-marker probe / permission assertion / gate check that fails if the class reopens. Without this, the fix decays silently on the next model/prompt/tool change.
3. **Re-run the trajectory eval** if the fix touched behavior — confirm no Layer-B regression elsewhere ([trajectory-evaluation.md](trajectory-evaluation.md)).
4. **Confirm the fix didn't just relocate the risk** — e.g., moving the broad credential to a "helper" agent that the reachable agent can still invoke.

## 5. Common pitfalls

- **Attaching the working payload "so they can reproduce it."** Now the ticket is an attack artifact with a longer lifespan than the bug. Give the mechanism + behavioral evidence instead.
- **Reporting the instance, so the fix is the instance.** If your report is "this exact string does X," the fix will be "block this exact string." Report the *class* and the *architectural gap*.
- **Accepting a prompt-level fix as verified.** "We added an instruction to ignore injected content" is a mitigation to measure, never a verification to accept. Re-probe with variation.
- **Verifying against the original probe only.** Passing the one test you filed proves nothing about the class. Vary it.
- **No regression test.** The fix works today and silently regresses on the next model update. If it's not in CI, it's not durable.
- **Severity by cleverness.** Rate by blast radius × reachability, every time.

## Review protocol (for a finding you're about to file, or reviewing)

1. Does it name the **risk class** and point to the right principles doc?
2. Is the **surface** concrete enough to locate but free of a working payload?
3. Is **blast radius / authority reached** stated, and does it drive the severity (§3)?
4. Is the **evidence** behavioral/sanitized (marker result, trajectory excerpt, permission diff) — not a runnable exploit?
5. Does the **remediation** name an architectural control that closes the *class*?
6. Are there **verification criteria** and a **CI regression test** so the fix is durable and class-level (§4)?
7. Final safety read: could this report be copied and used as an attack? If yes, strip it down to mechanism + fix ([DESIGN.md](../DESIGN.md)).

**Related:** every principles doc's fix section is a remediation source; [core-principles.md](core-principles.md) §9 (report like an engineer). Base-model disclosure norms and generalization-testing methodology: `ai-model-red-teamer/`.
