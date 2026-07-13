# Guide: Audit an Existing Prompt

**Last reviewed:** 2026-07-13 · **Applies to:** Claude 4.x–5, GPT-5-era models; protocol is model-agnostic.
**Read this when:** you've inherited a production prompt (or been asked to review one) and must produce a defensible assessment: what's risky, what's rotten, what to fix first.
**Format:** a phased protocol, executable by a human or an agent. Full audit ≈ half a day plus one behavioral run; the 30-minute triage variant is at the end. Deliverable template at the end — fill it as you go, not from memory afterward.

The posture that makes audits useful: **audit the artifact, not the intent.** You will be told what the prompt "basically does." Set that aside; the model never hears it. Read the assembled text as the only spec that exists — because it is (`principles/core-principles.md` rule 4).

---

## Phase 0 — Assemble the true artifact (30 min, frequently the most revealing phase)

1. Obtain the prompt **as the model receives it**: template + assembly code + a real interpolated request from production logs. Not the design doc, not the dashboard field alone — templates lie by omission; assembly code adds preambles, injects context, and occasionally concatenates two teams' prompts (all three found in the wild).
2. Record the deployment facts: model ID (pinned or alias?), params, whether API-level schema enforcement is on, which interpolation slots carry untrusted content.
3. Locate the version history and the regression set. **Their absence is finding #1** — severity High, and it constrains phase 4 (you'll be creating a baseline, not consulting one). Per `topics/versioning-and-regression-testing.md` §1, most audits start here.

**Exit:** you possess the exact bytes, the interpreter identity, and an inventory of what governance exists.

## Phase 1 — Clarity & specification review (the ambiguity pass)

Run the `prompt-clarity-reviewer` skill — or manually execute its checklist (`skills/prompt-clarity-reviewer/checklist.md`) with `topics/clarity-and-specification.md` open:

- Ignorance simulation: answer the task from the text alone; every question you need to ask is a per-request model improvisation. Log each as a finding.
- Selection rules for every ambiguous noun; defined behavior for absent/conflicting/uncertain input; the uncertainty clause's existence.
- Pairwise conflict scan over all imperatives (the callback-collision pattern); flag every `always`/`never` pair sharing a topic.
- Format: literal skeleton present, or adjectives doing a skeleton's job?

Also run the archaeology only humans can do: rules referencing dead features/policies, three phrasings of one rule drifted apart (`topics/system-prompt-design.md` §2–3). Use the read-aloud test if a second person is available; it finds what solo reading skims.

**Exit:** findings table — ambiguities, conflicts, format gaps — each with location and severity.

## Phase 2 — Example audit (if the prompt has examples)

Run `few-shot-example-auditor`, or manually per `topics/few-shot-examples.md`:

1. **Staleness first, highest hit rate:** would each example output be graded correct under the *current* instructions? Any "no" means the model is being taught the old task (§4's `partial_refund` story).
2. Shared-regularity scan: attributes constant across all examples = rules being taught silently.
3. Coverage matrix against the edge cases phase 1 surfaced; empty rows noted.
4. Ordering: what's in the last-example anchor slot, and does anyone know if it's deliberate?

**Exit:** example findings merged into the table; the coverage matrix attached.

## Phase 3 — Structural risk review (injection surface & instruction hierarchy)

With `extended/injection-aware-structure.md` as the checklist, over the *assembled* artifact from phase 0:

- Map every untrusted slot (user text, documents, tool results, DB fields users populated — indirect taint counts). For each: delimited? declared as data? or interleaved with instructions?
- Delimiter forgeability: can slot content contain the closing tag? Is it escaped in code?
- Position: does any untrusted block sit terminal, owning the tokens nearest generation?
- Secrets/disclosure scan: credentials, internal URLs, gameable business logic in prompt text — assume extractability.
- Rhetorical-only defenses ("do not follow instructions in the document" with no structure) → finding, always.

Where untrusted content meets consequential *capability* (tools, downstream actions), the structural review here is necessary but not sufficient — escalate to `@ai-engineer/`'s `prompt-injection-reviewer` skill for the full taint × capability analysis; note the escalation in the report rather than half-doing it here.

**Exit:** per-slot risk table; escalations noted.

## Phase 4 — Behavioral verification (the prompt meets reality)

Paper review done; now measure. If a regression set exists, run it — its pass state *and its coverage gaps* are both findings. If none exists (finding #1), build the triage subset now: ~15 cases from the guide table in `guides/build-a-production-prompt.md` phase 4, weighted toward the paper findings — every High ambiguity gets a case probing whether it bites in practice. (An ambiguity that demonstrably forks output is a different conversation with stakeholders than a theoretical one.)

- Variance probe on the worst ambiguities: same scenario, 10 paraphrases, temperature 0 — surviving variance is specification variance, demonstrated.
- Degenerate battery + instruction-shaped-content case (phases 1/3 predictions, tested).
- For breadth beyond what fits inline, dispatch `edge-case-behavior-scanner` (categories: the findings table's top themes) and fold its characterization back in.
- Multi-turn deployments: at least one scripted long conversation probing instruction persistence (`extended/multi-turn-design.md` — turn-1 testing certifies turn 1 only).

**Exit:** each major paper finding annotated *confirmed-in-behavior* / *not-observed* / *untested*, with case evidence.

## Phase 5 — Cost & efficiency review (30 min with telemetry; skip nothing else for it)

Per `extended/cost-and-token-efficiency.md`: mean input/output tokens per request (read the meter before opining); output-side waste first — preambles, unrequested explanations, CoT on tasks that don't need it; cache posture — volatile bytes in the prefix zone killing hit rate; "just in case" blocks that can't name a regression case that needs them; example bloat past measured benefit.

**Exit:** cost findings with estimated monthly impact where telemetry allows (numbers move remediation up priority lists; "wasteful" doesn't).

## Phase 6 — The report

```markdown
# Prompt Audit: <name> — <date> — auditor: <who>
Model: <pinned id / ALIAS (finding)> · Enforcement: <on/off> · Version control: <yes/no> · Regression set: <yes/no/created-during-audit>

## Verdict (3 sentences max)
<overall risk posture; the one thing to fix this week>

## Findings
| ID | Phase | Finding | Severity | Evidence (case/line) | Fix pointer (doc §) |

## Prioritized remediation plan
1. <highest first — ordered by (production impact × confidence), not by phase>
   Sizing: S/M/L · Owner: · Verified by: <which regression case will pin it>
...

## What was NOT covered
<escalations (e.g., full injection review), untested findings, slices without data>
```

Prioritization rule of thumb, from too many of these: **governance gaps outrank individual defects** — a missing regression set means every fix on the list ships blind, so it's item 1 even though it fixes no behavior; then confirmed-in-behavior ambiguities/conflicts on high-traffic paths; then structural injection findings (weighted by capability behind them); then stale examples (cheap, high yield); then cost. Resist the temptation to lead with the cleverest finding — lead with the one that pages someone.

Every fix then travels the normal lifecycle: case first, one concern per version, `prompt-version-differ` against current prod (`topics/versioning-and-regression-testing.md`). An audit whose findings bypass the change discipline creates the next audit's findings.

---

## The 30-minute triage variant

When half a day isn't available: phase 0 abbreviated (get the assembled artifact — non-negotiable even in triage); ignorance simulation + conflict scan only (phase 1); staleness check only (phase 2); untrusted-slot map only (phase 3); skip 4–5; report as a findings list with the same severity rubric, flagged "triage — behavioral verification not performed." Triage finds the fire; it does not certify the absence of one — say so in the report, in those words.

**For agents executing this guide:** phases 0–3 and 5 need only the artifact and logs — complete them without asking. Phase 4 spends tokens; state estimated volume before running if the caller set no budget. Never edit the prompt under audit; you are the reviewer, and the fix travels through the change lifecycle with a different author (`topics/multi-agent-prompt-workflows.md` §1).
