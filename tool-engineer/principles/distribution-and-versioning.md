# Distribution & Versioning of Internal Tools — "it's just internal" is how builds break at 9am

**Applies to:** any internal tool consumed by other teams — CLIs, generators, lint configs, shared scripts. **Last verified:** 2026-07-06.

**The stance:** internal tools need *more* versioning discipline than public ones, not less. A public library's users chose it, read its changelog, and pinned it. Your internal CLI's users were told to use it, have never seen its repo, and are running whatever version their laptop happened to auto-update to. When you break them, you don't get an angry GitHub issue — you get forty teams' CI red simultaneously and a very quiet Slack channel filling with @-mentions. Every section below exists because "it's just an internal tool, we can just change it" was said out loud, by me, at least once.

## 1. Semver for tools, honestly applied

Semver's rules are easy; the judgment is in what counts as the *public surface* of a tool. For an internal tool, the breaking-change surface is bigger than authors think:

- Command names, flag names, **and flag defaults** — a default flip breaks invocations that didn't change.
- **Exit codes** — scripts branch on them.
- **stdout format** — the moment anyone pipes your output to `grep`/`jq`, your human-readable output is load-bearing. (This is why `--json` exists: give scripts a deliberate contract so your human output stays free. `tool-engineer/principles/cli-ux.md` §5.)
- Config file schema, environment variables read, file locations written.
- For a generator: the *shape of its output* (`tool-engineer/principles/codegen.md` §2).

Rules: breaking any of the above = major. New commands/flags = minor. Everything ships with a changelog entry written for consumers ("what do I need to change") — an empty changelog with a version bump is a warning sign about everything else. And version *even the "scripts" directory*: the unversioned shared script that everyone curls is the tool most likely to break everyone, precisely because nobody considers it released.

## 2. The breaking-change protocol

The single worst tooling failure mode is shipping a breaking change to a widely-used tool without warning every consumer. The protocol, in order, no skipping:

1. **Enumerate consumers first.** Not "announce and hope" — *enumerate*. Dispatch the **`change-impact-scanner`** subagent to find every call site: CI configs, Makefiles, cron entries, wrapper scripts, docs, sibling repos. The honest blast radius is always 2–5× the guess; the scanner exists because grep-at-scale output must not live in your working context.
2. **Write the migration path before announcing.** Ideally a codemod/autofix; minimally exact before/after instructions. A breaking change without migration tooling is a tax levied on every consuming team (`tool-engineer/principles/adoption-and-rollout.md` §3).
3. **Dual-support window.** Old and new behavior both work; old warns with replacement + removal date (`tool-engineer/principles/cli-ux.md` §6 for the flag-level mechanics).
4. **Announce with the blast-radius list attached** — tell the affected teams *they* are affected, by name. Broadcast announcements reach nobody; the targeted ones get read.
5. **Watch usage of the old path decay** (telemetry, §5 of adoption doc). Remove when near zero, not when the calendar says so.
6. **Remove loudly**: the removed path's error names the replacement forever.

## 3. Auto-update: the mechanisms fail silently

Auto-update solves version skew and creates its own failure class. Every auto-updater I've operated eventually failed *silently* for a subset of the org — corporate proxy blocking the release endpoint, a permissions error writing to the install dir, a check that swallowed exceptions "to not bother the user." The result: you believe everyone is on 4.x, telemetry says 94% are, and the 6% on 2.9 are exactly the machines that will hit the bug you fixed a year ago — or worse, produce old-format codegen output into shared repos.

Design rules:

- **Update check is async and non-blocking.** Never make `mytool deploy` slower or flakier because a version ping timed out. Check in the background, apply on next invocation.
- **Failed update checks are loud eventually.** Swallow one failure; after N days without a successful check, print a stderr banner: "mytool hasn't checked for updates in 12 days (last error: proxy timeout) — run `mytool update`." Silent-forever is the sin.
- **`--version` reports version, channel, and age**, e.g. `mytool 4.2.1 (stable, released 2026-06-20)`. Support triage starts with this line; make it carry everything.
- **Server-side minimum-version floor** for tools that talk to a service: the service rejects clients below the floor with an actionable error ("client 2.9 is below minimum 3.5 — run `mytool update`"). This converts unbounded skew into a bounded, *enforced* window — the only mechanism that actually catches the silent-updater-failure population, because it fires at point of use.
- **Respect pinning.** CI and repos must be able to pin exactly (see §4); auto-update applies to humans' interactive installs, never to CI.

## 4. Version skew: not everyone updates at once — design for it

Skew is the steady state, not the anomaly. Three skews to design for:

**Human ↔ human skew.** Two teammates on different tool versions produce different output (formatter, codegen) and their PRs oscillate, each "fixing" the other. Fix: **the repo pins its tool versions** in a checked-in file (`.mytool-version`, or a `mise`/`asdf`-style toolchain file), the tool warns or refuses when its version doesn't match the repo's pin, and CI runs the pinned version as the source of truth. Format/codegen output disputes are then settled by CI, not by whoever pushed last.

**Human ↔ CI skew.** Passes locally, fails in CI (or worse, vice versa) because versions differ. Same fix: single pin, both sides read it. CI must never install "latest".

**Client ↔ service skew.** The tool talks to a backend; old clients speak an old protocol. Fix: version handshake on every call + the server-side floor from §3. The backend team owning both sides of the protocol must treat the *client's wire behavior* as public surface (§1).

## 5. Rollback: assume the release is bad

A tool release that breaks builds blocks the whole org per hour, so rollback speed matters more than release polish. Requirements:

- **Immutable, retained artifacts.** Every released version stays installable forever (or ≥ a year). Never overwrite a published version in place — "4.2.1 but different on Tuesday" makes every debugging session epistemically hopeless.
- **One-command rollback for users** (`mytool update --to 4.1.0`) **and one-command yank for you**: pointing "latest" back at the previous version must be a single reversible operation that doesn't require a rebuild. If rollback requires re-releasing, your first bad release will teach you this at the worst time.
- **Canary channel.** `stable` and `canary`; your team and volunteer power users ride canary for ≥ a few days of real use before promotion (this is dogfooding with a mechanism — `tool-engineer/principles/adoption-and-rollout.md` §2). Most releases that would have broken the org die on canary, where the affected population is people who opted into risk.
- **Kill switch for remote-config-capable tools:** the ability to disable a specific feature/codepath server-side beats rolling back the whole binary when only one feature is bad.

## 6. Packaging: how the tool physically reaches machines

Decision tree, shaped by years of "works on my machine" support threads:

- **Default: a self-contained artifact per platform** — static binary (Go/Rust) or a bundled runtime (PyInstaller/PyOxidizer; or `uv tool install` from an internal index where Python-native distribution is acceptable — see `tool-engineer/guides/build-a-cli-from-scratch.md` §8). The tool must not depend on whatever Python/Node the host happens to have; half your support load is otherwise other people's runtime managers.
- **Distribute through the channel the org already trusts**: internal Homebrew tap, internal package index, or the company device-management system. Never `curl | bash` from a wiki page — unauditable, unpinnable, unrollbackable.
- **Wrapper-script trampoline** for repos that pin (§4): a tiny checked-in `./tools/mytool` shim that reads the pin file, fetches that exact version to a cache, and execs it — Gradle-wrapper style. This makes "clone and run" work with zero install instructions, which is the real golden path.

## 7. Failure modes → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Breaking change ships without consumer warning | Org-wide CI red within hours of release; support channel spike | Yank to previous version (one command, §5); then run protocol §2 properly | `change-impact-scanner` + migration tooling are release-blocking checklist items for any major |
| Auto-update fails silently for a cohort | Version telemetry histogram has an old-version tail that never shrinks | Fix updater path; server-side floor to force the stragglers through a loud error | Age-based stderr banner (§3); floor rejection at point of use; dashboard on version distribution |
| Version skew produces oscillating codegen/format diffs | PRs flip-flopping the same generated lines between teammates | Pin in repo; CI regenerates with pin as truth | Checked-in version pin + tool refuses on mismatch (§4) |
| Bad release, slow rollback | Time-to-yank measured in hours because rollback = re-release | Immutable artifacts + repointable "latest" | Rollback rehearsal: yank a test release quarterly; canary channel absorbs most bad releases |
| Mutated published artifact | Same version behaves differently on different machines; checksums differ | Republish as a new version; never patch in place | Immutable artifact store with write-once enforcement |
| Unversioned shared script breaks everyone | "The script changed" with no version to name or pin | Adopt it: version, changelog, distribution channel | Inventory rule: anything ≥2 teams run gets §1 treatment |
| CI installs "latest", breaks on release day | CI failures correlate with your release timestamps, not with consumers' commits | Pin CI to exact versions | Lint CI configs for unpinned installs of internal tools |

## Cross-references

- Enumerating consumers before a break: **`change-impact-scanner`** subagent. Tracing a breakage back to a release: **`build-breakage-tracer`** subagent.
- Flag-level deprecation mechanics: `tool-engineer/principles/cli-ux.md` §6. Generator-output versioning: `tool-engineer/principles/codegen.md` §3.
- Getting people onto the new version at all: `tool-engineer/principles/adoption-and-rollout.md`.
