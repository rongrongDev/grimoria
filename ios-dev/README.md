# iOS Engineering Knowledge Base

> **Applies to:** Swift 6.2 · Xcode 26 · iOS 26 SDK (guidance targets iOS 17+ deployment) · **Last reviewed:** 2026-07-06
> The distilled judgment of a 20-year Apple-platforms career, written to be used without its author — by junior-through-staff engineers and by AI models invoking the skills/subagents. Structure rationale: [DESIGN-NOTE.md](DESIGN-NOTE.md) · Vocabulary: [GLOSSARY.md](GLOSSARY.md) · Version history: [CHANGELOG.md](CHANGELOG.md)

## Find what you need (30 seconds)

**"I need to DO something right now"**

| You are... | Go to |
|---|---|
| Building a new SwiftUI app | [guides/build-from-scratch.md](guides/build-from-scratch.md) |
| Dropped into an unfamiliar codebase | [guides/analyze-existing-app.md](guides/analyze-existing-app.md) |
| Reviewing a diff for leaks/lifetime bugs | Skill: `.claude/skills/retain-cycle-reviewer` |
| Reviewing a GCD→async/await migration diff | Skill: `.claude/skills/concurrency-migration-auditor` |
| Auditing a whole codebase for concurrency risk | Subagent: `.claude/agents/actor-isolation-scanner` |
| Holding a crash log | Subagent: `.claude/agents/crash-log-tracer` |

**"I have a SYMPTOM"**

| Symptom | Doc |
|---|---|
| Memory grows / deinit never runs / leak after 40-min sessions | [topics/memory-management.md](topics/memory-management.md) |
| Crash in `swift_release` / heap corruption / duplicate side effects | [topics/concurrency.md](topics/concurrency.md) |
| SwiftUI state resets / view model recreated / body storms | [topics/state-and-architecture.md](topics/state-and-architecture.md) |
| Stale data overwrites fresh / spinner never stops / stream buffers forever | [topics/async-patterns.md](topics/async-patterns.md) |
| Hangs, hitches, slow launch, `0x8badf00d` | [topics/performance.md](topics/performance.md) |
| Secrets, pinning, Keychain-fails-when-locked, jailbreak questions | [topics/security.md](topics/security.md) |
| Flaky tests / async test hangs / snapshot drift / coverage theater | [topics/testing.md](topics/testing.md) |
| Rejection, signing failure, rollout, old-OS breakage | [topics/release-and-platform.md](topics/release-and-platform.md) |

**"I need to DECIDE or UNDERSTAND"** → `principles/`

- weak vs unowned vs strong; when tools lie; leak economics → [principles/memory-judgment.md](principles/memory-judgment.md)
- Isolation design; what Swift 6 does NOT guarantee; migration restraint → [principles/concurrency-judgment.md](principles/concurrency-judgment.md)
- MVVM vs TCA; the three questions that predict outcomes; novelty budget → [principles/architecture-judgment.md](principles/architecture-judgment.md)
- Splitting planner/implementer/reviewer agents; fan-out; pbxproj & simulator contention → [principles/multi-agent-orchestration.md](principles/multi-agent-orchestration.md)

**Extended tier** (production patterns + pitfalls, not full depth): [objc-interop](topics/objc-interop.md) · [gcd-legacy](topics/gcd-legacy.md) · [platform-variants](topics/platform-variants.md) (watchOS/tvOS/visionOS) · [tca](topics/tca.md)

## How this KB is meant to be used

- **Every doc stands alone.** Version-stamped, self-contextualizing, cross-links for depth not prerequisites. Hand a single file to a smaller model and it works.
- **Topic docs are failure catalogs**: each entry is *failure mode → detection → fix → prevention (lint/test/CI gate)*. The prevention tables at the bottom of each are designed to be adopted wholesale as CI gates.
- **Principles docs are the judgment layer** — read them once slowly; they explain *why* the topic-doc rules exist and when to break them.
- **Skills run on diffs; subagents run on codebases.** Their frontmatter descriptions state when NOT to invoke them — respect those boundaries ([DESIGN-NOTE.md](DESIGN-NOTE.md) has the reasoning).

## Reading paths by role

- **Junior engineer:** build-from-scratch guide → memory-management → state-and-architecture → the GLOSSARY as needed. Then principles/memory-judgment when the rules start feeling arbitrary.
- **Senior engineer:** the three judgment docs in `principles/` → skim every topic's failure catalog headers → adopt the prevention tables into CI.
- **Staff / lead:** principles/architecture-judgment + multi-agent-orchestration → analyze-existing-app guide → release-and-platform prevention table → decide which skills/subagents run in your review pipeline.
- **AI model (Opus/Sonnet/Haiku):** if invoked via a skill/subagent, that file is self-sufficient — follow it. Otherwise: match the user's problem in the symptom table above and load exactly that doc; load a principles doc only when asked to make a tradeoff, not to execute a procedure.

## Maintenance

Update stamps on touch; log behavioral changes in [CHANGELOG.md](CHANGELOG.md); the rot-fastest list (re-review at each Swift/Xcode major) is in the changelog's maintenance rules.
