# Chaos Engineering — Production Patterns & Common Pitfalls

**Applies to:** tool-agnostic (LitmusChaos / Gremlin / AWS FIS-class injectors); extended-tier doc: patterns + pitfalls only, not a full methodology · **Last verified:** 2026-07-14

**Working definition:** chaos engineering is *hypothesis-driven failure injection* — "we believe the system survives X, here's the steady-state metric that proves it, let's inject X and watch" — not randomly breaking things to see what happens. The hypothesis is the whole discipline; injection without one is vandalism with a dashboard.

## Production patterns

**Pattern: hypothesis → blast radius → abort condition, written before anything is injected.** A one-page experiment doc: the steady-state SLI that must not move (use the real SLO SLIs — `reliability-engineer/principles/slos-and-error-budgets.md`), the injection, the bounded scope, the abort threshold, and who's watching. If you can't state the steady-state metric, you're not ready to experiment — you're missing observability, and *that's* the finding (`reliability-engineer/principles/observability.md`).

**Pattern: blast radius is designed first and expanded last.** Sequence: staging → one prod instance → one AZ's small slice → meaningful fraction. Bound by scope (specific instances/percentage of traffic), by time (auto-stop), and by budget (an experiment may spend at most a defined slice of the service's error budget — that's literally what the budget is for; a team with no budget left doesn't run prod chaos this window). Always with an automatic abort wired to the steady-state SLI, because the human watching gets distracted. And check the calendar sideways: your Tuesday 10am experiment can collide with another team's launch — a shared experiment calendar is cheap insurance.

**Pattern: mine postmortems for experiments.** The best experiment catalog is your incident history (`reliability-engineer/principles/postmortems.md` corpus, tagged by factor class): every past incident class becomes a recurring regression test — "dependency X times out" happened once at 3am with a cold team; re-run it quarterly at 10am with a warm one and verify the fix held. Generic packaged experiments (kill a pod, add latency) are a fine warm-up but the returns are in *your* failure history.

**Pattern: game days exercise the humans, not just the system.** Inject a real (bounded) fault, and let detection → paging → IC assignment → diagnosis → mitigation run as if real. This is simultaneously your alert-coverage test, your runbook-staleness test, your IC-bench training (`reliability-engineer/principles/incident-management.md`), and your observability drill (`reliability-engineer/principles/observability.md`, the 3am test). Half the findings from a good game day are process findings: the runbook's commands don't exist anymore, the escalation contact left in March.

**Pattern: start with the experiments that verify claimed redundancy.** "We're N+1" / "the cache is optional" / "we fail over automatically" — every architecture carries claims like these, most untested since the day they were built. Killing one instance of an "N+1" fleet is the cheapest, highest-yield first experiment there is, and it fails more often than anyone expects.

## Common pitfalls

- **Treating a passed experiment as proof of resilience.** A pass is one data point under one condition on one day: the system survived *that* injection at *that* load with *that* data shape. Systems drift — the config change next month can un-survive it. Fixes: re-run experiments on a schedule (they're regression tests, not certifications), and word reports honestly: "survived AZ loss under Tuesday-noon load" not "AZ-loss resilient."
- **Chaos without a rollback story.** If you can't stop the experiment faster than it does damage, you don't have an experiment — you have an incident with a scheduled start time. Verify the abort works *in staging first*, including the injector itself dying mid-experiment (injectors that fail open, leaving the fault running with nobody at the wheel, have caused real outages — know your tool's failure mode before trusting it in prod).
- **Experiments that don't map to plausible failures.** Injecting exotic byzantine faults while never having tested "the database fails over" is theater. Priority order: past incidents → claimed redundancy → dependency failures (`reliability-engineer/principles/capacity-planning.md` dependency ledger) → exotica, if ever.
- **Running chaos when the finding can't be actioned.** An experiment that reveals a weakness nobody has budget to fix produces a known-and-accepted risk, which is *fine if written down* ("declined, because —" like a postmortem action item) and corrosive if just... known. Don't run experiments faster than the org metabolizes findings.
- **Skipping chaos because "we have too many real incidents already."** Half-true instinct, wrong conclusion: a team drowning in incidents shouldn't run *new* prod injections, but game-day rehearsal of the incidents they're *already having* is exactly what shortens them. The gate is pager health (`reliability-engineer/principles/alerting.md` fatigue metrics), not incident count.

## Where depth lives

Steady-state metrics: `reliability-engineer/principles/slos-and-error-budgets.md` · watching the experiment: `reliability-engineer/principles/observability.md` · game-day incident mechanics: `reliability-engineer/principles/incident-management.md` · experiment sourcing: `reliability-engineer/principles/postmortems.md` · DR tests as the biggest chaos experiment: `reliability-engineer/topics/disaster-recovery.md` · injection tooling/deployment mechanics: `devops-engineer/`.
