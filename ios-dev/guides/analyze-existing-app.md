# Analyze an Existing App: Bounded-Time Codebase Triage

> **Applies to:** Swift/ObjC iOS codebases · Xcode 26 toolchain on the analysis machine · **Last reviewed:** 2026-07-06
> **Capability B.** Take an unfamiliar iOS codebase and produce, in a **bounded budget**, three artifacts: (1) architecture summary, (2) memory/concurrency risk list, (3) prioritized remediation plan. Written to be executable verbatim by a human or an agent. Default budget: **~90 minutes** of focused analysis (halve the minutes-per-phase for a quick pass; double for a due-diligence pass — the *phase order never changes*, because early phases decide what the later ones look at).

**Rules of engagement:** read-only throughout — you are producing findings, not fixes. Time-box each phase and move on; an unfinished phase becomes a line in the report ("not assessed"), never a silent gap. Every finding carries `path:line`, evidence, and a severity; no finding without evidence you could paste.

## Phase 1 — Shape and inventory (10 min)

Commands first, opinions later:

```bash
find . -name "*.xcodeproj" -o -name "Package.swift" -o -name "*.xcworkspace" | grep -v build
ls Podfile Cartfile 2>/dev/null; cat Package.swift 2>/dev/null | head -50   # dependency manager era
find . -name "*.swift" | grep -v -E "Tests|build|Pods" | wc -l               # Swift file count
find . -name "*.m" -o -name "*.h" | grep -v Pods | wc -l                     # ObjC remnant size
grep -rl "import SwiftUI" --include="*.swift" . | wc -l                      # vs:
grep -rl "import UIKit" --include="*.swift" . | wc -l                        # UI paradigm mix
grep -rn "SWIFT_VERSION\|swiftLanguageMode\|swift-tools-version" --include="*.pbxproj" --include="Package.swift" . | sort -u
git log --format="%ad" --date=short -1; git shortlog -sn --since="1 year" | head  # pulse: alive? how many hands?
```

Record: targets/modules and their dependency direction, UI paradigm(s), language-mode era (Swift 5 vs 6 mode is the single biggest predictor of the concurrency phase's findings), dependency count, ObjC percentage, team bus-factor from git. **Also read the project README and any ADRs now** — 5 minutes of stated intent calibrates everything after.

## Phase 2 — Architecture reconstruction (20 min)

Goal: answer the three questions from [../principles/architecture-judgment.md](../principles/architecture-judgment.md) with evidence.

1. **Entry point in:** find `@main` / `AppDelegate`; follow construction 2–3 levels. Is there a composition root, or do objects self-assemble via singletons? Count: `grep -rn "\.shared\b" --include="*.swift" . | grep -v -E "URLSession|UIApplication|UserDefaults|NotificationCenter|FileManager" | wc -l` — your-code singletons reached from logic are Q2 failures; note the top 5 offenders.
2. **State ownership sample:** pick the 3 largest feature screens (`wc -l` on view files, or the screens git touches most — churn marks the load-bearing walls). For each: who owns the VM (`@State`/`@StateObject` vs the churn-bug `@ObservedObject`-with-default — [../topics/state-and-architecture.md](../topics/state-and-architecture.md) §1)? `ObservableObject` vs `@Observable` era? Any two-writers state?
3. **Layering check:** `grep -rln "import SwiftUI\|import UIKit" <models-or-domain-dirs>` — framework imports in the domain layer are Q3 failures and predict framework-churn pain.
4. **Name the architecture honestly:** "MVVM-intended, singleton-service-locator in practice, one legacy MVC tab" is a real answer and more useful than the README's claim. Note *consistency* — a mediocre-but-uniform architecture outranks a brilliant-but-triple one ([../topics/tca.md](../topics/tca.md) §4).

**Artifact 1 (write it now, half a page):** module map with dependency direction, the three-questions scorecard with `path:line` evidence, declared-vs-actual architecture, consistency note.

## Phase 3 — Memory risk scan (20 min)

Greps ordered by hit-rate-per-minute (rubric: [../topics/memory-management.md](../topics/memory-management.md); each grep names its section):

```bash
grep -rn "var delegate" --include="*.swift" . | grep -v weak                      # §2 delegate cycles
grep -rn "Timer.scheduledTimer(target\|CADisplayLink(target" --include="*.swift" .  # §3 runloop retention
grep -rn "assign(to:.*on: self" --include="*.swift" .                             # §4 guaranteed Combine cycle
grep -rn "\.sink" --include="*.swift" -A1 . | grep -B1 "self\." | grep -v "weak self"  # §4 candidates (noisy — sample 10)
grep -rn "Task {" --include="*.swift" . | wc -l                                   # §5 unstructured-task population
grep -rn "Task.detached" --include="*.swift" .                                    # §5 every one needs a reason
grep -rn "addObserver(forName" --include="*.swift" .                              # §3 token closures
grep -c "deinit" -r --include="*.swift" . | awk -F: '$2>0' | wc -l                # deinit-awareness proxy
```

Then **one dynamic sample if the app builds** (10 of the 20 min): run it, exercise the heaviest navigation loop 3×, open the memory graph debugger, filter to app module — count screen-class instances. More than one alive per screen = confirmed leak; attach the retainer chain. A confirmed dynamic leak outranks twenty static candidates. If the app doesn't build in-budget, say so in the report and stay static.

## Phase 4 — Concurrency risk scan (20 min)

Rubric: [../topics/concurrency.md](../topics/concurrency.md) / [../topics/gcd-legacy.md](../topics/gcd-legacy.md). For a codebase-wide *thorough* version of this phase, spawn `.claude/agents/actor-isolation-scanner` and spend these 20 minutes elsewhere; inline version:

```bash
grep -rn "@unchecked Sendable\|nonisolated(unsafe)" --include="*.swift" .   # escape-hatch inventory — read EACH
grep -rn "DispatchSemaphore" --include="*.swift" .                          # cross-ref: files also containing await = P0 soft-lock risk (gcd-legacy.md §4)
grep -rn "\.sync\b" --include="*.swift" . | grep -i dispatch                # deadlock family
grep -rn "DispatchQueue.main.async" --include="*.swift" . | wc -l           # GCD-era UI threading volume (migration sizing)
grep -rn "MainActor.run\|assumeIsolated" --include="*.swift" .              # isolation-boundary confusion markers (concurrency.md §3)
grep -rn "withCheckedContinuation\|withUnsafeContinuation" --include="*.swift" .  # audit each for resume-path coverage (async-patterns.md §2)
```

Read every escape-hatch hit (there are rarely more than 20): does a comment name the synchronization mechanism? Is there actually one? For actors, skim for the reentrancy pattern (state read → `await` → dependent write — [../topics/concurrency.md](../topics/concurrency.md) §2). Note the migration posture: language mode per module + hit counts above ≈ how far through the §6 migration sequence they are, and whether they're stuck in the dangerous middle.

**Artifact 2 (write it now):** risk table — `finding | path:line | evidence | severity | rubric ref`. Severity scale: **P0** = plausible crash/corruption/soft-lock in the field (semaphore-in-async, `@unchecked` with visible mutable state, confirmed leak of screen graphs); **P1** = correctness under load (reentrancy patterns, FIFO-dependent queue migrations, continuation gaps); **P2** = hygiene debt (spurious weak, GCD volume, missing deinit awareness).

## Phase 5 — Everything else, sampled (10 min)

One pass, breadth over depth: test reality (`find . -path "*Tests*" -name "*.swift" | wc -l`, then open 3 — do they assert behavior or exercise coverage? sleeps? real network? — [../topics/testing.md](../topics/testing.md) §5); security smells (secrets greps + ATS plist check from [../topics/security.md](../topics/security.md) §1–2); release hygiene (CI config exists? signing automated? privacy manifest present? — [../topics/release-and-platform.md](../topics/release-and-platform.md)). Each gets one line in the report; anything alarming gets a P-rating in Artifact 2.

## Phase 6 — Remediation plan (10 min)

**Artifact 3.** Order by (field-impact × confidence) ÷ effort — never by architectural offensiveness. The shape that survives contact with real teams:

1. **Stop the bleeding (this sprint):** every P0, each with its one-line fix direction and rubric link. These are point fixes, not refactors.
2. **Gates before repairs (next sprint):** the CI/lint prevention rows from the relevant topic docs' prevention tables — grep gates for semaphores-in-async and `assign(to:on:)`, `assertDeallocated` on the 3 heaviest screens, language-mode ratchet ("no module regresses; new modules start in Swift 6 mode"). Gates first, because they stop the P1 population growing while you drain it.
3. **Drain P1s (quarter):** sized batches along module boundaries, sequenced by the migration order in [../topics/concurrency.md](../topics/concurrency.md) §6 where concurrency-related.
4. **Architecture moves (only with a named forcing function):** consolidate the paradigm mix / adopt-or-retire decisions per [../principles/architecture-judgment.md](../principles/architecture-judgment.md). If nothing forces it, say "no architecture change recommended" — that sentence has saved more quarters than any refactor I've led.

End the report with **coverage honesty**: what was not assessed (phases cut, modules unsampled, dynamic checks skipped) and what a deeper pass would examine first.

## Agent adaptation note

An agent running this guide: emit each artifact *at its phase boundary* (context may summarize; artifacts on disk survive), keep grep output samples ≤10 lines per finding, and when the codebase exceeds ~15 modules fan out Phase 3/4 per the partitioning rules in [../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) rather than deepening a single pass.
