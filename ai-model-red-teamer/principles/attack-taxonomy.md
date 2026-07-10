# Attack Taxonomy — Classes of Technique

> **Version 1.0 — 2026-07-06.** Applies to: all model versions. Read [core-principles](./core-principles.md) first.

**Scope discipline (read before reading further):** This document names and explains *classes* of attack technique at the level a reviewer needs to *recognize the pattern in a report and reason about coverage*. It contains no working instances, no phrasings that function as a payload, and no recipe for constructing one. Where a technique cannot be explained without effectively handing over an exploit, this doc says what the class targets and stops. That is deliberate and non-negotiable. If you need reproducible test cases, those live in access-controlled tooling maintained by the model-safety team, not here.

---

## Why a taxonomy at all

You cannot track coverage over things you cannot name. The taxonomy exists so that a coverage matrix ([program-design](./program-design.md)) has meaningful columns, so that two red-teamers describe the same failure the same way, and so that a fix can be evaluated against a *class* rather than an instance ([feeding-findings-back](./feeding-findings-back.md)). The categories below are stable across model generations even as specific phrasings churn constantly — that stability is exactly why we organize around them.

A useful mental model: almost every successful elicitation does one of four things — **erodes context**, **reframes the actor or task**, **obscures the request from a filter**, or **fabricates a permitting context**. Most real attacks combine several. The classes below map to those verbs.

## The attack classes

For each: what it exploits, how to recognize it in a report, and its general failure mode. No examples that could be executed.

### 1. Multi-turn context erosion

**What it exploits:** models weigh the accumulated conversation, and safety-relevant context can be diluted over many turns. The harmful objective is decomposed into individually innocuous-seeming steps, none of which trips a refusal on its own, with the harmful synthesis emerging only from the assembled whole.

**Recognize it in a report:** a long transcript where no single turn looks alarming but the trajectory converges on a prohibited outcome; findings that only reproduce with the full conversation, not any single message.

**Failure mode:** per-turn safety evaluation that never re-examines the conversation as a whole. The fix must consider trajectory, not just the latest message. Notoriously under-tested because it is slow and tedious relative to single-shot attempts — a classic coverage blind spot.

### 2. Role-play / persona framing

**What it exploits:** instructions to adopt a character, simulate a system, or operate under a fictional frame in which the model's normal constraints are narratively suspended.

**Recognize it in a report:** the setup establishes an alternate identity or ruleset before the actual request; the harmful output is framed as "in character" or "hypothetical."

**Failure mode:** the model treating a narrative frame as authorization to drop policy. A robust fix generalizes across the infinite space of possible personas rather than blocking named ones — blocking specific character names is a phrasing patch (see [core-principles](./core-principles.md) principle 2).

### 3. Encoding / obfuscation

**What it exploits:** a mismatch between the layer that filters and the layer that comprehends. The request is transformed (encoding schemes, character substitution, embedding in another language or format, splitting across fields) so that surface-level filters do not recognize it while the model still reconstructs the intent.

**Recognize it in a report:** the input is not plain natural-language prose; the harmful intent is recoverable only after a transformation step.

**Failure mode:** filtering on surface form rather than reconstructed meaning. Fixes that add one more encoding to a denylist are phrasing patches; the class is unbounded.

### 4. False-context / authority framing

**What it exploits:** fabricated context that purports to make the request legitimate — claimed authorization, a spoofed system or developer instruction, an invented emergency, or an assertion that a safeguard has been disabled.

**Recognize it in a report:** the input asserts a permitting condition — a claim of prior authorization, an assertion that the request serves an approved purpose, or a directive to disregard earlier instructions — that the model has no way to verify.

**Failure mode:** the model crediting unverifiable claims of authority. This class overlaps heavily with prompt injection when the fabricated context arrives via an untrusted channel (retrieved documents, tool outputs) rather than directly from the user.

### 5. Prompt injection (indirect)

**What it exploits:** content the model ingests from a non-user source (a web page, a file, a tool result) carrying instructions the model then follows, blurring the line between data and command.

**Recognize it in a report:** the trigger is not in the user's message but in retrieved or tool-sourced content; the affected system is agentic or retrieval-augmented.

**Failure mode:** no trust boundary between "content to reason about" and "instructions to follow." This is primarily a *system-design* vulnerability, not only a base-model one; the fix often lives in the harness, not the weights. Cross-reference any adjacent web/agent security review.

### 6. Refusal suppression / instruction-hierarchy attacks

**What it exploits:** direct pressure on the model's refusal behavior — instructions to never refuse, to prefix compliance, to treat refusal as failure, or to smuggle the objective under a formatting or completion constraint.

**Recognize it in a report:** the input explicitly targets the refusal mechanism itself rather than disguising the request.

**Failure mode:** the model prioritizing a local instruction over its safety policy. Robustness here is about the *ordering* of instruction sources, which is why it is closely tied to system-prompt and instruction-hierarchy design.

### 7. Gradual escalation within a topic

**What it exploits:** starting in a legitimate, allowed region of a sensitive topic and incrementally pushing toward the prohibited region, with each step a small distance from the last.

**Recognize it in a report:** a slope from clearly-fine to clearly-not, where the boundary crossing is hard to pinpoint.

**Failure mode:** the absence of a firm decision boundary; the model's tendency toward local consistency ("I answered the last one, so I'll answer this slightly-further one"). Related to context erosion but within a single topic rather than across decomposed subtasks.

### 8. Cross-lingual and low-resource transfer

**What it exploits:** uneven safety training across languages, dialects, and modalities. A request that reliably refuses in a high-resource language may succeed when moved to a lower-resource one, or across a modality boundary.

**Recognize it in a report:** the same semantic request succeeds in one language/modality and fails in another.

**Failure mode:** safety alignment concentrated in the training-dominant language. A perennial, systematically under-tested coverage gap — see [program-design](./program-design.md) on why non-English coverage is the cell most often left empty.

## Combinations are the norm

Real high-severity findings almost always chain classes: a persona frame *plus* multi-turn erosion *plus* an encoding step. Track the *primary* class for the coverage matrix, but record secondary classes, because a fix that closes the primary mechanism may leave the combination open. When you cluster findings ([finding-cluster-analyzer](../agents/finding-cluster-analyzer.md)), cluster on mechanism, not on surface, or combinations will scatter across the wrong buckets.

## Failure mode → detection → fix → prevention (at the class level)

| Class | Failure mode | Detection strategy | Fix altitude | Prevention |
|---|---|---|---|---|
| Context erosion | Per-turn-only safety eval | Trajectory-level review of long transcripts | Trajectory-aware safety, not token patch | Mandate multi-turn cells in coverage matrix |
| Persona framing | Frame treated as authorization | Probe across many persona shapes | Generalize across persona space | Test persona class, never named characters |
| Encoding | Filter/comprehension layer mismatch | Test transformed-input variants | Filter on reconstructed meaning | Assume denylists are incomplete |
| False-context | Unverifiable authority credited | Probe fabricated-permission variants | Ignore unverifiable authority claims | Model can't verify → must not rely on it |
| Prompt injection | No data/instruction boundary | Test via untrusted channels in agentic setups | Harness-level trust boundary | Design boundary before deployment |
| Refusal suppression | Local instruction beats policy | Probe direct anti-refusal pressure | Instruction-hierarchy hardening | Define source ordering explicitly |
| Gradual escalation | No firm decision boundary | Slope probes within sensitive topics | Consistent boundary regardless of history | Test the boundary, not just endpoints |
| Cross-lingual | Alignment concentrated in one language | Replay findings across languages/modalities | Broaden alignment coverage | Non-English cells mandatory in matrix |

**Every "fix altitude" above is a class-level fix.** If a proposed fix operates below this altitude (blocks a token, a name, a single encoding), flag it as a phrasing patch and route it through the `fix-verification-tracer` reasoning ([fix-verification-tracer](../agents/fix-verification-tracer.md)) before believing it.

## Related

- Coverage over these classes: [program-design](./program-design.md)
- Scoring what an attack in these classes actually risks: [severity-and-triage](./severity-and-triage.md)
- Measuring robustness across the class, not the instance: [robustness-evaluation](./robustness-evaluation.md)
- Scaling breadth-within-class safely: [automated-red-teaming](./automated-red-teaming.md)
