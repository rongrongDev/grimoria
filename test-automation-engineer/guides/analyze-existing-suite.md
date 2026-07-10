# Analyze an Existing Automation Suite

**Stamped:** 2026-07-06 · Tool-agnostic procedure; grep patterns cover Playwright/Selenium/Cypress/Appium. Executable by a human or an AI agent. **Time budget: 4 hours** to all three deliverables (phases are time-boxed — when the box expires, write down what you have and move; an 80% audit delivered beats a 100% audit abandoned). A deeper follow-up per finding is a separate engagement.

**Deliverables:** (1) architecture summary, (2) fragility/maintainability risk list, (3) runtime & parallelization assessment — combined into (4) a prioritized remediation plan.

**Scope note:** this audits the *machine* — framework, infra, runtime. Whether the tests verify the right things at the right layers is `@quality-dev/`'s `test-suite-auditor`; run both for a full picture, and don't duplicate its work here.

## Phase 0 — Inventory (20 min)

Establish the shape before judging anything:

```bash
# What is this? (tool, language, versions — start dating everything)
cat package.json pom.xml requirements.txt 2>/dev/null | grep -iE 'playwright|selenium|cypress|appium|webdriver'
# Size and layout
find . -name "*.spec.*" -o -name "*.test.*" -o -name "*Test.java" | wc -l
ls -d */ && wc -l $(find . -name "*.page.*" -o -path "*pages*" -name "*.ts" -o -name "*Page.java") | sort -rn | head
# Config: workers/parallel/retries/timeouts — photograph the settings
cat playwright.config.* cypress.config.* testng.xml .github/workflows/*e2e* 2>/dev/null
```

Record: tool + version (vs current — version gap is a finding per `principles/maintainability-and-tech-debt.md`), test count, directory convention, config posture (retries? workers? global timeout raised above default? — a 60s default timeout is a confession), CI trigger topology (what blocks merge?).

## Phase 1 — Architecture summary (45 min)

Read, in order: the config, the fixture/setup layer, **two page objects (largest and median)**, and **three specs (newest, oldest, largest)** — newest tells you what the team does *now*, oldest what the framework wanted, largest where the bodies are. Answer against `principles/framework-architecture.md`:

- Layering: do specs contain selectors/waits/driver calls? (Grep: `getBy|locator\(|By\.|cy\.get` inside the spec directories — count hits per file, the distribution matters more than the existence.)
- Pattern: POM / components / Screenplay / none / **two-frameworks-in-one-tree** (look for parallel conventions: `pages/` AND `screens/`, or raw-driver specs beside POM specs — the half-migration finding, with its own line in the report).
- Composition: fixtures/DI vs inheritance (grep `extends` depth in test code); god objects (page objects > 300 lines); assertion leakage (`expect(|assert` in the interaction layer).
- Auth & data: UI login per test? (grep login-page interactions in setup hooks) — hardcoded users/credentials (`grep -rE '(admin|test)@|password.*=' --include="*.spec.*"`)?

**Output:** one page — tool/version/size, pattern + layering verdict, composition style, auth/data approach, the 2–3 structural facts that dominate everything else (e.g., "selectors live in specs; any redesign is a mass-breakage event").

## Phase 2 — Fragility & maintainability risks (60 min)

**Dispatch `agents/suite-wide-antipattern-scanner.md` here if agent infrastructure is available** — it's this phase at full coverage, and its findings table slots directly into the report. Manually (sampled), hunt in priority order:

1. **Hard waits** — `grep -rnE 'waitForTimeout|Thread\.sleep|time\.sleep|cy\.wait\(\s*[0-9]|sleep\(' --include=<specs,pages>` — count, and eyeball the values (three hundred sleeps × 3s = your runtime problem AND your flake problem; cross-foot with Phase 3).
2. **Brittle selectors** — positional XPath (`//.*\[[0-9]+\]`), style classes (`\.(btn|mt|px|col)-`), generated-id tells (`ember|:r[0-9]|__[A-Za-z0-9]{5,}`). Sample 20 hits: are they concentrated (one legacy module — cheap fix) or ambient (culture problem)?
3. **Instant-read assertions racing the app** — `expect\(await .*(isVisible|textContent|count)\(|assertEquals.*getText` (`principles/waiting-and-synchronization.md` §race-2).
4. **Shared-state hazards** — hardcoded accounts/emails/IDs; `describe.serial|@Test\(priority|depends[oO]n` (order coupling declared in code is order coupling *relied on*); global-flag mutation (grep the words `flag|feature|setting` near `update|set|toggle` in setup code).
5. **Maintainability vitals** (git, 10 min): `git log --since=6.months --pretty=%s -- <suite-path> | grep -icE 'fix|flak|stab'` vs total — the fix-to-feature ratio; last-touched dates on the framework layer (abandoned infra?); bus factor (`git shortlog -sn -- <framework-dirs>` — two names = priesthood, per `principles/maintainability-and-tech-debt.md`).
6. **Quarantine/skip census** — `grep -rcE '\.skip|@Ignore|@Disabled|xit\(|xdescribe'` — every skip is silent coverage loss; check dates in blame. A 140-test graveyard changes the whole remediation conversation.

**Output:** risk table — pattern, count, concentration (localized/ambient), blast radius (what breaks when: "next redesign", "next parallelism increase", "silently wrong today"), representative `file:line` examples.

## Phase 3 — Runtime & parallelization assessment (45 min)

**Dispatch `agents/ci-runtime-profiler.md` if CI history is accessible** — it computes what you'd estimate. Manually:

- Pull the last 10 CI runs: wall-clock (and trend vs 3 months ago — creep rate), shard count and balance (max−min shard duration — >20% of mean = rebalancing win available, `principles/parallelization-and-sharding.md`), setup:test ratio per shard (rebuild-per-shard? uncached browsers? — the two classic wastes, `frameworks/github-actions/README.md`).
- Parallel ceiling: current workers × shards vs what hermeticity permits — Phase 2's shared-state findings ARE the parallelization blockers; connect them explicitly ("cannot exceed 1 worker until the 12 hardcoded-account tests are factory-fied").
- Retry accounting: retries configured? Is pass-on-retry *recorded* anywhere (`principles/ci-cd-integration.md` §retry)? If not, note: **the suite's real flake rate is currently unknown** — a finding in itself, and suite-wide flake ranking needs `@quality-dev/`'s `ci-flake-history-scanner` once telemetry exists.
- Longest single test (caps the parallel floor) and the top-10 duration list if any timing data exists.

**Output:** current wall-clock + trend, theoretical floor at full parallelism (`total test-minutes / achievable parallelism + setup`), the 3 largest levers ranked by minutes saved.

## Phase 4 — Prioritized remediation plan (30 min)

Rank by **(risk reduction × minutes saved) / effort**, not by offensiveness. The ordering that has held across every suite I've audited:

1. **Stop the bleeding (days):** lint bans on new sleeps/brittle selectors/instant-reads — the suite must stop getting *worse* before it gets better (`guides/build-framework-from-scratch.md` step 6 has the rule set); flake-event telemetry turned on (can't manage what isn't measured); `fail-fast`/artifact-on-failure/timeout CI fixes (config-only wins).
2. **Cheap big levers (1–2 weeks):** API login + session reuse; build-once-per-pipeline; browser caching; sleep purge of the top-N offenders by (count × value) — mechanical, fan-out-able (`principles/multi-agent-orchestration.md`).
3. **Structural (quarter):** hermetic-data refactor unlocking parallelism (the big one — sequence per `principles/parallelization-and-sharding.md` case study); selector migration by churn ranking; interaction-layer rebuild only if Phase 1 found layering collapse (threshold: >30% blast radius per `principles/maintainability-and-tech-debt.md` §triggers).
4. **Governance (standing):** budget gate, quarantine SLA, nightly random-order run, quarterly health review.

Each item: effort (S/M/L), owner-shaped (one team can do it), measurable exit criterion ("suite at 4 workers, flake rate < 1%" — not "improve stability").

**Anti-recommendation discipline:** the plan must also say what NOT to do. The most common wrong instinct on a bad suite is a ground-up rewrite; per `principles/maintainability-and-tech-debt.md`, rewrites are justified only when the *interaction layer* is unsalvageable, and even then tests migrate through the strangler pattern, never big-bang.
