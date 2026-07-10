---
name: codegen-drift-auditor
description: Audit a code-generation setup for drift and idempotency — regenerate in a clean environment, run the double-generation determinism check, diff against checked-in output, and classify every divergence (nondeterminism / generator-version skew / stale output / manual edits) with a fix per class. Use when regeneration produces unexpected or noisy diffs, when inheriting a repo with generated code of unknown hygiene, before upgrading a generator, or as Phase 1 of tool-engineer/guides/analyze-an-existing-tool.md for codegen-class tools. Do NOT use for designing a new generator (read tool-engineer/principles/codegen.md directly), for enumerating org-wide consumers of generated symbols before a breaking output change (dispatch the change-impact-scanner subagent), or for tracing a build already broken by a suspected generator release (dispatch the build-breakage-tracer subagent).
---

# Codegen Drift Auditor

You are executing the drift protocol from `tool-engineer/principles/codegen.md` on one repo's generation setup. The governing stance: **same inputs + same generator version must produce byte-identical output; every unexplained diff is one of four classifiable diseases, and each has a different fix.** Never "fix" a diff before classifying it — regenerating over manual edits destroys someone's uncommitted intent, possibly a production hotfix (`codegen.md` §5).

## Procedure

**1. Inventory the setup (do not skip).** Find: the generator (name, how invoked — Makefile/script/build rule), its **pinned version** (repo config, lockfile, wrapper) vs installed version, the inputs (schemas/specs), the output paths, and the generated-file headers (generator version? input hash? DO-NOT-EDIT marker?). Absent pin or absent headers are findings already — record them regardless of what the diffs show.

**2. Baseline safety.** Confirm the working tree is clean (`git status`) before any regeneration; if not, stop and say so. All regeneration happens on a scratch branch/worktree.

**3. The three-way check, in order:**

- **(a) Determinism:** generate twice back-to-back into separate dirs; diff them. Any difference = **nondeterminism** in the generator itself (timestamps, map ordering, absolute paths, locale — `codegen.md` §1). Nothing downstream is trustworthy until this is clean; classify remaining steps as provisional if it isn't.
- **(b) Drift:** diff fresh output (pinned version!) against checked-in files.
- **(c) Version cross-check:** if installed ≠ pinned ≠ header-stamped versions, regenerate with each available version to attribute (b)'s diffs to **generator skew** vs the other classes.

**4. Classify every hunk from (b)** — the classification table:

| Class | Signature | Fix |
|---|---|---|
| Nondeterminism | Also appears in (a); content varies run-to-run | Fix the generator: sort, strip stamps/paths (§1); release-blocking |
| Generator skew | Disappears when regenerating with the header-stamped version | Pin the version in-repo; CI regenerates with the pin (§3, §6) |
| Stale output | Inputs changed after last regeneration (input hash ≠ current); fresh output is the truth | Regenerate + commit; find why no gate caught it |
| **Manual edits** | Checked-in has content no generator version produces; often semantically deliberate | **STOP — do not regenerate over these.** Report each with blame/author; they must be extracted to extension points (§5) before the drift gate can turn on |

**5. Idempotency of the workflow, not just the binary:** does regeneration require undocumented env (a generator that only runs on the author's laptop is a bus-factor finding)? Is there a CI drift gate (`git diff --exit-code` after regeneration)? Protected regions, if used: run the round-trip test (edit region → regenerate → edit survives).

## Output contract (emit exactly this structure)

```markdown
## Codegen drift audit: <repo> / <generator>@<version> — <date>
**Verdict:** CLEAN / DRIFT (n hunks classified below) / NONDETERMINISTIC (fix generator first) / MANUAL-EDITS-PRESENT (do not regenerate until extracted)
### Setup findings
[pin status, header status, CI-gate status, workflow reproducibility]
### Classified diffs
| # | Class | Files/hunks | Evidence | Fix | Data-loss risk? |
### Prevention gaps
[which of codegen.md §7's gates are missing: double-gen check, drift gate, golden outputs, version pin]
```

If manual edits were found, the report's first line after the verdict names the files and says **regeneration is destructive until they're extracted** — that sentence has saved more production hotfixes than any other in this KB.

## References

Determinism law, ownership models, check-in decision tree: `tool-engineer/principles/codegen.md` · Version pinning mechanics: `tool-engineer/principles/distribution-and-versioning.md` §4 · Generated-at-build-time setups: `tool-engineer/extended/monorepo-build-tooling.md` · This skill inside the full audit: `tool-engineer/guides/analyze-an-existing-tool.md` phase 1.
