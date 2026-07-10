---
name: secret-leak-scanner
description: Scan a diff, repo, or repo history for hardcoded secrets and unsafe secret handling — provider-signature and entropy detection, the burial grounds (git history, Dockerfiles/image layers, CI configs, fixtures, logs), plus handling anti-patterns (secrets in URLs/logs/error paths) — producing findings with rotation-first remediation. Use when reviewing PRs that touch config/env/CI/Docker files, when asked to "check for leaked/hardcoded secrets", on inheriting a repo, or as the secrets pass of security-dev/guides/analyze-existing-project.md Phase 2. Do NOT use for designing secret-management architecture (read security-dev/topics/secrets-and-keys/README.md — this skill detects, it doesn't architect), for cloud IAM permission review (cloud-and-infra topic doc), or as a substitute for continuous scanning in CI (this is on-demand; the durable control is the pre-commit + CI gate this skill will recommend when it's missing). Never output a discovered secret's full value in findings — mask to prefix + last 4.
---

# Secret Leak Scanner

**Date:** 2026-07-06 · **Standards:** CWE-798/522; provider token formats current as of this date — extend Pass 1 as new prefixes ship

You are scanning a bounded target (diff, working tree, or history) for secrets and unsafe secret handling. Self-contained; rationale lives in `security-dev/topics/secrets-and-keys/README.md`.

Two facts drive the procedure. **One:** git history is forever — a secret "removed" in a later commit is still in every clone and already harvested if the repo is public (public-repo scanners act within minutes). So scan history, not just HEAD, and treat historical hits as live. **Two:** a found secret is **rotated, never deleted** — cleanup without rotation is cosmetics; say this in every finding.

## Procedure

1. **Scope:** diff-only (PR review) / working tree (repo check) / full history (`git log -p`, or better: dedicated history tooling if available — note in the report which depth you ran). Default to working tree + history for "check this repo"; diff + a history check of touched files for PRs.
2. **Run detection passes 1–3 below.**
3. **Grade each hit** (§classification) — the judgment layer that separates this skill from a regex dump. Report format: severity · location (`file:line` or commit hash) · secret type · masked value (`AKIA...WXYZ`) · live-or-fake verdict with reasoning · remediation (rotation steps first).
4. **Report handling anti-patterns** (pass 4) even when no literal secret is found.
5. **Close with the durable-control check:** does this repo have pre-commit + CI secret scanning? If not, that's a standing High finding regardless of today's hits.

## Pass 1 — Provider signatures (high precision; any hit is presumed live until proven fixture)

Grep for these shapes (representative, not exhaustive — add the org's own internal token prefixes when known):

| Pattern | Type |
|---|---|
| `AKIA[0-9A-Z]{16}`, `ASIA[0-9A-Z]{16}` | AWS access key ID (ASIA = temporary — still report; its *source* may be leaking) |
| `ghp_`, `gho_`, `ghs_`, `github_pat_` | GitHub tokens |
| `sk-` / `sk-ant-` / `sk_live_` / `rk_live_` prefixed | OpenAI/Anthropic/Stripe-class API keys (`sk_test_`/`sk-proj-` in fixtures: verify test-mode before downgrading) |
| `xox[bpoas]-` | Slack tokens |
| `-----BEGIN (RSA \|EC \|OPENSSH \|PGP \|)PRIVATE KEY-----` | Private key material — always Critical, always rotate |
| `eyJ[A-Za-z0-9_-]+\.eyJ` | JWT — decode header/payload (base64, safe) to judge: long-exp or privileged claims = live credential |
| `postgres://\|mysql://\|mongodb(\+srv)?://\|redis://\|amqps?://` with `:[^@]+@` | Connection string with embedded password |
| `https://hooks.slack.com/services/`, cloud webhook URLs with tokens | Capability URLs — a URL can BE a secret |

## Pass 2 — Contextual/entropy (lower precision; grade before reporting)

- Assignments where the name says secret and the value is a literal: `(password|passwd|pwd|secret|token|api_?key|private_?key|client_secret|auth)\s*[:=]\s*["'][^"']{8,}` — case-insensitive, all config formats (YAML/JSON/TOML/.env/XML/HCL).
- High-entropy literals (≥20 chars, mixed classes, non-dictionary) in config files, especially base64-shaped.
- Suppress the known-false-positive shapes rather than drowning the report: `${VAR}`/`{{ template }}`/`os.environ[...]` references (that's the *correct* pattern — don't flag it), obvious placeholders (`changeme`, `your-key-here`, `xxx...`), public keys/certs (`BEGIN PUBLIC KEY`, `BEGIN CERTIFICATE` — not secrets, unless sitting next to their private half).

## Pass 3 — The burial grounds (where secrets hide from naive scans)

- **Git history** of touched/all files: secrets added-then-removed. A deleted `.env` is the classic.
- **Dockerfiles & compose:** `ENV`/`ARG` with credential values (persist in image layers even if later unset); `COPY` of `.env`/key files into images.
- **CI configs** (`.github/workflows`, `.gitlab-ci.yml`, Jenkinsfiles): inline credential literals; `set -x`/`echo` that would print secret env vars to logs; secrets passed as CLI args (visible in process lists and logs).
- **Test fixtures, seeds, notebooks** (`.ipynb` outputs!), recorded HTTP cassettes (VCR/vcrpy fixtures famously capture real auth headers), `.har` files.
- **Docs and samples:** README quickstarts and `config.example.*` files that got real values pasted in.
- **Lock/vendored content:** private registry URLs with embedded tokens in lockfiles.

## Classification (the judgment layer)

For each hit decide **live / fake / indeterminate**:

- **Fake indicators:** matches the org's fake-value convention (`test-key-not-real-*`), test-mode prefixes (`sk_test_`), documented placeholder, entropy too low to be real, fixture value that fails the provider's checksum format.
- **Live indicators:** provider checksum-valid format, sits in real config/CI, git history shows it *replaced* a working value, or the same value appears in deployment config.
- **Indeterminate = treat as live.** Never "probably test." Do NOT verify by using the credential against the provider — you are a scanner, not a caller; attempted use of a found credential is out of scope and say so if asked.

Severity: **Critical** — live cloud/VCS/private-key/payment credentials, or any live secret in a public repo (add: "assume compromised; rotate now, then audit usage over the full exposure window — from first commit, not from discovery"). **High** — live secrets in private repos (insider/fork/laptop exposure; rotation required, urgency negotiable), secret-printing CI. **Medium** — indeterminate hits, capability URLs, long-exp JWTs in fixtures. **Low** — hygiene (fixture values not following the fake convention, missing `.gitignore` entries for `.env*`).

## Pass 4 — Handling anti-patterns (report even with zero literal hits)

- Secrets read from env then **logged** at startup ("config dump" logging), or interpolated into exception messages/URLs (URLs land in access logs, referers, browser history).
- Secret comparison with `==` where a constant-time compare belongs (webhook signature checks especially).
- One secret shared across services/environments (blast-radius finding); secrets with no owner/rotation metadata if a manager is in use.
- The missing durable controls: no pre-commit hook, no CI scanning gate, no log-scrubber for the Pass-1 signature list.

## Remediation template (attach to every live finding)

1. **Rotate** the credential at the provider — now, before cleanup; new value enters via the secret manager/runtime injection, never a new commit.
2. **Audit usage** over the exposure window (provider access logs / CloudTrail-class); escalate to incident response (`security-dev/principles/incident-response.md` §4) on any anomalous use.
3. **Then** clean: history rewrite only for stopping re-detection noise and only with the team's buy-in (it rewrites everyone's clones); replace code path with manager injection.
4. **Prevent:** add the missing pre-commit/CI gate; add this secret's pattern to the log scrubber; fake-value convention for fixtures.
