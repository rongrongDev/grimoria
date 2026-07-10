# Documentation-Generation Tooling — production patterns + common pitfalls

**Applies to:** docs-from-source toolchains — TypeDoc 0.26+, Sphinx 7–8, MkDocs 1.6 (Material), Docusaurus 3, OpenAPI doc renderers. **Extended tier:** patterns and pitfalls, not full depth. **Last verified:** 2026-07-06.

**The stance in one line:** documentation rots at the speed of the code it describes, and the only docs that stay true are the ones a machine checks against the code on every commit. Docs generation is not a formatting problem; it's a *staleness-prevention* problem — the same confidently-wrong hazard as dashboards (`tool-engineer/principles/internal-dashboards.md` §2), because a developer who follows a stale example and gets a confusing failure blames themselves first, your tool second, and never reads your docs again third.

## Production patterns

**Generate reference, author narrative, and know which is which.** API reference (signatures, flags, config schemas) must be generated from source — hand-written reference is wrong within a quarter. Narrative (tutorials, concepts, the *why*) must be hand-written — generated prose from doc comments reads like a phone book. The failure is mixing them: hand-edits inside generated reference pages get overwritten on the next build, which is exactly the mixed-ownership trap of `tool-engineer/principles/codegen.md` §5 — same fix: generated pages carry a do-not-edit banner, narrative lives in separate source files, and CI regenerates + diffs so a hand-edit to generated output fails loudly.

**Every code example is compiled and run in CI, no exceptions.** This is the highest-leverage practice in documentation tooling. Python: doctest/Sybil over every snippet. TS/JS: extract fenced blocks and typecheck them (or make examples real files included into docs — `literalinclude`/snippet-include — so they're just normal code with normal tests). CLI examples: run them against the real tool in a sandbox and snapshot the output — which also catches *your own* breaking changes, because a CLI doc example failing in CI is a consumer break you almost shipped (`tool-engineer/principles/distribution-and-versioning.md` §1). An untested example is a support ticket with a publication date.

**The docs build is a build — treat it like one.** Deterministic (same source → same site; the codegen determinism list applies), warning-clean enforced (`sphinx -W`, TypeDoc `--treatWarningsAsErrors`): broken cross-references and unresolved links are *errors*, because a warning-tolerant docs build accumulates hundreds of warnings that bury the one that matters. Link check (internal always; external on a scheduled job, not per-PR — external sites flake and you'll train people to ignore the red). Docs deploy previews on every PR so reviewers see rendered output, not markup.

**Version docs with the tool, and default readers to their reality.** One docs version per supported tool major, a visible version switcher, and — the detail everyone misses — the *default* landing version should match what the org actually runs (fleet telemetry, `adoption-and-rollout.md` §4), not `latest`, or your lagging majority follows instructions that don't work for them yet. Mark EOL versions with a banner. For internal tools, wire the tool's error messages and `--help` footer to deep-link into the *matching docs version* (`cli-ux.md` §4) — a link to the wrong version's page is worse than no link.

**Docs coverage is measurable — measure it where it matters.** Enforce "every public symbol / command / flag has a description" as a lint (TypeDoc and Sphinx both support coverage checks; for CLIs this is the walk-the-command-tree test from `reference/click-typer.md` §4). But don't chase 100% prose coverage of internals — a coverage gate on *public surface only*, plus tested examples, beats blanket docstring quotas that fill with "Gets the value." (metric-gaming law: `extended/productivity-metrics.md` §3).

## Common pitfalls

| Pitfall | Detection | Fix / prevention |
|---|---|---|
| Stale example breaks for every new user | Run all examples in CI — the detection *is* the prevention; support tickets quoting a doc page | Tested-examples gate; examples are real included files, not prose blocks |
| Hand-edits to generated pages silently lost | Regenerate + `git diff` in CI; "my docs fix disappeared" | Do-not-edit banners; narrative/reference source split; drift gate |
| Warning-blind docs build | Warning count > 0 and flat/climbing for months | `-W`/treat-warnings-as-errors from day one; fix-or-suppress-with-reason only |
| Readers on v3 following v5 docs | Support questions that only make sense cross-version | Version switcher; default version = fleet majority; error messages link matching version |
| Docs site itself is stale (build broke weeks ago, nobody noticed) | "Last published" timestamp on the site footer vs repo activity | Publish freshness alert to the owning team — same pipeline-stall alarm as dashboards |
| Docstring quota gamed with filler | Spot-read a sample; "Gets the X" density | Coverage gate on public surface only + example-tested requirement, not prose quotas |
| Search returns the graveyard | Top search results are deprecated pages | Redirects + noindex on EOL versions; deletion is a feature — tombstone, don't hoard |
| OpenAPI docs drift from actual API behavior | Contract tests between spec and implementation fail (or don't exist) | Generate spec from code (or validate code against spec) in CI; the spec is the contract, test it like one |

## Cross-references

- Mixed-ownership and drift mechanics (docs generation *is* codegen): `tool-engineer/principles/codegen.md` §1, §4–5; the `codegen-drift-auditor` skill works unchanged on a docs pipeline.
- Help text and error messages as the docs front line: `tool-engineer/principles/cli-ux.md` §4.
- Versioned docs ride the tool's release process: `tool-engineer/principles/distribution-and-versioning.md`.
