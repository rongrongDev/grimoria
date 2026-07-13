# Multi-Turn Conversation Design

**Last reviewed:** 2026-07-13 · **Applies to:** Claude 4.x–5, GPT-5-era models. Extended tier: production patterns + pitfalls.
**Scope wall:** conversation-state architecture (what to store, summarize, retrieve across sessions) is `@ai-engineer/` territory. This doc owns the prompt-craft slice: how instructions survive — or don't — across turns, and how to write prompts that age well inside a growing transcript.

The mechanism to internalize: **a conversation is one ever-growing prompt.** Every turn appends tokens; nothing is ever "said and done." Your system prompt competes for attention against an expanding transcript, the model's own prior outputs become few-shot examples of how to behave (with all the authority examples carry — `topics/few-shot-examples.md`), and instructions that dominated turn 1 are, by turn 40, a distant preamble behind thousands of tokens of chat. Single-turn prompt discipline still applies; this doc is what *changes*.

## Production patterns

**1. Instruction persistence degrades with distance — design for it.**
The system prompt's pull weakens as the transcript grows (rule 10's position effect, compounded every turn). Observed signature: format compliance and persona fidelity high in early turns, drifting by turn 20+, especially after long user messages. Patterns that hold up:
- Put *conversation-lifetime* rules in the system prompt, but re-anchor *per-response* requirements (output format, length bounds) near the point of generation — via a trailing developer/instruction message or template suffix on each turn, not by hoping turn-1 instructions carry.
- The re-anchor is a *pointer*, not a restatement: "Respond per the format rules in your instructions." Restating rules verbatim in two places creates the drift-apart failure of `topics/system-prompt-design.md` §3 the first time someone edits one copy.
- Detection: slice quality metrics by turn number. Flat = fine; downward slope = persistence problem. Teams that never slice by turn depth ship this failure mode for quarters without a name for it.

**2. The model's own outputs are self-reinforcing examples.**
One slightly-off response early (wrong tone, a format deviation, an emoji) becomes in-context precedent the model then matches — drift compounds because each drifted turn is a fresher example than your instructions. War story in miniature: an assistant that used one exclamation mark in turn 2 was measurably peppier by turn 15; nothing in the prompt changed — the *transcript* was the prompt. Mitigations: catch deviations early (per-turn format validation with the repair path from `topics/structured-output.md` — repairing turn 2 prevents drift at turn 20); where the harness allows, don't append the malformed draft to history, append the repaired one.

**3. Context management is prompt management.**
When transcripts are truncated or summarized to fit the window, the *summary is now part of the prompt* and inherits every discipline in this KB: it must preserve standing commitments ("user prefers metric units," "already tried restarting") — losing those re-asks answered questions, which users experience as the assistant getting dumber mid-conversation; it must be delimited and declared like any assembled content, and *summarized user content stays untrusted* — summarization does not launder the data plane into the instruction plane (`extended/injection-aware-structure.md` — indirect taint is still taint). Whether/when/how to summarize is architecture (`@ai-engineer/`); *what the summary prompt must preserve and how it's framed* is prompt craft, and the summary prompt itself deserves a regression set.

**4. Multi-turn behavior needs multi-turn cases.**
A regression set of single-turn cases certifies a conversational prompt for exactly the first turn. The set must include *scripted conversations*: instruction-persistence probes (does the format hold at turn 25?), mid-conversation contradiction ("actually, make everything imperial from here on" — does the change stick, and does the *old* rule stay dead?), topic-return cases (commitment from turn 3 still honored at turn 30 after a digression?). Grade the transcript, not just final turns. Harness mechanics: `@ai-eval-engineer/topics/agentic-task-evals.md` (nearest methodology); the prompt-side duty is that these cases *exist* in the versioned set.

## Common pitfalls

- **Testing turn 1, shipping turn 40.** The demo is always a fresh conversation; production is a 40-turn transcript with three topic changes. If the eval set has no long conversations, the prompt has never been tested in its production condition.
- **Patching drift with system-prompt repetition.** "Maintain a professional tone AT ALL TIMES" added in three places because tone drifted at depth — pays permanent rent (`extended/cost-and-token-efficiency.md`), creates copy-drift risk, and doesn't fix the mechanism (the transcript is out-examplering you; per-turn re-anchoring and early repair do fix it).
- **Sticky-instruction ambiguity.** User says "keep it brief" in turn 5. For the rest of the conversation? That topic? The prompt should legislate defaults for instruction scope ("user style requests persist until countermanded") — otherwise the model re-decides per turn, which is `topics/clarity-and-specification.md` §1 with a time axis.
- **Unbounded conversations as a spec hole.** If the product allows 200-turn sessions, the prompt was tested nowhere near its operating range. Either the system bounds/refreshes sessions (architecture) or the eval covers the true range (methodology) — the prompt author's job is to force that fork explicitly rather than let the window overflow decide.
