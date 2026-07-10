# CLI & Tool UX — the error path is the product

**Applies to:** any command-line tool, any language. Framework mechanics: `tool-engineer/reference/click-typer.md`. **Last verified:** 2026-07-06.

**The stance:** users form their opinion of a CLI in its failure moments, not its success moments. Success is invisible — the tool did the thing and got out of the way. Failure is where the user is stressed, blocked, and reading your words. I watched a genuinely excellent deployment CLI — faster and safer than the thing it replaced — get abandoned org-wide within a year because its errors were raw Java stack traces with the actual cause on line 40 of 200. Teams went back to clicking buttons in a web console *they had already complained about*, because the console at least said "insufficient quota in us-east-1" in red. Nobody files a ticket saying "your error messages are bad." They just stop using the tool, and you find out at the adoption review.

## 1. Error messages: the three-part contract

Every user-facing error must answer three questions, in this order:

1. **What failed** — the operation in the user's vocabulary, not yours. "Could not upload `dist/app.tar.gz` to the artifact store", not "PUT returned 403".
2. **Why** — the actual cause, surfaced from however deep it occurred. "Your token expired 2 days ago", not "authentication error".
3. **What to do next** — a concrete action, ideally copy-pasteable. "Run `mytool auth login` to refresh it."

```
✗ Error: exit status 1
✗ Error: EACCES: permission denied, open '/etc/mytool/config.yaml'
✓ Could not read config file /etc/mytool/config.yaml: permission denied.
  This file is usually owned by root. Either run with sudo, or point at a
  user config with --config ~/.config/mytool/config.yaml
```

Rules that took me two decades to stop compromising on:

- **Never show a stack trace by default.** A stack trace is a debugging artifact for the tool's author, not an error message for the tool's user. Catch at the top level, print the three-part message, and offer the trace behind `--debug` (and say so: "re-run with --debug for details"). Log the full trace to a file regardless, and print the path — support conversations start with "send me `~/.mytool/logs/last-error.log`".
- **Unknown errors are a bug in your error handling**, not an acceptable output. Every `Error: something went wrong` in your telemetry is a case you haven't classified yet. Track the ratio of classified to unclassified errors; it is one of the few tool-quality metrics that can't be gamed.
- **The "why" must survive wrapping.** The classic failure: layer A catches the real cause ("DNS lookup failed for artifacts.internal"), wraps it as "upload failed", layer B wraps that as "deploy failed", user sees "deploy failed". Preserve the cause chain end to end and print the innermost cause prominently.
- **Suggest, don't just reject.** Unknown command or flag → compute edit distance and offer "did you mean `--dry-run`?" Every mainstream framework has this built in or one flag away; there is no excuse.
- **One error, once.** Tools that print the same failure five times as it propagates up through their own layers train users to ignore output entirely.

## 2. Silent failures vs. loud, actionable ones

A silent failure is any case where the tool did less than the user asked and exited zero. These destroy trust faster than crashes, because the user discovers them downstream — a deploy that "succeeded" with half the assets, a formatter that skipped files it couldn't parse and said nothing.

Decision rule: **partial success is failure unless the user opted into it.** If you skip something, either (a) fail with a list of what was skipped and why, or (b) require an explicit `--skip-unreadable`-style flag, print a per-item warning to stderr, *and* exit non-zero if everything was skipped. "Warnings scrolled past in CI output" is not informing the user.

The exit-code contract (keep it small and document it in `--help` and the README):

| Code | Meaning |
|---|---|
| 0 | Full success — everything the user asked for happened |
| 1 | Operation failed (runtime error: network, permissions, remote rejected it) |
| 2 | Usage error (bad flags/args — the user's invocation was wrong) |
| 3+ | Tool-specific, only if consumers need to branch on them; document each |

Two non-negotiables: never exit 0 on any failure path (scripts and CI gate on it), and never exit non-zero on success paths like `--help` or `--version` (some frameworks default `--help` through the usage-error path; test it).

## 3. Flag naming: consistency across a suite

Nobody memorizes one tool's flags; they memorize the *convention* and guess. Every guess that fails is a paper cut, and paper cuts compound across the 40 internal tools an engineer touches. When I inherited a tool suite where one command took `--output`, its sibling took `--out-file`, and a third took `-o` meaning something else entirely, the support channel was 30% flag questions.

The convention table (adopt this or write your own — but write one and lint it):

| Meaning | Flag | Notes |
|---|---|---|
| Preview without side effects | `--dry-run` | Never `--noop`, `--preview`, `--check` in different tools |
| Output destination | `--output` / `-o` | |
| Machine-readable output | `--json` (or `--format json`) | See §5 |
| More diagnostics | `--verbose` / `-v` | Repeatable `-vv` if you need levels |
| Less output | `--quiet` / `-q` | Errors still print — quiet never means silent-on-failure |
| Skip confirmation | `--yes` / `-y` | Never overload `--force` for this |
| Override safety check | `--force` / `-f` | Reserved for "I know this is destructive" |
| Config file | `--config` | |

Mechanics: kebab-case (`--dry-run`, never `--dryRun` or `--dry_run`); booleans get `--no-` negation if defaults may flip; short flags only for the top 3–5 most-used long flags — a tool where every flag has a single letter is a tool whose help text is a cipher. Enforce with a test that walks the command tree and asserts flags against the convention table (trivial in Click/Typer — see `tool-engineer/reference/click-typer.md`); conventions enforced by review comments last one team-rotation.

## 4. Help text and discoverability

`--help` is your documentation's front line, because the audience for internal tools does not read documentation (`tool-engineer/principles/internal-dashboards.md` §1 — same audience, same law). Completeness bar:

- Every command and flag has a one-line description. A flag with no help string is a flag that generates a support question.
- The top-level help shows **the 2–3 most common invocations as copy-pasteable examples**. Users pattern-match examples; they do not parse usage grammars like `[OPTIONS] SRC... DEST`.
- Running the bare command with no args either does the obvious safe thing or prints help — never a usage error dump, and never something destructive.
- If the tool has a docs page, the help footer links it. If an error has a known remediation doc, the error links it. Deep links, not "see the wiki".

Test help like a feature: snapshot-test `--help` output for every subcommand so a rename or dropped description shows up in review, not in a user's confusion.

## 5. stdout/stderr, TTY detection, and machine-readable output

The contract that keeps your tool pipeline-safe and script-safe:

- **stdout carries the result. stderr carries everything else** — progress, warnings, log lines, hints. The instant a progress spinner leaks into stdout, someone's `mytool list | jq` breaks and they stop trusting `--json` everywhere.
- **Detect TTY.** When stdout is not a TTY: no colors, no spinners, no interactive prompts, no unicode box-drawing. Also honor `NO_COLOR` and `--no-color`.
- **Never prompt when non-interactive.** A tool that asks "Proceed? [y/N]" inside CI hangs the pipeline for an hour until the job times out — this exact failure has paged me at 3am. If input is needed and stdin is not a TTY: fail immediately with "non-interactive session; pass --yes to confirm" (exit 2).
- **`--json` is a contract, version it.** Once one team scripts against your JSON output, renaming a field is a breaking change with everything that entails (`tool-engineer/principles/distribution-and-versioning.md`). Emit only deliberate fields; additive changes only; if you must break, add `--format json-v2` and deprecate the old.

## 6. Backward-compatible flag deprecation

Removing a flag from a widely-used tool without a deprecation path breaks scripts you cannot see — cron jobs, CI steps, that one Makefile in a repo you've never heard of. The protocol:

1. **Alias first.** New flag ships; old flag keeps working as a hidden alias mapped to the new behavior.
2. **Warn on use** (stderr, once per invocation): `warning: --out-file is deprecated, use --output. --out-file will be removed in v4 (2026-10-01).` Name the replacement, the version, and the date.
3. **Measure.** If you have invocation telemetry (`tool-engineer/principles/adoption-and-rollout.md` §4), watch old-flag usage. Remove when it approaches zero — not when the calendar says so and 200 CI jobs still use it. No telemetry? Then dispatch the `change-impact-scanner` subagent to enumerate call sites before removal, and hold the deprecation window at ≥2 release cycles.
4. **Remove loudly.** The removed flag's error message names the replacement forever: `--out-file was removed in v4; use --output`. Cost: one dict entry. Benefit: the last confused user in 2028 self-serves.

Same protocol applies to renaming commands, changing defaults (a default flip **is** a breaking change — the invocation is unchanged and the behavior isn't), and changing output formats.

## 7. Failure modes → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Unreadable errors (stack traces, wrapped-away causes) | Support-channel questions quoting raw traces; grep codebase for uncaught-exception paths; run the tool wrong on purpose | Top-level handler + three-part contract (§1); preserve cause chain | `cli-error-ux-reviewer` skill on every release; CI test asserting no traceback in stderr for known-bad invocations |
| Silent failure (partial work, exit 0) | Diff "what user asked" vs "what happened" in an end-to-end test; audit every `continue`/`except: pass` in loops over user input | Fail loudly or gate skipping behind explicit flag + non-zero on total skip (§2) | Code-review checklist: "every skipped item is reported and affects exit code"; integration test asserting exit ≠ 0 on partial failure |
| Inconsistent flags across suite | Walk all commands' flags, diff against convention table | Alias-and-deprecate to converge (§6) — never a hard rename | Flag-convention test in CI (§3); conventions doc linked from tool template |
| Prompt hangs CI | Pipeline timeout with the tool as last output line | TTY-detect; fail fast with `--yes` hint (§5) | CI test running every prompting command with stdin closed, asserting fast exit-2 |
| Help text rot | Snapshot diff; new-hire walkthrough ("do X using only --help") | Rewrite against §4 bar | `--help` snapshot tests; flag-has-description lint |
| stdout pollution breaks scripting | User reports `| jq` broken; test parsing `--json` output while progress enabled | Route all diagnostics to stderr | CI test: run with `--json`, parse stdout strictly, assert stderr owns the rest |
| Exit 0 on failure | Wrapper scripts "succeed" while the tool failed; grep for `sys.exit()`/bare returns on error paths | Audit every exit path against the code table (§2) | Error-path test matrix asserting codes; the table lives in the README |

## Cross-references

- Review a CLI's error paths concretely: invoke the **`cli-error-ux-reviewer`** skill (`.claude/skills/cli-error-ux-reviewer/SKILL.md`).
- Before removing/renaming any flag or command: dispatch the **`change-impact-scanner`** subagent.
- Building a new CLI end to end: `tool-engineer/guides/build-a-cli-from-scratch.md`.
- Framework mechanics (Click/Typer error handling, testing, completion): `tool-engineer/reference/click-typer.md`.
- Versioning the tool itself and its output formats: `tool-engineer/principles/distribution-and-versioning.md`.
