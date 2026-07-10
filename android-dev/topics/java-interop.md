# Java Interop — Production Patterns & Pitfalls for Mixed Kotlin/Java Codebases

> **Tier: extended** — production patterns + common pitfalls.
> **Applies to:** Kotlin 2.2, Java 17 toolchain, API 24–36 · **Last reviewed:** 2026-07-06
> **Related:** [concurrency.md](../principles/concurrency.md) · [build-and-release.md](../principles/build-and-release.md)

## The one rule that prevents most interop crashes

**Every value crossing from Java into Kotlin is nullable until proven otherwise.** Kotlin trusts Java's nullability annotations; unannotated Java types are *platform types* (`String!`) and Kotlin will neither warn nor check — it inserts a runtime intrinsic that throws `NullPointerException` at the *assignment*, which is at least near the cause… unless the platform-type value travels (stored in a field, passed along) before something finally dereferences it, at which point the crash blames innocent code. The production fingerprint: NPE crash clusters pointing at a Kotlin line that "can't be null," where the null was born in an unannotated Java callback three frames earlier.

**Policy that works:** annotate the Java you own (`@Nullable`/`@NonNull` — JSpecify or JetBrains annotations, pick one and stop debating); at the boundary with Java you *don't* own, receive into explicit `?` types and validate immediately. Grep-able review rule: no platform types stored in fields — resolve nullability at the seam.

## Direction 1: Kotlin called from Java (you keep Java callers alive)

- **`lateinit` and Java:** Java callers can read a `lateinit var` before init — they get the raw null with no helpful "lateinit property not initialized" message. Don't expose `lateinit` to Java; wrap in an accessor.
- **Default parameters vanish** in Java — Java sees only the full-arity method unless you add `@JvmOverloads`. The pitfall inside the pitfall: `@JvmOverloads` on a `View` constructor chain overrides *style defaults* subtly (the three-arg constructor with a default `defStyleAttr = 0` drops the view's actual default style — the classic "my custom EditText lost its underline" bug).
- **Top-level functions** → `UtilsKt.foo()` unless `@file:JvmName`. **`object`** → `INSTANCE.` unless `@JvmStatic`. **`const val`/`@JvmField`** to avoid getter noise. These are ergonomics, not correctness — apply when Java callers exist, don't cargo-cult them everywhere.
- **Coroutines exposed to Java are unusable** (`suspend` compiles to a `Continuation` parameter Java can't sensibly supply). At a boundary that Java must call: expose `CompletableFuture` (`kotlinx-coroutines-jdk8`'s `future {}` scope builder — mind the scope's lifetime, [concurrency.md](../principles/concurrency.md)) or a callback overload. Design the seam once, in Kotlin, rather than letting each Java caller improvise.

## Direction 2: Java called from Kotlin (the common case in migrations)

- **Checked exceptions disappear:** Kotlin doesn't check them, so a Java `throws IOException` is silently uncaught in Kotlin — until production. When wrapping Java I/O APIs, write the `try/catch` the Java compiler would have forced.
- **Java callbacks into Kotlin coroutines:** the bridge is `suspendCancellableCoroutine` — and the two bugs are *double-resume* (Java APIs that can call both `onSuccess` and `onError` on edge paths → `IllegalStateException: Already resumed`; guard with `isActive` or `resume` catching) and *missing cancellation propagation* (always implement `invokeOnCancellation { call.cancel() }`, or cancelled screens keep network calls alive — the zombie-work class from [concurrency.md](../principles/concurrency.md)).
- **Java singletons with mutable state** are the same process-death trap as Kotlin `object`s ([architecture.md](../principles/architecture.md)) but older and load-bearing. Don't "quickly Kotlinize" them — that converts a known-shaped risk into a fresh one; migrate them to injected, persisted state as their own ticket.

## Migration mechanics (Java → Kotlin)

- **Convert leaf classes first** (few dependents), models before logic, never "while I'm in here" during a feature PR — conversion diffs bury logic changes and make `git blame` archaeology useless for the exact files where you'll need it most.
- Studio's auto-converter output is a *draft*: it preserves Java's nullability pessimism (`?` everywhere, `!!` sprinkled). Every `!!` it emits is a decision it punted to you; a converted file still containing `!!` is an unfinished conversion. Review rule: **`!!` in converted code = the conversion isn't done.**
- Build note: mixed modules pay a compile-ordering tax (kotlinc must see Java stubs and vice versa). Fully-converted modules build faster and can drop the Java toolchain paths; finish modules rather than leaving 5% Java remnants everywhere ([build-and-release.md](../principles/build-and-release.md)).

## When NOT to use this doc

No Java in the repo and no Java-only SDK consumers → you don't have an interop problem; don't add `@Jvm*` annotations speculatively. KMP's Kotlin/Swift boundary is a different beast → [kotlin-multiplatform.md](kotlin-multiplatform.md).
