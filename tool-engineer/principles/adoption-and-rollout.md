# Adoption & Rollout — tools are adopted, not deployed

**Applies to:** rolling out any internal tool, tool version, or tool retirement across an org. **Last verified:** 2026-07-06.

**The stance:** you cannot mandate a tool into use; you can only mandate it into *nominal* use. The org chart can force installations, but engineers under deadline will route around a tool that costs them more than it gives them — wrapper scripts that bypass it, the old tool kept alive in a fork, `--force` flags cargo-culted into every invocation. Real adoption is earned at the moment of first use: if a new user (human or CI job) doesn't get value inside the first fifteen minutes, you've lost them, and winning back a burned user costs ten times the first impression. The mandate-first rollout I watched most closely achieved 100% install rate and roughly 30% actual usage; the delta was invisible for two quarters because nobody was measuring usage (§4) — only installs.

## 1. The adoption curve for internal tools

Run every rollout through these stages, in order, with an exit criterion for each. Skipping a stage doesn't save time; it moves the failure later, where it's bigger.

| Stage | Population | Exit criterion |
|---|---|---|
| 1. Dogfood | Your own team, in anger, ≥2 weeks | You've hit and fixed your own top-5 paper cuts; support questions from your own team ≈ 0 |
| 2. Design partners | 2–3 volunteer teams with real, differing workloads | They'd be upset if you took it away (ask literally); time-to-first-success < 15 min without you in the room |
| 3. Default for new | New projects/repos get the tool by default; existing ones untouched | New-project usage sustains without hand-holding; error-rate telemetry stable |
| 4. Migration of existing | Everyone else, pulled by migration tooling (§3) | Actual-usage (§4) crosses ~80–90% |
| 5. Sunset the old | The stragglers | Old tool at ~0 usage, then removed (§5) |

Stage 2 is the one impatient teams skip, and it's the cheapest place to learn your tool is confusing. Design partners must be *volunteers* (they forgive rough edges and tell you the truth) with *different* workloads (three teams shaped like yours validate nothing).

## 2. Dogfooding: using it "in anger" is the bar

Dogfooding means the tool sits in your team's own critical path — your deploys, your codegen, your CI — where its failures cost *you* the 9am debugging session. Running it occasionally in a demo repo is not dogfooding; it's rehearsal. Signals you're doing it right: your own team files irritated bug reports; your standup mentions the tool unprompted; someone on your team tried to bypass it and you learned why. The canary channel (`tool-engineer/principles/distribution-and-versioning.md` §5) is dogfooding's permanent, mechanized form — dogfooding isn't a launch phase you finish, it's a property you keep.

The known blind spot: your team can't dogfood the *newcomer experience* — you all have working configs and folk knowledge. That's what stage 2 and the 15-minute test are for. Watch (don't guide) one engineer outside your team go from nothing to first success; every place they stall is a bug, usually in error messages or defaults (`tool-engineer/principles/cli-ux.md`), not in features.

## 3. Migration tooling: the author pays the migration tax

When adoption requires consumers to change their code/config/habits, the iron rule: **whoever ships the change writes the migration tooling.** A breaking change or new-tool mandate without a codemod is a tax you levy on every team, each independently rediscovering the same fix — org-wide cost is (teams × hours), your cost to prevent it is one codemod. Teams don't resent change; they resent *unfunded* change.

Ranked by conversion power:

1. **Automated in-place migration** — a codemod/`mytool migrate` that converts a repo in one command, producing a reviewable mechanical diff. Ship the migration PRs yourself to the top consumers; the long tail self-serves.
2. **Compat shim + warning** — old interface keeps working, warns with the exact replacement (`tool-engineer/principles/cli-ux.md` §6). Buys time; doesn't finish the job alone.
3. **Migration guide** — exact before/after, common errors, time estimate. Necessary always; sufficient only for tiny surfaces.
4. **"See the new docs"** — this is not migration tooling. This is a hope.

Codemod quality bar: idempotent (running twice = running once), reports what it couldn't auto-convert rather than silently skipping it (the silent-failure law again), and is itself dogfooded on your own repos first.

## 4. Measuring actual adoption vs. assumed adoption

Assumed adoption is installs, downloads, "we announced it", the mandate's existence. Actual adoption is **successful invocations, per team, per week, on the current version**. The gap between them is where tools die quietly — see the 100%-install/30%-usage story above.

Instrument the tool itself (design details and the consent story: `tool-engineer/extended/productivity-metrics.md`):

- **Invocations by command, version, and team** (team, not individual — you're measuring the tool, not the people, and per-person numbers poison trust in the telemetry program itself).
- **Success/failure ratio per command**, and *which errors* fire most. Your top-3 error messages by volume are your adoption bugs, ranked. Fix those messages first; it's the cheapest adoption work that exists.
- **Time-to-first-success for new users/repos** — the 15-minute metric, measured rather than assumed.
- **Workaround signals**: old-tool invocations still happening, `--force`/escape-hatch usage rates, wrapper scripts in repos (the `change-impact-scanner` subagent can inventory these across the org).

Pair quantitative with qualitative on a cadence: support-channel themes and a two-question survey ("did it work; what almost made you give up") catch what telemetry structurally can't — the person who *didn't* run the tool leaves no event.

## 5. Sunsetting a legacy tool without stranding teams

Retiring the old tool is a rollout in reverse, with the same discipline. The temptation is to announce a kill date and stop there; the result is the kill date arriving with 20% of the org still on the old tool, then slipping, twice, until nobody believes your dates anymore — date-credibility is an org-level resource you're spending.

1. **Freeze, announce, point.** Old tool stops getting features (bugfixes only); every invocation prints a deprecation notice naming the replacement, the migration command, and the date. The notice must survive `--quiet` (deprecation is errors-tier information).
2. **Migrate actively, by name.** Use usage telemetry to list remaining teams; open migration PRs for the biggest, office-hours for the rest. Broadcast reminders convert nobody after the first one.
3. **The last 10% is white-glove, and it's load-bearing.** The stragglers aren't lazy — they're the weird cases: the repo with the fork, the team whose workflow the new tool genuinely doesn't cover. Sit with them; you'll either extend the new tool (a real gap you'd otherwise ship broken) or migrate them by hand. Stranding them means they fork the dead tool, and an unowned fork of a deprecated tool is a security incident with a delay timer.
4. **Brick it loudly, keep the tombstone.** On the date: the old tool exits non-zero with the pointer (don't just delete the binary — "command not found" strands whoever's left with no clue). Keep the tombstone for a year.

## 6. Failure modes → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Mandated-but-unused tool (installs ≠ usage) | Usage telemetry per team vs install count; workaround-script inventory | Treat as stage-2 restart: find why design partners would reject it; fix top errors | Actual-usage metric defined before rollout starts; review it, not installs (§4) |
| First-use failure burns users | Time-to-first-success > 15 min; top error = a setup error | Fix defaults and the top-3 error messages; quickstart that is actually quick | Watched newcomer test as a stage-2 exit criterion (§2) |
| Unfunded migration (breaking change, no tooling) | Support channel doing the same Q&A repeatedly; adoption stalls at stage 4 | Stop; write the codemod; ship migration PRs to top consumers | "Author writes the codemod" is release-blocking policy for breaking changes (§3) |
| Dogfooding theater (demo repo, not critical path) | Zero bug reports from your own team pre-launch | Put the tool in your own deploy/CI path for 2 weeks | Stage-1 exit criterion requires your team's real usage evidence (§2) |
| Sunset date slips repeatedly | Kill date passed, old-tool telemetry still >0, date moved | White-glove the stragglers individually (§5.3) | Freeze+telemetry+named-team migration starts ≥1 quarter before the date |
| Adoption measured by survey vibes only | No per-command telemetry exists; decisions cite anecdotes | Instrument invocations/success/version now; backfill nothing | Telemetry is part of the tool template from day one (`guides/build-a-cli-from-scratch.md` §7) |
| Stranded team forks the dead tool | Old tool's repo has post-deprecation commits in a fork | Adopt the gap into the new tool or migrate them by hand | Last-10% white-glove pass; gap analysis before the brick date (§5) |

## Cross-references

- The mechanics adoption rides on — canary channel, pinning, deprecation warnings: `tool-engineer/principles/distribution-and-versioning.md`; flag-level deprecation UX: `tool-engineer/principles/cli-ux.md` §6.
- Who still uses the old thing: **`change-impact-scanner`** subagent (call-site + wrapper-script inventory).
- Telemetry design, privacy, and anti-gaming: `tool-engineer/extended/productivity-metrics.md`.
- Full from-zero rollout sequence with checklists: `tool-engineer/guides/build-a-cli-from-scratch.md` §9–10.
