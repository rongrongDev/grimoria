# Guide: Analyze an Existing Project for Security Risk

**Date:** 2026-07-06 · **Capability:** take an unfamiliar codebase and produce, within a bounded time budget: (1) a trust-boundary/data-flow summary, (2) a prioritized vulnerability-class risk list, (3) a remediation plan · **Standalone:** yes · **Audience:** security engineers, staff+ generalists, or AI agents driving the assessment · **Scope discipline:** this produces *risk findings and fixes*, never exploit demonstrations — verification means reading code paths and running benign probes on non-production environments

## 0. Contract and budgets

Deliverables are fixed regardless of budget; **depth scales, structure doesn't.** Time-box hard — an assessment that's 80% done everywhere beats 100% done on one topic and silent on the rest, because the *silent* areas read as "fine" to whoever receives the report. Say what you didn't look at.

| Budget | Phase 1 (map) | Phase 2 (mechanical) | Phase 3 (judgment passes) | Phase 4 (report) |
|---|---|---|---|---|
| Half-day | 1.5h | 1h (automated only) | 1h, top-3 surfaces only | 30m |
| 2 days | 3h | 3h | 1 day | 2h |
| 1 week | 1 day | 1 day | 2.5 days | 0.5 day |

Ground rules: read-only posture (no fixes mid-assessment — they destroy your own baseline and scope); get authorization explicit and written if you're external or agent-driven; work from the deployed reality (prod config, actual routes) wherever access allows, because the docs describe the system someone *meant* to build.

**Agent-driven note:** the *caller* follows this guide and makes the scoping calls; dispatch subagents for the bulk reading ([orchestration §1](../principles/multi-agent-orchestration.md)) — [dependency-cve-triager](../agents/dependency-cve-triager.md) for Phase 2's dependency layer, [threat-model-drafter](../agents/threat-model-drafter.md) for Phase 1's draft at large scale — and apply the skills per-surface in Phase 3. Merge with the [check-spec discipline](../principles/multi-agent-orchestration.md) §3: fixed verdict vocabulary, `UNKNOWN(reason)` always legal.

## Phase 1 — Map before you hunt (deliverable 1: trust-boundary summary)

Resist the urge to grep for bugs first. Findings without a map mis-prioritize — the scariest-looking bug in a dead admin tool matters less than a mediocre one on the money path.

1. **Inventory the surfaces:** every way input enters — routes (dump the *served* router/gateway config, not the docs; [api-security §6](../topics/api-security/README.md)), queue consumers, cron jobs, webhooks, file uploads, admin panels, "internal" APIs. Every way data leaves — responses, emails, outbound calls, logs, exports.
2. **Inventory the assets:** what here is worth attacking? PII/financial/health data stores, credentials and token mints, money-moving operations, compute (for cryptojacking), and *your users' trust* (the send-email-as-you capability). Rank them — this ranking drives everything downstream.
3. **Draw the flow + boundaries:** one page, [threat-modeling §2](../principles/threat-modeling.md) style, with the [chronically-missed boundaries](../principles/security-mindset.md) §2 checked by name: DB→render paths, queue→consumer, webhook→handler, CI→artifact, third-party→you.
4. **Identity census:** what authenticates (users, services, CI), holding what privileges, minted where? ([secrets-and-keys §5](../topics/secrets-and-keys/README.md) gradient tells you what "bad" looks like.)
5. **Posture skim — the tell-check (30 minutes, calibrates everything):** `Set-Cookie` flags ([one-header test](../topics/authentication-and-sessions/README.md) §4), security headers present ([web-client §3](../topics/web-client-security/README.md)), error verbosity on a bad request, lockfile committed?, CI has any security gates?, secret scanning on?. These cheap signals predict the deep findings with embarrassing accuracy: a codebase that fails the cookie-flag check has never had a security pass, and you should budget Phase 3 accordingly.

## Phase 2 — Mechanical sweep (breadth, automatable, fan-out-able)

Run the low-judgment/high-coverage layer across the whole tree; output = *leads*, graded in Phase 3:

- **Secrets:** [secret-leak-scanner](../skills/secret-leak-scanner/SKILL.md) over working tree **and history** — history hits are live findings until rotation is proven ([secrets-and-keys §1](../topics/secrets-and-keys/README.md)).
- **Dependencies:** dispatch [dependency-cve-triager](../agents/dependency-cve-triager.md) — returns the reachability-ranked table, not the raw scanner dump ([supply-chain §4](../topics/supply-chain/README.md)). Note lockfile/SBOM hygiene as findings in their own right.
- **Dangerous-API grep:** the [full table from code-review §3](../principles/secure-code-review.md) — raw SQL assembly, shell-string exec, deserializers, `verify=False`, escape-hatch renderers, non-CSPRNG randoms near tokens, JWT decode variants. Record hit counts per class; the *distribution* tells you the house style (three `raw(` calls = escape hatches to check; three hundred = no ORM discipline exists, which is a finding about the class, not thirty findings).
- **Config surfaces:** CORS config, debug endpoints (`/actuator`, `/debug`, GraphQL introspection), TLS/cookie settings, CI workflow permissions ([supply-chain §5](../topics/supply-chain/README.md)), container/IaC manifests against [cloud-and-infra](../topics/cloud-and-infra/README.md)'s drills.

## Phase 3 — Judgment passes (depth, ranked by Phase 1's asset map)

Take the top surfaces by asset value × exposure and run the targeted review per class — each pass is its topic doc's drill applied for real:

1. **AuthZ pass on the crown-jewel objects** (highest yield per hour in almost every assessment, because [scanners can't see it](../topics/authorization/README.md) §0): pick the top 3 object types, trace *every* route to each (including exports, search, batch, GraphQL nodes), apply the [authz-review skill](../skills/authz-review/SKILL.md)'s scoped-fetch rule. Two-account probe on staging where permitted.
2. **AuthN/session pass:** [authentication drill §7](../topics/authentication-and-sessions/README.md) against login/reset/session code; [JWT/OAuth drill §5](../topics/oauth-oidc-jwt/README.md) if tokens are in play.
3. **Injection pass on taint-heavy handlers:** Phase 2's grep hits, now traced source→sink with the [injection-review skill](../skills/injection-review/SKILL.md); include the [SSRF/parser inventory](../topics/ssrf-xxe-deserialization/README.md) §4 if the app fetches or parses.
4. **The background-path pass** (chronically skipped, disproportionately bloody): cron jobs, queue consumers, exporters — tenant scoping ([authorization §5](../topics/authorization/README.md)), payload trust ([deserialization](../topics/ssrf-xxe-deserialization/README.md) §3), credential privilege.
5. **Detection reality-check:** if the top-1 asset were being breached *right now*, what log line fires? Trace it for real. "None" is a top-5 finding in most first assessments ([incident-response §1](../principles/incident-response.md)'s no-logging trap) and it re-weights every other finding's severity upward.

## Phase 4 — Report (deliverables 2 and 3)

**Risk list format — one row per *class-on-surface*, not per instance** ("object-level authZ absent across invoice/export/search routes: 14 instances, pattern P" beats 14 tickets; the fix is one pattern + one test scaffold):

| Rank | Finding (class @ surface) | Evidence (file:line, probe result) | Exploitability in *this* deployment | Blast radius (asset map) | Chain notes |
|---|---|---|---|---|---|

Rank by exploitability × blast-radius, with [chain analysis](../principles/security-mindset.md) §3 explicitly applied — the report's rank is the *chain's* severity, and the classic under-rankings (enumeration + informative errors + no rate limit) get promoted accordingly. State negative results and unexamined areas ("payment code reviewed, clean against the injection drill"; "mobile client out of scope") — the reader must know silence from absence, and honest `UNKNOWN`s route follow-up correctly ([orchestration §4](../principles/multi-agent-orchestration.md)).

**Remediation plan — three horizons, every line with an owner:**

- **Now (days):** anything internet-reachable + severe from §1's matrix ([incident-response](../principles/incident-response.md) severity model — a live critical finding converts the assessment into an incident; say so plainly and start that process, don't bury it at rank 1 of a report nobody reads until Friday); leaked-secret rotations; KEV-listed reachable CVEs.
- **Next (weeks):** the per-class pattern fixes with their prevention twins — the fix *and* the lint rule/test scaffold/CI gate that holds it ([every topic doc's prevention discipline](../principles/security-mindset.md) §5: fix the instance, kill the class).
- **Later (quarter):** structural — deny-by-default authZ middleware, secret-manager migration, egress policy, the [paved road](build-secure-feature-from-scratch.md) Phase 0 items this codebase is missing. These out-earn any individual finding; the report should say which single structural item retires the most rows.

Close with the re-assessment trigger: after *Next* lands, or when a new boundary ships — whichever is first.
