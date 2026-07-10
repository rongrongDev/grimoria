# Developer Productivity Metrics & Tool Telemetry — production patterns + common pitfalls

**Applies to:** tool-usage telemetry, DORA-class metrics, developer-experience surveys, as they serve *tooling* decisions. **Extended tier:** patterns and pitfalls, not full depth. Org-wide engineering-metrics programs are beyond this KB's scope. **Last verified:** 2026-07-06.

**The stance in one line:** measure *friction*, not *output*. The purpose of tooling telemetry is to find where developers lose time and trust — never to rank developers. The moment a metric touches a performance review, it stops measuring reality (people optimize the number, Goodhart wins) and it poisons consent for the entire telemetry program: the org that deployed commit-count dashboards got more commits, smaller and more meaningless, and then got engineers who disabled telemetry in *every* tool they could, including mine. One bad metric cost every good one.

## Production patterns

**Instrument the tool, aggregate by team, design for the front page.** The telemetry schema that answers real tooling questions: invocations by command × version × team; success/failure per command with *error identity* (which classified error fired — `cli-ux.md` §1's classified-vs-unclassified ratio comes from here); duration percentiles per command; time-to-first-success for new users/repos; escape-hatch usage rates (`--force`, suppressions, cache-bypass flags — each is a distrust signal, see the suite-wide inventory in `static-analysis.md` §1 and `monorepo-build-tooling.md`). Aggregate at team granularity or coarser, and apply the front-page test *at collection time*: collect nothing you couldn't defend on the org's front page. No command *arguments* (they contain paths, secrets, customer names), no per-individual leaderboards, ever. Be transparent (`mytool telemetry show` prints exactly what's sent) and honor the org's opt-out — a telemetry program that survives is one nobody has a horror story about.

**Choose metrics that reflect friction, and pair every quantitative signal with a qualitative one.** The useful tooling metrics are friction-shaped: top error messages by volume (your adoption bugs, ranked — `adoption-and-rollout.md` §4), p90 build/lint/deploy wait time, retry loops (same command re-run within a minute = the tool failed *and* the error didn't help), old-version tail (`distribution-and-versioning.md` §3). DORA metrics (deploy frequency, lead time, change-fail rate, MTTR) are fine *system-level* outcomes to check tooling investments against — but they move slowly and confound everything, so use them for direction, not for tool-by-tool decisions. And telemetry structurally can't see the person who *didn't* use the tool: pair the numbers with support-channel theme counts and a two-question periodic survey ("what tool cost you the most time this month; what almost made you give up"). When survey and telemetry disagree, believe the survey and go find what the telemetry is missing — the reverse policy leaves you optimizing a dashboard while the users leave.

**Every metric gets a gaming forecast before it ships.** Write down: "if a team wanted to make this number better without making anything better, what would they do?" Coverage % → asserts-nothing tests (see `quality-dev/principles/mutation-testing.md` — the adjacent KB exists partly because of this game). Suppression count → suppressions move to config-level disables. Adoption count → wrapper script that invokes the tool with `--version` in CI. If the gaming move is easy and invisible, redesign the metric (measure the *outcome* the gamed metric was proxying) or explicitly decide it's a low-stakes informational number and keep it away from goals. Metrics attached to goals get gamed; metrics used as *diagnostics by the people who own the fix* mostly don't — the difference is who's accountable for the number moving.

**Decide with baselines and denominators.** A number without a baseline is a mood. "1,400 invocations" means nothing; "invocations per active repo, up 40% since the v4 error-message rework" is a decision input. Normalize by team size / repo count / working days; annotate dashboards with release dates of the tools being measured so cause and effect are at least in the same frame; and mind the freshness/definition discipline of `tool-engineer/principles/internal-dashboards.md` §1–2 — a metrics dashboard is a dashboard first.

## Common pitfalls

| Pitfall | Detection | Fix / prevention |
|---|---|---|
| Metric wired to reviews → gamed + consent poisoned | Metric improves while the outcome it proxied doesn't; opt-out rate climbs | Team-level aggregation policy; metrics are diagnostics, not targets; gaming forecast gate |
| Vanity adoption numbers (installs, downloads) | Install count ≫ weekly-active invocations | Report actual-usage only (`adoption-and-rollout.md` §4); delete the vanity panel |
| Arguments/paths/secrets in telemetry | Audit a sample of raw events for high-entropy strings and paths | Schema allowlist (command name + classified error only); collection-time scrubbing; front-page test |
| Survey says drowning, dashboard says fine | Run both and diff quarterly | Believe the survey; instrument the gap it exposes |
| Retry-loop blindness | Same-command re-runs within 60s not tracked | Add the retry metric; it's the cheapest proxy for "error message didn't help" |
| DORA used to judge one tool's week | Metric noise ≫ effect size; decisions flip-flop | DORA for direction/quarters; per-tool friction metrics for decisions |
| Telemetry endpoint down → tool slow or broken | Tool latency correlates with telemetry service health | Fire-and-forget, async, drop-on-failure; telemetry must never be on the critical path |
| Dashboard without denominators drives panic | "Errors doubled!" (so did usage) | Rates + baselines + release-date annotations, enforced by dashboard review checklist |

## Cross-references

- The consumers of these numbers: `tool-engineer/principles/adoption-and-rollout.md` (adoption decisions), `tool-engineer/principles/distribution-and-versioning.md` §3 (version-tail monitoring), `tool-engineer/principles/cli-ux.md` §1 (classified-error ratio).
- Presenting the numbers honestly: `tool-engineer/principles/internal-dashboards.md`.
- Test-quality metrics and their gaming pathology in depth: `quality-dev/principles/mutation-testing.md` (adjacent KB).
