# Release Engineering: An Artifact Is a Fact — Extended Tier with Full Failure Chains

**Applies to:** tool-agnostic; examples cite OCI registries/digests, SemVer, Bazel/Nx/Turborepo-class build graphs (verified 2026) · **Last verified:** 2026-07-14

**The one-sentence philosophy:** a release is a *fact* — this exact artifact, built from this exact commit, with these exact dependencies — and every practice in this doc exists to keep that fact checkable, because the moment "what is actually running?" has no reliable answer, every debugging session starts with archaeology and every rollback is a guess. Extended-tier doc, but its failure modes carry full chains: mutable artifacts and wrong-subset monorepo builds are among the most expensive mistakes in the domain.

## Production patterns

- **Version the artifact, not the vibe.** Every buildable unit gets an identity: SemVer for things with consumers who must reason about compatibility (libraries, APIs, modules — where major-bump-on-breaking is a *promise*, and breaking-in-a-patch is the trust-destroying sin); build metadata (commit SHA + build number) for continuously-deployed services, where SemVer is ceremony. Both kinds resolve to an immutable artifact reference (digest).
- **Tags are pointers; digests are facts.** Deploy manifests reference digests. Human-friendly tags (`v2.3.1`, `prod-current`) may exist for people, but nothing in the delivery path resolves them at deploy time (`devops-engineer/principles/containers-and-orchestration.md`).
- **Promote, never rebuild.** One build per commit; the same digest moves dev → staging → prod by *reference*, gathering approvals as metadata. Stated fully in `devops-engineer/principles/cicd-pipelines.md`; restated here because release engineering is where it's enforced: the registry/promotion tooling should make rebuilding-for-prod *impossible*, not just discouraged.
- **Retention serves rollback.** The last N releases per service are pinned against registry GC *because they are the rollback inventory* (`devops-engineer/principles/deployment-strategies.md`, failure mode 2). A cost-optimization that deletes last month's images has quietly deleted your escape hatch.

## Failure modes (full chains)

### 1. Mutable artifacts (the reused tag, the overwritten release)

- **Failure mode:** someone re-pushes `v2.3.1` (or `latest`, or a branch-named tag) with different content — because "it was just a small fix" — and now two environments running "the same version" run different code, the incident timeline says a version that means nothing, and the rollback target is whichever content the tag pointed to at pull time. The debugging cost of this failure is unbounded because it attacks the *premise* of debugging: that the version string identifies the code.
- **Detection:** registries that record tag-repointing events (audit log alert); deploy pipeline comparing the digest a tag resolves to against the digest recorded at release time — any mismatch is a five-alarm finding.
- **Fix:** immutable-tag enforcement (most registries offer it — turn it on); the "small fix" ships as `v2.3.2`, always, no exceptions for anyone under deadline, *especially* not then.
- **Prevention:** registry immutability config (mechanism); deploy-by-digest so a repointed tag can't reach prod anyway (mechanism); release process where version assignment is automated from the commit, so there is no human hand to reuse a number (pipeline).

### 2. Pinning vs. staleness (the two ways dependencies rot)

- **Failure mode:** two failure modes in tension, and teams pick their poison instead of resolving it. *Unpinned:* builds are non-reproducible, Tuesday's artifact differs from Monday's with no diff (`devops-engineer/principles/cicd-pipelines.md`, failure mode 2). *Pinned-and-frozen:* the versions age, CVEs accumulate, and the eventual forced upgrade (a Log4Shell-class day) is a 40-version jump under incident pressure, with every breaking change between here and there due at once.
- **Detection:** staleness metrics per repo — age of oldest lockfile entry vs. upstream, count of majors behind, open-but-unmerged bot PRs (a bot whose PRs rot unmerged is detection without fix — measure merge latency, not PR count).
- **Fix/prevention — the resolved tension:** pin everything (lockfiles, digests, SHAs — `devops-engineer/topics/supply-chain-integrity.md`) *and* run the update engine as routine: bot PRs land continuously, CI validates each small step, and upgrading 40 times by one version replaces upgrading once by 40 versions. Budget rule that survives contact with roadmaps: dependency PRs get merged weekly or the bot gets paused-and-un-paused honestly, not left generating wallpaper.

### 3. Monorepo build-graph incorrectness (rebuilding the wrong subset)

- **Failure mode:** at monorepo scale you must build/test/deploy *only what changed* — full rebuilds are hours — so a build graph (Bazel/Nx/Turborepo-class, or hand-rolled path filters) decides what a commit touches. Two inverse failures: **under-building** (the graph misses a real dependency — a codegen input, a shared config, a runtime data file no `import` declares — so service X ships *without* rebuilding against the change that breaks it; CI is green because CI didn't run the thing that would have failed) and **over-building** (the graph is so conservative every commit rebuilds the world; CI takes 3 hours; teams route around it, which is worse than either failure). Under-building is the counterfeit-checkmark failure (`devops-engineer/principles/cicd-pipelines.md`, failure mode 4) at repo scale.
- **Detection:** for under-building — periodic full-graph builds (nightly/weekly) whose results are *reconciled* against the incremental builds' (anything the full build catches that increments missed is a graph bug, treated as P1); "works on rebuild-all but broke in prod" reports are graph-suspect first. For over-building — cache-hit rates and average targets-built-per-commit trending up.
- **Fix:** dependencies declared where the build tool can see them (codegen and data files included); hermetic build rules so undeclared deps *fail* instead of silently working (Bazel's sandbox is exactly this enforcement); path-filter pipelines (the cheap approximation) reviewed whenever directory structure changes — a path filter is a build graph maintained by hand, with a hand's reliability.
- **Prevention:** the nightly full-build reconciliation (monitor); hermeticity so the graph can't lie (mechanism); remote build caches keyed on content-hashes, same cache-key discipline as `devops-engineer/principles/cicd-pipelines.md` failure mode 5 (a poisoned remote build cache poisons *every* consumer).

## Common pitfalls (short form)

- **Changelog-by-archaeology:** release notes reconstructed from `git log` at release time. Generate from conventional commits or PR labels continuously; a release whose contents surprise its own team is a process smell with an incident attached.
- **The Friday mega-release:** batching a week of changes into one deploy multiplies the suspects when it breaks. Release cadence is a risk decision: smaller, more frequent releases make `devops-engineer/principles/deployment-strategies.md`'s whole toolkit work better (a canary judging one change converges; a canary judging forty changes finds *that something* is wrong, never *what*).
- **Version-bump ceremonies:** humans hand-editing version files in release PRs = merge conflicts and skipped numbers. Automate from commit metadata.

## References

Build-once/promote spine: `devops-engineer/principles/cicd-pipelines.md` · rollback inventory: `devops-engineer/principles/deployment-strategies.md` · pinning mechanics and update bots: `devops-engineer/topics/supply-chain-integrity.md` · digest discipline: `devops-engineer/principles/containers-and-orchestration.md`
