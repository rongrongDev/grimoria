# StrykerJS — running mutation testing without burning the team out

**Applies to:** StrykerJS 8.x with Vitest 3.x / Jest 29–30 runners · **Last verified:** 2026-07-06
**Standalone:** yes. Quick definitions: Stryker generates *mutants* (small code changes: `>=`→`>`, `+`→`-`, boolean flips, statement removal) and re-runs your tests per mutant. *Killed* = a test failed (good). *Survived* = suite stayed green despite changed code (a verification gap, dead code, or an equivalent mutant). *Mutation score* = killed ÷ (total − ignored).
**Related principles:** what the score means and the survivor decision tree — `quality-dev/principles/mutation-testing.md` (read it first; this doc is mechanics). Bulk interpretation across a module — `.claude/agents/mutation-gap-analyzer.md`.

## Setup that survives contact with a real repo

```bash
npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner   # or jest-runner
npx stryker init
```

`stryker.config.json` — the fields that matter and why:

```jsonc
{
  "testRunner": "vitest",
  "mutate": [
    // RISK-RANKED PATHS ONLY — never "src/**/*" on a real repo.
    "src/billing/**/*.ts",
    "src/authz/**/*.ts",
    "!src/**/*.generated.ts",
    "!src/**/migrations/**"
  ],
  "thresholds": { "high": 85, "low": 70, "break": null },  // break: null on day one — see gating below
  "incremental": true,
  "incrementalFile": ".stryker-incremental.json",
  "coverageAnalysis": "perTest",     // only re-runs tests that cover each mutant — the difference between 20 min and 4 h
  "reporters": ["html", "clear-text", "json", "dashboard"],
  "timeoutMS": 10000, "timeoutFactor": 2,
  "concurrency": 4
}
```

- **`mutate` globs are the whole game.** Scope to the top-10 risk modules from your strategy doc (`quality-dev/principles/test-strategy.md`); mutating glue/generated code produces noise, runtime, and abandonment.
- **`coverageAnalysis: "perTest"`** is non-negotiable for usable runtimes; it needs a clean, *deterministic* suite — mutation testing on a flaky suite lies in both directions (a flake "kills" a mutant randomly; fix flakiness first: `quality-dev/principles/flakiness.md`).
- **`incremental: true`** re-tests only mutants affected by changed code/tests. Persist `.stryker-incremental.json` in CI cache keyed on branch; this is what makes PR-time mutation affordable.
- Trim noisy mutators when they prove noisy *for you* (typically `StringLiteral` in logging, `ObjectLiteral` in config): `"mutator": { "excludedMutations": ["StringLiteral"] }` — but only after triage shows they're noise, not before.

## The two-track operating pattern (the one that doesn't get turned off)

**Track 1 — PR-time (blocking, minutes):** incremental run over changed files within the `mutate` scope. Gate: **break-even or better** — the PR may not *lower* the incremental score on core paths. Implemented by comparing the json reporter's score for changed-file mutants against the base branch. No repo-wide absolute bar: absolute bars on day one block every PR and get the tool deleted (I've watched that arc twice; both teams re-adopted a year later with this pattern).

**Track 2 — nightly/weekly (non-blocking, hours):** full run over the `mutate` scope; publish `html` report as a CI artifact and score trend to the dashboard reporter (or your own metrics store). New survivors in core paths auto-file to the owning team. This is also where you run the `mutation-gap-analyzer` subagent to classify survivors into the four buckets (missing assertion / untested path / dead code / equivalent — the decision tree in `quality-dev/principles/mutation-testing.md`) instead of dumping raw reports on humans.

## Reading the report — fast triage

Sort survivors by **mutator type × file risk**, not file order:

1. `ConditionalExpression` / `EqualityOperator` / **`ConditionalBoundary`** (`<`→`<=` etc.) in domain logic → almost always a real missing boundary test. The `>=`→`>` discount-threshold survivor in `quality-dev/principles/mutation-testing.md` is this class; write the `test.each` boundary table (`quality-dev/tools/jest-vitest.md`).
2. `BlockStatement` (emptied function body) surviving → nothing asserts this function's effect at all — the assertion-free-test signature.
3. `ArithmeticOperator` in money/quota math → priority regardless of score.
4. `StringLiteral`/`ObjectLiteral` in messages/config → usually ignore-with-comment or exclude the mutator.
5. Survivors in `catch` blocks → risk call: money/auth/data-integrity error paths get tests; log-and-rethrow may not.

Mark equivalents inline so they stop reappearing: `// Stryker disable next-line ConditionalBoundary: loop provably never hits boundary`.

## Common pitfalls

| Pitfall | Consequence | Instead |
|---|---|---|
| `mutate: ["src/**/*"]` on first run | 8-hour run, 3,000 survivors, tool abandoned by Friday | Risk-ranked globs; expand later |
| Running on a flaky suite | Random kills/survivals; scores incomparable run-to-run | Green + deterministic suite is a precondition |
| `break` threshold set day one | Every PR blocked on legacy debt | `break: null`; gate on *break-even delta* only |
| Chasing equivalent mutants | Contorted tests asserting internals | Classify → `// Stryker disable` with reason |
| Comparing scores across config changes | Fake trends | Config changes logged in `quality-dev/CHANGELOG.md`; reset trend baseline |
| Timeouts counted as kills misread as strength | Slow tests "kill" via timeout, not assertion | Investigate `Timeout` outcomes separately in the json report |
| Full run in the PR path | 10-min budget (`quality-dev/principles/ci-cd-integration.md`) obliterated | Incremental on PR; full runs scheduled |

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Verification decay (new code, weak tests) | Incremental score drops on PR | Strengthen assertions per triage order above | Break-even PR gate on core paths |
| Survivor backlog rot | Nightly survivor count trend rising, untriaged age >2 weeks | `mutation-gap-analyzer` classification + owner assignment | Auto-filed tickets per new core survivor; monthly review |
| CI cost explosion | Mutation stage wall time trend | perTest coverage, incremental cache, concurrency tuning, scope trim | Hard timeout on PR stage; full run only scheduled |
| Score gaming (tests written to kill mutants, not verify behavior) | Tests asserting internals/exact strings appear alongside score jumps | Review: does the test state a behavioral claim? | Reviewer checklist question; equivalents disabled with reasons, not "tested" |
