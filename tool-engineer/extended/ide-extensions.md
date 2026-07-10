# IDE & Editor Extensions — production patterns + common pitfalls

**Applies to:** VS Code extension API (engine ^1.9x, 2025–2026 era), IntelliJ Platform plugin basics (2024.x–2025.x). **Extended tier:** patterns and pitfalls, not full depth. **Last verified:** 2026-07-06.

**The stance in one line:** an editor extension is a guest in the single most latency-sensitive surface a developer owns. A CLI that takes 800ms is slow; an extension that takes 80ms *on the UI-adjacent path* is an uninstall. And the uninstall is silent — extension attrition shows up in your adoption dashboard months before anyone tells you why.

## Production patterns

**Activate lazily or not at all.** `activationEvents` is the highest-leverage line in `package.json`. Activate on your language/command/file-pattern only — never `*` (`onStartupFinished` is the ceiling if you truly must warm up). Users audit slow startups with "Developer: Show Running Extensions" / `--prof-startup`, and extensions at the top of that list get uninstalled org-wide via a Slack screenshot. Same law in IntelliJ: no work in plugin load; use dynamic plugin patterns and background `ProgressManager` tasks.

**Keep the extension host thin; put brains in a separate process.** Heavy analysis (type checking, indexing, your codegen validation) belongs in a language server (LSP) or child process, not the extension host — the host is shared by every extension, so your CPU spike is *everyone's* frozen editor and VS Code names you in the "extension host unresponsive" blame UI. LSP also buys editor portability (the same server backs VS Code + JetBrains + Neovim), which for an internal tool is often the difference between one team served and the whole org served.

**Graceful degradation when your backend is down.** Internal extensions usually talk to internal services (auth, code search, telemetry, AI backends). The failure pattern that kills trust: the service is down, and the extension throws error toasts on every keystroke or, worse, blocks saves. Rules: (1) degrade features, never the editor — offline means your CodeLens/panels show "myorg: offline (retrying)" in the status bar *once*, not a toast storm; (2) cache the last-known-good data with a staleness marker (same law as `tool-engineer/principles/internal-dashboards.md` §2); (3) all network calls carry timeouts and back off exponentially; a retry loop against a dead service is a laptop-battery bug report with your name on it. Never make the save/format/commit path depend on network liveness.

**Version compatibility is a matrix you must pin and test.** VS Code ships monthly; `engines.vscode` + `@types/vscode` pin your floor — set it to the *oldest version your org actually runs* (check telemetry; enterprise fleets lag 3–6 months), and CI-test against both that floor and latest stable. Using an API newer than your declared floor fails at runtime on exactly the lagging machines you can't see. IntelliJ: `sinceBuild`/`untilBuild` plus the Plugin Verifier in CI — JetBrains APIs break across major releases as a matter of course.

**Distribute like a real tool.** Internal marketplace/private gallery (or `--install-extension` via device management), auto-update on, semver + changelog, and a rollback path — the whole of `tool-engineer/principles/distribution-and-versioning.md` applies unchanged. Extensions have one extra rollback trap: users can't easily pin old versions in managed fleets, so a bad release is *everyone's* bad release within hours. Canary via a parallel "myorg-tools-insiders" extension ID for the volunteer cohort.

## Common pitfalls

| Pitfall | Detection | Fix / prevention |
|---|---|---|
| Eager activation drags editor startup | Top of "Show Running Extensions"; `--prof-startup` trace | Narrow `activationEvents`; CI check that the manifest never contains `*` |
| Sync/blocking work on the UI-adjacent path | "Extension host unresponsive" reports; profiler shows your stack | Move to LSP/child process; chunk with async; never `execSync` in the host |
| Toast storm when backend is down | Support screenshots of stacked error notifications | One status-bar state + log channel; rate-limit `showErrorMessage` (≤1 per failure episode) |
| Works on latest, breaks on fleet's older editor | Errors only from lagging-version users; API-not-found at runtime | Pin `engines` to fleet floor; CI matrix on floor + stable; watch fleet version telemetry |
| Leaked disposables (event listeners, watchers) | Memory climbs over a day; duplicate handlers fire after window reload | Push every registration into `context.subscriptions`; review-checklist item |
| Secrets in settings/globalState | Token visible in settings JSON sync'd to cloud | Use the SecretStorage API; lint settings schema for credential-shaped fields |
| Format-on-save wired to a network service | Saves hang when VPN drops | Local-first formatting; network features never on the save path |
| Extension silently fights another extension | Conflicting formatters/providers; "works until I install X" | Register with specific selectors; document known conflicts; prefer LSP standard capabilities |

## Cross-references

- Rollout, canary, version-skew discipline: `tool-engineer/principles/distribution-and-versioning.md`; adoption measurement (installs ≠ usage is *acute* for extensions): `tool-engineer/principles/adoption-and-rollout.md` §4.
- If the extension fronts a CLI, keep the CLI the source of truth and the extension a thin veneer — the CLI gets the UX bar of `tool-engineer/principles/cli-ux.md`, and scripts/CI can reuse it.
