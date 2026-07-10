# Concurrency Judgment: Isolation Design, Migration Restraint, and the Races the Compiler Can't See

> **Applies to:** Swift 6.2 · Swift 6 language mode · Xcode 26 · **Last reviewed:** 2026-07-06
> Mechanics: [../topics/concurrency.md](../topics/concurrency.md). This doc is how to *think* so the mechanics stay simple.

## Design isolation top-down, not error-by-error

The failed pattern I've watched repeatedly: turn on strict concurrency, fix 400 diagnostics one at a time, each with the smallest local edit — a `@MainActor` here, `@unchecked Sendable` there, a `nonisolated(unsafe)` on Friday afternoon. The result compiles in Swift 6 mode and has *worse* concurrency properties than the GCD code it replaced, because the annotations record a random walk instead of a design.

The working pattern is deciding, per module, **where the isolation domains are** before touching diagnostics:

1. **UI layer** → `@MainActor` wholesale (with Swift 6.2, module-default MainActor isolation for app/feature targets makes this the ambient default — correct for UI-heavy targets, wrong for a networking library).
2. **Shared mutable services** (caches, connection managers, stores) → one actor each, chosen because they *are* shared mutable state, not because a diagnostic pointed there.
3. **Everything between** → Sendable *values* flowing through async functions. The bulk of a well-factored app is layer 3, and layer 3 needs almost no annotations at all.

Then diagnostics stop being chores and become findings: each one now tells you where reality disagrees with your design — which of the two is wrong is a real question with a real answer.

**Restraint heuristics:**
- **Fewer actors than you think.** An actor per class is an object-oriented reflex, not a concurrency design; every actor boundary adds `await`s (suspension points → reentrancy surface → [../topics/concurrency.md](../topics/concurrency.md) §2) and ordering freedom. If two "actors" always change together, they're one actor.
- **Value types are the cheapest concurrency tool you own.** Every struct that replaces a shared class deletes an entire category of questions. Reach for Sendable values before actors, actors before locks, locks before `@unchecked`.
- **`@MainActor` is not a performance problem until the profiler says so.** Teams contort designs to keep work "off main" that takes 40 µs. Isolate correctly first; move specific hot functions off ([../topics/concurrency.md](../topics/concurrency.md) §3b) when the Hangs instrument names them.

## The compiler's guarantee, stated precisely (so you know what's still yours)

Swift 6 mode eliminates **data races on memory it can see**. It does not and cannot address:

- **Logic races / atomicity**: check-then-act across `await` (actor reentrancy), stale-response-wins ([../topics/async-patterns.md](../topics/async-patterns.md) §1). *Yours.*
- **Ordering**: actors aren't FIFO; two `Task {}`s race each other by design. *Yours.*
- **Liveness**: blocking the cooperative pool, priority inversion, await-cycles between actors. *Yours.*
- **Everything behind `@unchecked Sendable` / `nonisolated(unsafe)` / un-annotated C and ObjC.* *Yours, with interest.*

The judgment shift this demands: pre-Swift-6, review effort went to "could these two threads touch this field." Now that's the compiler's job, and review effort moves **up a level** to *interleaving semantics*: what may have changed across this `await`? what happens if these two effects land reversed? A migrated team that keeps reviewing for data races reviews for the solved problem and ships the unsolved one.

## Migration restraint (the meta-lessons over the mechanics in [../topics/concurrency.md](../topics/concurrency.md) §6)

- **Migrate to *a design*, not to *a syntax*.** "Replace callbacks with async/await" is a refactor; "define isolation domains and make the compiler enforce them" is the migration. Teams doing the first get the second's costs with none of its guarantees.
- **The dangerous window is the middle.** Half-migrated code has GCD's implicit serialization *removed* and Swift 6's checking *not yet on* — the war-story zone where new races ship ([../topics/concurrency.md](../topics/concurrency.md) §6). Minimize time-in-window per module: flip one module leaf-first entirely rather than all modules halfway.
- **Every escape hatch is debt with a face.** `@unchecked Sendable` and `nonisolated(unsafe)` are sometimes the honest bridge — but each carries a comment naming the synchronization story and a tracking ticket, or it's not a bridge, it's a bypass. Inventory them quarterly (the `actor-isolation-scanner` subagent exists for exactly this).
- **Don't migrate what doesn't need it.** A stable, tested, GCD-based subsystem behind a narrow async façade can stay GCD for years ([../topics/gcd-legacy.md](../topics/gcd-legacy.md) keeps it honest). Migration effort goes where change velocity is — churning code benefits from compiler-checked concurrency; frozen code mostly needs a fence around it.

## Reviewing concurrency (what I actually look for, in order)

1. Every new `await` in code that read state above it: is that state re-validated below? (reentrancy)
2. Every new `Task {}`: who cancels it, and what does it capture? (lifetime — half memory question, see [memory-judgment.md](memory-judgment.md))
3. Every new `@unchecked`/`assumeIsolated`/`nonisolated(unsafe)`: where's the comment and the mechanism?
4. Every replaced serial queue: did anything depend on FIFO?
5. Every state write at the end of async work: what if a newer request already finished?

Five questions, and they catch, in my experience, over 90% of what ships broken. They're encoded as the checklist in `.claude/skills/concurrency-migration-auditor`.

**Related:** mechanics & failure signatures → [../topics/concurrency.md](../topics/concurrency.md) · seam bugs → [../topics/async-patterns.md](../topics/async-patterns.md) · codebase-wide audit → `.claude/agents/actor-isolation-scanner`
