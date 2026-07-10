# Build an Internal CLI From Scratch — zero to safely-rolled-out

**Applies to:** a new internal command-line tool; worked example in Python (Typer 0.12–0.16, Python 3.12, uv). The sequence and checklists are framework-agnostic. **Last verified:** 2026-07-06.

This is capability A of this KB: follow it start to finish and you ship a minimal but well-UX'd internal tool — clear errors, versioning, telemetry, and a rollout plan — without the author in the room. Each step names its exit criterion. The worked example is `artifex`, a tool that publishes build artifacts to the org's artifact store: small enough to follow, real enough to have error paths, config, and a service dependency (most internal CLIs are exactly this shape).

**Ordering note:** steps 1–3 are design-on-paper and cost an hour; they are also where doomed tools are doomed. Do not open an editor before finishing them.

## Step 1 — Define the job, the user, and the non-goals (½ page, written down)

Answer in writing: **(a)** the job in one sentence, in the user's vocabulary ("publish a build artifact and get back a shareable URL"); **(b)** who runs it and *where* — humans at a laptop, CI, or both (almost always both, which decides §5's non-interactive discipline before any code exists); **(c)** the 15-minute test scenario — what a new user must accomplish in their first quarter-hour (`adoption-and-rollout.md` §2); **(d)** three explicit non-goals (ours: no artifact *fetching*, no retention management, no non-org registries). Tools without written non-goals grow flags until nobody can hold them.

**Exit:** a teammate reads the half page and correctly predicts what `artifex --help` will show.

## Step 2 — Name it, shape the command grammar

- Name: short, typeable, greppable, no collision with anything on `$PATH` or in the org (check both — a name collision with a common Unix tool is a decade of confusion).
- Grammar: **verb-noun subcommands from day one** (`artifex publish`, `artifex status`) even if v1 has one verb — retrofitting subcommands onto a flag-soup single command is a breaking change you can avoid for free.
- Draft the actual `--help` text now, before implementation, including the example lines. Writing help first is the cheapest design review that exists: if the help is hard to write, the interface is wrong.
- Flags come from the org convention table (`cli-ux.md` §3): `--dry-run`, `--json`, `--yes`, `--verbose` mean here what they mean everywhere.

**Exit:** the drafted help text survives one review by someone who didn't design it.

## Step 3 — Pick the framework (decision, not exploration)

| Situation | Pick |
|---|---|
| Org is Python-first (this guide's path) | **Typer** on Click — type-hint parsing, inherits Click's edge-case correctness. Mechanics: `reference/click-typer.md` |
| Org is Node-first, single tool | commander |
| Org is Node-first, a *suite* with plugins | oclif |
| Distribution constraints demand a single static binary and the team owns Go/Rust | cobra / clap — pay the language cost for the packaging win |

The framework matters less than people think; every rule in this guide is achievable in all of them. What matters is **one framework family per org** — a suite where each tool parses flags differently fails the consistency law before UX design even starts.

## Step 4 — Scaffold with the skeleton that scales

Project layout (uv-managed):

```
artifex/
├── pyproject.toml          # [project.scripts] artifex = "artifex.cli:main"; pinned deps
├── src/artifex/
│   ├── cli.py              # Typer app, commands, NOTHING heavy imported at module top
│   ├── errors.py           # ToolError (what/why/fix/exit_code)
│   ├── config.py           # precedence resolution, `config show`
│   ├── output.py           # emit() — the single owner of stdout/--json
│   ├── telemetry.py        # async fire-and-forget events (step 7)
│   └── store.py            # the actual artifact-store client (heavy imports live here)
└── tests/                  # CliRunner suite (step 6)
```

Copy the application skeleton and the `main()` top-level error handler *verbatim* from `reference/click-typer.md` §1–2 — `no_args_is_help=True`, `standalone_mode=False`, `pretty_exceptions_show_locals=False`, `ToolError` caught in exactly one place. Those four decisions, made now, prevent the four most common CLI defects later.

**Exit:** `uv run artifex --help` shows the step-2 help in <300ms (`python -X importtime` if not); `artifex`, `artifex --version`, `artifex publish --help` all exit 0.

## Step 5 — Implement the command with the error paths as first-class work

Write `publish` by enumerating its failure modes *before* its happy path — for `artifex publish dist/app.tar.gz`: file missing/unreadable; not logged in / token expired; artifact too large; store unreachable; store rejects (quota, duplicate version); interrupted mid-upload. Each becomes a `ToolError` with the three-part contract (`cli-ux.md` §1):

```python
raise ToolError(
    what=f"could not publish {path}",
    why="your auth token expired 2 days ago",
    fix="run `artifex auth login` to refresh it",
)
```

Non-negotiables to wire in this step, while the command is small:

- **Exit codes:** 0 full success, 1 runtime failure, 2 usage (`cli-ux.md` §2). No partial-success-exit-0 — if 3 of 5 artifacts publish, report the 2 failures and exit 1.
- **stdout/stderr split + `--json`:** the shareable URL (the *result*) on stdout via `output.emit()`; progress and warnings on stderr. `--json` emits one versioned document.
- **Non-interactive safety:** any confirmation checks `sys.stdin.isatty()`; in CI without `--yes`, fail fast with the fix in the message (exit 2). This tool runs in CI — we decided that in step 1.
- **`--dry-run`** prints the exact plan (file, size, destination, resulting URL shape) and touches nothing. Cheap now; retrofitting it after users fear the tool is much harder.
- **Config precedence** implemented once in `config.py`: flag > `ARTIFEX_*` env > repo `.artifex.toml` > user config > default — plus `artifex config show` printing effective values *with the source of each* (deletes a support-thread genre).

**Exit:** for every enumerated failure, running it produces a three-part message on stderr, correct exit code, no traceback; the happy path's stdout is exactly the URL.

## Step 6 — Test suite that enforces the contracts mechanically

From `reference/click-typer.md` §4, the minimum honest suite: exit-code matrix (`--help`→0, bad flag→2, each failure→1); `--json` stdout parses strictly while progress is enabled; help snapshots per subcommand; the two suite-walkers (every param has help text; every flag matches the convention table); closed-stdin prompt test; one subprocess smoke test for import-time and real exit codes. Add the error-path matrix from step 5 as fixtures — these tests are the *executable spec* of your UX, and they're what lets the next maintainer refactor without re-deriving your judgment.

**Exit:** CI green; deleting any single flag's help string or changing an exit code turns it red.

## Step 7 — Telemetry, minimal and clean-handed

Instrument before first external user — retrofitted telemetry never gets backfilled and you'll fly blind through your own rollout. Events: `command, version, duration_ms, outcome(success | error_id | unclassified), team` — no arguments, no paths (`extended/productivity-metrics.md`: front-page test, team-level aggregation). Fire-and-forget async, drop-on-failure, never on the critical path; `artifex telemetry show` prints what's sent; honor the org opt-out mechanism. The two numbers you will actually use in step 10: **top error_ids by volume** and **time-to-first-success**.

**Exit:** telemetry service down → tool latency unchanged (test it: point the endpoint at a black hole).

## Step 8 — Package, version, distribute

- **Versioning:** semver from `0.1.0`, changelog written for consumers, and the public-surface list (commands, flags, defaults, exit codes, JSON shape) declared in the README — that list is what "breaking" means from now on (`distribution-and-versioning.md` §1).
- **Packaging:** publish to the internal package index; humans install via `uv tool install artifex --index <internal>`; ship the **wrapper trampoline** (`./tools/artifex` shim reading a checked-in `.artifex-version`, fetching that exact version to a cache, exec-ing it) so repos and CI are pinned by construction (`distribution-and-versioning.md` §4, §6). If laptop-fleet Python proves painful, escalate to PyInstaller binaries — but try the index+uv route first; it's an order of magnitude less build maintenance.
- **Channels:** `stable` and `canary` from the first release; `--version` prints `artifex 0.3.0 (canary, released 2026-07-01)`.
- **Rollback rehearsal:** before any user exists, release 0.1.1, yank it, confirm pointing latest back at 0.1.0 is one command. Discovering rollback friction during your first bad release is the expensive way.

**Exit:** a colleague on a clean machine goes from nothing to first successful `publish` in under 15 minutes using only the README — *watch them* (don't guide); every stall is a bug, file each one.

## Step 9 — Dogfood, then design partners

Run the adoption curve stages 1–2 (`adoption-and-rollout.md` §1–2), concretely: your team's own CI publishes through `artifex` for ≥2 weeks (in anger, not in a demo repo); fix your own top-5 paper cuts; then 2–3 volunteer teams with *different* workloads (one monorepo, one tiny service, one with the weird artifact type). Watch the telemetry from step 7: top error messages by volume are your ranked adoption-bug backlog — fixing the top three error messages is usually the entire difference between stage-2 success and failure.

**Exit:** design partners answer "would you be upset if we took it away?" with yes; time-to-first-success p50 < 15 min without you in the room.

## Step 10 — Org rollout plan (write it before announcing)

One page: **target population order** (new projects default-on first, existing repos pulled by migration tooling — if `artifex` replaces `old-publish.sh`, *you* write the codemod that rewrites CI configs, `adoption-and-rollout.md` §3); **the announce** targeted at the enumerated affected teams (dispatch **`change-impact-scanner`** to find every `old-publish.sh` call site — the honest list, not the guess); **success metrics** defined now (actual weekly usage per team, not installs); **the sunset** of the old path with freeze date, warning-in-old-tool, and brick date (`adoption-and-rollout.md` §5); **the rollback trigger** — what telemetry reading makes you pause the rollout (e.g., unclassified-error ratio >5%, or any team's CI blocked >30 min by an artifex defect).

**Exit:** the plan names dates, owners, the metric thresholds, and the first three teams — and the old tool's sunset is scheduled, because a rollout without a sunset is how orgs end up running both tools forever.

## The condensed checklist (print this)

- [ ] Job + user + 15-min scenario + non-goals written (step 1)
- [ ] Verb-noun grammar; help text drafted and reviewed before code (step 2)
- [ ] Skeleton: lazy imports, one top-level error handler, no-args-is-help (step 4)
- [ ] Every failure mode = three-part message + correct exit code; no partial-success exit 0 (step 5)
- [ ] stdout=result, stderr=everything else; `--json` versioned; TTY/CI-safe prompts; `--dry-run` (step 5)
- [ ] Test suite enforces exit codes, help completeness, flag conventions, JSON purity (step 6)
- [ ] Telemetry: command/version/outcome/duration, async, front-page clean (step 7)
- [ ] Semver + consumer changelog + declared public surface; pinned via trampoline; canary channel; rollback rehearsed (step 8)
- [ ] Dogfooded in anger 2 weeks; design partners passed the take-it-away test (step 9)
- [ ] Rollout page: impact scan, migration codemod, usage metrics, sunset date, rollback trigger (step 10)

## Cross-references

Judgment behind each step: `principles/cli-ux.md` (steps 2, 5) · `reference/click-typer.md` (steps 3–6) · `extended/productivity-metrics.md` (step 7) · `principles/distribution-and-versioning.md` (step 8) · `principles/adoption-and-rollout.md` (steps 9–10). Review your error paths before stage 2: **`cli-error-ux-reviewer`** skill. Replacing an existing tool: **`change-impact-scanner`** subagent before the announce, and `guides/analyze-an-existing-tool.md` to understand what you're replacing.
