# Few-Shot Example Design

**Last reviewed:** 2026-07-13 · **Applies to:** Claude 4.x–5, GPT-5-era models. The mechanisms are general; the *magnitude* of example effects is larger on smaller models (Haiku-class) and older generations.
**Read this when:** adding examples to a prompt, or debugging a prompt whose examples predate its current instructions.
**Operationalized by:** skill `few-shot-example-auditor` · **Fork:** zero-shot vs. few-shot in `principles/decision-trees.md` §1.

The one-sentence theory: **examples are executable spec, and they outrank the prose.** In-context learning latches onto whatever pattern is most salient across the examples — which is the pattern they *actually share*, not the pattern you intended them to illustrate. Every regularity in your examples is a rule you are teaching, whether you know it or not.

---

## 1. Examples teach a narrower pattern than intended (overfit to example specifics)

**Failure mode.** The examples share an accidental regularity — all one class, all one length, all one domain, all resolving an edge case the same lucky way — and the model learns the regularity as law. Instructions say "classify sentiment"; the examples are all negative reviews; the model develops a negative thumb on the scale. Instructions say "summarize"; every example output is two sentences; two sentences is now the format, and no instruction wording will fully pry it loose.

**War story.** A sentiment classifier's three examples were all negative (the author had grabbed them from a bug report about missed negatives — selection bias at the source). Post-ship, the negative class was over-predicted by 11 points. The instructions were balanced and blameless; the examples were the operative spec. Rebalancing the examples fixed in one edit what three rounds of instruction-wordsmithing hadn't.

Subtler variants that recur: all examples have non-null values for an optional field (model hallucinates values rather than emit null — it's never *seen* a null); all examples come from one document template (model's accuracy silently craters on other templates); all example inputs are short (long inputs get truncated treatment).

**Detection.**
- **Shared-regularity audit:** for each attribute — class, length, domain, format, tone, null-usage, input length — check whether the example set *varies* it. Anything constant across all examples is being taught as a rule. This is the core move of `few-shot-example-auditor`.
- **Contrast probe:** run inputs that *should* break the accidental pattern (a positive review, a case demanding a long output, a null field) and check whether outputs comply with the instructions or with the examples.
- Class-balance check on eval results, sliced by whatever the examples over-represent.

**Fix.** Vary every attribute you don't intend to teach. If outputs should range from one sentence to a paragraph, the examples must demonstrate that range. If a field can be null, at least one example must show null. If two labels are commonly confused, include the near-miss pair. The examples should collectively span the *decision boundary*, not sit comfortably in each class's center.

**Prevention.** Examples enter the prompt only through the audit (skill, or its checklist by hand). The regression set includes anti-pattern cases: inputs that punish the model for following the accidental regularity rather than the instruction.

## 2. Ordering effects

**Failure mode.** The same examples in different orders produce different behavior. Two mechanisms: **recency** — the last example exerts the strongest pull on format and style (it's the closest anchor to generation); and **majority/position bias in classification** — models drift toward labels that appear late or often in the example sequence. Teams discover this when reordering examples "for readability" and watching the regression set flip cases.

**War story.** A triage prompt's examples ended with an `escalate` case because the author considered it the most important to show. Escalations ran ~8% over base rate. Moving that example to the middle — changing *nothing else* — brought the rate back down. The last example wasn't emphasized; it was *imitated*.

**Detection.**
- **Permutation test:** run the regression set under 3–4 example orderings. Score variance across orderings is your ordering-sensitivity measurement. (Cheap, and almost nobody does it.)
- Compare output-format fidelity against the last example specifically vs. earlier ones.

**Fix.**
- Put the example whose *output shape* you want imitated last — the recency slot is a feature; aim it deliberately.
- For classification, interleave classes rather than blocking them (`A A B B` teaches a different thing than `A B A B`), and don't end on a rare class.
- If ordering sensitivity stays high after this, the examples are underspecifying the task — the model is leaning on order because content doesn't disambiguate. Strengthen the spec or the example diversity; order-shuffling is a symptom fix.

**Prevention.** Pin example order in the versioned prompt artifact — order is behavior, so a reorder is a prompt change and gets a regression run like any other (`topics/versioning-and-regression-testing.md`). Note the intended anchor ("last example is last on purpose") in the prompt's version notes so a future tidier doesn't "alphabetize" it.

## 3. Insufficient diversity → edge cases uncovered

**Failure mode.** The examples all show the happy path. The model handles the happy path beautifully and improvises on everything else — absent fields, malformed input, boundary-straddling cases — precisely the inputs where you most needed the examples to legislate. Distinct from §1: there the examples teach a *wrong* narrow rule; here they simply *don't cover the territory* and leave the edge behavior to per-request invention.

**Detection.**
- **Coverage matrix:** rows = edge conditions the task spec acknowledges (missing field, multiple candidates, conflicting info, adversarial/junk input, boundary cases between labels); columns = examples. Empty rows are uncovered conditions. The auditor skill emits exactly this matrix.
- Production failure clustering: if failures cluster on input shapes no example resembles, this is your failure mode.
- Run the `edge-case-behavior-scanner` subagent — its category-wise failure characterization maps directly onto missing rows.

**Fix.** Budget examples by *informativeness*, not representativeness: one happy-path example is usually enough (the instructions carry the happy path fine); spend remaining slots on the decision boundary and the degenerate inputs. If the matrix has more rows than your token budget has example slots, cover the rest with explicit conditional instructions ("if the field is absent → …") — instructions are cheaper per edge case; examples are stronger per edge case. That tradeoff is `principles/decision-trees.md` §1.

**Prevention.** The coverage matrix lives next to the prompt in version control and is re-checked whenever the task spec grows a new edge condition. New production edge case → new matrix row → decide example vs. instruction → new regression case, in that order.

## 4. Stale examples

**Failure mode.** The task definition moved — new label added, format field renamed, policy changed — and the instructions were updated but the examples weren't (or vice versa). The prompt now disagrees with itself, and per the one-sentence theory, **the model follows the examples.** This is rubric-drift (see `GLOSSARY.md`), and it is the most common few-shot defect in prompts older than a quarter, because instructions are edited in place while examples are psychologically "done."

**War story.** A team added a `partial_refund` label to a claims classifier — instructions updated, five examples untouched. The model almost never emitted the new label: five examples unanimously demonstrated a four-label world, and unanimous examples beat a one-line instruction. Three weeks of "the model can't learn the new label" ended when someone diffed the examples against the label list. One example swap; problem gone.

**Detection.**
- **Consistency diff:** mechanically compare every example output against the *current* instructions and schema — would this exact output be graded correct today? Any "no" is rot. (Auditor skill, step 1 — it's the cheapest check with the highest hit rate.)
- Version-control heuristic: `git log` the prompt file; if instruction lines changed after example lines last did, audit before shipping anything else.
- Symptom signature: model persistently "ignores" a recently added instruction — check whether the examples unanimously demonstrate the old behavior.

**Fix.** Re-derive, don't patch: regenerate each example output by applying the current instructions honestly, rather than minimally editing old outputs (minimal edits preserve stale structure you've stopped seeing). Delete examples whose input scenarios no longer occur.

**Prevention.** Treat instructions + examples as one atomic artifact with one version: any instruction change forces an example review before the version can ship (make it a checklist item in the prompt-change PR template). The regression set must include cases that *only pass under the new definition* — those cases fail loudly while stale examples are still steering.

---

## Cross-references

- Whether to use examples at all: `principles/decision-trees.md` §1.
- Examples as format anchors vs. skeletons: `topics/structured-output.md` §1.
- Examples inside system prompts and their maintenance: `topics/system-prompt-design.md`.
- Mechanized audit: skill `few-shot-example-auditor`. Behavioral characterization at scale: subagent `edge-case-behavior-scanner`.
