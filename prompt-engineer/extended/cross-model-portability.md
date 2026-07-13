# Cross-Model Portability

**Last reviewed:** 2026-07-13 · **Applies to:** transfers among Claude 4.x–5, GPT-5-era, Gemini-class, and open-weight families. Extended tier: production patterns + pitfalls; specifics here rot fastest of any doc in this KB — treat every named behavior as "verify on current versions."
**Read this when:** swapping model families, upgrading versions, or writing prompts that must serve multiple models.

The rule that governs everything here (`principles/core-principles.md` rule 12): **a prompt's behavior is an empirical fact about a specific model version.** The prompt is half the program; the model is the interpreter — and unlike CPU instruction sets, these interpreters differ in undocumented, distributional ways that no changelog enumerates.

## What transfers, what doesn't

**Transfers well (invest here):** clarity and full specification; explicit edge-case and uncertainty rules; trusted/untrusted delimiting; task decomposition; a good regression set (the *most* portable artifact you own — it's model-independent by construction, and it's what *measures* everything below).

**Transfers unreliably (re-validate per family):** formatting-instruction style (Claude models respond strongly to XML-ish tags; other families lean markdown/JSON-schema conventions); system-prompt authority (how firmly system outranks user/data varies by family — defensive structure that holds on one can be softer on another); CoT benefit (native-reasoning models make prompted CoT redundant or counterproductive; smaller models may still need it spelled out); schema adherence under stress (`topics/structured-output.md` §3's "how does it bend" is family-specific); verbosity and preamble tendencies; refusal thresholds and safety-boundary phrasing; few-shot sensitivity (smaller models lean on examples harder — a prompt tuned zero-shot on a frontier model may need examples added downmarket, and vice versa).

**Pitfall — "it's the same vendor."** Version-to-version shifts within a family break prompts too (rule 12's war story: a same-family upgrade, no prompt change, −6 points for two weeks). "Minor version" describes the API contract, not the behavior distribution.

## Production patterns

**The transfer audit.** Moving a prompt to a new model, in order — the sequence matters because each step's failures contaminate the next step's diagnosis:
1. Run the full regression set on the new model, unchanged prompt. The flip table (which cases, which direction) is your migration worklist — this is a `prompt-version-differ` run with the model as the "version," fan-out pattern per `topics/multi-agent-prompt-workflows.md` §2.
2. Triage flips into: format drift (usually cheap to fix — re-anchor the skeleton), edge-case behavior changes (re-legislate per `topics/clarity-and-specification.md`), capability differences (the new model genuinely can't/won't — a model-selection question, punt to `@ai-engineer/principles/decision-trees.md`).
3. Fix in that order; re-run after each batch, one concern per version (`topics/versioning-and-regression-testing.md` §3).
4. Re-run the degenerate battery and format-stress categories even if happy-path cases all pass — adherence-under-stress is the least portable behavior of all.

**One prompt, many models.** If a single template must serve several models: write to the *intersection* (full explicitness, no family-specific idiom as load-bearing structure), keep any family-specific tuning in small per-model overlay sections rather than forked templates (forks drift apart within a quarter, and every future edit must be made N times), and maintain one regression set with per-model baselines.

**Pinning discipline.** Production artifacts name exact model IDs, never `-latest` aliases. An alias is a model migration you didn't schedule, running the transfer audit's step 1 in production with customers as the regression set.

## Prevention checklist

- Every prompt artifact states the model ID it was validated against (the `model:` field in the versioned artifact — `topics/versioning-and-regression-testing.md` §1).
- Model upgrades travel alone: never bundled with prompt edits, or the flip table attributes to nothing.
- Regression set re-run is the *precondition* for moving traffic, not the follow-up.
- Budget real time for migrations: the honest planning number for a nontrivial production prompt is days of triage-and-fix, not the hour the API swap takes. Teams that budget the hour ship the −6 points.
