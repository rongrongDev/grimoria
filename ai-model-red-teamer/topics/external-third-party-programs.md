# External / Third-Party Red-Team Programs

> **Version 1.0 — 2026-07-06.** Extended tier — production-patterns + common-pitfalls. Applies to: programs opening testing beyond the internal team (bug-bounty-style, contracted external red-teams, coordinated pre-release access). Read [reporting-and-disclosure](../principles/reporting-and-disclosure.md) and [severity-and-triage](../principles/severity-and-triage.md) first.

External red-teaming brings in adversarial diversity the internal team structurally cannot have — new backgrounds, new blind spots, genuine outside-view creativity. It also hands the program's most sensitive activity to people outside your trust boundary. The whole game is capturing the diversity benefit without the exposure cost.

---

## Why go external at all

Internal teams share training, incentives, and blind spots ([program-design](../principles/program-design.md) on monoculture). External testers break that — a bug-bounty population or a contracted specialist crew will try framings your team never would. For catastrophic-potential categories, external *domain experts* are often the only people who can credibly judge uplift. External testing is a coverage lever, not a PR exercise.

## Production patterns

- **Structured scope and rules of engagement.** External testers get a defined scope (surfaces, categories, what's in/out), a severity rubric ([severity-and-triage](../principles/severity-and-triage.md)) so findings arrive scored, and explicit handling rules for dangerous findings — *especially* what to do when they find something genuinely catastrophic (stop, report through the secure channel, do not propagate or publish). These rules are the load-bearing part.
- **Secure intake for reproduction detail.** External findings arrive through a controlled channel, with the Layer-2 reproduction detail ([reporting-and-disclosure](../principles/reporting-and-disclosure.md)) handled under access control from first contact — not posted to a shared tracker. A bug-bounty platform's default openness is wrong for this content; configure for confidentiality.
- **Tiered access by trust and category.** Not every external tester gets every surface. Catastrophic-potential and child-safety categories go to vetted, contracted, legally-bound experts under strict protocol — never open bounty. General categories can take a broader pool.
- **Coordinated disclosure terms up front.** Agree *before* testing on who can publish what and when, tied to the fix-first / catastrophic-never decision tree ([reporting-and-disclosure](../principles/reporting-and-disclosure.md)). Disputes over disclosure timing are far worse discovered after a finding than before.
- **Deduplicate against internal findings.** External and internal efforts overlap; dedupe by mechanism ([finding-cluster-analyzer](../agents/finding-cluster-analyzer.md)) so you pay one bounty per real vulnerability and triage one ticket.
- **Legal and compensation clarity.** Safe-harbor terms so good-faith testing isn't legally exposed; clear bounty criteria tied to severity so payouts match real-world consequence, not cleverness ([severity-and-triage](../principles/severity-and-triage.md)).

## Common pitfalls

| Pitfall | Why it bites | Guard |
|---|---|---|
| Open bounty for catastrophic categories | Invites broad elicitation of the most dangerous content | Vetted, contracted experts only for those categories |
| Findings arrive on an open platform | Reproduction detail exposed by default | Secure, access-controlled intake |
| No dangerous-finding protocol for testers | A tester publishes or propagates a critical | Explicit stop-and-report ROE in the brief |
| Disclosure terms negotiated after a finding | Dispute during a live critical | Agree disclosure terms before testing |
| Bounty rewards cleverness | Incentivizes baroque low-severity findings | Tie payout to consequence-based severity |
| Duplicate payouts / triage | Same vuln paid many times | Dedupe by mechanism against internal set |
| No safe harbor | Deters good-faith testers or invites legal mess | Clear safe-harbor + scope terms |

## The trust-boundary reframe

Everything about external programs flows from one fact: you are inviting people *outside your trust boundary* to do your most sensitive activity. Every control above is a way to get the outside-view benefit while keeping the genuinely dangerous residue — reproduction detail for serious categories — inside a controlled perimeter. When a control decision is unclear, resolve it toward *less exposure of dangerous detail to less-vetted people*, and consult legal/policy ([cross-functional-coordination](../principles/cross-functional-coordination.md)).

## Related
- [reporting-and-disclosure](../principles/reporting-and-disclosure.md) · [severity-and-triage](../principles/severity-and-triage.md) · [program-design](../principles/program-design.md) · [cross-functional-coordination](../principles/cross-functional-coordination.md) · [finding-cluster-analyzer](../agents/finding-cluster-analyzer.md)
