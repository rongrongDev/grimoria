# Hallucination & Reliability

**Last reviewed:** 2026-07-06 · **Applies to:** all current model families (Claude 4.x–5, GPT-5-era). This failure class is intrinsic to the technology; techniques dated, problem permanent.
**Read this when:** any output of your system will be believed by someone.
**Related:** `topics/rag.md` §6 (citation grounding) · skill: `rag-grounding-auditor`.

The mental model that makes everything else follow: **an LLM is a plausibility
engine, not a truth engine.** It produces the most plausible continuation, and true
things are usually plausible — that's why it works. But plausible-and-false is
well inside its output distribution, delivered with identical fluency and
confidence. You cannot prompt this away. You can only build systems where
plausible-and-false gets caught before it gets believed.

---

## 1. Grounding techniques

**Failure mode.** The model answers from parametric memory — a compressed, undated,
lossy snapshot of training data — when it should answer from your sources. Symptoms:
outdated facts stated as current, plausible-but-wrong specifics (prices, versions,
names), and the confabulated citation (`topics/rag.md` §6).

**The techniques, in order of enforcement strength:**
1. **Closed-book prohibition** — instruct: answer *only* from provided
   documents/tool results; otherwise say so. Necessary, insufficient alone —
   this is a rhetorical control (`topics/prompt-design.md` §2's hierarchy applies).
2. **Quote-then-claim** — require a verbatim supporting quote before each claim.
   Mechanically verifiable (string match against source), turning a semantic
   audit into `grep`. The single highest-leverage grounding technique because
   verification is deterministic.
3. **Citation-ID validation** — citations must reference IDs actually in context;
   reject-and-retry on fabrication. Deterministic, cheap, catches the dumbest and
   surprisingly common failure.
4. **Post-hoc entailment checking** — decompose answer into atomic claims, verify
   each against cited source with a judge model (`topics/evaluation.md` §3
   protocol). Catches subtle drift: added numbers, dropped conditions, negation
   flips. This is the `rag-grounding-auditor` skill's procedure.
5. **Tool-mediated facts** — anything current or computable (prices, dates, math,
   inventory) comes from a tool call, never from the model
   (`topics/agents-and-tool-use.md` §3 under-eagerness is the failure to enforce
   this).

**Detection.** Groundedness score on sampled traffic (technique 4, continuous).
**Prevention.** Groundedness as a launch-gating eval metric with a floor;
fabricated-citation rate tracked and held at zero.

## 2. Confidence signaling

**Failure mode.** Every answer arrives in the same assured register, so users
(and downstream systems) can't allocate their skepticism. Worse: the model's
*expressed* confidence ("I'm quite sure...") is weakly correlated with its
accuracy — it's a style choice, not a measurement. Naively asking "how confident
are you, 0–100?" produces clustered, poorly calibrated numbers (usually 80–95).

**What actually works:**
- **Derive confidence from evidence, not introspection.** Grounded-with-quote →
  high. Grounded-partially → medium, say what's missing. No supporting source →
  the answer is "I don't know," not a hedged guess (§3). Confidence becomes a
  *property you compute* from the grounding audit, not a number the model emits.
- **Self-consistency sampling** where stakes justify 3–5× cost: sample the answer
  multiple times at temperature; agreement rate is a usable proxy. Divergent
  samples → route to abstention or human.
- **Expose provenance, not adjectives:** "according to the 2026 Handbook §4.2..."
  lets the reader calibrate; "I'm fairly confident" does not.

**Detection.** Calibration curve: bucket outputs by your confidence signal, measure
actual accuracy per bucket on labeled data. Flat curve = your signal is decoration.

## 3. "I don't know" vs. guessing — abstention as a built feature

**Failure mode.** Under uncertainty the model guesses, because helpfulness-trained
models experience "I don't know" as failure. Your system inherits this default
unless you actively override it. In domains with citations, compliance, medicine,
money — a guess is strictly worse than an abstention, but nothing in the stack
knows that unless you encode it.

**War story.** An internal API-support bot was asked about a deprecated endpoint
whose docs had been removed from the corpus. Retrieval returned near-misses; the
model synthesized a *plausible* deprecation date and a migration path — both
invented. Three teams planned a quarter around that date. The correct answer —
"the docs for this endpoint aren't in my sources" — was never in the model's
behavioral repertoire because nothing had put it there, and our eval set contained
zero cases where abstention was the right answer. The eval literally could not see
the failure that mattered most.

**Fix.**
1. **Give the out explicitly, with the phrasing:** "If the provided sources don't
   contain the answer, respond exactly: 'I can't answer this from the available
   documentation' and name what's missing." Models abstain far more reliably when
   handed the exact escape hatch than when told "don't guess."
2. **Reward it:** eval cases where abstention is the *correct, full-credit* answer,
   and where guessing scores zero — at realistic proportion (§`topics/evaluation.md`
   §1). What your eval rewards is what your iteration optimizes toward.
3. **Make abstention useful, not dead-end:** route to human, log as a
   content gap (feeds the RAG ingestion backlog), tell the user what *would*
   answer it. Teams suppress abstention when it's a UX dead-end; give it a job.
4. **Watch the overcorrection:** an abstention-heavy prompt can start refusing
   answerable questions. Track both error directions — false-answer rate *and*
   false-abstention rate — like precision and recall, because that's what they are.

## 4. Structured output validation

**Failure mode.** The output parses as JSON, so the pipeline proceeds — but the
values are hallucinated: a `user_id` that doesn't exist, a `confidence: 0.95` the
model invented, an enum value that's plausible but not in your set, a total that
doesn't equal the sum of line items. Schema validity gets mistaken for truth;
structured output *launders* hallucination into data.

**War story.** An extraction pipeline wrote model output straight into a CRM.
Weeks later: dozens of records with `region: "EMEA-2"`. The company had no
EMEA-2 — the model had generalized from EMEA and APAC-2 in neighboring context.
Schema said `region: string`. String it was.

**Fix — the three-layer validation ladder (every layer, always):**
1. **Syntactic:** parses, schema-validates. Use the provider's structured-output /
   tool-calling mode to get this mostly for free
   (`principles/decision-trees.md` §6).
2. **Semantic:** enums are *closed sets* not strings; IDs checked for existence
   against the real system; dates parse and land in sane ranges; cross-field
   invariants hold (totals sum, start < end). This layer is deterministic code —
   write it.
3. **Plausibility (where stakes warrant):** outlier checks against historical
   distributions; a second cheap model pass asking "is this extraction supported
   by the source?" — technique 4 from §1 applied to fields.

**On failure:** reject → retry with the validation error *appended to the prompt*
(one retry fixes most; see the retry ladder below) → after N failures, dead-letter
queue for humans. Never silently accept, never silently drop.

**The general retry ladder** (applies beyond structured output):
attempt → validate → on failure, retry with error feedback (1–2×) → escalate one
model tier → route to human / dead-letter. Each rung logged; rung-hit rates on
the dashboard — a rising retry rate is an early quality regression signal.

---

## The reliability stack, summarized

| Layer | Catches | Cost |
|---|---|---|
| Citation-ID validation | Fabricated references | ~free, deterministic |
| Quote-then-claim + string match | Unsupported claims | Prompt tokens, deterministic check |
| Schema + semantic validation | Hallucinated structure/values | ~free, deterministic |
| Entailment audit (sampled) | Subtle claim drift | Judge-model calls |
| Abstention path + evals | Guessing under uncertainty | Design effort |
| Confidence-from-evidence | Misallocated user trust | Falls out of the above |

Deterministic layers run on 100% of traffic; model-graded layers run sampled.
A system with only the model-graded layers has soft floors; a system with only
deterministic layers misses semantic drift. You need both.

**Related:** `topics/rag.md` (grounding's retrieval half) · `topics/evaluation.md`
(judge protocol, abstention cases) · `topics/safety-and-guardrails.md` (validation
as a guardrail class) · skill: `rag-grounding-auditor`.
