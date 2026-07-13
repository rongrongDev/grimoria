# Clarity & Specification

**Last reviewed:** 2026-07-13 · **Applies to:** model-agnostic (this is the slowest-rotting doc in the KB — ambiguity hurts every model ever shipped).
**Read this when:** writing any prompt that runs more than once, or debugging output that varies across similar inputs.
**Operationalized by:** skill `prompt-clarity-reviewer` · **Worldview:** `principles/core-principles.md` rules 2–4.

The core mechanism to internalize: **every decision the prompt doesn't make, the model makes per-request, independently, with no memory of how it decided last time.** Ambiguity is therefore not a quality issue — it's a *determinism* issue. It produces the worst kind of bug: defensible-but-different outputs that pass any single-case review and fork behavior only in aggregate.

---

## 1. Ambiguous instructions → inconsistent output

**Failure mode.** A noun or verb in the instruction admits multiple reasonable readings. Each request resolves it independently. Symptoms downstream: intermittent parsing failures, users reporting behavior nobody can reproduce, eval scores that jitter without any change.

**War story.** The canonical one: an invoice extractor instructed to output "the date." Invoices carry an issue date, a due date, sometimes a service date. On ~15% of documents the model's pick differed from its pick on a near-identical document the day before. Every individual output was defensible. The aggregate was chaos. One word — "the issue date, in ISO 8601; if absent, output `null`" — ended it.

The generalization: ambiguity hides in words the author reads as obvious because they carry context the prompt doesn't. "Summarize" (how long? for whom? preserving what?). "Relevant" (to what criterion?). "Recent" (relative to when?). "The customer's name" (billing contact? account holder? the person in the email signature?).

**Detection.**
- **Variance probe:** run the prompt on 20 paraphrases/near-duplicates of one scenario at temperature 0; diff outputs. Variation that survives temperature 0 is specification variance, not sampling noise.
- **Defensible-but-different triage:** in eval failures, separate "the output is wrong" from "the output is a different reasonable reading." The second pile is your ambiguity backlog.
- **Ignorance simulation:** hand the prompt (nothing else) to a colleague or a smaller model and ask them to do the task. Every clarifying question they ask is a decision the model currently makes alone. This is the single highest-yield review technique in the discipline, and it's what `prompt-clarity-reviewer` mechanizes.

**Fix.** For each ambiguity: make the decision, in the prompt, once. The checklist of decisions most task prompts owe:
- Which candidate, when several qualify (first? most recent? highest-confidence?)
- What to output when the answer is absent (`null`? empty string? a specific sentinel? — never leave "absent" undefined; the model will improvise a different apology each time)
- What to do when candidates conflict
- Units, timezone, casing, language, length bounds — down to the level a parser or a style guide would enforce
- **The uncertainty clause:** "if you cannot determine X from the input, do Y." The model *will* hit uncertainty; without this clause, its coping strategy is per-request improvisation.

**Prevention.** Every ambiguity resolved becomes a regression-set case *before* the prompt fix ships (missing field, two candidates, conflicting info). The spec and the eval grow together; see `topics/versioning-and-regression-testing.md`. New prompts pass the ship gate in `principles/decision-trees.md` §8.

## 2. Competing instructions → unpredictable resolution

**Failure mode.** Two instructions in one prompt pull opposite directions — "be concise" and "explain your reasoning fully"; "always cite a source" and "never mention documents to the user"; "match the user's tone" and "maintain a formal register." The model doesn't error on contradiction; it *resolves* it, silently, differently per request, weighting whichever instruction is nearer, more recent, more concrete, or reinforced by an example.

**War story.** A support-bot system prompt, grown by patch accumulation, contained "always offer a callback option" (added after a March complaint) and "never offer callbacks during high-volume periods" (July), with "high-volume" undefined and no precedence stated. The model alternated between behaviors on identical inputs. Each sentence had an owner; the *pair* had none. Full treatment of the accumulation dynamic: `topics/system-prompt-design.md` §2.

Competing instructions are worse than ambiguity because they're distributed — no single sentence is wrong, so no single-sentence review catches them. And a large fraction of "the model ignored my instruction" bug reports are actually this: it obeyed your *other* instruction.

**Detection.**
- **Pairwise conflict scan:** list every imperative in the prompt; check pairs for tension. Tedious by hand, fast for a model — this is `prompt-clarity-reviewer` step 3.
- **Symptom signature:** the model obeys instruction A on some requests and B on others, and both appear in the prompt. That's not noncompliance; that's a coin flip you wrote.
- Instructions containing "always"/"never" deserve special scanning — absolutes are the usual colliders.

**Fix.** Don't soften both instructions into mush ("generally try to offer callbacks when appropriate" — now it's ambiguous *and* weak). Instead: (a) establish precedence explicitly ("rule 3 overrides rule 7 when they conflict"), or better (b) merge the pair into one conditional rule with the condition defined ("offer a callback unless the queue-status field in the request context is `high`"). If the condition can't be defined, the *policy* is unresolved — that's a stakeholder question, not a prompt-wording question, and no wording will fix it.

**Prevention.** Every rule added to a prompt is checked against existing rules for collision (the review habit that dies first under deadline pressure — hence the skill). Keep a rule inventory in the prompt's version notes with each rule's motivating incident; rules whose motivations have expired get *deleted*, not accumulated.

## 3. Under-specified output format → downstream parsing failures

**Failure mode.** The prompt says "output JSON" or "list the items" and stops. The model chooses field names, nesting, casing, code-fence wrapping, preamble text ("Here is the JSON you requested:"), null-handling — and re-chooses per request. The parser downstream was written against the format seen in testing, which was one draw from a distribution.

**War story.** A pipeline parsed a model's "JSON output" for six weeks. The prompt never showed the schema. One day ~2% of responses arrived with a courteous preamble sentence before the brace — nothing changed except input mix; chattier inputs elicited chattier outputs. The parser threw; the on-call learned the prompt had specified the format with the single word "JSON."

**Detection.**
- Parser error rate over time is the direct signal — if you're not measuring parse failures per thousand requests, you have this failure mode and no detection.
- Grep production outputs for known format-drift signatures: leading prose before structure, code fences, trailing commentary, field-name variants.
- In review: if the prompt requests structure but contains no *literal skeleton* of that structure, flag it. Prose descriptions of format are the weakest anchor.

**Fix.** In order of strength:
1. **API-level enforcement** when output feeds a parser — tool/function schema, JSON mode (`principles/decision-trees.md` §3). This deletes the syntax problem; the prompt still owes semantics (field meanings, null-vs-empty, enum boundaries).
2. **Literal skeleton** in the prompt — the exact shape with placeholder values, not a description of the shape. Models copy anchors far more reliably than they follow adjectives.
3. **The closing sentence** "Output only the JSON object — no explanation, no code fences, no text before or after," positioned *last* (rule 10: the tokens nearest generation pull hardest).
4. A downstream validator with a bounded repair path regardless — prompt-level adherence is probabilistic; plan for the tail.

**Prevention.** Format specification is part of the prompt's contract and lives in the regression set: cases assert *parseability and schema conformance*, not just content. Any format change is a versioned, regression-tested prompt change like any other. Deep treatment: `topics/structured-output.md`.

---

## Review checklist (the portable version)

1. Every noun that selects among candidates: is the selection rule stated?
2. Every absent/uncertain/conflicting-input path: is the behavior defined?
3. Any two imperatives in tension? Precedence stated?
4. Does an output-format request come with a literal skeleton or enforcement?
5. Would a colleague, given only this text, ask a question? Then the model is guessing.
6. Do instructions and examples agree? (If not, the examples win — `topics/few-shot-examples.md` §1.)

The full mechanized version with severity ratings: skill `prompt-clarity-reviewer`.
