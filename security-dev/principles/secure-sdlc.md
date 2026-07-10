# Secure SDLC — Where Tooling Helps, Where It Lies, and How to Gate

**Date:** 2026-07-06 · **Tier:** core · **Standalone:** yes · **Related:** [threat-modeling.md](threat-modeling.md) (design time), [secure-code-review.md](secure-code-review.md) (review time), [../topics/supply-chain/](../topics/supply-chain/README.md) (dependency layer)

The secure SDLC is not a tool pipeline; it's the placement of the *cheapest effective control at each phase*. A vulnerability costs roughly 1× to prevent at design, 10× to fix at review, 100× in production, and reputation-plus-100× in a breach. Everything below is about buying findings at the cheapest phase.

## 1. The control map (what runs when, and what each is blind to)

| Phase | Control | Catches | Constitutionally blind to |
|---|---|---|---|
| Design | Threat model ([threat-modeling.md](threat-modeling.md)) | Missing controls, wrong trust assumptions — the 1× bugs | Implementation defects |
| Commit | Pre-commit secret scan | Secrets before they enter history (after = rotation, not deletion — [../topics/secrets-and-keys/](../topics/secrets-and-keys/README.md)) | Everything else |
| PR | SAST + security-aware human/agent review | Taint→interpreter paths, dangerous APIs; humans/agents catch the *absent* code | SAST: missing authZ, business logic, config. Humans: fatigue |
| PR | SCA / dependency scan | Known-vulnerable deps, license issues | Your own bugs; malicious-but-unreported packages; reachability |
| Build | SBOM generation + artifact signing | Nothing directly — buys incident-day speed and provenance ([../topics/supply-chain/](../topics/supply-chain/README.md)) | — |
| Pre-deploy | DAST / API fuzzing against staging | Deployed-config bugs: missing headers, verbose errors, some injection, authN gaps | Anything behind login flows it can't drive; code it never triggers; IDOR (it doesn't know your object model) |
| Runtime | Egress control, WAF, detection/alerting | Exploitation *attempts*; blast-radius limits | Prevention. A WAF is a speed bump, never the fix |

The composite lesson: **every tool's marketing describes its catches; your job is knowing its blindness.** The classes that dominate real breaches — broken authZ, business-logic abuse, leaked credentials *used legitimately* — are precisely the ones no scanner sees. Tools free human attention for those; they don't replace it.

## 2. SAST without the hatred (the rollout that survives)

SAST fails organizationally, not technically: switched on with 400 findings, teams triage none, gate gets disabled within a quarter. The rollout that works:

1. **Baseline and freeze.** Existing findings go to a dated backlog; the gate applies to *new* code only ("no new criticals in changed files"). You cannot gate your way out of history.
2. **Curate rules to your stack.** Start with the taint rules for your actual interpreters (SQL, shell, template) and the dangerous-API rules from [secure-code-review.md](secure-code-review.md) §3. Kill any rule with >30% false-positive rate in your codebase — each one burns trust you need for the true positives. Semgrep-style custom rules that encode *your* framework's escape hatches (`raw(`, your internal `unsafeQuery`) out-earn the entire generic ruleset.
3. **Make suppression visible, not hard.** An inline `// security-suppress: reason` that shows up in a weekly report beats an unsuppressable gate people route around with refactoring tricks. Audit suppressions monthly; a growing suppression count in one team is a signal, not an annoyance.
4. **Every incident feeds a rule.** Post-incident, ask: what SAST/lint rule, had it existed, would have flagged this? Write it. This is how the tool becomes *your* tool. (Same discipline as prevention items in every topic doc in this KB.)

## 3. The minimum viable pipeline (adopt in this order)

For a team with nothing, in payoff order — each step is useful alone:

1. **Secret scanning** (pre-commit + CI + org-wide history scan) — cheapest catastrophic-bug preventer that exists. [../skills/secret-leak-scanner/SKILL.md](../skills/secret-leak-scanner/SKILL.md) for the on-demand version.
2. **Dependency scanning + lockfiles + update automation** — you ship more third-party code than first-party. [../topics/supply-chain/](../topics/supply-chain/README.md).
3. **Framework-default hardening review** — one-time: auto-escaping on, ORM everywhere, deny-by-default routing/authZ middleware, security headers at the edge. Defaults out-earn scanners ([security-mindset.md](security-mindset.md) §5).
4. **SAST with curated rules** per §2.
5. **Threat modeling** at Level 1–2 ([threat-modeling.md](threat-modeling.md) §5) for boundary-crossing features.
6. **DAST/API scanning** against staging — last because it's the noisiest per finding, and most of its catches are cheaper upstream.

## 4. Gates vs. guardrails (the political engineering)

A **gate** blocks merge/deploy; a **guardrail** warns and records. Gate only what is (a) high-confidence and (b) high-severity: new hardcoded secret, new critical taint finding in changed code, known-exploited CVE in a directly-reachable dependency, authZ test suite failing. Everything else is a guardrail feeding a weekly review.

Two failure modes to design against — both are things I've watched kill programs:

- **The gate that lies gets bypassed.** One false-positive week where the security gate blocked a legitimate release, and engineering leadership will hold a meeting about making it advisory. Precision before coverage, always.
- **The guardrail nobody reads is decoration.** Every guardrail needs a named owner and a cadence ("AppSec reviews the suppression + new-findings digest Tuesdays"). No owner → delete it honestly rather than pretend.

**Security tests are the load-bearing gate.** The authZ regression tests, the "foreign user gets 404" suite, the webhook-signature rejection test ([threat-modeling.md](threat-modeling.md) §4's proof artifacts) are the only gate in the whole pipeline that encodes *your* threat model rather than generic badness. Treat a red security test with the seriousness of a red build, and never quarantine one to ship.

## 5. Metrics that mean something

Skip "findings count" (measures scanner chattiness). Track: **time-to-remediate by severity** (the SLA that matters: criticals in days, not quarters), **% of changed-code PRs with security review** on sensitive paths, **secret-leak incidents requiring rotation** (should trend to ~0 after step 1 lands), **suppression growth rate**, and **mean time from CVE publication to "are we exposed?" answer** (SBOM maturity — minutes when it's working, days when it's not).
