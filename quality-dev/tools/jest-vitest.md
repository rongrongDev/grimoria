# Jest / Vitest — unit & integration mechanics without self-deception

**Applies to:** Vitest 3.x, Jest 29–30 · **Last verified:** 2026-07-06
**Standalone:** yes. 2026 default: **Vitest** for new projects (ESM-native, fast, Jest-compatible API); keep Jest where it's entrenched — the patterns below are written once and noted where the two diverge.
**Related principles:** what belongs at unit vs integration layer — `quality-dev/principles/test-strategy.md`; fake timers in anger — `quality-dev/principles/concurrency-and-async-testing.md`; whether these tests verify anything — `quality-dev/principles/mutation-testing.md`.

## Assertions that can actually fail

The highest-defect-density area of unit suites isn't logic — it's assertions too weak to catch anything. The `toBeDefined()` epidemic (see the 100%-coverage war story in `quality-dev/principles/test-strategy.md`) lives here.

- Assert **values and shapes**, not existence: `toEqual({ total: 4200, currency: 'USD' })` beats three `toBeDefined()`s and a `toBeTruthy()`.
- `toBeTruthy()` on anything but a boolean is a bug magnet (`1`, `'false'`, `[]` all pass). Use `toBe(true)` / concrete matchers.
- **Async pitfalls that produce tests that cannot fail:**
  - Missing `await` on an async assertion — the test ends before the expectation runs. Vitest/Jest now warn; still, enforce `@typescript-eslint/no-floating-promises` in test dirs.
  - `expect(fn).toThrow()` on an *async* fn — never catches; use `await expect(promise).rejects.toThrow(SpecificError)`, and assert the *type*, not just "something threw."
  - Assertions inside `.catch()`/callbacks that never execute → test passes vacuously. `expect.assertions(n)` pins the count when control flow is conditional.
- Error-path tests assert three things: correct error type, no partial side effects (the DB row was *not* half-written), and — where relevant — that cleanup/compensation ran.

## Mocking discipline — the slope from test double to hall of mirrors

Module-level auto-mocking (`vi.mock`/`jest.mock`) is powerful and corrosive. The gradient I enforce in review:

1. **Prefer injecting a fake** (in-memory repo implementing the real interface) — survives refactors, testable behavior.
2. **Mock at the network boundary** (MSW/`nock`) for HTTP dependencies — tests the real client code, serialization included.
3. **`vi.mock` a module** only for genuinely unownable edges (SDKs, clock, fs) — and assert *outcomes*, not call counts, wherever an outcome exists.
4. A test needing **>3 mocks** is at the wrong layer — move it to integration (`quality-dev/principles/test-strategy.md`, decision tree step 2).

`toHaveBeenCalledWith` is an *implementation* assertion: correct only when the call **is** the contract (an email was sent, an event was published). Using it for internal collaborations welds the test to the current call graph — the suite that "breaks on every refactor and never on any bug."

Sharp edges: `vi.mock` is hoisted above imports (factory can't close over test-local variables — use `vi.hoisted`); Vitest does **not** auto-reset mocks by default — set `mockReset: true` in config or leaked mock state becomes inter-test coupling (flakiness taxonomy #2/#4 in `quality-dev/principles/flakiness.md`); in Jest, `resetMocks: true` similarly.

## Fake timers — mandatory for time logic, sharp on async

Any debounce/TTL/retry/scheduling logic gets fake timers (`vi.useFakeTimers()`), never real waits (the principle: `quality-dev/principles/concurrency-and-async-testing.md`).

- The classic deadlock: `vi.advanceTimersByTime()` is synchronous — promise callbacks scheduled by the elapsed timers haven't run yet. Use **`advanceTimersByTimeAsync` / `runAllTimersAsync`** when the timed code is async (it almost always is).
- Faking `performance.now`/`Date` but not timers (or vice versa) splits the clock — configure `fakeTimers.toFake` deliberately.
- Always `vi.useRealTimers()` in `afterEach`; leaked fake timers freeze *other* tests' timeouts — a legendarily confusing order-dependent flake.

## Isolation & lifecycle

- **Fresh state per test:** module-level mutable state survives between tests in the same file (module cache). `beforeEach` re-creates fixtures; `vi.resetModules()` when the module itself holds state (config caches, singletons).
- **Integration tests own their world:** real DB via Testcontainers, per-test transaction rollback or unique-keyed rows — the full hierarchy in `quality-dev/principles/contract-and-integration-testing.md`.
- **Run shuffled** (`sequence.shuffle: true` in Vitest / `--randomize` in Jest 29.4+) permanently, so order dependence dies young instead of ambushing the day you parallelize.
- `test.each` for boundary tables (the `>=`-vs-`>` class of bug from `quality-dev/principles/mutation-testing.md` is exactly what a boundary table kills): `test.each([[99.99, false], [100, true], [100.01, true]])('threshold %f → %s', …)`.

## Snapshots — a tool with a default failure mode

Snapshot tests fail toward *ritual approval*: the diff appears, the developer presses `u`, the bug ships with a recorded blessing. I audited a suite where 30% of tests were snapshots and the git history showed snapshot updates in 80% of PRs — effectively write-only tests. Rules: snapshot only **stable, human-reviewable serialized output** (error payloads, generated config, AST output); inline snapshots (`toMatchInlineSnapshot`) so the expected value lives in the test and diffs in the PR; a snapshot larger than ~30 lines is unreviewable and therefore unverifiable — replace with targeted assertions.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Assertion-free/weak tests | Mutation run on the module (`quality-dev/tools/stryker.md`); grep `toBeDefined|toBeTruthy` density | Rewrite to value/shape assertions | Incremental mutation gate on core paths; lint warn on weak matchers in core dirs |
| Tests that can't fail (missing await, vacuous catch) | `expect.assertions` mismatches; mutation survivors at 100% coverage | Await assertions; `rejects.toThrow(Type)` | `no-floating-promises` in test dirs; review checklist "make it fail once before merging" |
| Mock-welded suite | Refactors break tests, bugs don't | Re-layer per mocking gradient above | ">3 mocks ⇒ wrong layer" review rule |
| Leaked mock/timer state between tests | Fails in suite, passes alone; shuffle canary red | `mockReset` config; real timers in `afterEach` | Shuffle permanently on; global `afterEach` hygiene in setup file |
| Snapshot ritual approval | Snapshot updates in most PRs; giant `.snap` files | Replace with targeted asserts; inline-only policy | Size cap on snapshots (lint); PR template asks "why is each snapshot diff correct?" |
| Slow unit stage | Stage 1 budget breach (`quality-dev/principles/ci-cd-integration.md`) | Move DB-touching tests to integration stage; pool workers (Vitest `pool: 'threads'`) | Wall-time trend alarm per stage |

## Jest ↔ Vitest migration notes (only what bites)

API is ~drop-in (`vi` for `jest`), but: Vitest is ESM-first — most Jest ESM/transform pain disappears, while CJS-only mocking tricks (`require` interception) don't port; globals are opt-in (`globals: true`) — imports otherwise; environment per-file directives differ (`// @vitest-environment jsdom`); coverage default is v8, thresholds config moved under `coverage`. Migrate a directory at a time; both runners coexist fine during transition. Don't rewrite a green Jest suite for speed you haven't measured.
