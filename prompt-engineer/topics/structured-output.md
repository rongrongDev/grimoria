# Structured Output

**Last reviewed:** 2026-07-13 · **Applies to:** Claude 4.x–5, GPT-5-era models. Schema-enforcement API features change per provider release — verify current capabilities against provider docs (for Claude: the `claude-api` reference or Anthropic docs) before relying on specifics here.
**Read this when:** any code will parse what the model emits.
**Fork:** prompted vs. API-enforced structure — `principles/decision-trees.md` §3 · **Worldview:** `principles/core-principles.md` rule 8.

The framing that keeps you honest: a format constraint is a fight you're picking with the model's training priors (prose, markdown, helpful preambles). You win that fight *most* of the time, and "most" multiplied by production volume is a pager. So: **enforce syntax mechanically where the API allows, spend prompt effort on semantics, and validate downstream regardless** — the prompt-only path is for prototypes and formats no API feature can express.

---

## 1. Schema drift — requested shape vs. reliably produced shape

**Failure mode.** A gap opens between the schema the prompt describes and what the model emits at some percentile: field names in the wrong case, optional fields omitted vs. nulled inconsistently, enums returned as prose paraphrases ("high priority" for `HIGH`), numbers as strings, an extra `notes` field the model finds helpful, single object where the schema said array-of-one. Each variant parses in some consumers and breaks others, so the drift surfaces as scattered downstream weirdness rather than one clean failure.

**War story.** A prompt described its schema in prose: "return the priority (high, medium, or low), the assignee, and the due date." Production yielded `"priority": "High"`, `"Priority": "high"`, `"priority_level": "medium"`, and — memorably — `"priority": "medium-high (leaning high)"`. Every one was a *reasonable reading of a prose spec*. The fix was not stronger wording; it was a literal skeleton plus enum-value definitions, and eventually a tool schema that made the wording moot.

**Detection.**
- **Conformance telemetry:** validate every production response against the schema and log failures with the diff. Parse-failure rate per thousand requests is the vital sign; a prompt team without it is flying blind (this is the same instrument as `topics/clarity-and-specification.md` §3).
- Distinguish syntax drift (invalid JSON — API enforcement deletes this) from *semantic* drift (valid JSON, wrong content: enum paraphrases, null-vs-empty confusion, unit changes). Semantic drift survives JSON mode; measure it separately with field-level checks.
- In review: prose-only schema description with no literal skeleton = a finding, always.

**Fix.**
1. **API enforcement for syntax** (tool schema / JSON mode / grammar). Non-negotiable default when a parser consumes the output.
2. **Prompt owns semantics**: define each field's meaning, each enum value's boundary ("`HIGH` = customer-facing outage or data loss; not merely 'urgent-sounding'"), null-vs-empty-vs-omitted policy, units, timezones. Enforcement guarantees a valid envelope; only the prompt governs what goes in it.
3. **No API support** (exotic formats): literal skeleton with placeholder values, one example, "output nothing before or after," positioned last (rule 10). Accept a residual break rate and build the repair path (§ below).

**Prevention.** The schema is a versioned artifact shared by prompt and validator — one source of truth, both generated from it, so they cannot drift apart *from each other*. Regression cases assert field-level semantics, not just parseability.

## 2. Works in testing, degrades under real-world input variety

**Failure mode.** The prompt held format perfectly across two weeks of testing — on clean, typical inputs. Production brings the tail: enormous inputs, empty inputs, inputs in other languages, inputs *containing* JSON or markdown or things that look like instructions, inputs where the task is impossible. Format adherence degrades exactly there, because unusual inputs drag the model off-distribution and its priors (explain, apologize, improvise) reassert themselves. The model that emitted clean JSON for "summarize this memo" emits "I notice this document appears to be empty. Would you like…" for the degenerate case — a perfectly helpful response and a parser exception.

**War story.** An extraction pipeline: 0 parse failures in testing, ~2% in production week one. Every failure was an input the test set never represented — scanned-gibberish OCR, a document in Portuguese, one document that itself contained a JSON code sample the model helpfully merged with its output format. The prompt was fine on the distribution it was tested on. The test distribution was the fiction.

**Detection.**
- Slice conformance telemetry by input characteristics (length buckets, language, "task-impossible" flags). Degradation concentrated in a slice tells you which tail you never tested.
- Before ship: run the `edge-case-behavior-scanner` subagent with format-stress categories — degenerate inputs, format-colliding inputs (input contains the output format), oversized inputs, impossible-task inputs. Its per-category conformance table is this failure mode's pre-mortem.

**Fix.** Legislate the tail explicitly: the prompt must define output for *failure itself* — "if the input is empty, unreadable, or the task cannot be performed, output `{"status": "error", "reason": <enum>}` in the same schema." The single highest-yield structured-output fix in this KB: **give the model a schema-conformant way to fail**, because otherwise its only escape hatch is prose, and it *will* need an escape hatch. Wrap inputs in delimiters so input-embedded format can't bleed into output framing (`extended/injection-aware-structure.md` — same mechanism, different threat).

**Prevention.** The regression set permanently includes the degenerate battery (empty, oversized, wrong-language, format-colliding, impossible). Test-set realism is an eval-methodology discipline — `@ai-eval-engineer/` owns making offline distributions match production; the prompt-side duty is making sure *format cases* are in the set.

## 3. Format constraints that conflict with model tendencies → subtle corruption

**Failure mode.** The schema demands something the model's priors resist, and instead of breaking loudly, output *bends*: prose creeps into string fields ("`"name": "John Smith (as listed in the header)"`"), forbidden markdown appears inside values, a field ordering the model prefers overrides the one you specified, content gets subtly summarized to fit a structure it doesn't want to fit. Worst case: the model satisfies the *letter* of the schema by degrading the *content* — truncating a quote to dodge escaping, rounding numbers into "cleaner" strings. Corruption, not breakage: everything parses.

**War story.** A schema required verbatim quotes inside JSON strings. Quotes containing newlines and quotation marks came back subtly *paraphrased* — the model resolved the tension between "verbatim" and "clean JSON string" by silently editing reality so it would escape nicely. Parseability: 100%. Verbatim-ness: quietly gone, discovered a month later during an audit that compared quotes to sources. The fix moved quotes out of JSON entirely (delimited plain-text block + JSON metadata alongside) — *changing the format to one the model could satisfy honestly*, rather than escalating demands it would keep resolving dishonestly.

**Detection.**
- Content-fidelity checks, not just schema checks: verbatim fields diffed against source spans; numeric fields compared to source precision; string fields regexed for markdown/prose leakage.
- Smell in design review: any schema requiring the model to do something *hard inside a string* (verbatim multi-line text, embedded code, heavy escaping) is a §3 candidate before it ships.
- Eval cases specifically built from tension inputs: quotes with quotes in them, text containing braces, fields whose natural content is long where the schema implies short.

**Fix.** Negotiate with the priors instead of overpowering them:
- Flatten nesting; models emit shallow structures more faithfully than deep ones.
- Move prose-shaped content out of tight structure — XML-ish tagged blocks for long text, JSON for scalars, is a robust hybrid on Claude-family models.
- Match the model's natural field ordering where you don't actually care (fight only battles with stakes).
- If a field keeps corrupting, split the call: generate content first, structure it second (`principles/decision-trees.md` §5 — quality interference is a split criterion).

**Prevention.** Design-review question, asked verbatim: **"what will this schema make the model do when the content doesn't fit?"** Every schema field gets an answer or gets redesigned. The `edge-case-behavior-scanner` tension battery stays in the regression set forever — this failure mode returns with every schema change and every model upgrade (`extended/cross-model-portability.md`: adherence style is one of the least portable behaviors).

---

## The downstream contract (always, regardless of technique)

Prompt-level format adherence is probabilistic; the pipeline must be deterministic. Every structured-output consumer gets: a validator (schema + field-level semantic checks), a bounded repair path (one re-ask with the validation error, *then* fail — infinite retry loops burn budget hiding real defects), and telemetry on both. This paragraph is the boundary with `@ai-engineer/` — the pipeline architecture is theirs (`@ai-engineer/topics/hallucination-and-reliability.md`); knowing you owe them a break rate is yours.
