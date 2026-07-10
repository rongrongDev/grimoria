# Objective-C Interop — Production Patterns & Pitfalls (Extended Tier)

> **Applies to:** Swift 6.2 / Swift 6 language mode · legacy ObjC in mixed targets · Xcode 26 · **Last reviewed:** 2026-07-06
> Extended-tier doc: patterns that keep mixed codebases shippable + the pitfalls that page you. Not an ObjC tutorial.

## Production patterns

1. **Annotate the ObjC, don't defend in the Swift.** Un-annotated ObjC imports as implicitly-unwrapped (`UIView!`) — every call site is a latent crash. Wrap headers in `NS_ASSUME_NONNULL_BEGIN/END`, mark real optionals `nullable`, add `NS_SWIFT_NAME` for API ergonomics. One afternoon per header; pays forever. Until annotated, treat every imported IUO as `Optional` at the Swift boundary (`if let view = legacyView`).
2. **Shrink the bridging surface.** One `@objc`-facing façade per legacy subsystem, pure Swift behind it. The bridging header is an API contract; a 200-import bridging header means the "migration" is actually an entanglement. Track its import count as a metric that must only go down.
3. **Generics/enums don't cross.** Swift structs, non-`@objc` enums, protocols with associated types are invisible to ObjC. Design the façade in the common subset (`NSObject` subclasses, `@objc` enums with `Int` raw values, closures) and convert at the edge — don't let `@objc` requirements dictate your Swift model layer.
4. **Lightweight generics + `__kindof` in ObjC headers** (`NSArray<NSString *> *`) import as typed Swift arrays instead of `[Any]` — annotate collections when you annotate nullability.

## Pitfalls (failure → detection → fix)

### 1. ObjC exceptions bypass Swift entirely

**Failure.** `NSException` (KVC on an invalid key, out-of-bounds `NSArray`, NSInvalidArgumentException from a framework) **cannot be caught by Swift `do/catch`** — it unwinds through Swift frames (undefined behavior territory) and crashes. Crash logs show `objc_exception_throw` atop a Swift stack; teams look for the Swift `throw` that doesn't exist.

**Fix.** At known-risky boundaries (KVC/KVO, `NSCoding` with hostile data, third-party ObjC), wrap in an ObjC trampoline compiled into the project:

```objc
// ObjCTryCatch.h/.m — the only sanctioned exception bridge
NS_INLINE NSException * _Nullable ObjCTryBlock(void(NS_NOESCAPE ^_Nonnull block)(void)) {
    @try { block(); return nil; } @catch (NSException *e) { return e; }
}
```

Convert to a Swift `Error` at the boundary. Do **not** sprinkle this everywhere — exceptions from Apple frameworks generally mean programmer error; fix the cause, use the trampoline only where inputs are external.

### 2. KVO string-keypath and deregistration crashes

**Failure.** Legacy `addObserver(_:forKeyPath:)`: typo'd string paths (silent no-op or crash), observing an object that deallocates first (`NSInternalInconsistencyException`, or messages to a deallocated observer). Also: `deinit`-based removal that never runs because of a retain cycle ([memory-management.md](memory-management.md)) — two bugs compounding.

**Fix.** Always the block-based API with lifetime-managed tokens: `observe(\.keyPath, options:)` returning `NSKeyValueObservation` stored on the owner — type-checked keypath, auto-deregistration. Grep gate: `addObserver(_:forKeyPath:` ⇒ migrate or justify.

### 3. Swift 6 concurrency at the ObjC seam

**Failure.** ObjC completion handlers arrive on *arbitrary threads*; Swift 6 makes `@MainActor` state writes from them errors *if the compiler can see it* — but un-audited ObjC callbacks hide behind `@Sendable`-less imported signatures, so races compile fine in ObjC and detonate in Swift. Delegate protocols from ObjC frameworks are nonisolated → the `@MainActor`-conformance problem in [concurrency.md](concurrency.md) §3c.

**Fix.** Annotate ObjC headers with sendability/isolation: `NS_SWIFT_UI_ACTOR` (imports as `@MainActor`) on main-thread-contract classes/protocols, `NS_SWIFT_SENDABLE` on immutable types, completion handlers with `NS_SWIFT_SENDABLE` blocks. Where you can't edit the header, funnel the callback through one Swift shim that hops explicitly (`Task { @MainActor in … }`) — one audited hop instead of N ad-hoc ones.

### 4. Ownership traps ARC won't save you from

- **`NSNotificationCenter` pre-block API, `performSelector(afterDelay:)`, `NSTimer` target-action** retain targets from global roots — same class as [memory-management.md](memory-management.md) §3, more common in ObjC-era code.
- **Toll-free bridging with `Unmanaged`** (`CF...Create` results): `takeRetainedValue()` vs `takeUnretainedValue()` chosen wrong = leak (unretained treated as retained never happens; retained treated as unretained → over-release crash in `CFRelease`, often far from the call). Rule: Create/Copy-named CF functions → `takeRetainedValue()` (the "Create Rule"); Get-named → `takeUnretainedValue()`.
- **`autoreleasepool`:** loops creating many ObjC-derived temporaries (UIImage, NSData, Foundation formatters) balloon memory until the enclosing pool drains — on a background thread/async context, that can be *never soon enough*. Wrap the loop body: `autoreleasepool { … }`. Detection: Allocations shows sawtooth-less linear growth of ObjC objects during batch work.

## Minimum bar for any mixed target

- [ ] All bridged headers nullability-annotated (`NS_ASSUME_NONNULL`), collections typed
- [ ] Main-thread-contract ObjC marked `NS_SWIFT_UI_ACTOR`
- [ ] One exception trampoline, used only at external-input boundaries
- [ ] No string-keypath KVO without a ticket
- [ ] `Unmanaged` usages comment which naming rule applied
- [ ] Bridging-header import count tracked and non-increasing

**Related:** GCD patterns in the same legacy code → [gcd-legacy.md](gcd-legacy.md) · isolation seams → [concurrency.md](concurrency.md)
