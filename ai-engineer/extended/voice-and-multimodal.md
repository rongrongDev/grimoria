# Voice & Multimodal Agent Patterns (Extended Tier)

**Last reviewed:** 2026-07-06 · **Applies to:** 2025–2026 generation speech/vision-capable models (native-multimodal and pipeline architectures both). Extended-tier depth: production patterns + common pitfalls. This modality landscape moves fastest of anything in the KB — re-verify capabilities before designing.

The transferable insight: **every core-tier discipline in this KB applies
unchanged — but the input is now lossy, the latency budget is 10× tighter, and
the user can't see what the system heard.** Voice/multimodal failures are mostly
core failures (grounding, injection, eval gaps) arriving through a noisier
channel.

## Production patterns

- **Pipeline vs. native tradeoff, decided by latency and control.**
  STT → LLM → TTS pipelines give you an inspectable text seam — you can log,
  moderate, and eval the transcript (all your text-era machinery works).
  Native speech-to-speech models cut latency dramatically but remove that seam:
  moderation and grounding checks must move to audio-adjacent hooks or sampled
  transcription. Default to the pipeline until the latency budget forces you
  off it; know exactly what observability you're giving up when you switch.
- **The turn-taking budget is ~500–800ms perceived.** Achievable only by
  streaming everything (STT partials → LLM streaming → sentence-chunked TTS),
  running fast-tier models for the conversational layer
  (`topics/cost-and-latency.md` §3–4), and pushing anything slow — retrieval,
  tool calls — behind a verbal acknowledgment ("let me check that").
  Latency-hiding phrases are a *designed component*, not filler.
- **Confirm before consequences, always, in voice.** ASR errors make
  "transfer $500 to Dan" vs. "Stan" a live failure class. Any consequential
  action gets a read-back confirmation gate — the voice-native form of the
  deterministic gates in `topics/safety-and-guardrails.md` §1. Confirmation is
  a *harness rule keyed to the tool*, not a model behavior:
  the model asks nicely; the harness *requires*.
- **Log the audio-to-action chain.** Trajectory logging
  (`principles/core-principles.md` §10) now includes: audio ref, transcript +
  ASR confidence, model turn, action. Disputes ("I never said that") are
  unresolvable without it — and it's a PII sink of the first order
  (voiceprints are biometric data in several jurisdictions; retention and
  consent are legal questions, flag them — `topics/safety-and-guardrails.md` §4).
- **Vision inputs are retrieval-grade untrusted content.** A screenshot or
  photo enters the prompt like a RAG chunk: delimit it, treat text *within*
  images as data (injection via image text is real and demonstrated), and
  ground claims about the image the way you'd ground claims about a document
  (`topics/prompt-design.md` §2, `topics/rag.md` §6).

## Common pitfalls

- **Evaling on clean audio.** The suite uses studio-quality recordings; users
  have speakerphones, accents, crosstalk, and kitchen noise. Build the eval set
  from *production* audio distributions (`topics/evaluation.md` §1 — the
  happy-path trap, acoustic edition). Same for vision: eval screenshots are
  pristine; user photos are dark, rotated, and partial.
- **Cascading confidence loss, invisibly.** ASR is 95% confident, the model
  answers fluently from the slightly-wrong transcript, TTS delivers it
  beautifully. Every stage laundered the upstream uncertainty
  (`topics/hallucination-and-reliability.md` §2). Propagate ASR confidence into
  the LLM turn ("transcript may contain errors; confirm critical entities") and
  down-weight or confirm low-confidence entity mentions.
- **Text prompts ported verbatim.** A 200-word text answer is a 90-second
  monologue. Voice prompts need: brevity rules, spoken-format numbers/dates,
  no markdown artifacts ("asterisk asterisk important asterisk asterisk"), and
  interruption handling. Re-eval from scratch; text eval scores transfer
  approximately not at all.
- **Barge-in ignored.** Users interrupt mid-response constantly. If the
  pipeline can't cancel TTS + abandon the in-flight generation + treat the
  interruption as the new turn, the agent talks over users — the single
  fastest way to make a voice product feel broken.
- **Multimodal hallucination gets a pass.** Teams that rigorously ground text
  claims let "the chart shows revenue declining" ship unverified. Claims about
  images need the same evidence discipline — quote the region/value the claim
  rests on, or route to abstention (`topics/hallucination-and-reliability.md` §3).

**Related:** `topics/cost-and-latency.md` (the budget math that dominates voice) ·
`topics/safety-and-guardrails.md` (gates + PII) · `topics/evaluation.md`
(distribution-faithful eval sets).
