---
name: cli-error-ux-reviewer
description: Review a CLI's error paths, help text, exit codes, and output discipline against the three-part error contract, producing severity-rated findings with rewrites for every bad message. Use when asked to review a CLI's UX/errors/help, before a tool's first external rollout (stage-2 gate), or as Phase 1 of tool-engineer/guides/analyze-an-existing-tool.md for CLI-class tools. Behavioral where possible — runs the tool wrong on purpose; falls back to static review of error sites when execution isn't available. Do NOT use for full tool audits including versioning/adoption (follow guides/analyze-an-existing-tool.md — this skill is its phase 1 only), for dashboards/web tools (principles/internal-dashboards.md checklists), or for designing a new CLI from zero (guides/build-a-cli-from-scratch.md).
---

# CLI Error-UX Reviewer

You are executing the review protocol from `tool-engineer/principles/cli-ux.md` on one CLI. The governing stance: **users judge a CLI in its failure moments; the error path is the product.** Every finding must carry evidence (the actual output observed or the actual source line) and, for message findings, a concrete rewrite — a review that says "unclear error" without supplying the clear version is half done.

## Procedure

**1. Establish ground rules (5 min).** Identify the tool's entry point, how to run it safely (prefer a sandbox/`--dry-run`; never run destructive commands against real targets — if only destructive commands exist, do static review for those paths and say so). Note framework and version if visible.

**2. Behavioral probe matrix.** Run each; record exact stderr/stdout, exit code, and wall time:

| Probe | Pass bar |
|---|---|
| Bare command, no args | Help or safe no-op; exit 0; never a usage dump or side effect |
| `--help`, `<subcmd> --help` | Exit 0; every flag described; ≥1 copy-pasteable example |
| Unknown flag / misspelled subcommand | Exit 2; "did you mean" suggestion |
| Missing file / bad path argument | Three-part message; exit 1; no traceback |
| No auth / expired credentials (if applicable) | Cause surfaced ("token expired"), not generic "auth error"; names the fix command |
| Unreachable backend (if applicable) | Fails within a bounded timeout; actionable message; no bare stack |
| stdin closed + any confirming command | Immediate exit 2 with "pass --yes" guidance — the CI-hang probe |
| `--json` (if it exists) with diagnostics/progress active | stdout parses as pure JSON; all human output on stderr |
| Success path piped (`| cat`) | No colors/spinner litter; result on stdout only |

**3. Score every error message observed against the three-part contract** (`cli-ux.md` §1): *what failed* (user's vocabulary) / *why* (innermost cause, survived wrapping) / *what to do next* (copy-pasteable). Tracebacks by default, "Error: exit status 1"-class messages, and wrapped-away causes are automatic HIGH findings.

**4. Static sweep of error sites** (also the fallback when the tool can't be run): grep for exit/raise/panic sites, bare `except`/`catch`-and-continue in loops over user input (silent-failure scan, `cli-ux.md` §2), raw `print`/stdout writes on diagnostic paths, exit-code assignments (build the actual code table and diff it against the documented one — undocumented is a finding).

**5. Consistency pass:** flags across subcommands vs the convention table (`cli-ux.md` §3); deprecated-but-unwarned aliases; help snapshot/flag-help tests present in the test suite (absence = the prevention gap, one finding, not per-flag).

## Output contract (emit exactly this structure)

```markdown
## CLI error-UX review: <tool> <version> — <date> — mode: behavioral | static | mixed
**Verdict:** SHIP / FIX-FIRST (n blocking) / UNSAFE-IN-CI (hang or exit-0-on-failure found)
### Findings
| # | Severity | Where (probe or file:line) | Evidence (exact output) | Problem class | Rewrite / fix |
Severity: BLOCKING (exit-0-on-failure, CI hang, stdout pollution breaking --json) ·
HIGH (traceback default, cause lost, no-remediation errors) · MED (convention drift,
help gaps) · LOW (polish).
### Exit-code table (observed vs documented)
### Prevention gaps
[missing tests/gates from cli-ux.md §7 — the items that make regressions structural]
```

## References

Contract and severity calibration: `tool-engineer/principles/cli-ux.md` · Framework-level fixes for findings (handler pattern, CliRunner tests): `tool-engineer/reference/click-typer.md` · This skill as phase 1 of the full audit: `tool-engineer/guides/analyze-an-existing-tool.md` · Estate-wide fan-out of this review: `tool-engineer/orchestration/README.md` §3.
