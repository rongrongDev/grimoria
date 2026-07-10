# Static Analysis & Lint Rules — trust is the budget, false positives are the spend

**Applies to:** custom lint rules and static-analysis checks in any framework (ESLint, Ruff plugins, semgrep, custom AST checks). Framework mechanics: `tool-engineer/reference/eslint-custom-rules.md`. **Last verified:** 2026-07-06.

**The stance:** a lint rule is not judged by the bugs it could catch; it's judged by whether developers still read its output six months in. Every false positive spends trust roughly ten times faster than a true positive earns it, because the developer remembers the time the tool was wrong and cried wolf, not the nine times it was right and invisible. Once a team stops trusting one rule, they stop reading *all* the tool's output — suppression comments appear in commits titled "shut up linter", then someone adds a blanket disable to the repo config, and your true positives now fire into the void. I have watched this exact cascade take a security-critical rule down with it, because it shared a reporter with a style rule that flagged idiomatic code.

## 1. False-positive economics

Working numbers from running lint programs across large orgs:

- **A rule needs a true-positive rate above ~95% on real code** (not on your test fixtures — on the actual codebase) to survive. Below that, suppressions accumulate faster than fixes.
- **Measure it before shipping:** run the candidate rule across the whole codebase, sample 50 findings randomly, and hand-classify each as true/false/technically-true-but-nobody-should-fix-this. The third category counts as false for trust purposes — see §2.
- **Every rule message must carry a suppression escape hatch and say so.** Counterintuitive but load-bearing: a visible, per-line, *reason-required* suppression (`// lint-ignore rule-name: <why>`) keeps disagreement local and auditable. Deny people the local escape and they take the global one (disabling the rule in config), which you cannot audit and rarely notice.
- **Audit suppressions quarterly.** Suppression count per rule is your false-positive telemetry. A rule with rising suppressions is either wrong or explained badly; both are your bug. A rule with >20% of findings suppressed should be demoted to warn or killed.

## 2. Technically correct but impractical at scale

The second way rules die: the finding is *true* but the fix is not worth it, and the rule can't tell. A rule demanding explicit return types fired 14,000 times on a codebase that had survived fine without them. Each finding was "correct." The aggregate demand was three engineer-months of churn with near-zero defect reduction. The team's rational response was to disable the rule — and my lesson was that **the rule author owns the cost of compliance, not just the correctness of the finding.**

Before shipping any rule, compute: `(findings on existing code) × (median minutes to fix) = cost you are imposing`. Then:

- Cost near zero (autofixable) → autofix the world yourself (§3, path A). You wrote the rule; you pay the migration.
- Cost material, defect-prevention high (real incident class behind it) → baseline-and-ratchet (§3, path B).
- Cost material, defect-prevention speculative → don't ship it as a blocking rule. Ship as advisory in code review, gather data, revisit.

A blocking rule is a claim that *every* violation is worth stopping a merge for. Most rules can't honestly make that claim; severity inflation is how lint programs lose the room.

## 3. Rollout across a large existing codebase

Never flip a new rule to error on a codebase with existing violations — you either block every team's next PR on cleanup they didn't schedule, or teach everyone to bulk-suppress. Decision tree:

**Path A — the rule has a reliable autofix.**
1. Ship rule + autofix. 2. Run the autofix across the entire repo yourself, in one mechanical PR per ownership area (reviewers must be able to skim; "mechanical, verified by X" in the description, and *nothing else* in the diff). 3. Flip to error the moment the fix PRs land. Total warn-phase: days. This is the golden path; it's why autofixability should shape rule design from the start — a rule you can't autofix is a rule you're asking thousands of people to fix by hand.

**Path B — no autofix, many existing violations.**
1. **Baseline:** snapshot current violations into a checked-in baseline file the tool ignores. 2. **Error on new code immediately** — new violations (not in baseline) block merge from day one. The codebase stops getting worse today. 3. **Ratchet:** CI fails if the baseline *grows*; shrinking is allowed and celebrated (burn-down chart, if you track anything). 4. Optionally schedule cleanup by ownership area. Never convert the baseline to "fix by date X or we break your build" without doing step-A-style work for the teams — a deadline without migration tooling is a tax (`tool-engineer/principles/adoption-and-rollout.md` §3).

**Path C — warn-then-error, time-boxed.** Only for rules with few existing violations (< ~50): warn for one or two release cycles with an announced flip date, then error. Warn-forever is worse than nothing: permanent warnings train output-blindness, and output-blindness is a tool-wide disease, not a per-rule one.

## 4. Authoring quality bar

- **The message contains the fix, not just the objection.** `"Avoid deprecated fetchUser()"` fails the bar. `"fetchUser() is deprecated and drops auth context; use fetchUserWithSession() — see go/auth-migration"` passes. The message is read at the moment of highest receptiveness; a URL to the *why* doc converts arguers into compliers. Every custom rule gets a docs URL in its metadata.
- **Test negatives as hard as positives.** A rule's test suite needs valid-code cases that *look like* violations (the near-misses) — that's where false positives live. And if the rule has an autofix, assert the *exact fixed output*, and run the fixer over pathological cases (nested violations, comments inside the node, overlapping fixes). **A fixer that produces broken code is worse than no rule at all** — it converts a warning into a build breakage with your tool's name on it, at which point you need `build-breakage-tracer`-grade forensics and an apology.
- **Performance is a feature.** Lint runs on every save in editors and every PR in CI. A type-aware rule that adds 40s to lint is a rule teams will disable for latency alone. Budget rules; measure with the framework's timing tools (`tool-engineer/reference/eslint-custom-rules.md` §5).
- **Every rule has a named owner.** Rules whose author left and nobody defends become folklore ("why do we have this?"). Quarterly review: each rule's owner re-justifies it with its suppression count and catch count in hand; orphaned rules get adopted or deleted. Deleting a rule is not failure — carrying dead rules is.

## 5. Failure modes → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| False positives erode trust → wholesale suppression | Suppression count per rule trending up; grep for file-level/config-level disables | Fix or demote the rule; personally remove now-unneeded suppressions | 50-finding hand-classification gate before any rule ships (§1); quarterly suppression audit |
| Correct-but-impractical rule disabled by consumers | Rule enabled but violation count static + suppressions rising; teams asking "can we turn this off" | Recompute cost-of-compliance; move to advisory or ship autofix | Cost calculation is a required field in the rule proposal template (§2) |
| Rule flipped to error, blocks unrelated PRs org-wide | Merge-queue failure spike the day a rule lands | Revert to warn within the hour; then Path A or B properly (§3) | Rollout paths are policy: no error-on-existing-violations, ever |
| Broken autofix corrupts code | CI red after `--fix`; fixer output fails typecheck | Disable fixer immediately (keep rule as warn); fix with output-exact tests | Fixer test suite asserts exact output + typechecks fixed fixtures (§4) |
| Warn-forever → output blindness | Warnings count high and flat for months | Pick a path from §3 or delete the rule | Every warn-level rule carries an owner + flip-or-kill date |
| Lint latency creep | Editor-save lint > ~1s; CI lint step trending up | Profile per-rule timing; cache type info; demote hot offenders | Per-rule time budget asserted in CI on a fixture repo |
| Orphaned rules nobody can justify | Rule ownership list has gaps; "why?" answered with a shrug | Adopt or delete | Named owner per rule + quarterly re-justification (§4) |

## Cross-references

- Framework mechanics — rule anatomy, RuleTester, fixers, publishing an internal plugin: `tool-engineer/reference/eslint-custom-rules.md`.
- Rollout of a rule is an adoption problem: `tool-engineer/principles/adoption-and-rollout.md` (dogfooding, migration tooling, measuring).
- A lint-rule release that broke builds: dispatch **`build-breakage-tracer`**.
- Lint gates inside CI pipeline design: `quality-dev/principles/ci-cd-integration.md` (adjacent KB — owns CI stage architecture).
