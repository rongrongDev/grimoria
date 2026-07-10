# Guide: Analyze an Existing LLM System

**Last reviewed:** 2026-07-06 · **Applies to:** any LLM application (RAG, agent, pipeline, chat); model-agnostic.
**Goal:** given an unfamiliar LLM application, produce — inside a bounded budget — (1) an architecture summary, (2) a hallucination/reliability risk list, (3) a cost/latency assessment, (4) a prioritized remediation plan.
**Time budget:** ~4 hours for a typical single-purpose system. Half-day cap; findings beyond it go in "open questions," not overtime. A smaller model executing this guide should follow the phases literally and fill the templates.

The premise of the whole protocol: **LLM systems fail silently by default**
(`principles/core-principles.md` §1), so "no errors in the logs" is evidence of
missing instrumentation, not health. You are not looking for what's broken —
you're looking for what *couldn't be seen* if it were broken.

---

## Phase 1 — Architecture recovery (≤ 60 min)

Work from the code, not the README (READMEs describe intentions). Locate every
LLM call site — grep for the SDK client, HTTP calls to provider endpoints, and
framework imports:

```
rg -l "anthropic|openai|claude-|gpt-|langchain|langgraph|litellm|bedrock|vertex" \
   --type py --type ts | head -50
rg "model[\"'=:\s]+[\"']?(claude|gpt|gemini|llama|mistral)" -g '!*test*'
```

For **each** call site, fill one row (this table is deliverable #1's core):

| # | Purpose | Model (pinned?) | Prompt source | Untrusted input reaches it? | Tools/side effects | Output consumed by | Validation after? |
|---|---|---|---|---|---|---|---|

Then classify the topology — single call / fixed pipeline / agent loop /
multi-agent (`principles/decision-trees.md` §2) — and draw the 10-line data-flow
diagram: user input → [moderation?] → [retrieval?] → model(s) → [validation?] →
output. Every `?` you can't resolve in the code goes in the open-questions list;
each unresolved `?` is itself a finding (undiscoverable architecture).

**Red flags at this phase, cheap to check, high yield:**
- Model IDs with `-latest`, or unpinned (`topics/prompt-design.md` §5)
- Prompts assembled by scattered string concatenation, or living in a dashboard
  outside source control
- No eval directory, no eval CI step ← *if so, note it now; it's finding #1*
- Agent loops: search for the termination conditions (`max_turns`, cost caps,
  repeat detection). Absence of all three is a severity-High finding on its own
  (`topics/agents-and-tool-use.md` §1)

## Phase 2 — Reliability & safety risk pass (≤ 90 min)

Run the checklists against each call-site row. Score each item **OK / Missing /
Unknown** — "Unknown" is a real score; do not guess it into OK.

**Hallucination surface (`topics/hallucination-and-reliability.md`):**
1. Does the system make factual claims? From what — retrieval, tools, or
   parametric memory? Memory-sourced current facts = finding.
2. Citations: are cited IDs validated against context? Are quotes verified? Or
   are citations decorative? (`topics/rag.md` §6 — decorative citations are
   *worse* than none: they buy unearned trust.)
3. Abstention: is there an explicit "can't answer" path? Is it ever exercised
   in logs? A system whose logs show zero abstentions either knows everything
   or guesses (it guesses).
4. Structured outputs: schema-validated? *Semantically* validated (IDs exist,
   enums closed, invariants hold)? Or does parse-success flow straight to
   production data? (`topics/hallucination-and-reliability.md` §4)

**Injection & guardrails (`topics/prompt-design.md` §2, `topics/safety-and-guardrails.md`):**
5. Trace every untrusted channel (user text, documents, tool results, web
   content) to the prompts it enters. Delimited and declared as data? Or
   concatenated raw?
6. Capability × taint: does any model call that *reads* untrusted content also
   *hold* consequential tools? That combination is the injection blast radius —
   run the `prompt-injection-reviewer` skill on those call sites specifically.
7. For every "must never X" the owners state: is there a deterministic control,
   or just a prompt line?
8. PII: what enters prompts; where do trajectories/logs go; retention; could a
   deletion request be honored across all sinks? (`topics/safety-and-guardrails.md` §4)

**Evaluation & observability (`topics/evaluation.md`):**
9. Does an eval suite exist? Sourced from production or imagination? Run in CI,
   gating changes? When did it last actually fail a change? (A gate that never
   fails is decorative.)
10. Production monitoring: deterministic checks on 100%? Sampled quality
    grading? Or exceptions-only alerting (= silent-failure blindness)?
11. Can they reproduce last Tuesday's output — prompt version + model + params +
    retrieved context logged per request? (`principles/core-principles.md` §10)

**If RAG (`topics/rag.md`):** corpus freshness process or rot; dedup; chunking
sanity (read 10 actual chunks — can a human answer from them?); recall/precision
ever measured; hybrid search or vector-only.

## Phase 3 — Cost & latency assessment (≤ 45 min)

From billing data if available; otherwise estimate from the Phase-1 table
(calls/day × avg tokens × pinned-model pricing) and *label estimates as
estimates*. Per `topics/cost-and-latency.md`:

1. **Attribution:** can spend be broken down by feature/call-site? If not,
   that's the first remediation item — everything else here is guesswork
   until it lands (§0).
2. **Tier fit:** any classification/routing/extraction on top-tier models?
   Any agent loop on a bottom-tier model? Both directions are findings (§4).
3. **Caching:** prompt-cache hit rate if measurable; else inspect prompt
   assembly for dynamic bytes (timestamps, user names, IDs) upstream of the
   stable block — the silent cache killer (§2).
4. **Waste signatures:** unbounded history growth; k chosen by fear; retry
   storms; `max_tokens` defaults; agent turn-count p95 vs. median (turn
   inflation); batch-eligible workloads (evals, backfills) running interactive.
5. **Latency:** streaming on user-facing paths? Sequential call chains that
   could parallelize or collapse? Blocking output checks on streamed responses?

## Phase 4 — Synthesis: the deliverable (≤ 45 min)

Produce exactly this document:

```markdown
# LLM System Review: <name> — <date>
Reviewed by: … · Time spent: … · Code version: <commit>

## 1. Architecture summary
<topology classification, data-flow diagram, the call-site table>

## 2. Risk register
| ID | Finding | Severity | Evidence (file:line / log / measurement) | Doc ref |
Severity rubric — High: silent wrong-answer path, unbounded spend, injection
blast radius, or irreversible action without deterministic gate. Medium:
missing detection (can't see failures) or major waste. Low: hygiene.
NOTE: absence of evals/monitoring is itself High — it makes every other
severity unknowable.

## 3. Cost & latency assessment
<current spend or labeled estimate; top 3 levers with expected magnitude;
latency profile of the user-facing path>

## 4. Remediation plan (prioritized)
Order by (user harm × likelihood) / effort — measurement items first, because
they de-risk everything below them:
1. <typically: eval suite + trajectory logging, if absent>
2. <typically: deterministic validation on the highest-stakes output>
3. …
Each item: what, why (link to risk ID), effort (S/M/L), verification
("done when <metric> is visible/green").

## 5. Open questions
<every "Unknown" from Phase 2, with who could answer it>
```

**Calibration rules for the register:** every finding carries evidence you can
point at — a file:line, a log excerpt, a measurement. No vibes findings. And
resist the completeness urge: a 40-item register gets filed; a 12-item register
with three High items gets *fixed*. Park the rest in an appendix.

---

## The 30-minute triage variant

When a half-day isn't available, answer only these six — they dominate the risk:

1. Is there an eval suite in CI? (No → that's the whole plan; start there.)
2. Do agent loops have turn + cost caps? (Grep takes 5 minutes.)
3. Does untrusted content reach a model that holds consequential tools?
4. Are outputs that feed production data semantically validated?
5. Can they reproduce yesterday's output for a given request?
6. Is the biggest-volume call on an eval-justified model tier?

Six "yes" answers = an unusually healthy system; each "no" maps to a topic doc
and, usually, to remediation item #1–3 of the full protocol.

**Related:** every `topics/` doc is the "why" behind one checklist block ·
skills: `prompt-injection-reviewer`, `rag-grounding-auditor` (run them during
Phase 2 on the surfaces they cover) · subagent: `agent-trajectory-tracer` (for
Phase 2 item 11 when trajectories exist but are long).
