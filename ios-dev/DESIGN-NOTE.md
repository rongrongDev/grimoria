# Design Note — Why This Knowledge Base Is Shaped This Way

> **Applies to:** Swift 6.2 · Xcode 26 · iOS 26 SDK (min deployment discussed per-doc) · **Last reviewed:** 2026-07-06
>
> Written by a retiring principal iOS engineer. Nobody is available to clarify this later.
> Every choice below is deliberate; if you extend the KB, follow the same rules.

## The three primitives, and the test for each

| Primitive | Test: put content here if... | Anti-test: do NOT put it here if... |
|---|---|---|
| **Principles / topic docs** (`ios-dev/`) | A human or model must *reason* with it — weigh tradeoffs, apply a decision tree, recognize a failure signature. | It's a step-by-step procedure you'd run the same way every time (that's a Skill). |
| **Skill** (`.claude/skills/<name>/SKILL.md`) | It's a *repeatable bounded procedure* over a known input (a diff, a migration, a test plan) that fits in the caller's context window. | The work requires reading dozens of files whose contents would drown the conversation (that's a Subagent). |
| **Subagent** (`.claude/agents/<name>.md`) | The work needs an **isolated context window**: whole-codebase scans, crash-log symbolication with large pasted logs — anything where intermediate reads are bulky but the *answer* is small. | The result depends on conversational context the subagent can't see, or the task is a quick single-file check (Skill or inline). |
| **Command** (`.claude/commands/`) | Never, in this KB. Nothing here is trivial enough that losing auto-invocation and frontmatter is worth it. | — |

**Rule of thumb: principles teach, skills do, subagents isolate.**

## Concrete assignments and the reasoning

- **Retain-cycle review of a PR** → **Skill** (`retain-cycle-reviewer`). Input is a diff; the checklist is mechanical once you know the signatures; output is inline findings. No isolation needed — the diff is already in context.
- **GCD→async/await migration audit** → **Skill** (`concurrency-migration-auditor`). Same shape: bounded diff, mechanical correctness checks (ordering, Sendable, cancellation), small output.
- **Actor-isolation / data-race scan of a codebase** → **Subagent** (`actor-isolation-scanner`). Requires grepping and reading across every target; raw findings are noisy; only the triaged risk list should return to the caller. Read-only tool allowlist because a scanner that can edit is a scanner that *will* edit.
- **Crash-log tracing** → **Subagent** (`crash-log-tracer`). Crash logs are thousands of lines; symbolication and frame-by-frame source tracing must not consume the main conversation. Needs `Bash` for `atos`/`symbolicatecrash`, read-only otherwise.
- **weak vs unowned judgment, MVVM vs TCA, when to trust Instruments** → **Principles docs**. These are arguments, not procedures. A skill that says "it depends" is useless; a doc that explains *on what* it depends is the whole point.
- **Failure→detection→fix→prevention mechanics per area** → **Topic docs**, one file per area, flat (`topics/<area>.md`). One file per topic keeps every doc independently readable — a smaller model given exactly one file gets frontmatter version stamps, the failure catalog, and cross-links, with no required sibling files.

## Directory layout

```
ios-dev/
  README.md                 ← start here; 30-second routing table
  GLOSSARY.md               ← single shared vocabulary
  CHANGELOG.md              ← dated against Swift/iOS/Xcode versions
  DESIGN-NOTE.md            ← this file
  principles/               ← judgment (why the rules exist)
    memory-judgment.md
    concurrency-judgment.md
    architecture-judgment.md
    multi-agent-orchestration.md
  topics/                   ← mechanics (failure → detection → fix → prevention)
    memory-management.md      concurrency.md         state-and-architecture.md
    async-patterns.md         performance.md         security.md
    testing.md                release-and-platform.md
    objc-interop.md           gcd-legacy.md          ← extended tier
    platform-variants.md      tca.md                 ← extended tier
  guides/                   ← end-to-end capabilities
    build-from-scratch.md   ← Capability A
    analyze-existing-app.md ← Capability B
.claude/
  skills/
    retain-cycle-reviewer/SKILL.md
    concurrency-migration-auditor/SKILL.md
  agents/
    actor-isolation-scanner.md
    crash-log-tracer.md
```

## Conventions every file follows

1. **Version stamp** in a blockquote directly under the title: Swift version + language mode, relevant SDK, Xcode version, review date. Swift 6 strict concurrency changed *correctness* rules, not just style — an undated concurrency doc is a liability.
2. **Standalone readability.** Each doc restates the two sentences of context it needs rather than assuming you read a sibling. Cross-links are for *depth*, never for *prerequisites*.
3. **Decision trees over hedging.** "Use `[weak self]` when X; `[unowned self]` only when Y; plain `self` when Z" — with the failure that punishes the wrong choice.
4. **Claims are backed** by a crash signature, an Instruments observation, or a compiler diagnostic — something a reader can go reproduce.
5. **Skills and subagents state triggers AND non-triggers** in their descriptions, so an orchestrating model knows when *not* to invoke them.
