# Click / Typer — the chosen CLI framework family, with the judgment attached

**Applies to:** Click 8.1–8.2, Typer 0.12–0.16, Python 3.11+. **Last verified:** 2026-07-06.** This doc will rot; check `CHANGELOG.md` for revision status before trusting API specifics. The principles it implements (`tool-engineer/principles/cli-ux.md`) will not rot — when this doc and that one disagree, that one wins.

**Why this family:** Typer builds on Click (you can mix them — a Typer app can mount Click commands and vice versa), gets you type-hint-driven parsing with near-zero boilerplate, and inherits Click's two decades of correct edge-case handling (TTY detection, pipes, encodings, shell completion). Use **Typer** for new tools; drop to **Click APIs** when you need its lower-level control (custom parameter types, complex group behavior). If your org is Node-first instead, the equivalent judgment maps to commander (simple) / oclif (plugin-suite class) — the principles doc is framework-agnostic on purpose; don't port this file, port the checklists.

## 1. Application skeleton that scales past one command

```python
# mytool/cli.py
import typer

app = typer.Typer(
    no_args_is_help=True,        # bare `mytool` prints help, never a usage error (cli-ux.md §4)
    rich_markup_mode="rich",
    pretty_exceptions_show_locals=False,  # NEVER leak locals into user-facing tracebacks
)
deploy_app = typer.Typer(no_args_is_help=True, help="Deploy artifacts to environments.")
app.add_typer(deploy_app, name="deploy")

@deploy_app.command("run")
def deploy_run(
    env: str = typer.Argument(..., help="Target environment (e.g. staging, prod)"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Show the plan without executing."),
    output_json: bool = typer.Option(False, "--json", help="Machine-readable output on stdout."),
):
    """Deploy the current artifact to ENV.

    Example: mytool deploy run staging --dry-run
    """
    ...
```

Judgment notes:

- `no_args_is_help=True` on **every** group. The Click default (exit code 2 + usage dump) fails the discoverability bar.
- Docstring = long help. Put a copy-pasteable **Example:** line in every command's docstring; it renders in `--help` and is the single highest-value line in it.
- Flag names are declared explicitly (`"--dry-run"`) rather than derived, so a Python-level variable rename can never silently rename a public flag — a flag rename must look like a flag rename in review (`tool-engineer/principles/distribution-and-versioning.md` §1).
- **Startup latency:** every module imported at CLI import time runs before `--help` does. Keep `cli.py` imports to stdlib + typer; import heavy deps (requests, pandas, your SDK) *inside* command functions. A tool whose `--help` takes 2s is a tool that feels broken; measure with `python -X importtime -m mytool --help`.

## 2. Errors and exit codes (implementing the three-part contract)

Define one exception type carrying the contract, catch it in one place:

```python
class ToolError(Exception):
    """User-facing failure: what + why + what-to-do-next."""
    def __init__(self, what: str, why: str, fix: str, exit_code: int = 1):
        super().__init__(what)
        self.what, self.why, self.fix, self.exit_code = what, why, fix, exit_code

# entry point wrapper — the ONLY place tracebacks are decided
def main() -> None:
    try:
        app(standalone_mode=False)   # stop Click from swallowing/formatting our exceptions
    except ToolError as e:
        typer.secho(f"error: {e.what}", fg="red", err=True)
        typer.secho(f"  cause: {e.why}", err=True)
        typer.secho(f"  fix:   {e.fix}", err=True)
        raise SystemExit(e.exit_code)
    except click.ClickException as e:   # usage errors from parsing
        e.show()
        raise SystemExit(2)
    except click.exceptions.Abort:      # Ctrl-C
        raise SystemExit(130)
    except Exception:
        log_path = write_crash_log()    # full traceback to file, always
        typer.secho(
            f"error: unexpected failure (this is a bug in mytool).\n"
            f"  details logged to {log_path}\n"
            f"  re-run with --debug for the traceback; report at go/mytool-bugs",
            fg="red", err=True,
        )
        if os.environ.get("MYTOOL_DEBUG"):
            raise
        raise SystemExit(1)
```

Pitfalls this design exists to prevent:

- **`standalone_mode` default (True) makes Click catch everything and exit itself** — convenient until you need the top-level handler above. Turn it off at the entry point and own your exits.
- **`typer.Exit(code=1)` vs `typer.Abort` vs raw `sys.exit`:** standardize on `ToolError` for failures and `typer.Exit(0)` for early-success returns; ban raw `sys.exit` in commands (greppable in review).
- Every raw `except Exception: pass` you write in a command is a silent failure (`cli-ux.md` §2) waiting for its incident.
- Test the codes: `--help` must exit 0, bad flag must exit 2, runtime failure must exit 1 — CliRunner asserts all three (§4).

## 3. Output discipline: echo, stderr, JSON, TTY

- `typer.echo(...)` / `click.echo(...)` for **results** (stdout); `typer.echo(..., err=True)` or `secho(err=True)` for **everything else**. Ban bare `print` via lint — one stray `print("checking auth...")` breaks every `| jq` consumer.
- Click strips colors automatically when the stream isn't a TTY; still honor `NO_COLOR` explicitly (`color=False` when `os.environ.get("NO_COLOR")`).
- `--json` mode: emit exactly one JSON document on stdout, everything human on stderr, and route through one `emit(result)` helper so the contract has a single owner. The JSON shape is versioned public surface.
- **Prompts:** `typer.confirm()`/`typer.prompt()` hang CI when stdin is closed at the wrong moment. Gate every prompt: if `not sys.stdin.isatty()` and `--yes` absent → `ToolError(..., fix="pass --yes to confirm in non-interactive sessions", exit_code=2)`. Test this path with CliRunner + `input=None`.

## 4. Testing with CliRunner — the minimum honest suite

```python
from typer.testing import CliRunner
runner = CliRunner()  # note: merged stderr pre-Click-8.2 differs; pin and check your version

def test_help_exits_zero():
    r = runner.invoke(app, ["--help"])
    assert r.exit_code == 0

def test_bad_flag_is_usage_error():
    r = runner.invoke(app, ["deploy", "run", "staging", "--no-such-flag"])
    assert r.exit_code == 2

def test_json_stdout_is_pure():
    r = runner.invoke(app, ["deploy", "run", "staging", "--dry-run", "--json"])
    json.loads(r.stdout)          # stdout parses strictly — the pipeline-safety gate

def test_help_snapshot(snapshot):  # every subcommand; catches silent flag/description changes
    r = runner.invoke(app, ["deploy", "run", "--help"])
    assert r.stdout == snapshot
```

Plus the two suite-level tests that enforce the principles mechanically: walk `app.registered_commands`/groups and assert (a) every parameter has non-empty `help`, (b) every flag name matches the org convention table (`cli-ux.md` §3). These two tests replace an entire category of review comments.

CliRunner limits to know: it runs in-process (import-time latency and real signal handling escape it — keep one subprocess smoke test: `subprocess.run([sys.executable, "-m", "mytool", "--help"], timeout=3)`), and it fakes the TTY (`isatty()` is False under the runner — good: your non-interactive paths get tested by default, but test interactive paths with `input="y\n"` explicitly).

## 5. Shell completion, config, and the odds and ends that generate support load

- **Completion:** Click ships bash/zsh/fish completion; Typer exposes `--install-completion`/`--show-completion`. Ship it — completion is discoverability (`cli-ux.md` §4) that users carry with them. For dynamic values (env names, service names), provide a completer function, and make it **fast and network-free** (cache to disk); a completer that does a 2s API call makes *tab* hang, and users blame the shell.
- **Config precedence** — implement exactly once, as a helper: flag > env var (`envvar="MYTOOL_ENV"` on the Option) > project config file > user config file > default. Add `mytool config show` printing the *effective* config with the source of each value — this command deletes a whole genre of support threads.
- **Version:** `--version` via the standard callback pattern; string includes channel + release date (`distribution-and-versioning.md` §3).
- **Context objects:** for cross-command state (loaded config, API client), use one dataclass on `ctx.obj`, constructed in the app callback. Resist the God-context; if `ctx.obj` has ten fields, commands have hidden coupling.

## 6. Version-sensitive gotchas (checked against Click 8.1–8.2 / Typer 0.12–0.16)

| Gotcha | Detail |
|---|---|
| CliRunner stderr behavior changed around Click 8.2 | Older `mix_stderr=True` default merged streams — asserting on `r.output` may hide stdout pollution. Pin Click; assert on `r.stdout` specifically. |
| Typer's rich-formatted exceptions | Pretty tracebacks with locals are a **secrets leak** in a tool that handles tokens. `pretty_exceptions_show_locals=False` is non-negotiable; prefer catching everything at `main()` anyway (§2). |
| `Annotated` style is current Typer idiom | `Annotated[str, typer.Option(...)]` over default-value style for new code; both work in 0.12+, mixing in one signature is what breaks. |
| Boolean flag auto-negation | Typer generates `--flag/--no-flag` pairs when you declare them; do declare `--no-` forms for defaults that may flip (`cli-ux.md` §3). |
| Lazy subcommand loading | Click's `LazyGroup` pattern (docs recipe) defers subcommand imports — apply it when a large tool's `--help` crosses ~300ms. |

## Cross-references

- The framework-agnostic law this file implements: `tool-engineer/principles/cli-ux.md`. Review a real tool against it: **`cli-error-ux-reviewer`** skill.
- Full worked example of a new tool using these patterns end to end: `tool-engineer/guides/build-a-cli-from-scratch.md`.
- Packaging the result (uv/PyInstaller, pinning, channels): `tool-engineer/principles/distribution-and-versioning.md` §6.
