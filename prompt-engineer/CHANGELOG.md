# Changelog

All dates are review/freshness dates. This is the fastest-moving domain in the series: prompting behavior that holds on one model version can weaken or invert on the next. **Check a doc's `Last reviewed` stamp and `Applies to` scope before trusting model-specific guidance.** Model-agnostic judgment (ambiguity discipline, versioning, regression testing) rots slowest; model-specific formatting preferences and structured-output behavior rot fastest.

## 1.0.0 — 2026-07-13

Initial release. Authored as a final knowledge transfer; guidance validated against the Claude 4.x–5 family (Fable/Opus/Sonnet/Haiku) and GPT-5-era models unless a doc states otherwise.

Added:
- `README.md`, `DESIGN.md`, `GLOSSARY.md`
- `principles/core-principles.md` — the 12 rules with the war stories that paid for them
- `principles/decision-trees.md` — few-shot vs. zero-shot, CoT or not, prompted vs. API-enforced structure, one call vs. two, with defaults
- `topics/clarity-and-specification.md` — ambiguity, competing instructions, under-specified format
- `topics/few-shot-examples.md` — selection, ordering, overfit-to-example-specifics, staleness
- `topics/reasoning-elicitation.md` — when CoT helps, when it just costs, trace-trust limits
- `topics/structured-output.md` — schema drift, real-world input degradation, format-vs-priors conflicts
- `topics/system-prompt-design.md` — role-setting altitude, patch accumulation, conflict archaeology
- `topics/versioning-and-regression-testing.md` — prompts as versioned artifacts, change attribution
- `topics/multi-agent-prompt-workflows.md` — planner/implementer/reviewer splits and fan-out for prompt work
- `extended/cross-model-portability.md`, `extended/injection-aware-structure.md`, `extended/cost-and-token-efficiency.md`, `extended/multi-turn-design.md`
- `guides/build-a-production-prompt.md` — capability A, start-to-finish
- `guides/audit-an-existing-prompt.md` — capability B, phased protocol
- skills: `prompt-clarity-reviewer` (+ `checklist.md`), `few-shot-example-auditor`
- subagents: `edge-case-behavior-scanner`, `prompt-version-differ`

Maintenance contract for future editors:
1. Any doc whose model-specific claims you re-validate: bump its `Last reviewed` date and log it here.
2. New model family adopted in production → re-run `extended/cross-model-portability.md` §"transfer audit" against the docs' claims; log deltas here.
3. Never edit a rule without reading its war story; if the story no longer reproduces on current models, record that here *before* softening the rule.
