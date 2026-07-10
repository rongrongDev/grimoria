# Analyze an Existing Internal Tool — unfamiliar codebase → risk assessment + remediation plan, time-boxed

**Applies to:** any inherited/unfamiliar internal tool — CLI, codegen, lint config, tooling web app. **Last verified:** 2026-07-06.

This is capability B of this KB: take a tool you've never seen and produce, within a bounded budget, three deliverables — **(1) a UX/adoption risk assessment, (2) a breaking-change/versioning risk list, (3) a prioritized remediation plan.** The output contract at the bottom is the deliverable; everything above it is how to fill it honestly.

**Time budgets.** Quick pass: **2 hours** (phases 0–2 shallow, deliverables with confidence marked low). Standard: **1 day** (all phases). Deep: **3 days** (standard + dispatching the subagents + reading consumer repos). Declare which budget you ran before your findings — an unstated budget makes a 2-hour skim read like a 3-day audit, and someone will bet a migration on it. When the budget is up: ship with `[not examined]` sections rather than extending — an honest partial beats a late complete, and `[not examined]` is itself a finding.

**The prime rule: judge the tool from the outside first.** Its README will tell you what it aspires to be; its error messages, changelog, and consumers tell you what it is. Read the code *last* — code-first analysis anchors you on implementation cleverness and blinds you to the user-facing rot that actually kills tools.

## Phase 0 — Identity and blast radius (~15% of budget)

Establish before judging anything:

- **What is it and who owns it?** One-sentence job (if you can't extract one from the help/README, that's finding #1). Named owner still at the org? Last commit date; open-issue staleness.
- **Who consumes it, really?** Installs/usage telemetry if any (and if none: adoption is unmeasured — automatic finding, `adoption-and-rollout.md` §4). Quick grep for invocations in CI configs, Makefiles, wrapper scripts of the 3–4 likeliest consumer repos. **Deep budget:** dispatch **`change-impact-scanner`** for the honest org-wide inventory — it returns the blast-radius table this phase wants, without flooding your context.
- **What versions are in the wild?** Latest release vs what consumers pin (or worse: nothing pinned, everyone on "latest" — pre-finding for phase 2). Is there a changelog at all, and does it speak to consumers?
- **Which class of tool is it?** CLI / codegen / lint / dashboard — this selects which phase-1/2 checklists apply and which principles doc calibrates severity.

**Exit artifact:** five lines — job, owner, consumer count (measured or estimated-with-basis), version spread, tool class.

## Phase 1 — UX & adoption risk (~35% of budget)

**Use it cold, as a new user, before reading any source.** You are the 15-minute test (`adoption-and-rollout.md` §2) with the clock running.

For a CLI (score against `principles/cli-ux.md`; the fastest route is invoking the **`cli-error-ux-reviewer`** skill, which executes this sub-phase with an output contract you can paste into your report):

- Run bare command, `--help`, a plausible-but-wrong invocation, a missing-file case, a no-auth case, and one command with stdin closed (the CI-hang probe). Score each error against the three-part contract; note every stack trace, every exit-0-on-failure, every prompt that would hang CI.
- Flag-convention consistency across subcommands; help completeness (undocumented flags = count them); does `--json` exist and is stdout pure.
- Time your own path from zero to first success, honestly.

For codegen: run the **`codegen-drift-auditor`** skill — regenerate twice, diff against checked-in, classify (nondeterminism / skew / manual edits). For a lint config: suppression census (`grep -rc` per rule), warn-forever rules, unowned rules (`static-analysis.md` §1, §4). For a dashboard: the 90-second first-visitor test, per-panel freshness stamps, "worst row it can render" access check (`internal-dashboards.md` §1–3).

**Adoption signals regardless of class:** support-channel themes (skim the last 90 days — the top recurring question is the top UX bug); workaround artifacts (wrapper scripts, `--force` cargo-culting, forks); the gap between mandated and measured usage.

**Exit artifact:** scored findings, each tagged `[UX]` with severity and the *evidence* (the actual bad error message, the actual hang).

## Phase 2 — Breaking-change & versioning risk (~30% of budget)

Now open the repo, looking only for contract surfaces and their protection:

- **Enumerate the public surface** (`distribution-and-versioning.md` §1): commands, flags, defaults, exit codes, stdout/JSON shapes, config schema, env vars — and for codegen, output shape. Is this surface *declared* anywhere, or does "breaking" have no definition here? Undeclared surface is the root risk; everything else compounds it.
- **Change protection:** tests on exit codes and output formats? Help snapshots? Golden outputs (codegen)? A surface with no tests breaks silently on refactor — list each unprotected surface as a named risk.
- **Version hygiene:** semver honored in history? (Sample 3 recent releases; diff their changelogs against their actual diffs — a "minor" that renamed a flag tells you everything.) Changelog for consumers? Deprecation warnings ever used, or do things just vanish?
- **Skew exposure:** can consumers pin? Do they? CI installing "latest" of this tool is a standing incident (`distribution-and-versioning.md` §4, §7). Auto-update: silent-failure design or loud? Version telemetry tail?
- **Rollback:** are old artifacts retained and installable? Is yank one command or a re-release?
- **Release automation:** if release = "a human runs a script from their laptop", the artifact provenance and the bus factor are both findings.

**Exit artifact:** the breaking-change/versioning risk list, each entry: surface → protection status → who breaks if it changes → severity.

## Phase 3 — Synthesis: the remediation plan (~20% of budget)

Rank every finding by **(blast radius × likelihood) / fix cost** — not by how offended you were. A missing `--json` flag annoys; an unpinned org-wide consumer base one bad release from a red morning is the top of the list. Then sequence with the tool-work-specific rules:

1. **Stop-the-bleeding first** (hours): pin the unpinned consumers, add the drift gate, fix the exit-0-on-failure, kill the CI-hanging prompt. These are cheap and buy safety for everything else.
2. **Measurement second** (days): if usage/error telemetry doesn't exist, add it before investing in features — every later decision improves, and you can't verify remediation worked without it (`adoption-and-rollout.md` §4).
3. **Trust repairs third**: top-3 error messages by volume, suppression-heavy lint rules, noisy codegen diffs — the compounding-return fixes.
4. **Structural work last** (weeks): surface declaration + protection tests, release automation, migration tooling — scheduled, owned, not "someday".

Include a **keep/fix/sunset verdict**. If phase 0 found no owner, near-zero measured usage, and a healthier alternative exists, the honest plan is a sunset plan (`adoption-and-rollout.md` §5) — recommending investment in a tool that should be retired is this guide's version of a false positive.

## Output contract (the deliverable)

```markdown
# Tool analysis: <name> — <date> — budget: <2h | 1d | 3d> — analyst: <who/model>
## Identity (phase 0)
Job: … | Owner: … | Consumers: N (measured|estimated via …) | Versions in wild: … | Class: …
## Verdict
KEEP-AS-IS / FIX (invest) / SUNSET — one paragraph of because.
## UX & adoption risks (phase 1)
| # | Finding | Evidence | Severity | Principles ref |
## Breaking-change & versioning risks (phase 2)
| # | Surface | Protection today | Who breaks | Severity |
## Remediation plan (phase 3)
| Priority | Action | Effort | Risk retired | Owner suggestion |
## Not examined
[what the budget excluded — always present, even for the 3-day pass]
```

## Cross-references

- Severity calibration per finding class: `principles/cli-ux.md`, `principles/codegen.md`, `principles/static-analysis.md`, `principles/distribution-and-versioning.md`, `principles/internal-dashboards.md`, `principles/adoption-and-rollout.md`.
- Executable sub-phases: **`cli-error-ux-reviewer`** (phase 1, CLIs), **`codegen-drift-auditor`** (phase 1, generators). Org-wide consumer inventory: **`change-impact-scanner`** subagent (phase 0, deep budget).
- Auditing many tools for consistent conventions at once: fan-out pattern in `tool-engineer/orchestration/README.md` §3 — this guide is the per-tool worker.
- If the "tool" is primarily a test framework, run this guide for its CLI/distribution surface and hand test-strategy judgment to `quality-dev`/`test-automation-engineer` (adjacent KBs).
