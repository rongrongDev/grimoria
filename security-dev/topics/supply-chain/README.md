# Supply-Chain Security — Dependencies, Build Integrity, SBOM, and CVE Triage Judgment

**Date:** 2026-07-06 · **Tier:** core (full depth) · **Standards:** OWASP Top 10 2021 A06 (Vulnerable & Outdated Components), A08 (Software & Data Integrity Failures); SLSA v1.0; CWE-1357, CWE-829, CWE-506; SBOM formats: SPDX 2.3+, CycloneDX 1.5+ · **Standalone:** yes · **Fleet-scale triage:** dispatch [../../agents/dependency-cve-triager.md](../../agents/dependency-cve-triager.md) · **Related:** [../secrets-and-keys/](../secrets-and-keys/README.md) §5 (CI credentials), [../../principles/multi-agent-orchestration.md](../../principles/multi-agent-orchestration.md) §3 (CVE-day fan-out)

You ship far more code you didn't write than code you did — a typical service is 90%+ third-party by volume. Supply-chain security is the discipline of extending your trust decisions to that 90%: what you pull in (§1–§2), how you know what you're running (§3), how you react when a dependency turns out to be vulnerable (§4 — where the judgment lives), and whether the artifact you deploy is the artifact you built (§5).

## 1. Malicious packages: dependency confusion & typosquatting (CWE-1357, CWE-506)

**Failure mode — dependency confusion:** your internal package `acme-billing-utils` lives in a private registry; an attacker publishes `acme-billing-utils` at a *higher version* on the public registry; a resolver configured to check both prefers the higher version, and the attacker's install script runs inside your build. This worked against a who's-who of tech companies when first demonstrated (2021) and still works against misconfigured resolvers today, because the failure is per-repo config, not per-ecosystem.

**Failure mode — typosquatting/brandjacking:** packages named one edit away from popular ones (`requets`, `python-dateutil` vs `python3-dateutil` variants), or plausible-sounding scoped names, carrying credential-stealers in install hooks. Increasingly: **maintainer-account takeover** — the *legitimate* package's next release is malicious (the highest-profile npm incidents of recent years were this shape), which no name-checking catches; that's what §2's version-pinning-plus-delay and install-script controls are for.

**Detection.** Resolver config audit: does any manifest/registry config allow public fallback for internal-scoped names? (The finding is in `.npmrc`/`pip.conf`/`settings.xml`/registry proxy rules, not in code.) Lockfile diff review on every dependency change: new packages, changed registries/URLs, new install hooks. Behavioral: install-time network egress from build hosts to unexpected destinations is the runtime tell ([secrets-and-keys](../secrets-and-keys/README.md) §5's per-pipeline identity limits what it steals).

**Fix/Prevention.**
- **Namespace protection:** reserve/claim your internal names (or your scope/prefix) on public registries; configure resolvers with *explicit* registry-per-scope routing, never "try private, fall back to public."
- **One gateway registry:** all installs (dev + CI) go through an internal proxy that allowlists/quarantines — a single choke point for policy ([mindset](../../principles/security-mindset.md) §5, structural control over vigilance).
- **Install scripts disabled by default** (`--ignore-scripts` in npm CI config and equivalents) with an allowlist for the few that genuinely need them — install hooks are the malicious payload's front door in most incidents.
- **Adoption gate for new dependencies:** before a package enters the tree, sixty seconds of judgment: age, maintainer count, release cadence, download base, does it *need* to exist (is it 8 lines you could write — the left-pad lesson is about fragility, not just malice), and does it want install scripts/network at install? Encode as a checklist line in review, not a wiki page.

## 2. Version management: pinning, updating, and the two-sided risk

**Failure mode, both directions.** *Unpinned/floating versions:* builds aren't reproducible, and a hijacked upstream release enters production automatically — you've delegated your deploy decision to every maintainer you depend on. *Never updating:* you accumulate known-vulnerable components until the backlog itself is the vulnerability (and the eventual forced upgrade across 6 major versions is a rewrite). Teams oscillate between these; both extremes lose.

**Fix — the stable middle:** lockfiles everywhere, committed, enforced in CI (`--frozen-lockfile`-class flags — a CI resolve that differs from the lockfile is a build failure); automated update PRs (Renovate/Dependabot-class) so updating is continuous and small instead of episodic and huge; **cooldown delay for non-security updates** (e.g., auto-merge only after a release is 7+ days old) — account-takeover payloads are usually caught within days, so not being the first adopter is a real control; security updates jump the delay queue after §4 triage. **Prevention:** update-PR merge SLA tracked as a health metric ([secure-sdlc](../../principles/secure-sdlc.md) §5); CI verifies lockfile integrity hashes (registry-provided checksums/signatures where the ecosystem supports them).

## 3. SBOM — the incident-day speed control

**Failure mode it fixes.** A Log4Shell-class disclosure drops; the org's exposure question — "do we run this, where, which versions?" — takes *days* of manual archaeology across repos, images, and vendored copies. The breach happens during those days. (Log4Shell's worst amplifier was transitive and vendored copies that repo-grep never found.)

**What good looks like.** SBOM (SPDX or CycloneDX — pick one, stay consistent) **generated at build time per artifact** — not scheduled repo scans; the artifact's actual resolved tree, including transitive deps, is what you deploy — stored queryable and mapped artifact→deployment. Then CVE-day exposure is one query returning services and versions, and the [fan-out audit](../../principles/multi-agent-orchestration.md) §3 starts from a fleet list instead of guesswork. Mean-time-to-"are we exposed?" is the metric; minutes is the target ([secure-sdlc](../../principles/secure-sdlc.md) §5).

**Detection (of the gap):** ask the question for last quarter's noisy CVE and time the answer. **Prevention:** SBOM generation as a build step, gated (artifact without SBOM doesn't deploy); include container base-image contents (the OS packages are dependencies too — [cloud-and-infra](../cloud-and-infra/README.md) owns image hygiene); regenerate on rebuild, never hand-edit.

## 4. CVE triage — the judgment section

**Failure mode.** Both extremes of scanner response: *panic mode* — every CVSS 9+ triggers a fire drill, teams burn out, and within two quarters the alerts are ignored wholesale (the boy-who-cried-wolf failure is the worse one, because it's silent when it matters); *checkbox mode* — "we patch monthly" while a known-exploited RCE in an internet-facing service waits its turn in the queue.

**The triage model: CVSS is an input, not a verdict.** Score = severity of the vulnerability *in the abstract*; risk = that severity **in your deployment**. Four questions, in order, each capable of ending the analysis:

1. **Present?** Is the vulnerable *version range* actually in the resolved tree (lockfile/SBOM, not manifest — the manifest lies about transitives)?
2. **Reachable?** Is the vulnerable function/feature *called* by your code (directly or transitively), or the vulnerable config enabled? A 9.8 in a library's XML feature you never invoke is inventory, not exposure. Call-graph reachability tools help; a grep for the vulnerable API + ten minutes of honest code reading answers most cases. **Unknown counts as reachable** until answered — see verdict vocabulary below.
3. **Exposed?** Can attacker-influenced input arrive at the reachable path? Internet-facing service vs. batch job behind three walls changes the clock. ([Egress/network posture](../cloud-and-infra/README.md) counts as compensating control here — write it down if you rely on it.)
4. **Exploited in the wild?** Known-exploitation status (CISA KEV-class feeds, vendor advisories) overrides pace debates: KEV + present + exposed = today, whatever the CVSS says. Conversely a 9.8 that's present-but-unreachable = normal update cadence, *with the reasoning recorded* — an unrecorded "we decided it's fine" is indistinguishable from "we forgot" in the postmortem ([threat-modeling](../../principles/threat-modeling.md) §4's accept-with-a-name rule).

Verdict vocabulary (shared with [the triager agent](../../agents/dependency-cve-triager.md), which runs this model at tree/fleet scale): **EXPOSED** (present + reachable + attacker-reachable input — fix on incident clock), **PRESENT-UNREACHABLE** (fix on cadence, reasoning recorded, re-check when code changes), **ABSENT**, **UNKNOWN(reason)** — an honest UNKNOWN routes human attention correctly; a guessed ABSENT is how one service stays vulnerable while the dashboard is green ([orchestration](../../principles/multi-agent-orchestration.md) §4's missing-evidence failure).

**Prevention (making triage cheap):** SCA gating tuned to the model — block on KEV/critical-reachable in changed code, guardrail the rest ([secure-sdlc](../../principles/secure-sdlc.md) §4's precision rule); triage decisions logged in a queryable place (the next same-package CVE starts from the last reachability answer); virtual patching (disable the feature, WAF rule, config flag) as the honest bridge when the real patch needs a major-version migration — bridge with an expiry date, not a permanent "mitigation."

## 5. Build & artifact integrity (SLSA)

**Failure mode.** The build system as the laundering point: attacker with CI write access (a stolen PAT, a malicious PR that edits the workflow, a compromised action/plugin) injects code *after* review and *before* signing — producing an artifact that is simultaneously malicious and legitimately yours (the SolarWinds shape; [mindset](../../principles/security-mindset.md) §2's build-is-a-trust-boundary row). Sub-variants: workflows that execute untrusted PR code with secret access (`pull_request_target`-class misconfigurations), unpinned third-party CI actions (a tag move away from compromise — the 2025 tj-actions incident class), and deploy pulling `latest` by tag instead of by digest.

**Detection.** CI config review as attack-surface review: what runs on untrusted PRs, with which secrets in scope? Are third-party actions/plugins pinned by *commit SHA/digest* (tags are mutable)? Who can edit workflow files, and does workflow-edit require the same review as code? Does deploy verify *anything* about the artifact it pulls?

**Fix/Prevention.** Untrusted-PR jobs run secretless and permission-minimal (read-only default token); actions pinned by SHA with the update-bot managing bumps (§2's machinery reused); per-pipeline identities so CI compromise has a bounded blast radius ([secrets-and-keys](../secrets-and-keys/README.md) §5); **sign artifacts at build, verify at deploy** (Sigstore/cosign-class or registry-native), reference images by digest; provenance attestation (SLSA levels — L1 provenance exists → L2 signed by the build service → L3 hardened builder) adopted incrementally: even L1 turns "is this artifact ours?" from forensics into a lookup, which is exactly the incident-day question ([incident-response](../../principles/incident-response.md) §3's understand phase).

## 6. Review drill (any diff touching dependencies or CI)

1. New dependency → §1 adoption gate (age, maintainers, install scripts, necessity). Lockfile diff read, not skimmed — registries and URLs, not just names.
2. Version bump → security-motivated? Then §4 verdict recorded. Routine? Then cooldown applies.
3. CI/workflow edit → what secrets/permissions are in scope of untrusted input now? Actions pinned by SHA?
4. New internal package name → claimed/protected on the public registry?
5. Does the artifact this builds carry an SBOM and a signature, still? (Gates catch removal; reviewers catch circumvention.)
