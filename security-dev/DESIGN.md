# Design Note — Why This Knowledge Base Is Shaped the Way It Is

**Date:** 2026-07-06 · **Author role:** principal application security engineer (final knowledge transfer) · **Applies to:** the whole `security-dev/` tree

This KB encodes twenty years of AppSec judgment for two audiences that read differently: humans (junior → staff engineers) and smaller AI models (Opus/Sonnet/Haiku) executing skills and subagents. Every structural decision below optimizes for one thing: **the right knowledge reachable in the right form at the moment of decision, with no author available to clarify.**

## The three primitives and how content was assigned

**Principles and topics teach. Skills do. Subagents isolate.** The test I applied to every piece of content:

1. **Does it require judgment that changes with context?** → plain markdown in `principles/` or `topics/`. Threat-mode reasoning, CVE-triage judgment, "when is this severity actually critical" — these cannot be proceduralized without lying. A checklist that pretends judgment is mechanical produces engineers (and models) that confidently misjudge. These docs are written to be *reasoned with*, not executed.
2. **Is it a repeatable procedure over a bounded input (a diff, a PR, one report)?** → a Skill. Reviewing a diff for authorization gaps is the same procedure every time; only the code changes. Skills are self-contained: a model with *only* the SKILL.md in context must be able to execute correctly. Each embeds its own check tables rather than requiring the topic doc — the topic doc is the "why," the skill is the "do."
3. **Does it consume more input than the calling context can afford (whole dependency trees, entire codebases, feature specs plus source)?** → a Subagent. The dependency-CVE triage of a real service reads hundreds of advisories and manifests; that volume must not flood the caller. Subagents return a verdict, not their reading.

**Commands:** none. Everything worth automating here either needs judgment framing (→ skill) or context isolation (→ subagent). A command that runs `grep -r password` without the interpretation guidance would produce false confidence — the most dangerous output a security tool can have. This is a deliberate omission, not an oversight.

## Directory map and rationale

```
security-dev/
├── README.md                  # start here; routing table (find anything <30s)
├── GLOSSARY.md                # single shared vocabulary
├── CHANGELOG.md               # dated against standards revisions
├── DESIGN.md                  # this file
├── principles/                # judgment: how to think
│   ├── security-mindset.md            # trust boundaries, attacker economics, defense in depth
│   ├── threat-modeling.md             # STRIDE right-sized; threats → test items
│   ├── secure-code-review.md          # what reviewers actually look for
│   ├── secure-sdlc.md                 # SAST/DAST/gates: where tools help and lie
│   ├── incident-response.md           # extended tier: triage, containment, postmortems
│   └── multi-agent-orchestration.md   # splitting security work across agents
├── topics/                    # knowledge: vulnerability classes, full failure→detection→fix→prevention
│   ├── injection/                     # core
│   ├── authentication-and-sessions/   # core
│   ├── authorization/                 # core (IDOR/BOLA, privesc)
│   ├── oauth-oidc-jwt/                # core (token & federation misuse)
│   ├── ssrf-xxe-deserialization/      # core (request-forgery & parser classes)
│   ├── web-client-security/           # core (XSS/CSRF/headers — the browser-interpreter classes)
│   ├── secrets-and-keys/              # core
│   ├── supply-chain/                  # core
│   ├── api-security/                  # core (OWASP API Top 10 lens)
│   ├── cloud-and-infra/               # extended: patterns + pitfalls only
│   └── cryptography/                  # extended: patterns + pitfalls only
├── guides/                    # end-to-end capabilities
│   ├── build-secure-feature-from-scratch.md   # Capability A
│   └── analyze-existing-project.md            # Capability B (bounded time budget)
├── skills/                    # bounded, repeatable procedures
│   ├── authz-review/SKILL.md
│   ├── secret-leak-scanner/SKILL.md
│   └── injection-review/SKILL.md
└── agents/                    # context-isolation workers
    ├── dependency-cve-triager.md
    └── threat-model-drafter.md
```

**Why topics are split the way they are.** Authentication and authorization are separate directories because conflating them is itself a top-5 root cause of breaches ("the user is logged in" treated as "the user may do this"). OAuth/OIDC/JWT gets its own topic because token misuse has failure modes independent of both authN and authZ and revises on its own standards cadence (RFC 9700). SSRF/XXE/deserialization share a directory because they share a root cause — the server made to act as a confused deputy against itself — and share prevention infrastructure (egress control, parser hardening).

**Why skills embed their own check tables** instead of pointing at topic docs: a Haiku-class model executing `authz-review` may have only that one file in context. Duplication between skill and topic doc is accepted and managed via CHANGELOG discipline (update both or neither).

**Boundary cases decided:**
- *Vulnerability-report triage* → a decision tree inside `principles/incident-response.md` §2 rather than a skill: the procedure is short but every branch is judgment, and it needs the severity model in the same document anyway.
- *Threat modeling* → both a principles doc (teaches the judgment) *and* a subagent (`threat-model-drafter`, for when the input is a whole feature spec + codebase). The doc is canonical; the agent applies it.
- *Secret scanning* → a skill (bounded diff/repo scan with interpretation guidance), not a subagent: findings must land in the caller's context where remediation happens, and the output is small even when the input is a full repo.
- *Whole-codebase risk analysis* (Capability B) → a guide, not a subagent, because the human/agent doing it needs to make scoping tradeoffs mid-flight. The guide tells you when to dispatch the subagents as workers.

## Non-negotiables applied throughout

- Every doc opens with a date stamp and the standards revision it tracks (OWASP Top 10 **2021**, OWASP API Security Top 10 **2023**, CWE **v4.x**, ASVS **5.0 (2025)**, NIST SP 800-63B, OAuth 2.0 Security BCP **RFC 9700 (2025)**). When a standard revises, CHANGELOG.md records what was re-verified.
- Every doc is standalone-readable; cross-links are enrichment, not dependencies.
- Every vulnerability class gets **failure mode → detection → fix → prevention** — prevention meaning a *durable control* (lint/SAST rule, CI gate, review-checklist line), because a fix without a prevention control is a fix you'll make again next quarter.
- **No exploit code, ever.** Patterns and detection signatures only. The KB teaches you to recognize a vulnerable shape and fix it, not to weaponize it. Where an example must show unsafe code, it shows the *vulnerable pattern* and the *fixed pattern*, never a working attack payload.
