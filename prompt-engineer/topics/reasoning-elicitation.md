# Reasoning Elicitation

**Last reviewed:** 2026-07-13 · **Applies to:** Claude 4.x–5 (including extended-thinking modes), GPT-5-era reasoning models. This doc rots fast: native reasoning modes have absorbed much of what prompted CoT used to do, and each generation shifts the boundary. Re-validate the §1 decision empirically on your model.
**Read this when:** deciding whether a task needs chain-of-thought, or when someone proposes trusting a reasoning trace.
**Fork:** `principles/decision-trees.md` §2 · **Worldview:** `principles/core-principles.md` rule 7.

Two facts hold simultaneously and teams keep collapsing them into one:
1. Eliciting intermediate reasoning **genuinely improves accuracy** on tasks with multi-step structure — math, planning under constraints, multi-hop inference.
2. The elicited trace is **output shaped like reasoning**, produced by the same next-token machinery as everything else — not a transcript of the computation that produced the answer.

Use fact 1. Never build process on a denial of fact 2.

---

## 1. CoT applied to tasks that don't need it — verbosity without accuracy

**Failure mode.** "Think step by step" gets pasted into every prompt as folk magic. On lookup, extraction, formatting, and most single-hop classification, it adds latency and token cost while moving accuracy not at all — and on some classification tasks it *hurts*: the model's immediate answer was right, and three paragraphs of generated deliberation talk it into a hedge or a flip. Meanwhile the verbose output feels rigorous, so nobody questions it.

**War story.** A team added CoT to a yes/no compliance check "for safety." Latency tripled. Accuracy moved from 91% to 90% — within noise, except for a new failure class: the model would correctly identify the violation in step 2, then reason itself into "however, context suggests this may be acceptable" by step 5. The un-CoT'd prompt never exhibited the talk-itself-out-of-it failure. They removed CoT and kept a one-line "answer, then one sentence of justification" for auditability — different tool, different job.

**Detection.**
- The only detection that counts: **run the eval with and without.** 30–50 cases, same everything else, diff accuracy, latency, cost. This fork is cheap to measure and perpetually guessed at instead.
- Smell: reasoning sections that restate the input and the instructions rather than deriving anything. Restatement is the signature of CoT applied to a task with no steps to reason through.
- Cost telemetry: output-token count per request against accuracy per request. Paying triple for a flat line is this failure mode in one graph.

**Fix.** Remove CoT where the eval says it's flat; keep the tokens for tasks that earn them. If you need *auditability* rather than accuracy — a human wants to see why — ask for a one-sentence justification *after* the answer, which doesn't gate the answer on generated deliberation. On models with native reasoning modes, prefer the mode over prompted CoT and set its budget deliberately rather than maximally.

**Prevention.** House rule: no reasoning elicitation ships without an A/B eval attached to the prompt's version notes. "We added CoT" must come with "and it bought us X points for Y tokens," or it's decoration. (Eval mechanics: `@ai-eval-engineer/`.)

## 2. Plausible traces that don't reflect the real decision process

**Failure mode.** The trace reads as a sound derivation; the answer contradicts it, or the answer is right while the trace is confabulated, or — most dangerous — trace and answer agree and are both wrong in a way the trace's fluency conceals. Post-hoc rationalization is the default texture of generated reasoning: the model is completing "text that looks like good reasoning for this answer," and it is very good at that.

**War story.** A document-authenticity checker produced traces citing specific formatting inconsistencies as evidence. Spot-checks showed the cited inconsistencies frequently *didn't exist in the document* — the answers were often still correct (driven by signals the trace never mentioned), but the traces were confident fiction. The team had been forwarding those traces to customers as explanations.

**Detection.**
- **Trace-fact audit:** sample traces and verify their factual claims against the actual input. Fabricated evidence in support of correct answers is the tell that traces are rationalization, not derivation.
- **Perturbation probe:** change an input fact the trace claims was decisive; if the answer doesn't change, the trace lied about what was decisive.
- Track answer-accuracy conditional on "trace looks good" (human-rated): if P(correct | good-looking trace) ≈ P(correct), trace quality carries no information and your reviewers are grading prose style. This exact measurement killed the review process in rule 7's war story (`principles/core-principles.md`).

**Fix.** Reposition the trace in your process: it is a *debugging hypothesis generator* (a trace that says "the field was ambiguous" tells you where to look — often usefully) and, when structural, a *scaffold* that forces sequential work. It is not evidence. Anything user-facing built on traces must present them as "explanation-style summaries," not as the model's actual grounds — or better, generate explanations from verifiable artifacts (citations to input spans that a renderer checks exist).

**Prevention.** Ground truth outranks trace review in every gate: prompts are graded on final answers against labeled cases (`@ai-eval-engineer/` owns the methodology). Reviewer training includes one session of trace-fact auditing — one hour of watching fluent fiction cite nonexistent evidence permanently recalibrates a reviewer.

## 3. Traces treated as a correctness guarantee

**Failure mode.** The institutional version of §2: process starts *depending* on traces. "The reasoning is logged, so we can audit any decision." "QA reviews the reasoning before high-stakes actions execute." "We require the model to double-check itself, so single-model review is fine." Each converts a probabilistic text artifact into a load-bearing control, and the control silently doesn't hold.

Self-checking deserves its own line: "verify your answer before responding" produces text of verification, which correlates with — but does not constitute — verification. Models pass their own checks at a rate that has nothing to do with an external checker's pass rate.

**Detection.**
- Process audit: list every place a trace gates an action, feeds a compliance record, or substitutes for an eval. Each entry is this failure mode, latent or active.
- Measure the self-check: on cases where the model's answer is wrong (per ground truth), how often did its self-verification pass anyway? That number — usually uncomfortably high — is the control's real strength.

**Fix.** Replace trace-gates with mechanism-gates: deterministic validators for anything checkable in code (schema, ranges, arithmetic, citation existence), independent model calls for judgment checks (a fresh-context checker with *only* the answer and the input, not the persuasive trace — see `topics/multi-agent-prompt-workflows.md` §1 for why the reviewer must not marinate in the author's reasoning), human review where consequences warrant. Traces can remain as *inputs* to debugging; remove them from the control plane.

**Prevention.** Design-review rule: any sentence of the form "the model's reasoning will be checked" must name *who checks it against what ground truth, and what the check can actually detect*. If the answer is "a human reads it and it looks right" — that's §2's measurement waiting to disappoint. For irreversible actions, the gate must be deterministic or human; that boundary is system architecture, owned by `@ai-engineer/topics/safety-and-guardrails.md`.

---

## Practical patterns (when CoT *is* the right call)

- **Delimit trace from answer** — reasoning in `<thinking>`, answer in `<answer>` (or native thinking mode, which separates them for you). Parsers and users must never receive trace text by accident; a trace leaking into a JSON field is a §3 incident in miniature.
- **Structure beats exhortation** — "First list the constraints. Then check each candidate against each constraint. Then answer." outperforms "think carefully step by step" because it specifies *which* steps; the model fills templates better than it self-organizes. This is just clarity discipline (`topics/clarity-and-specification.md`) applied to reasoning.
- **Budget it** — cap trace length or thinking budget; unbounded deliberation has sharply diminishing returns and occasionally talks itself off a correct answer (§1's flip failure).
- **Don't few-shot the trace unless you mean it** — example traces teach reasoning *style* with the same authority examples teach everything (`topics/few-shot-examples.md`); a sloppy example trace begets sloppy traces at scale.
- Cost accounting for all of the above: `extended/cost-and-token-efficiency.md`.
