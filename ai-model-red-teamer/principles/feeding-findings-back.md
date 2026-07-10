# Feeding Findings Back Into the Model

> **Version 1.0 — 2026-07-06.** Applies to: all programs. Read [core-principles](./core-principles.md), [robustness-evaluation](./robustness-evaluation.md), and [reporting-and-disclosure](./reporting-and-disclosure.md) first.

The output of red-teaming is a *changed model*, not a report ([core-principles](./core-principles.md) principle 7). This doc is about the loop that turns a finding into a shipped, verified fix — and the ways that loop silently fails. Most programs are better at finding than at fixing, and the gap is where the real risk lives: a program that finds everything and fixes nothing is theater.

---

## The three fix mechanisms

A finding can drive a change at three altitudes. Choosing the right one is the whole game.

### 1. Training-data / alignment changes (the base model)

Add examples that teach the model to refuse the *class*, then re-align. This is the deepest fix and the right one for vulnerabilities rooted in the model's behavior rather than the surrounding system.

**The trap:** if you add only the reported phrasing as a refuse-example, you have taught the model to refuse *that phrasing* — a phrasing patch that produces whack-a-mole ([robustness-evaluation](./robustness-evaluation.md)). The training data must represent the *class*: varied phrasings, languages, and framings spanning the generalization profile, so the model learns the boundary, not the tokens. This is why the generalization profile is a required report field ([reporting-and-disclosure](./reporting-and-disclosure.md)) — it *is* the spec for the training data.

### 2. Classifier / guardrail changes (the safety layer)

Update input/output classifiers or guardrail policies that sit around the model. Faster to ship than re-alignment and right for cases where the base model's behavior is hard to shift or where defense-in-depth is warranted. See [guardrail-classifier-robustness](../topics/guardrail-classifier-robustness.md).

**The trap:** guardrails are themselves attackable (that's an entire extended-tier topic), and a guardrail keyed on surface form is the same phrasing patch in a different layer. A guardrail fix and a base-model fix are complements, not substitutes; the strongest response often does both.

### 3. System-prompt / policy changes (the deployment)

Adjust the system prompt, instruction hierarchy, or usage policy. Fastest to ship, right for prompt-injection and instruction-hierarchy findings ([attack-taxonomy](./attack-taxonomy.md) classes 5–6) whose fix lives in the harness. Weakest in isolation — a determined attacker often works around a system-prompt-only defense.

**Choosing altitude:**
```
Is the vulnerability in how the base model behaves (persona, erosion, refusal)?
   → Training-data / alignment fix (deepest), often + guardrail for defense-in-depth.
Is it in an untrusted-input channel (injection via retrieval/tools)?
   → System / harness fix (trust boundary), + guardrail.
Is it something a classifier can reliably catch and the base fix is slow?
   → Guardrail fix now, base-model fix queued — but track both; guardrail alone
     is defense-in-depth, not closure.
Whichever you pick: verify against the generalization profile, not the phrasing.
```

## Verification is the fix — not a step after it

A fix you have not verified against the generalization profile is a *hypothesis*, not a fix. The verification asymmetry from [robustness-evaluation](./robustness-evaluation.md) applies in full: driving the reported phrasing to refusal is trivial and proves nothing; showing the *neighborhood* stays defended is the only proof.

**The verification loop:**
1. Take the finding's generalization profile (the axes along which it failed).
2. After the fix, re-probe *the whole profile*, not the single point.
3. If the ASR dropped across the profile → the class is (more) closed. Record it.
4. If the ASR dropped only at the point → phrasing patched, class open. Say so explicitly; do not mark the finding fixed.
5. Re-probe adjacent classes: a fix can *displace* a vulnerability to a neighboring mechanism rather than closing it.

This is the reasoning [fix-verification-tracer](../agents/fix-verification-tracer.md) performs — it checks whether a claimed fix generalizes, by reasoning about the mechanism, without generating new attacks.

**The regression risk:** a fix for one category can degrade another (over-refusal in an adjacent benign area, or a new gap opened by the alignment shift). Verify the fix did not *create* problems — differential testing across the pre/post checkpoints ([differential-testing](../topics/differential-testing.md)) is how you catch this. A fix that closes category A while opening category B or making the model uselessly over-cautious is not a win.

## Closing the loop on the coverage matrix

Every verified fix updates the coverage matrix ([program-design](./program-design.md)): the cell moves from "vulnerable" to "probed-and-generalization-verified." An unverified fix does *not* earn that annotation — it stays "vulnerable, patch attempted." This keeps the matrix honest about what is actually defended versus what merely has a closed ticket.

## Why findings die in the backlog (and how to prevent it)

The common failure is not bad fixes; it is *no* fixes — findings that sit because the loop has no owner or no path to the training/classifier/policy teams. See [cross-functional-coordination](./cross-functional-coordination.md) for the organizational fix. The red-team-side prevention:
- Every finding above LOW gets a *named fix owner* on the other team at triage time, not "someone will pick it up."
- The red team owns *verification*, so it has standing to say "not fixed" and reopen — verification cannot be owned by the team that shipped the fix, or "fixed" means "closed the ticket."
- Track *time-to-verified-fix* per severity as a program health metric, not time-to-report. A backlog of "reported" findings with no "verified-fixed" throughput is a failing loop regardless of finding volume.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Only reported phrasing added to training | Class resurfaces reworded | Train on full generalization profile | Profile is the training-data spec |
| Fix marked done, never verified | "Fixed" findings recur in deployment | Verify across profile before closing | Red team owns verification, not fixer |
| Guardrail patch mistaken for closure | Base model still vulnerable underneath | Add base-model fix; keep guardrail as depth | Track altitude; guardrail-alone ≠ closed |
| Fix opens a new gap | Adjacent category regresses; over-refusal | Differential pre/post testing | Mandate regression check on every fix |
| Findings die in backlog | High report volume, low verified-fix rate | Named owner at triage; track time-to-verified | Loop ownership + throughput metric |

## Related

- The generalization profile that specifies the fix: [robustness-evaluation](./robustness-evaluation.md)
- Where the profile comes from in the report: [reporting-and-disclosure](./reporting-and-disclosure.md)
- Reasoning about whether a fix generalized: [fix-verification-tracer](../agents/fix-verification-tracer.md)
- Guardrail-layer fixes: [guardrail-classifier-robustness](../topics/guardrail-classifier-robustness.md)
- Catching regressions a fix introduces: [differential-testing](../topics/differential-testing.md)
- Making the org actually act on findings: [cross-functional-coordination](./cross-functional-coordination.md)
