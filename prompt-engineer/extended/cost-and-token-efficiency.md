# Cost & Token Efficiency in Prompt Design

**Last reviewed:** 2026-07-13 · **Applies to:** Claude 4.x–5, GPT-5-era APIs. Extended tier: production patterns + pitfalls. Pricing ratios and cache mechanics are provider-specific and rot fast — verify current numbers (`claude-api` reference for Claude) before quoting them in a design doc.
**Scope wall:** system-level cost work (model-tier selection, routing, batching, caching architecture) is `@ai-engineer/topics/cost-and-latency.md`. This doc owns what the *prompt author* controls: the tokens in the template and the tokens the prompt causes the model to emit.

The pricing fact that orders all priorities here: **output tokens cost several times input tokens, and the prompt controls both.** A verbose instruction costs its own length once per request; an instruction that makes the *model* verbose costs multiples of that, forever. Optimize output shape first, prompt length second, and never optimize either at clarity's expense — one regression from an over-trimmed prompt costs more than a year of the tokens it saved.

## Production patterns

**1. Output is the expensive side.** The highest-leverage edits, in descending order:
- Cap and shape the output: explicit length bounds ("at most three sentences"), skeleton-anchored structure, and — the big one — no CoT on tasks where the eval says it's flat (`topics/reasoning-elicitation.md` §1: the compliance-check team paying triple latency for −1 point of accuracy).
- Kill politeness scaffolding: "Here is the JSON you requested:" preambles and closing summaries are pure cost *and* parser hazards — the same fix (`topics/structured-output.md` §1's "output nothing else, positioned last") serves both masters.
- Don't request fields nobody consumes. Audit the schema against actual downstream readers annually; dead fields accrete like patches do.

**2. Stable prefix = cacheable prefix.** Provider prompt caching bills cached prefix tokens at a fraction of the fresh rate, and it keys on *exact* prefix bytes. Layout consequence: everything static (system prompt, policy, examples, schema) first and byte-stable; everything volatile (timestamp, request ID, user data) after the last cache breakpoint. The classic self-inflicted wound: a `Current time: 2026-07-13T09:14:07Z` line — or a randomly-ordered metadata dict — interpolated *into the system prompt*, silently disabling caching on every request. If the model needs the time, put it in the user turn; if the serializer doesn't sort keys, make it. (Cache mechanics and TTLs: provider docs / `@ai-engineer/topics/cost-and-latency.md`.)

**3. "Just in case" context doesn't pay rent.** Reference material included speculatively — the full style guide when three rules apply, ten few-shot examples where the eval shows two suffice, boilerplate copied from a sibling prompt "for consistency" — costs on every request and *dilutes attention* on the instructions that matter (`principles/core-principles.md` rule 9: instructions tax each other; so does context). The test for every block: name the regression case that fails without it. Can't name one? It's a deletion candidate — verify by running the set without it, which takes minutes and settles the argument.

**4. Trim with the regression set open, or not at all.** Compression is a behavior change. Prompt edits are non-local (`topics/versioning-and-regression-testing.md` §2), and deletions are edits: the "redundant" sentence was sometimes the one holding an edge case down — that's precisely how it got added (rule 9's accretion, run in reverse without the incident history). Every trim is a version, regression-gated like any other change. The efficient workflow: trim in batches, run the set per batch, keep the batches that hold.

## Common pitfalls

- **Compressing into ambiguity.** Terse reads clean and underspecifies: "output the date" *is* the compressed version of the invoice-extractor spec, and it cost a month of inconsistency (`topics/clarity-and-specification.md` §1). Specification tokens are the last tokens to cut, and the model's per-request improvisation on an under-specified task frequently emits *more* output tokens than the specification would have cost.
- **Repeating instructions as a compliance strategy.** Stating a rule three times because "it wasn't being followed" pays triple rent for a fix that usually isn't the fix — noncompliance is usually position (move it: rule 10), conflict (another rule disagrees: `topics/clarity-and-specification.md` §2), or example contradiction (`topics/few-shot-examples.md` §4). Repetition also breeds the §3 system-prompt failure: three copies that drift apart under editing.
- **Example bloat.** Few-shot examples are the largest line item in most templates. Each one past the point of measured benefit is pure cost — the zero-shot fork (`principles/decision-trees.md` §1) is a cost decision as much as a quality one, and current frontier models need fewer examples than the prompt you inherited assumes.
- **Optimizing the cheap side.** A week shaving 200 template tokens while every response carries an unrequested 150-token explanatory preamble. Read the meter first: mean input and output tokens per request, by prompt version, before any trimming session. The version-stamped response logs from `topics/versioning-and-regression-testing.md` §3 give you this for free.

## Prevention

- Token telemetry per prompt version (input, output, cache-hit rate) on the same dashboard as quality metrics — cost regressions are regressions.
- Cache-hit rate alarms on prompt deploys: a layout change that breaks prefix stability shows up as a step function within the hour.
- The prompt-change checklist asks both directions: "does this add tokens that don't pay rent?" and "does this trim tokens that were paying rent?"
