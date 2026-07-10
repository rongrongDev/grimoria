# GitHub Actions — CI Execution Layer for Test Automation

**Stamped:** 2026-07-06 · **Applies to:** GitHub Actions SaaS as of this date (Actions has no version number — the date IS the version; re-verify runner images and action majors: `actions/cache@v4`, `actions/upload-artifact@v4`). Policy lives in `principles/ci-cd-integration.md`; this doc is the mechanism. Patterns transfer to GitLab CI/Buildkite with syntax changes only.

## The reference pipeline (Playwright, sharded)

The shape every pattern below plugs into — build once, shard the tests, merge the reports:

```yaml
jobs:
  build:                       # ONE build, artifacts to all shards
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci && npm run build
      - uses: actions/upload-artifact@v4
        with: { name: app-build, path: dist/ }

  e2e:
    needs: build
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false          # one red shard must NOT cancel the others —
      matrix:                   # you need the full failure picture per run
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: Cache Playwright browsers
        id: pw-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: pw-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
      - if: steps.pw-cache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium
      - if: steps.pw-cache.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium     # OS deps aren't in the cache
      - uses: actions/download-artifact@v4
        with: { name: app-build, path: dist/ }
      - run: npx playwright test --shard=${{ matrix.shard }}/4
      - if: ${{ !cancelled() }}                        # upload blobs even on failure
        uses: actions/upload-artifact@v4
        with: { name: blob-report-${{ matrix.shard }}, path: blob-report/ }

  merge-report:
    needs: e2e
    if: ${{ !cancelled() }}                            # runs even when e2e failed —
    runs-on: ubuntu-latest                             # failed runs need reports MOST
    steps:
      # download all blob-report-* artifacts, npx playwright merge-reports,
      # publish single HTML/Allure report + PR comment with failure summary
```

The three most-copied mistakes, pre-corrected above: (1) each shard rebuilding the app — the #1 waste `agents/ci-runtime-profiler.md` finds; (2) `fail-fast` defaulting to true — cancels the other shards on first failure, hiding the full picture and making flake patterns invisible; (3) report/artifact steps skipped on failure because they lack `if: !cancelled()` — the runs you most need artifacts from are the failed ones.

## Caching (mechanism for `principles/ci-cd-integration.md` §caching)

- **Browser binaries:** as above — the cache key is the lockfile (Playwright version pins the browser build). The split between `install --with-deps` (cold) and `install-deps` (warm) matters: OS libraries live outside `~/.cache/ms-playwright`, so a warm cache on a fresh runner image still needs them. Symptom of getting it wrong: "works cached, breaks the week the runner image updates."
- **Dependency cache:** `setup-node`'s built-in `cache: npm` is sufficient; don't hand-roll.
- **Cache honesty:** the weekly canary workflow (below) runs with an intentionally-busted cache key to catch works-only-cached drift.
- **Limits:** repo cache is bounded (10GB, LRU eviction) — huge caches evict each other into permanent cold starts, which looks like "caching randomly stopped working." Check cache-hit telemetry, not vibes.

## The supporting workflows

Policy from `principles/ci-cd-integration.md`, implemented as four small workflows beyond the PR pipeline:

1. **main full-set** — `on: push: branches: [main]`, full suite + Tier-1 browsers (`principles/cross-platform-and-browser.md`), red pages the suite-health rotation.
2. **nightly hazard hunt** — `on: schedule`, random-order + max-parallelism (order-dependence detector from `principles/test-data-management.md`), full matrix, quarantine re-runs. Schedule note: `cron` is UTC and top-of-hour is the platform's rush hour — pick an off-minute (`17 3 * * *`), and know that schedule triggers can delay 15+ min under load; don't build timing assumptions on them.
3. **weekly canary** — deps at `latest` + cache-off (`principles/maintainability-and-tech-debt.md` §upgrades). Non-blocking, but red canary auto-files an issue.
4. **quarantine bot** — consumes flake telemetry, opens the quarantine/restore PRs (`principles/ci-cd-integration.md` §quarantine).

**Runtime-budget gate:** a step in merge-report compares total wall-clock against budget and fails with attribution (top-5 slowest tests + setup:test ratio from the timing data). The check name is merge-blocking via branch protection.

## Actions-specific mechanics worth knowing

- **`concurrency` groups** on the PR workflow (`group: e2e-${{ github.head_ref }}`, `cancel-in-progress: true`): force-push storms otherwise queue five obsolete suite runs — real money at 16 shards each.
- **`timeout-minutes` on every job** (default is 360!). A hung browser process = a runner billed for six hours. Set it to ~2× expected.
- **Secrets & fork PRs:** `pull_request` from forks gets no secrets — E2E needing staging credentials silently degrades. For open-source repos, gate E2E behind `pull_request_target` *with extreme care* (it runs with secrets against untrusted code — checkout the base, not the head, or require a maintainer label; this is a real supply-chain surface, treat any deviation as a security review item).
- **Artifact retention:** `retention-days: 14` minimum on failure artifacts (`principles/reporting-and-observability.md`); publishing HTML reports via Pages or an S3 bucket beats download-and-unzip for triage speed — deep-link it from the PR comment.
- **Larger runners are usually cheaper than more shards** once per-shard setup is nontrivial: one 8-core runner at 4 workers ≈ two 2-core shards, minus one full setup cost. Do the arithmetic per suite (the profiler reports setup:test ratio precisely to feed this decision).
- **Self-hosted runners** for device labs / data-residency: you inherit runner ops (cleanup between jobs is YOUR job — stale state on self-hosted runners is a notorious hermeticity leak; use ephemeral/just-in-time runners or aggressive workspace cleanup).

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Per-shard app rebuild | Profiler: setup dominated by build step ×N shards | build-once + artifact download | Reference pipeline shape; profiler setup:test alert |
| `fail-fast` hiding shard results | "The other shards were cancelled" in every red run | `fail-fast: false` | Workflow template default |
| No artifacts from failed runs | Red run, empty artifact list | `if: !cancelled()` on upload/merge steps | Template; audit checks `if:` conditions on artifact steps |
| Zombie 6-hour jobs | Billing spikes; jobs at exactly 360 min | `timeout-minutes` everywhere | Org-level workflow lint |
| Obsolete runs queueing | Multiple in-flight runs per PR | `concurrency` + cancel-in-progress | Template |
| Cache eviction churn | Cache-hit rate declining; cold installs "randomly" | Trim cache sizes, consolidate keys | Cache-hit rate on the suite-health dashboard |
| Fork PRs silently skipping E2E | Green PRs from forks with zero E2E minutes | Explicit skip-with-status (visible) or pull_request_target pattern with security review | Required check fails loudly when E2E didn't run |

## Cross-references

- Policy this implements: `principles/ci-cd-integration.md` · Shard math: `principles/parallelization-and-sharding.md`
- Report merging details: `frameworks/allure/README.md` · Playwright blob reports: `frameworks/playwright/README.md` §CI
- Profiling a run that's over budget: `agents/ci-runtime-profiler.md`
