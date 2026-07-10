# Reporting and Responsible Disclosure

> **Version 1.0 — 2026-07-06.** Applies to: all programs. Read [core-principles](./core-principles.md) and [severity-and-triage](./severity-and-triage.md) first.

A finding report has two readers who want opposite things: the defender needs enough to reproduce and fix; an attacker who got hold of the report wants a copy-paste weapon. The report must serve the first without serving the second. This tension never goes away, and resolving it well is a core skill of the discipline — not a legal formality bolted on at the end.

---

## The dual-use tension, stated plainly

The more precisely a report reproduces an attack, the more useful it is to the fix team — and the more it *is* the attack. A report that pastes a full working payload into the open backlog has, at that moment, become the artifact the program exists to prevent. But a report so vague the fix team cannot reproduce the issue is useless. The resolution is not to pick a side; it is to *separate the layers*.

## Layered reporting: mechanism open, payload controlled

Structure every finding in two separable layers:

**Layer 1 — the open layer (mechanism and class).** Safe to circulate in the normal backlog and dashboards. Contains:
- The attack *class* ([attack-taxonomy](./attack-taxonomy.md)) and the *mechanism* — why it worked, in general terms.
- The harm *category* ([harm-taxonomy](./harm-taxonomy.md)) and *severity* with the three-factor scoring ([severity-and-triage](./severity-and-triage.md)).
- The *generalization profile* ([robustness-evaluation](./robustness-evaluation.md)): how wide the failing region is, along which axes.
- What a class-level fix would need to address.
- Enough to *cluster*, *triage*, and *prioritize* — but not to *reproduce*.

**Layer 2 — the controlled layer (reproduction detail).** Access-controlled, minimum necessary, never in the open backlog. Contains the exact reproduction steps needed by the fix/training team. Handling rules:
- Stored under access control with audit; only the fix owners and safety leads can read it.
- Minimum necessary — enough to reproduce, no elaboration, no "and here are ten more variants."
- Never pasted into general chat, tickets, dashboards, or training-data pipelines unfiltered.
- For catastrophic-potential and child-safety categories, Layer 2 handling is *stricter still* and routed through dedicated channels ([harm-taxonomy](./harm-taxonomy.md)); some findings never get a full written Layer 2 at all, only a live controlled demonstration.

**Why this works:** the open layer lets the whole program reason about, prioritize, and learn from the finding — which is where most of the value is. The controlled layer, kept small and locked, is the only part that is genuinely dangerous, and it is treated accordingly. A reader of the open backlog learns the *shape* of the problem, not a working exploit.

## A good finding report — the fields

At the open layer, a complete report has:
1. **Title / class:** the attack class and harm category in one line.
2. **Severity + scoring:** the three factors and the resulting level, with escalation status.
3. **Mechanism:** why it worked, in general terms — the thing a fix must address.
4. **Generalization profile:** paraphrase / topic / language / composition / checkpoint results.
5. **Affected surfaces:** which deployments, languages, modalities.
6. **Suggested fix altitude:** class-level, with a note if any proposed fix is merely a phrasing patch.
7. **Pointer to Layer 2:** where the controlled reproduction lives and who can access it — not the reproduction itself.

A report missing the mechanism or the generalization profile is incomplete: it tells the fix team *that* there's a problem but not *what class* to fix or *how wide* it is, which is exactly the information that prevents whack-a-mole ([robustness-evaluation](./robustness-evaluation.md)).

## Internal disclosure norms

- **Route by severity, not by convenience.** Criticals go out-of-band immediately ([severity-and-triage](./severity-and-triage.md) escalation table); do not let a critical sit in a batch because that's how the tooling defaults.
- **Least-exposure principle.** Each finding's reproduction detail is visible to the fewest people who can act on it. Widening access should be a deliberate decision, not the default.
- **Wellbeing.** Reports of disturbing content carry content warnings; people can opt out of categories; exposure is rotated. This is a reporting-system responsibility.

## External / public disclosure judgment

Some findings warrant external disclosure (to inform the field, coordinate across labs, or meet commitments); the judgment is *when and how much*.

Decision guidance:
- **Disclose the existence and class publicly** when it advances collective defense and the class is already broadly known — this raises the field's baseline without arming anyone new.
- **Withhold reproduction detail** from public disclosure essentially always for catastrophic-potential and child-safety categories; the uplift to a bad actor outweighs the informational benefit.
- **Time disclosure to the fix**, not to the discovery. Public disclosure before a fix ships hands a live weapon to everyone; the norm (borrowed from security's coordinated disclosure) is to fix first, disclose after, with enough delay to confirm the fix generalized ([robustness-evaluation](./robustness-evaluation.md)).
- **Coordinate across affected parties** when a finding implicates shared infrastructure or other providers' models — the same class often generalizes across models.

The decision tree:

```
Is it catastrophic-potential or child-safety category?
   → Do NOT publicly disclose reproduction detail, ever. Existence/class only,
     and only if it aids collective defense. When unsure, don't.
Is a fix shipped and generalization-verified?
   → NO:  do not publicly disclose reproduction. Existence-only at most, and
          only if withholding would leave users at greater risk than disclosing.
   → YES: disclosure of class + mechanism is defensible; reproduction detail
          still weighed against residual uplift and whether the class generalizes
          to unfixed models elsewhere.
Does it implicate other providers / shared infra?
   → Coordinate disclosure with them before going public.
```

When in genuine doubt, disclose *less* and *later*, and consult legal/policy ([cross-functional-coordination](./cross-functional-coordination.md)). The asymmetry is stark: under-disclosing costs some field knowledge; over-disclosing can arm real harm irreversibly, because published content is cached and indexed and does not un-publish.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Working payload in open backlog | Reproduction detail visible in general tickets | Move to Layer 2 access control; scrub | Layered reporting mandated by template |
| Report too vague to fix | Fix team can't reproduce; whack-a-mole | Add mechanism + generalization profile | Report template requires both |
| Critical batched, not escalated | Critical sits in queue | Escalate out-of-band | Route-by-severity in tooling |
| Public disclosure arms attackers | Reproduction detail published pre-fix | Cannot undo — prevention only | Fix-first, catastrophic-never decision tree |
| Over-broad internal access | Everyone can read Layer 2 | Least-exposure access control | Default to fewest-readers |

## Related

- Scoring that drives disclosure routing: [severity-and-triage](./severity-and-triage.md)
- Category rules for catastrophic/child-safety handling: [harm-taxonomy](./harm-taxonomy.md)
- Why the generalization profile belongs in every report: [robustness-evaluation](./robustness-evaluation.md)
- Automation's output-handling controls: [automated-red-teaming](./automated-red-teaming.md)
- Legal/policy coordination on disclosure: [cross-functional-coordination](./cross-functional-coordination.md)
