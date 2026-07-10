# Cost & Latency

**Last reviewed:** 2026-07-06 · **Applies to:** pricing mechanics of Claude 4.x–5 era APIs (caching, batch). Specific ratios drift — re-verify against current provider pricing before quoting numbers in a business case. Engineering judgment is durable.
**Read this when:** the invoice surprised someone, users call it slow, or you're sizing a system before launch (the cheap time to read it).

LLM spend has a property most infra costs don't: it's decided *per request, by
design choices* — prompt length, model tier, retries, agent turns — not by a
capacity plan. Which means it's also *fixable* per design choice. The teams with
10× cost problems almost never have a pricing problem; they have an
unexamined-defaults problem.

---

## 0. Measure before optimizing (the step everyone skips)

**Failure mode.** The team "optimizes cost" by intuition: switches models, trims
prompts, and can't say what changed because nothing was attributed. **Fix:** tag
every API call with `(feature, prompt_version, model_id)` and log input/output/
cached token counts. One afternoon of work; turns the invoice from a number into
a diagnosis. Every section below assumes you have this. Track **cost per
completed task**, not per call — an agent that's 20% cheaper per call and takes
2× the turns is a regression wearing a win's clothes.

## 1. Token budget management

**Failure mode.** Prompts accrete: every incident adds an instruction, every
feature adds a section, RAG stuffs k=20 chunks "to be safe," conversation history
is unbounded. Input tokens dominate most bills (typically 5–20× output volume),
and nobody owns the prompt's size because it grew one justified line at a time.

**War story.** A support bot's system prompt hit 9,000 tokens over 18 months —
including instructions for two deprecated features and few-shot examples for a
flow that no longer existed. Nobody had deleted anything, ever, because deletion
felt risky with no eval to confirm safety (`topics/evaluation.md` §4 — regression
suites are also what make *removal* safe). Trimming to 3,200 tokens: no eval
regression, −38% total spend. The eval suite paid for its own construction that
week.

**Fix.** Budgets as enforced numbers, per pipeline stage: system prompt ≤ X,
retrieval context ≤ Y (k chosen by precision measurement, `topics/rag.md` §3, not
fear), history ≤ Z with summarize-beyond (`topics/agents-and-tool-use.md` §4),
`max_tokens` set to the task's real need. CI warns when a stage exceeds budget —
same PR that changes the prompt sees the cost delta.

## 2. Caching

**Prompt caching** (provider-side prefix caching) is the highest-leverage cost
feature in current APIs: cached input tokens bill at ~10% and skip reprocessing
(latency win too). It works on a *byte-stable prefix* — and that's the whole game:

- **Order for stability:** system prompt → tool definitions → static exemplars →
  *then* anything dynamic. One early dynamic byte (timestamp, user name, request
  ID) invalidates everything after it.
- **War story:** a team "enabled caching" and saw a 0% hit rate. Their prompt
  began `Current time: 2026-07-06T14:22:31Z`. One timestamp, first line, total
  cache defeat. Moved time into the final user message: 85% hit rate, −60%
  input cost, in a one-line PR.
- **Agents are the killer use case:** the prefix (system + tools) is re-sent
  every turn of every run; caching it typically cuts agent input cost 50–80%
  (`topics/agents-and-tool-use.md` §5).
- **Monitor hit rate** (the API reports cached-token counts). A hit-rate drop
  after a deploy means someone inserted a dynamic byte upstream of the stable
  block — treat it like a perf regression, because it is one. Mind TTLs: cadence
  matters; a prefix hit less often than the TTL never caches.

**Retrieval/response caching** (yours, not the provider's): embedding cache
(never re-embed unchanged chunks — content-hash keyed), retrieval-result cache
for hot queries, and full-response caching for genuinely identical requests
(FAQ-shaped traffic). Semantic response caching (serve cached answer for
similar-enough queries) is a precision/staleness tradeoff — threshold it
conservatively and version-invalidate on corpus updates, or you'll serve
yesterday's answer to tomorrow's question (`topics/rag.md` §5, cached edition).

## 3. Streaming vs. batch

Decision tree in `principles/decision-trees.md` §5; the judgment behind it:

- **A human waiting → stream.** Perceived latency is TTFT, and streaming turns a
  12-second generation from "broken" into "thinking." Nothing else you do to
  latency matters as much as streaming where a user watches. Remember output
  guardrails interact with streaming: a blocking output check forfeits
  streaming's UX win — scan incrementally or accept-then-retract per your risk
  posture (`topics/safety-and-guardrails.md` §2).
- **No human waiting → don't stream**, and if it can wait hours, **provider
  batch APIs run at ~50% price**. Eval suites, backfills, nightly enrichment,
  report generation — huge fractions of real workloads are batch-eligible and
  running at interactive prices out of habit.

**Latency beyond streaming:** output tokens dominate generation time — the
biggest latency lever is usually *asking for less output* (structured, terse
formats; no "explain your reasoning" where you don't read it). Then: smaller
model tier (§4), parallelize independent calls, cache prefixes (TTFT win).
Sequential-call chains stack latencies — a 4-stage pipeline of 2s calls is 8s
before you've done anything; collapse stages that don't need separation.

## 4. Model-tier selection

**Failure mode.** One tier for everything, chosen at project start, never
revisited. Both directions hurt: Opus-class routing/classification burns 10–30×
the necessary cost; Haiku-class agent loops compound per-step errors into
task-level failure (`principles/decision-trees.md` §3). And "never revisited" is
its own failure — tier economics reset every model generation.

**Fix — route per task, prove with evals:**
1. Inventory every distinct LLM call in the system (you have this from §0's
   tagging).
2. For each: run its eval on the tier below the current one. Passes → move it.
   This is a one-afternoon experiment per call site, and it's how 5–10× wins on
   classification/extraction/routing workloads actually happen.
3. **Cascade pattern** for mixed-difficulty traffic: cheap tier attempts with a
   *validatable* success criterion (schema-valid, confidence rubric, grounding
   check — `topics/hallucination-and-reliability.md` §4's ladder); failures
   escalate to the big tier. Whole-population quality at a blended cost.
   Caution: the success criterion must be trustworthy — a cascade with a weak
   validator is just quality roulette with extra steps.
4. Re-run tier evals each model generation, both directions: new small models
   absorb yesterday's big-model tasks; new big models make new tasks feasible.

**Detection.** From §0's dashboard: cost per completed task by feature ×
tier — outliers are your experiment queue. Alert on cost-per-task drift, which
catches turn inflation, retry storms, and cache regressions before finance does.

---

## The first-week checklist for any new system

1. Call-site tagging + token logging live before launch (§0).
2. Prompt prefix ordered for caching; hit rate on the dashboard (§2).
3. `max_tokens`, k, and history budgets set consciously, not defaulted (§1).
4. Streaming on user-facing paths; batch API for offline paths (§3).
5. Tier chosen per call site via eval, with the re-test calendared (§4).
6. Agent runs cost-capped (`topics/agents-and-tool-use.md` §5).

Skipping this list doesn't fail loudly — it just prices your system at a
multiple of necessary, forever, invisibly.

**Related:** `topics/agents-and-tool-use.md` §5 (per-turn budgets) ·
`topics/rag.md` §3 (k as a cost knob) · `topics/multi-agent-orchestration.md`
(fan-out cost explosion) · `principles/decision-trees.md` §3/§5.
