# CI/CD Pipelines: The Signal Is the Product

**Applies to:** concepts tool-agnostic; worked examples are GitHub Actions (syntax verified 2026); everything ports to GitLab CI/Jenkins/Buildkite with renamed keys · **Last verified:** 2026-07-14

**The one-sentence philosophy:** a pipeline exists to produce one trustworthy bit — "this change is safe to ship" — and every flaky test, every stage that passes without validating what it claims, every cache that can serve a stale artifact is counterfeiting that bit. Teams don't abandon CI because it's slow; they abandon it because it lied to them. The day an engineer types "re-run, it's probably flaky" without reading the failure is the day your pipeline stopped being a safety mechanism and became a ritual.

## Pipeline architecture: the shape that survives

- **Stages are ordered by cost-of-failure-discovery, cheapest first:** lint/typecheck → unit tests → build artifact → integration tests against the built artifact → deploy to staging → smoke → promote. Never let an expensive stage run when a cheap one would have caught the failure.
- **Build once, promote the same artifact.** The single most load-bearing rule in this KB. The artifact that passed tests must be *byte-identical* to the artifact deployed to every environment — one image digest, promoted through stages, never rebuilt "for prod." Every rebuild is a chance for a different dependency resolution, a different base image, a different bug. If your prod deploy job contains a compile step, you are testing one binary and shipping another. See `devops-engineer/topics/release-engineering.md` for artifact immutability mechanics.
- **The pipeline is code: reviewed, versioned, owned.** `.github/workflows/` changes get the same review as application code — more, actually, because a workflow change can exfiltrate secrets or skip gates. Run `devops-engineer/skills/pipeline-flakiness-reviewer/` on any pipeline change as a matter of course.
- **Every gate must be able to fail.** For each stage ask: "what commit would make this stage go red?" If you can't name one, the stage is theater (see failure mode 4).

## Failure modes

### 1. Flaky pipeline (non-determinism eroding trust)

- **Failure mode:** tests or jobs that pass/fail without a code change. Sources, in the order I've actually found them across two decades: shared mutable state between tests (DB rows, ports, tmp files), time dependence (`sleep`-based waits, "expires tomorrow" fixtures that fail at 11:59pm, timezone-sensitive assertions), unpinned external dependencies (a `latest` tag, a live third-party API in unit tests), resource contention on shared runners, and test-order dependence that only bites when parallelism reshuffles.
- **Detection:** measure, don't vibe: track re-run-to-green rate per job and per test (a merge that needed a re-run is a flake datapoint). Any test that has both passed and failed at the same commit SHA is *proven* flaky — most CI platforms can report this; if yours can't, a nightly job re-running the suite 10× at HEAD builds the list.
- **Fix:** quarantine, then fix or delete — in that order and quickly. Move the proven-flaky test to a non-blocking job the same day (a flaky blocking test trains people to override reds), then fix the root non-determinism within a sprint or delete the test. A quarantine list older than a month is a graveyard, not a quarantine.
- **Prevention:** pipeline gate — new tests run 3× in the PR that introduces them (cheap with parallelism); review checklist via `devops-engineer/skills/pipeline-flakiness-reviewer/` on pipeline changes; standing budget: re-run rate >5% auto-creates a P1 for the owning team, so cleanup doesn't depend on whoever is annoyed loudest.

### 2. Non-reproducible builds (works locally, fails in CI — or worse, vice versa)

- **Failure mode:** the build's output depends on where/when it runs. Causes: floating dependency versions (no lockfile, or lockfile not enforced), unpinned base images (`FROM node:20` moves weekly), implicit reliance on runner state (a preinstalled tool, a warm cache, an env var someone set in a runner image two years ago), network-fetched resources without checksums. The worst variant is *vice versa*: CI green, prod broken, because CI's environment quietly had something prod's didn't.
- **Detection:** build the same commit twice on clean runners and diff the artifacts (digest comparison for images). Not identical → not reproducible → find why *now*, while it's cheap. Run this as a scheduled weekly job, not a someday intention.
- **Fix:** lockfiles enforced in CI (`npm ci` not `npm install`, `--frozen-lockfile`, `pip install -r` with hashes); base images pinned by digest (`node:20.19-bookworm@sha256:...`); builds run in containers so the runner's own state can't leak in; all fetched resources checksummed.
- **Prevention:** pipeline gate that fails on lockfile drift; digest-pinning enforced by lint on Dockerfiles (`devops-engineer/principles/containers-and-orchestration.md`); dependency updates arrive as *reviewed PRs from a bot*, never as silent resolution-time drift — pinning without an update bot is how you end up frozen on a vulnerable version, see `devops-engineer/topics/supply-chain-integrity.md`.

### 3. Secrets leaking into build logs

- **Failure mode:** a secret lands in plaintext in CI logs — echoed by a debug statement, dumped by a failing tool printing its env, interpolated into a command line that the runner logs, or captured in an uploaded artifact. Logs are the most-shared, least-protected surface in the delivery path; I've seen a prod DB password sit in a public repo's Actions log for five months because a library helpfully printed its connection string on failure.
- **Detection:** platform masking helps but only masks *registered* secrets in *exact* form — base64 of a secret, a secret inside a JSON blob, or a derived token sails through. Run a log-scanning step (gitleaks/trufflehog-class scanner against job output and artifacts) as a post-job hook. Treat every leak as a live credential compromise: the log's audience is unknowable.
- **Fix:** rotate the credential *first*, then fix the leak path. Deleting the log is not remediation; runners, forks, and browser caches have copies.
- **Prevention:** secrets enter jobs as env vars or files scoped to the *single step* that needs them, never job-global; `set -x` banned in steps holding secrets; prefer short-lived OIDC-federated credentials over long-lived stored ones so a leaked value expires in minutes (`devops-engineer/principles/secrets-in-delivery.md` for the full model). Incident handling of a confirmed leak beyond rotation → `security-dev/`.

### 4. Theater stages (pass without validating what they claim)

- **Failure mode:** a stage named "integration-tests" that runs zero tests because the glob matches nothing; a smoke test that curls a URL and ignores the status code; a "security scan" that's been `|| true`'d since it first found something inconvenient; a test job where a setup failure exits 0. Every one of these once shipped a broken build with a green checkmark on it — the checkmark is the product, and it was counterfeit.
- **Detection:** the mutation test for pipelines: introduce a deliberate failure (a failing test, a known-bad image, a bad exit code) and confirm the pipeline goes red at the right stage. Cheap to do quarterly; also audit for `|| true`, `continue-on-error`, ignored exit codes, and test-count assertions ("ran 0 tests" should fail, and in most runners doesn't by default).
- **Fix:** each stage asserts its own preconditions: test stages assert tests-discovered > 0; smoke stages assert on response *content*, not reachability; any `continue-on-error` carries a linked ticket and an expiry date.
- **Prevention:** review checklist for pipeline changes (any newly ignored failure is a blocker); the quarterly red-team-your-pipeline exercise above; delivery-wide audit via `devops-engineer/skills/delivery-posture-assessor/`.

### 5. Cache poisoning (stale artifacts shipped silently)

- **Failure mode:** a cache key that doesn't include everything that affects the output — so a change to a build flag, a base image, or a transitive dep reuses a stale compiled artifact, and the pipeline tests (or worse, deploys) something that doesn't correspond to the commit. This is the sneakiest failure in this doc because every stage is green *and telling the truth about the wrong artifact*. I once spent two days on a "fixed" bug that kept shipping because the Docker layer cache keyed on the Dockerfile line (`COPY package.json`… unchanged) while the actual fix lived a layer above the cache cut.
- **Detection:** any "the fix is merged but prod still shows the bug" report is cache-suspect *first* — check the deployed artifact's digest against a clean rebuild of the same SHA before debugging the code. The weekly reproducibility rebuild (failure mode 2) catches key-composition rot mechanically.
- **Fix:** cache keys must hash *all* inputs to the cached step: lockfile + toolchain version + relevant config, not just one file. When in doubt, over-invalidate — a cache miss costs minutes; a poisoned cache costs an incident plus a week of distrust in every green build.
- **Prevention:** iron rule — **caches accelerate builds; they must never determine outputs.** Anything that ships (the release artifact itself) is built from source or pulled by immutable digest, never assembled from cache. Dependency caches: fine. Compiled-output caches feeding a release artifact: only with content-hash keys you can defend in review.

## What the pipeline must never do

Deploy on a red or skipped gate (a manual override must be a *logged, named-human* action, not a retry button); rebuild an artifact between test and deploy; hold write-credentials broader than the stage needs; run untrusted PR code with secrets available (`pull_request_target` with checkout of the PR head is the classic self-inflicted wound — treat fork PRs as hostile input).

## References

Pipeline change review: `devops-engineer/skills/pipeline-flakiness-reviewer/` · full build guide: `devops-engineer/playbooks/build-a-delivery-pipeline-from-scratch.md` · artifact immutability and versioning: `devops-engineer/topics/release-engineering.md` · secrets model: `devops-engineer/principles/secrets-in-delivery.md` · failed-deploy root-causing: `devops-engineer/agents/deployment-failure-tracer.md` · whether a shipped regression breached an SLO and who gets paged: `reliability-engineer/principles/slos-and-error-budgets.md`
