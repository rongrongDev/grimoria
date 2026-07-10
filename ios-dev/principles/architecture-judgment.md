# Architecture Judgment: Choosing Structure an iOS App Can Afford

> **Applies to:** Swift 6.2 · SwiftUI iOS 17+ · TCA 1.x · Xcode 26 · **Last reviewed:** 2026-07-06
> Mechanics: [../topics/state-and-architecture.md](../topics/state-and-architecture.md), [../topics/tca.md](../topics/tca.md). This doc is the decision layer.

## The only three architecture questions that predict outcomes

Twenty years of postmortems reduce architecture quality to three questions. Frameworks are just different ways of forcing good answers.

**1. Can you point at the owner of any piece of state?** Every state bug — resets, desyncs, stale UI — is an ownership ambiguity wearing a costume. SwiftUI made ownership *syntactic* (`@State` vs `@Binding` — [../topics/state-and-architecture.md](../topics/state-and-architecture.md)); TCA makes it *structural* (the store). Either works. What fails is state with two writers and no owner.

**2. Can you construct any object with fakes in one line?** Testability is a dependency-topology property decided at *construction sites*, not a test-writing skill. If building a view model without the network requires a singleton reset, the architecture already failed; no test framework recovers it. This is 90% of what "use DI" means — a composition root that assembles the app, protocols (or TCA's `@Dependency`) at the seams, zero `Foo.shared` reached from inside logic.

**3. Does feature code depend on frameworks, or frameworks on feature code?** Domain models importing SwiftUI, reducers importing UIKit, `Codable` DTOs used as view state — each coupling converts every framework churn (and Apple churns annually) into domain churn. The cheap, CI-greppable rule: **your models import Foundation, at most.**

Any architecture answering all three is good enough to ship for years. An architecture answering none is legacy on arrival, whatever framework it name-drops.

## MVVM vs TCA — the decision, not the diplomacy

The comparison table is in [../topics/state-and-architecture.md](../topics/state-and-architecture.md); here is the *decision procedure*:

**Default: MVVM with a composition root** (`@Observable` VMs owned via `@State`, protocol-injected services). It answers questions 1–3 with the least machinery, hires can read it day one, and its failure modes are local.

**Switch to TCA when at least two of these are true, and the team commits to all-in within a bounded region ([../topics/tca.md](../topics/tca.md) §4):**
- Feature logic is genuinely intricate (multi-step flows, undo, offline reconciliation) and a shipped logic bug is expensive — exhaustive `TestStore` coverage is the payoff that justifies everything else.
- Navigation state must be data (deep links, state restoration, handoff) — TCA's tree navigation is the best-in-class answer.
- The team is ≥5 engineers on one codebase and consistency-by-framework beats consistency-by-discipline (discipline doesn't survive the third re-org).

**Never switch because:** the current code is messy (TCA will faithfully express the mess in more types), a conference talk was compelling, or one senior engineer wants it (they leave; the framework stays).

**And having chosen, stay chosen.** The half-adopted state is strictly worse than either pole — this is the single most common architecture failure I've seen in the field, and it is organizational: it happens when adoption was a preference, not a decision with a written scope and timeline.

## View-model lifecycle: the judgment behind the mechanics

SwiftUI inverted a UIKit assumption teams still carry: **the view is no longer a stable object you attach lifetime to — identity is** ([../topics/state-and-architecture.md](../topics/state-and-architecture.md) §2). The judgment consequences:

- Anything whose lifetime must *exceed* view identity (in-flight uploads, playback, sockets) does not belong in a view model at all — it belongs in a service above, with the VM as a projection of it. Deciding "is this state or is it *work*" is the design act; VMs holding work are how churn bugs ([../topics/state-and-architecture.md](../topics/state-and-architecture.md) §5) become data loss.
- Anything whose lifetime should *match* identity (form drafts, per-screen loading) belongs in `@State`-owned VMs, and identity resets become a *feature* you control with `.id()`.
- If you can't say which of the two a given property is, you've found the design conversation to have — before the bug report has it for you.

## Boring wins: the meta-principle

Every codebase has a **novelty budget**, and iOS spends most of it for you: Apple ships a new must-adopt thing yearly (SwiftUI, Concurrency, Observation, Swift 6 mode…). Spend the remainder on your *product's* hard problem, and make every other choice the boring one — URLSession over the clever networking framework, SPM over the build-system adventure, Apple-platform conventions over the cross-platform abstraction. The apps still healthy at year eight are, without exception in my career, the ones that are architecturally *dull*: obvious ownership, injected dependencies, thin framework coupling, one idea per module. The ones that died were, without exception, *interesting*.

**Related:** state mechanics → [../topics/state-and-architecture.md](../topics/state-and-architecture.md) · TCA operations → [../topics/tca.md](../topics/tca.md) · construction-site testability → [../topics/testing.md](../topics/testing.md) · worked example of all of this → [../guides/build-from-scratch.md](../guides/build-from-scratch.md)
