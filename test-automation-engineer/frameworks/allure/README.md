# Allure — Reporting & Observability Layer

**Stamped:** 2026-07-06 · **Applies to:** Allure Report 2.32, `allure-playwright` adapter; concepts port to any structured reporting layer (ReportPortal, Currents, custom). Policy lives in `principles/reporting-and-observability.md`; this doc is the mechanism. If you're Playwright-only and small, the built-in HTML report + trace viewer covers you — adopt Allure (or equivalent) when you need **cross-shard merging with history, failure categorization, and multi-framework aggregation** (e.g., Playwright web + Appium mobile in one place). Don't run two report systems in parallel indefinitely; pick per the trigger above.

## The pipeline: results → merge → categorize → history → publish

Allure's model: every test emits result JSON files (`allure-results/`); the report generator merges any number of result directories into one site. That merge-anything property is exactly what sharded CI needs:

1. Each shard uploads its `allure-results/` as an artifact (upload even on failure — `if: !cancelled()`, see `frameworks/github-actions/README.md`).
2. The merge job downloads all of them into one directory.
3. `allure generate` with the **previous run's `history/` directory copied in first** — this is the step everyone misses; without it every report is an amnesiac island and you lose trend/retry views (`principles/reporting-and-observability.md` §run-history). Persist `history/` per branch (S3/Pages/artifact) and thread it through.
4. Publish the generated site (Pages/S3) and deep-link it from the PR comment — one report per run, one click from the PR.

## Categories: automating the test-bug vs product-bug vs infra split

The highest-leverage Allure feature and the least used. `categories.json` pattern-matches failure messages/traces into named buckets, turning the two-minute triage tree (`principles/reporting-and-observability.md`) into report structure:

```json
[
  { "name": "Infrastructure (not app, not test)",
    "matchedStatuses": ["broken", "failed"],
    "messageRegex": ".*(SessionNotCreated|ECONNREFUSED|browser has been closed|Tunnel).*" },
  { "name": "Timing / synchronization suspects",
    "matchedStatuses": ["failed"],
    "messageRegex": ".*(Timeout .*exceeded|waiting for).*" },
  { "name": "Selector breakage",
    "matchedStatuses": ["failed"],
    "messageRegex": ".*(strict mode violation|not found|failed to find element).*" },
  { "name": "Product defect candidates",
    "matchedStatuses": ["failed"],
    "messageRegex": ".*(500 Internal|Unhandled|app error boundary).*" }
]
```

Curate these regexes from *your* failure corpus quarterly — the starter set above earns its keep on day one (infra failures stop polluting flake stats — the Grid/session-create problem from `frameworks/selenium/README.md`) but the real value compounds as signatures accumulate. A failure wave landing 40 tests in "Selector breakage" with one normalized message is one ticket, not forty (`reporting-and-observability.md` §clustering).

## Making reports carry intent, not plumbing

- **Steps at user granularity:** the adapter records Playwright API calls as steps automatically, but page-object methods are the *right* step level. Annotate the interaction layer (`allure.step()` decorator/wrapper on page-object methods — one wrapper in the base fixture, not per-method boilerplate), so a failure reads "Step: submit order → failed," not 45 raw `locator.click` lines. This is the reporting face of `principles/framework-architecture.md` layering.
- **Attachments on failure only:** trace, screenshot, video wired via the adapter config; app-log correlation ID (`X-Test-Run-Id`, per the reporting principles doc) attached as a link template (`allure.link`) pointing into your log system's query URL.
- **Context stamps as labels:** app version, browser, shard/worker index as Allure labels/parameters — they become filterable dimensions ("show me failures on shard 7" answers the contention question in seconds).
- **Ownership routing:** `allure.owner()`/epic/feature labels from spec-path conventions (set centrally in the fixture from the file path — never ask test authors to hand-label), so the quarantine bot and failure notifications route to the owning team without a human dispatcher.

## Flake telemetry via Allure

Allure's retries view (powered by history) shows pass-after-retry per test — the raw feed for the flake-event policy in `principles/ci-cd-integration.md`. Export it (the generated report's JSON data files are stable enough to parse, or emit your own events from the runner alongside) into the run-history store; the report is for humans, the store is for the quarantine bot and trend alerts. Don't make the pretty report the system of record — reports get regenerated/expired; the store is permanent.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| History not threaded through CI | Report shows no trends/retries; "new" failures that are actually old | Persist + restore `history/` per branch around `allure generate` | History restore is a template step, verified by a canary assertion (report must show ≥2 runs) |
| Shards reported separately | N report links per run; failures on shard k missed | Single merge job over all `allure-results/` | Pipeline shape per `frameworks/github-actions/README.md` |
| Categories unmaintained | "Product defect" bucket ≈ 0 while defects clearly ship; everything lands in a default bucket | Quarterly regex curation from recent failure corpus | Category-distribution sanity check in the quarterly suite-health review (`principles/maintainability-and-tech-debt.md`) |
| Step spam (500 raw driver calls per test) | Reports unreadable; triage reverts to raw logs | Step annotation at page-object level | Wrapper in base fixture; report-readability item in framework definition-of-done |
| Report as system of record | Flake stats vanish when reports expire; bot breaks on report format change | Run-history store fed independently | Store writes happen in the runner/CI, not scraped from the report |
| Attachment bloat | Report site GBs; slow loads; storage bills | Failure-only attachments; 14–30d retention | Capture policy in adapter config (`principles/ci-cd-integration.md` §artifacts) |

## Cross-references

- What a failure report must contain and why: `principles/reporting-and-observability.md`
- CI wiring (upload conditions, publishing): `frameworks/github-actions/README.md`
- Flake policy consuming this telemetry: `principles/ci-cd-integration.md` · Suite-wide flake mining: `@quality-dev/` `ci-flake-history-scanner`
