# Prompt Versioning & Regression Testing

**Last reviewed:** 2026-07-13 · **Applies to:** model-agnostic discipline; tooling examples are plain-git and provider-neutral.
**Read this when:** setting up prompt infrastructure, or after your first "who changed the prompt?" incident — ideally before.
**Worldview:** `principles/core-principles.md` rules 1, 6, 12 · **Eval methodology (metrics, judges, statistics):** `@ai-eval-engineer/` — this doc owns only the prompt-side discipline.

The whole doc in one sentence: **a prompt change is a deploy, and it gets what deploys get — version control, a test gate, attribution, and rollback.** Teams that treat prompts as config strings rediscover, one incident at a time, every reason software engineering invented those four things.

Why prompt changes need this *more* than code changes, not less: edits are non-local (a sentence added for case A shifts cases B–Z, because every token conditions every output token), effects are probabilistic (a regression can hide in a 10% flip rate that eyeballing three outputs won't catch), and there's no compiler — the only error surface is behavior.

---

## 1. Prompts as untracked strings

**Failure mode.** The production prompt lives in a dashboard text field, a database row, or a constant someone edits in place. No history, no diff, no review, no link between prompt state and the traffic it served. When behavior shifts, the investigation starts from "what is the prompt even, right now, and is it what staging has?"

**War story.** Rule 1's price tag, in full: output quality dropped Tuesday; the team spent three days investigating a suspected model-side regression — provider status pages, token-level analysis, the works. The actual cause: a colleague had hotfixed one adjective in the dashboard prompt field on Monday night to appease a single customer complaint. No history existed to consult; the edit was invisible until someone thought to ask aloud whether anyone had touched the prompt. Three engineer-days for a `git log` that didn't exist.

**Detection.** You have this failure mode if any of these is true: the production prompt can be edited without a second person seeing a diff; you cannot reconstruct the exact prompt that served a given request last month; staging and production prompt equality is assumed rather than checked. (Most teams: all three.)

**Fix.** Prompts are files in the repository — reviewed, merged, deployed like code. The versioned artifact must capture everything that determines behavior, because *the prompt text is only part of the program*:

```yaml
# prompts/invoice-extractor/v14.yaml
id: invoice-extractor
version: 14
model: claude-sonnet-4-6          # pinned ID, not an alias — aliases move silently
params: {temperature: 0, max_tokens: 1024}
schema_ref: schemas/invoice.json   # one source of truth, prompt + validator both
system: |
  ...
template: |                        # slots explicit, assembly reviewable
  ...{{document}}...
changelog: >
  v14: defined "date" as issue date per INC-4412; added null rule.
  Regression: 47/47 (was 44/47 on v13 edge slice).
```

Runtime loads by version; responses are logged with the version that produced them. If business owners must edit prompts through a UI, the UI writes commits — the review-and-history requirement is the invariant, not the file format.

**Prevention.** Close the side doors: production prompt sources are read-only except via the pipeline. Alias model IDs (`-latest`) are banned in the artifact — a moving interpreter under a pinned program is rule 12's war story (the silent model upgrade that cost 6 points for two weeks).

## 2. Changes deployed without regression testing

**Failure mode.** The edit fixes the case in front of you; nobody re-runs the cases behind you. Non-locality does the rest: the sentence added to stop over-summarizing also stops the (desired) terseness on short inputs; the new edge-case rule subtly reweights the label distribution. The regression ships, gets found in production weeks later, gets "fixed" — frequently by re-introducing what the first edit removed. Teams without regression sets oscillate between the same two defects for quarters and experience it as bad luck.

**War story.** A team fixed a "responses too long" complaint by adding "be extremely concise." Three weeks later: "extraction summaries are missing required details" — the conciseness rule had bled into the extraction path served by the same prompt. The next fix ("be thorough and complete in extractions") partially resurrected the verbosity. Two more swings before someone pinned both behaviors in a case set that made the tradeoff *visible in one table*, at which point the actual fix (separate length rules per path, ten minutes of work) became obvious.

**Detection.** The failure is procedural, so detect procedurally: can a prompt edit reach production without a recorded pass against a pinned case set? Yes → active failure mode, regardless of how careful everyone feels. Retrospective tell: recurring incident pairs that alternate (long/short, strict/lenient, formal/casual) — that's the oscillation signature.

**Fix.** A regression set per production prompt. Minimum viable is genuinely small — **~20 cases beats zero by more than 200 beats 20**:
- Happy-path representatives (a handful)
- Every edge case the spec had to resolve — missing fields, multiple candidates, conflicts (`topics/clarity-and-specification.md` §1 generates these)
- The degenerate battery — empty/oversized/wrong-language/impossible inputs (`topics/structured-output.md` §2)
- **One case per production incident, added before its fix** — the fix must flip the case red-to-green, proving both that the case captures the bug and the fix works. This is the prompt version of test-driven bugfixing, and it's the rule teams abandon first and regret most.

Pass criteria as deterministic as the task allows (exact match, schema conformance, field checks); judge-graded criteria where unavoidable, built per `@ai-eval-engineer/principles/llm-as-judge.md`. Run pre-merge; nondeterministic tasks get n>1 runs per case with a flip-rate budget, because a single green run of a coin-flip case is noise wearing a checkmark.

**Prevention.** The gate is mechanical (CI on the prompt directory), not devotional. Budget reality: 20 cases × a few cents ≈ the cheapest insurance in the stack; if judge-graded cases make runs expensive, tier the set (deterministic subset per-commit, full set pre-release — tiering strategy per `@ai-eval-engineer/principles/cost-and-scalability.md`).

## 3. No attribution — behavior changed and nobody can say why

**Failure mode.** Output shifted. Was it the prompt edit? Which of the three that shipped this week? The model version? A params change? An input-mix drift? Without attribution machinery, the answer is a meeting instead of a query — and the meeting usually convicts the wrong suspect, because the loudest recent change gets blamed while the actual cause (a "trivial" wording tweak, a silently-moved model alias) sits unexamined.

**Detection.** Ask, for the last behavior incident: how long from "something changed" to "this specific edit changed it," and was the answer *demonstrated* (case-level before/after diff) or *argued*? Hours-and-argued means this section is unfinished business.

**Fix.** Three mechanics, then the discipline:
- **One change per version.** A version that edits the wording *and* the examples *and* bumps the model can never be attributed. Batch nothing you might need to unwind separately; model upgrades especially travel alone (rule 12).
- **Version-stamped response logs** — prompt version, model ID, params on every logged response, so "when did it change" reduces to a query.
- **Case-level diffing between versions** — aggregate scores hide offsetting flips (three fixed, three broken, delta zero). The unit of attribution is *which case flipped, in which direction, on which edit*. This is exactly the `prompt-version-differ` subagent's job: run both versions over the regression set, return the flip table mapped to the textual diff, keep the 2N transcripts out of your context.
- The discipline: bisect over prompt versions like over commits. Possible if and only if §1 was done — versions must be checkoutable and re-runnable.

**Prevention.** The changelog entry format from §1's artifact ("what changed, why, regression delta") is what makes future attribution instant: the answer to "why does v14 behave this way" is written at v14 time, when it's cheap, not reconstructed at incident time, when it isn't.

---

## The lifecycle, assembled

```
spec change / incident
  → regression case added FIRST (red)
  → prompt edited (one concern)          topics/clarity-and-specification.md
  → clarity + example audit               skills: prompt-clarity-reviewer,
                                                  few-shot-example-auditor
  → regression run (green, incl. old cases)
  → case-level diff vs. current prod      agent: prompt-version-differ
  → version stamped, changelog written, merged, deployed
  → production telemetry (parse rate, drift)   topics/structured-output.md
       └── new incident → top of loop
```

Model upgrades run the same loop with the model as the "edit" — full regression on the new interpreter before traffic, per `extended/cross-model-portability.md`. Building the set for a brand-new prompt from scratch: `guides/build-a-production-prompt.md` phase 4.
