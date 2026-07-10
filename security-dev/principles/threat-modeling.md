# Threat Modeling — STRIDE Applied Practically, Right-Sized, and Turned Into Tests

**Date:** 2026-07-06 · **Tier:** core · **Standards:** STRIDE (Microsoft), maps to CWE v4.x classes · **Standalone:** yes · **Related:** [security-mindset.md](security-mindset.md) §2, [../agents/threat-model-drafter.md](../agents/threat-model-drafter.md) (applies this doc at feature scale), [../guides/build-secure-feature-from-scratch.md](../guides/build-secure-feature-from-scratch.md) (worked example)

A threat model is four questions answered in writing: **What are we building? What can go wrong? What are we doing about it? Did we do it?** Everything else — STRIDE, diagrams, tooling — is scaffolding for answering those honestly. The most common failure isn't a bad threat model; it's a beautiful one produced once, never turned into tests, and never reopened.

## 1. When to threat-model (decision tree)

- **New feature crossing a trust boundary** (new input path, new integration, new data store, new consumer of user content) → yes, before implementation. 30–90 minutes, not a week.
- **New service / product** → yes, full session (§2–§4), revisited at each major architectural change.
- **Refactor with no boundary change** → no formal model; note "no new boundaries" in the PR and move on. Threat-modeling theater on boundary-neutral changes is how teams learn to skip it when it matters.
- **Existing system, never modeled** → model the *current* system as Phase 1 of [../guides/analyze-existing-project.md](../guides/analyze-existing-project.md); don't retrofit feature-by-feature.
- **After an incident** → re-model the involved boundary; incidents are evidence your last model was wrong there.
- **Input is a large spec/codebase and you need a draft fast** → dispatch [../agents/threat-model-drafter.md](../agents/threat-model-drafter.md); review its output with §6's quality bar. A drafted model you *review* beats a blank page you never fill.

## 2. Step one: draw the data flow (15 minutes, non-negotiable)

You cannot enumerate what can go wrong in a system you haven't drawn. Boxes (processes), cylinders (stores), arrows (data flows), external actors, and **dashed lines at every trust-level change** ([security-mindset.md](security-mindset.md) §2 lists the boundaries everyone misses — queues, webhooks, the DB read path, CI).

Keep it one page. If it doesn't fit, your scope is too big — model the feature, not the company. For each arrow, annotate: what data, which direction, what authN/authZ is enforced *at that crossing*.

## 3. STRIDE as a prompt, not a form

Walk each element and boundary crossing asking which of the six apply. STRIDE's value is *coverage* — it forces you past the two threats you already thought of. Don't write essays; write one line per real threat.

| Letter | Question at each crossing | Classic finding | Deep-dive topic |
|---|---|---|---|
| **S**poofing | How do we know who's on the other end? | Unverified webhook signatures; service-to-service calls with no authN | [../topics/authentication-and-sessions/](../topics/authentication-and-sessions/README.md) |
| **T**ampering | Can the data be modified in flight/at rest by the wrong party? | Client-side price/role fields trusted; unsigned tokens; mass assignment | [../topics/api-security/](../topics/api-security/README.md) |
| **R**epudiation | Can someone deny doing it? Would we know who did? | No audit log on privileged actions; shared service accounts | [incident-response.md](incident-response.md) §5 |
| **I**nformation disclosure | Who can read this who shouldn't? | IDOR; verbose errors; over-fetching APIs; secrets in logs | [../topics/authorization/](../topics/authorization/README.md), [../topics/secrets-and-keys/](../topics/secrets-and-keys/README.md) |
| **D**enial of service | What happens under hostile load or poison input? | Unbounded uploads; regex backtracking; no rate limit on expensive endpoints | [../topics/api-security/](../topics/api-security/README.md) §rate-limiting |
| **E**levation of privilege | Can a low-trust actor gain high-trust capability? | Injection classes; deserialization; BFLA; SSRF→metadata | [../topics/injection/](../topics/injection/README.md), [../topics/ssrf-xxe-deserialization/](../topics/ssrf-xxe-deserialization/README.md) |

Two habits that separate useful models from ceremony:

- **Name the actor.** "An attacker could tamper" is weather. "A logged-in free-tier user can PATCH `plan_tier` because the update endpoint binds the whole body" is a threat someone can test. Threats have subjects, verbs, and objects.
- **Steal from the past.** Before finishing, ask: what has actually gone wrong in systems like this? Your incident history and the topic docs' failure modes are pre-enumerated threats. A threat model that ignores the company's own last three incidents is fiction.

## 4. From threats to controls to *proof* (the step everyone skips)

Every threat gets one of four dispositions — and the first two get a **verifiable artifact**:

| Disposition | Requires | Example |
|---|---|---|
| **Mitigate** | The control AND the test/gate that proves it stays mitigated | Threat: BOLA on `/invoices/{id}` → control: ownership check in handler → proof: an authorization test that fetches another user's invoice and asserts 404, running in CI forever |
| **Eliminate** | Design change removing the threat | Don't accept user-supplied URLs at all; fetch by ID from an allowlist |
| **Accept** | A name, a date, and a sentence of why — written down | "Timing side-channel on login accepted; uniform-response cost not justified for this asset. — J.K., 2026-07-06" |
| **Transfer** | The party actually holding it (processor, insurer) and verification they do | Card data never touches us; verify PCI scope annually |

The conversion rule: **a mitigated threat without a regression test is an accepted threat wearing a costume.** Controls decay — someone refactors the middleware, adds a second route, "temporarily" disables the check. The test is what makes the threat model outlive the meeting. This is how a threat model becomes the review checklist and test plan for the feature — worked end-to-end in [../guides/build-secure-feature-from-scratch.md](../guides/build-secure-feature-from-scratch.md).

## 5. Right-sizing (the rubric)

Cost of modeling must track value-at-risk, or the practice dies of overhead:

- **Level 0 — note in PR** (5 min): boundary-neutral changes. "No new inputs, stores, or callers."
- **Level 1 — lightweight** (30–60 min, in the design doc): one feature, one or two new crossings. Data-flow sketch, STRIDE pass on the *new* crossings only, threats→tests table. Most features live here.
- **Level 2 — full session** (half day, 2–4 people incl. one non-author): new service, new external integration, anything touching money/PII/auth. Full §2–§4.
- **Level 3 — full + adversary review** (external or dedicated red-team review of the model): payment flows, cross-tenant isolation mechanisms, anything whose failure is company-ending.

Anti-patterns at either end: 40-page models for a CRUD endpoint (theater; teaches people to route around security) and "we'll model it after launch" (you won't; the backlog will eat it — and retrofit controls cost 10× design-time controls).

## 6. Reviewing a threat model (yours, a teammate's, or an agent's)

A model is *done* when: (1) the diagram matches the code that actually shipped — verify, don't assume; (2) every trust-boundary crossing has at least one threat considered or an explicit "nothing beyond baseline here" with a reason; (3) every mitigation has its proof artifact linked (test, gate, config); (4) acceptances have names and dates; (5) someone who didn't build the feature has read it and asked one hostile question.

When reviewing an agent-drafted model specifically ([../agents/threat-model-drafter.md](../agents/threat-model-drafter.md)): the characteristic failure is *plausible completeness* — fluent STRIDE coverage of the boundaries visible in the spec, silent on the ones only in the code (the debug route, the second queue consumer, the cron job with prod credentials). Spot-check the diagram against the actual router/config before trusting the rest.
