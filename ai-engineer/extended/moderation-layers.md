# Guardrail & Moderation Layers as a System Component (Extended Tier)

**Last reviewed:** 2026-07-06 · **Applies to:** current-generation moderation APIs and small-model classifiers (Haiku-class); architecture is provider-agnostic. Extended-tier depth: production patterns + common pitfalls. The conceptual ground — model-level vs. application-level, the sandwich pattern — is core-tier: `topics/safety-and-guardrails.md` §1–2. This doc is the implementation layer.

Treat moderation as a *system component* with the properties any component has:
latency, error rates in both directions, versioning, monitoring, and an owner.
Teams that treat it as a checkbox ("we call the moderation API") get the two
classic outcomes: a bypass they can't explain, or a false-positive rate that
quietly strangles legitimate traffic.

## Production patterns

- **Tiered classification, cheap-to-expensive.** Regex/keyword rules (free,
  microseconds) → small-model classifier (Haiku-class, ~100–300ms) → escalation
  to a large model or human for the ambiguous residue. Route by confidence:
  the cheap tier handles the clear 95%, and *only* ambiguity pays for depth.
  This is the cascade pattern from `topics/cost-and-latency.md` §4 applied to
  safety.
- **Policy as versioned rubric, not vibes.** The classifier's prompt/ruleset is
  a policy document: in source control, with an eval set of labeled examples
  per category (including hard negatives — legitimate messages that *look*
  violating: a nurse asking about medication doses, a security engineer asking
  about injection). Every policy change runs that eval before deploy —
  moderation prompts are prompts (`topics/prompt-design.md` §5,
  `topics/evaluation.md` §4).
- **Fail-mode is a per-boundary decision, made in advance.** Moderation
  service down: fail-open (let traffic through, log loudly) or fail-closed
  (block)? Input moderation for a consumer chat product usually fails open;
  output moderation before an irreversible action always fails closed. Decide
  per boundary, write it down, test the failure path — the outage is the wrong
  time to discover the default.
- **Both-direction monitoring.** False negatives get found via incident reports
  and red-teaming; false positives *must* be actively hunted — weekly sampled
  review of blocked traffic, an appeal path, and block-rate dashboards by
  segment (a block-rate spike for one language or region is a bias incident
  in progress). Nobody files a bug for the message you never let them send
  (`topics/safety-and-guardrails.md` §2).
- **Moderation verdicts join the trajectory log.** Verdict + category +
  confidence + policy version, logged with the request
  (`principles/core-principles.md` §10). This is incident forensics, the
  eval-case mine, and your audit evidence in regulated contexts, all at once.
- **Streaming needs an incremental strategy.** Options, by risk posture:
  scan sentence-by-sentence with a small classifier and cut the stream on trip
  (rare visible retraction, low added latency); buffer-then-release short
  responses (forfeits TTFT — `topics/cost-and-latency.md` §3); post-hoc scan
  with retract-and-apologize (only for low-stakes surfaces). Pick deliberately;
  the accidental default is "no output moderation on streamed paths."

## Common pitfalls

- **Moderating only the user-input channel.** Retrieved documents, tool
  results, and uploaded files enter the prompt too — the injection channels
  of `topics/prompt-design.md` §2 are also the content-risk channels. Output
  moderation partially backstops this; input-side, every untrusted channel
  needs a screen, not just the chat box.
- **One threshold for every surface.** An internal engineering tool and a
  children's education product do not share a policy. Thresholds and categories
  are per-surface configuration; a global constant means at least one surface
  is wrong.
- **The latency ambush.** Serial input-check (300ms) + output-check (300ms)
  just added 600ms to every request — often more than the retrieval budget.
  Run input moderation concurrently with retrieval where the risk posture
  allows; keep blocking checks on the critical path only where blocking is
  the actual requirement.
- **Moderation-model upgrades without recalibration.** The vendor upgrades
  their classifier; your block-rate moves 3 points overnight; nobody notices
  for a month. Pin versions where offered; where not, monitor block-rate as a
  regression signal and keep the labeled eval set ready to re-baseline
  (`topics/evaluation.md` §3's judge-upgrade discipline, same mechanics).
- **Using the primary model to moderate itself, inline.** "Also, before
  answering, check your answer is safe" is one context, one model, one
  jailbreak away from neither answering nor checking. Separation of duties:
  the checker is a different call, ideally a different model, with the checked
  content as *data* (`topics/evaluation.md` §3 self-preference, safety
  edition).

**Related:** `topics/safety-and-guardrails.md` (the parent doc) ·
`topics/cost-and-latency.md` (the budget these layers spend) ·
`topics/evaluation.md` (calibration machinery) · skill:
`prompt-injection-reviewer` (reviews the design this doc implements).
