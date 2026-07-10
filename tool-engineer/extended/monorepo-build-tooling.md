# Monorepo Build Tooling — production patterns + common pitfalls

**Applies to:** custom rules/plugins/executors for Bazel 7–8 and Nx 20–21; the judgment generalizes to Buck2/Pants/Turborepo. **Extended tier:** patterns and pitfalls, not full depth. **Last verified:** 2026-07-06.

**The stance in one line:** a build-tool change has the largest blast radius of anything a tool engineer ships — a broken lint rule annoys, a broken codegen release breaks its consumers, but a broken build rule blocks *every team in the repo simultaneously*, and an *incorrectly-cached* build rule is worse still, because it ships wrong binaries while staying green. Correctness ranking for build tooling: **wrong-but-red < slow-but-right < fast-and-wrong.** Fast-and-wrong is the only unforgivable one.

## Production patterns

**Hermeticity is declared inputs, nothing else.** A custom rule/executor is hermetic when its output is a pure function of its declared inputs (sources, deps, toolchain, env it explicitly declares). The classic sins: reading an undeclared file (`~/.netrc`, a config outside the sandbox), depending on system tools (`/usr/bin/python` — version varies per machine), embedding timestamps/hostnames/absolute paths in outputs (the same nondeterminism list as `tool-engineer/principles/codegen.md` §1 — a build action *is* codegen). Bazel's sandbox catches undeclared file reads; nothing catches undeclared *semantic* env deps except discipline and the cache-check below. In Nx, the equivalent surface is the `inputs`/`namedInputs` of a target — an executor that reads a file not covered by its `inputs` globs is a stale-cache bug already shipped, just not yet observed.

**Cache correctness has one test: same inputs, byte-identical outputs, everywhere.** Run the double-build check in CI continuously: clean build twice (different machines ideally), diff action outputs (`bazel ... --execution_log_json_file` and compare, or Nx `--skip-nx-cache` vs cached run). Any divergence is a **remote-cache poisoning** vector: one machine's nondeterministic output becomes everyone's fetched artifact. When users report "works after `bazel clean`/`nx reset`", that is never a user problem — clean-fixes-it is the *signature* of an input-declaration bug, and every such report deserves a root-cause, because for each person who reports it, fifty learned to ritually clean (and your incremental build value quietly went to zero org-wide).

**Roll out build-tool changes like the org-blocking releases they are.** Everything in `tool-engineer/principles/distribution-and-versioning.md` applies, tightened: (1) shadow mode first — run the new rule/executor alongside the old, diffing outputs, before it's on anyone's critical path; (2) canary on your own team's targets (dogfooding, `adoption-and-rollout.md` §2), then one volunteer team, then default; (3) the rollback must be a **one-line revert** (a version pin bump in the repo — which requires pinning your build tooling like any other tool, `distribution-and-versioning.md` §4); (4) land upgrades of the build tool itself (Bazel/Nx major versions) in off-peak windows with a named person watching the first hour of CI. Time-to-detect matters more than anything here: a broken build rule costs (whole org) × (minutes until revert).

**Invalidation bugs come in exactly two flavors — detect them differently.** *Under-invalidation* (stale: input changed, cache hit anyway) ships wrong outputs; detect via the clean-vs-incremental diff (build incrementally, build from clean, outputs must match) and treat any hit as a sev-2. *Over-invalidation* (cache misses on no-op changes) silently taxes everyone's build time; detect by profiling cache hit rates per target and hunting the volatile input (a timestamped generated file, a `.env` glob, `$(date)` in a stamp) — Bazel's `--explain`/execution log and Nx's cache-miss diagnostics name the offending input. Under-invalidation is a correctness incident; over-invalidation is why teams start believing "the cache doesn't work" and add `--no-cache` to their scripts, which you will find years later still there.

**Custom rules earn their existence.** Every custom rule/executor is code the org must maintain against a fast-moving toolchain API. Default to the ecosystem's standard rules; write custom only when you own the semantics (your codegen — where the build rule should *invoke* the generator under the hermeticity contract, not reimplement it). Every custom rule has a named owner and tests (Bazel: analysis + integration tests; Nx: executor unit tests + an e2e workspace fixture), same ownership law as `tool-engineer/principles/static-analysis.md` §4.

## Common pitfalls

| Pitfall | Detection | Fix / prevention |
|---|---|---|
| Undeclared input → stale cache hits | "Fixed by clean" reports; clean-vs-incremental output diff | Declare the input / narrow the sandbox escape; CI double-build diff job |
| Nondeterministic action poisons remote cache | Same target, different bytes across machines; execution-log diff | Strip timestamps/paths (stamp variables only where needed); determinism gate in CI |
| Build-tool upgrade breaks whole org at 9am | CI failure spike correlated with the upgrade commit, all teams at once | One-line-revert pin; shadow/canary rollout; upgrade in watched window |
| Over-broad `inputs` (Nx) / volatile stamp (Bazel) kills hit rate | Cache hit-rate dashboard per target; misses on comment-only changes | Narrow inputs/namedInputs; move volatile data to unstamped or runtime |
| Custom rule reimplements a generator badly | Output drifts from the real generator's; two sources of truth | Rule invokes the pinned generator binary (`codegen.md` §3), never reimplements |
| Network access inside build actions | Flaky builds correlating with registry/VPN weather; sandbox violations | Vendored/mirrored deps as declared inputs; block network in the sandbox |
| Everyone adds `--no-cache` workarounds | Grep CI configs and scripts for cache-bypass flags | Root-cause each bypass; the flag count is your trust metric — drive it to zero |
| Orphaned custom rule breaks on toolchain upgrade | Upgrade PR fails in a rule nobody recognizes | Owner + tests required to add a rule; unowned rules deleted at annual review |

## Cross-references

- A build broke and a tooling change is suspected: dispatch **`build-breakage-tracer`** — bisecting build breakage across generator/lint/build-rule changes is exactly its job.
- Determinism law and generated-code ownership: `tool-engineer/principles/codegen.md` §1, §3. Pinning/rollback mechanics: `tool-engineer/principles/distribution-and-versioning.md` §4–5.
- CI stage architecture around the build (what gates where): `quality-dev/principles/ci-cd-integration.md` (adjacent KB).
