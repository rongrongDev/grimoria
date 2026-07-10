---
name: eval-suite-planner
description: Design a concrete evaluation suite for an LLM feature — case sourcing plan, slice structure, pass criteria (deterministic checks + calibrated judge rubrics), CI gating, and a starter case list. Use when a new LLM feature is being built (ideally before it), when a system is found to have no evals, when "it seems better" needs to become a measurement, or as remediation item #1 from an existing-system analysis. Do NOT use for running an existing suite and analyzing failures (dispatch the eval-suite-runner subagent), for auditing judge bias in an existing setup (read ai-engineer/topics/evaluation.md §3 and check its protocol directly), or for classic software test strategy (non-LLM code paths).
---

# Eval Suite Planner

You are designing the measurement instrument for an LLM feature. The standard
you're building to is `ai-engineer/topics/evaluation.md`; the failure you're
preventing is the 96%-offline / broken-in-production gap (§1–2 there). The
deliverable is a plan a mid-level engineer can implement in 1–2 days, plus a
starter case list — not a essay about evaluation.

## Inputs you need (ask for whichever is missing)

1. What the feature does: inputs, outputs, who consumes the output.
2. What "wrong" costs: which failure directions matter most (false answer vs.
   false abstention, missed escalation, leaked PII, wrong tool call...).
3. What data exists: production logs? beta traffic? nothing yet?
4. Where changes ship from (repo/CI) — the gate must attach to something.

## Procedure

**Step 1 — Enumerate failure modes before cases.** From the feature description
and the relevant topic docs (`topics/rag.md` for retrieval features,
`topics/agents-and-tool-use.md` for agents, `topics/hallucination-and-reliability.md`
always), list the 5–10 specific ways this feature fails. Every eval case must
trace to one of these; cases without a failure mode are decoration.

**Step 2 — Design the slices.** Partition expected traffic by the properties
that plausibly change difficulty: input length, language, topic cluster,
single- vs. multi-intent, answerable vs. must-abstain, adversarial. Per-slice
reporting is non-negotiable (aggregate scores hide targeted regressions —
§4 there). State the minimum case count per slice (5+ for signal).

**Step 3 — Source the cases**, using the hierarchy from §1 there:
production logs (stratified sample, over-sample failures) → incident reports →
adversarial synthesis (injection corpus, empty/huge/malformed inputs) →
imagined happy path (only as scaffolding when no logs exist — and say so in the
plan, with a dated task to replace them once logs accumulate).
**Mandatory inclusions:** abstention-correct cases at realistic proportion, and
for agents, trajectory assertions (which tools MUST / MUST NOT be called per
case — `topics/agents-and-tool-use.md` §3).

**Step 4 — Define pass criteria, deterministic-first.** For each case type:
- Deterministic checks wherever possible: schema validity, citation-ID
  validity, must-mention/must-not-mention substrings, exact abstention phrase,
  tool-call assertions, latency/token ceilings. These run free, on everything.
- Judge rubrics only for what determinism can't reach — decomposed into binary
  anchored checks (never "rate 1–10"), with the judge one tier above the judged
  model, both-orderings for any pairwise use, and a human-calibration plan
  (50 outputs, κ ≥ 0.7 target) before the judge's number is trusted (§3 there).

**Step 5 — Specify the harness and gates.**
- Two tiers: smoke (~30 cases, every PR touching prompts/params/model IDs,
  deterministic-heavy) and full (nightly + pre-release, judges included).
- Gate rule: aggregate must not drop AND no previously-passing critical case
  flips (name which cases are critical).
- Flakiness policy: temperature 0 where the task allows; else N=3 majority on
  flaky-prone cases, flip-rate tracked.
- Ownership: who reviews new cases, the quarterly drift check against fresh
  production traffic (§1 there), and the rule that every production incident
  becomes a case before its fix merges.

## Output format

```markdown
## Eval Plan: <feature> — <date>

### Failure modes (each case below maps to one)
1. ...

### Slice structure
| Slice | Why it might differ | Min cases | Source |

### Starter case list (15–30 cases, ready to implement)
| ID | Slice | Input (or sourcing instruction) | Pass criteria (exact check) | Critical? |

### Judge rubrics (if any)
<binary decomposed checks + calibration plan + judge model/tier>

### Harness & CI
<smoke/full tiers, gate rule, flakiness policy, file paths, trigger globs>

### Ownership & growth
<owner, incident→case rule, quarterly drift check date>
```

## Quality bar

The test of this plan: an engineer implements it without asking you anything,
and the first time it fails a bad prompt change in CI, the failure message names
the case and the criterion. Prefer 25 sharp cases with exact pass criteria over
100 vague ones — vague criteria rot into a suite that always passes
(`topics/evaluation.md` §4's decorative-gate failure). If the feature genuinely
cannot be evaled deterministically at all, say so explicitly and size the judge
calibration effort honestly rather than hiding it.
