# Vue From Scratch — Build the Reactivity System

**Applies to the concepts behind:** Vue 3.5+ (Composition API). **Date:** 2026-07-06.
**Format:** the reactivity core below is complete and testable start-to-finish; the renderer integration (step 5) is a guided sketch — do `frameworks/react/from-scratch.md` for a full VDOM build, then step 5 shows where Vue diverges.
**Why this mechanism:** React's core is *diffing*; Vue's core is *dependency tracking*. Build it and the rest of Vue — `computed`, watchers, why mutation *works* here, reactivity loss pitfalls — stops being magic.

## The core insight

Vue's model: wrap state in a Proxy; while an "effect" (render function, computed, watcher) runs, every property **read** is recorded as a dependency; every later **write** to that property re-runs exactly the effects that read it. Fine-grained push-based invalidation — the opposite pole from React's "re-render and diff everything below."

## Step 1 — track & trigger

`src/reactivity.js` (test with Vitest, no DOM needed):

```js
let activeEffect = null;
const targetMap = new WeakMap();          // target -> (key -> Set<effect>)

function track(target, key) {
  if (!activeEffect) return;              // reads outside effects aren't dependencies
  let depsMap = targetMap.get(target);
  if (!depsMap) targetMap.set(target, (depsMap = new Map()));
  let dep = depsMap.get(key);
  if (!dep) depsMap.set(key, (dep = new Set()));
  dep.add(activeEffect);
  activeEffect.deps.push(dep);            // effect remembers its deps for cleanup (step 3)
}

function trigger(target, key) {
  const dep = targetMap.get(target)?.get(key);
  if (!dep) return;
  for (const effect of [...dep]) {        // copy: running effects re-track and mutate the set
    if (effect === activeEffect) continue; // guard: effect writing what it reads = infinite loop
    effect.scheduler ? effect.scheduler() : effect.run();
  }
}
```

## Step 2 — reactive, ref, effect

```js
export function reactive(target) {
  return new Proxy(target, {
    get(t, key, receiver) {
      track(t, key);
      const value = Reflect.get(t, key, receiver);
      return typeof value === 'object' && value !== null ? reactive(value) : value; // lazy deep
    },
    set(t, key, value, receiver) {
      const old = t[key];
      const result = Reflect.set(t, key, value, receiver);
      if (!Object.is(old, value)) trigger(t, key);   // Vue's version of the bail-out
      return result;
    },
    deleteProperty(t, key) {
      const had = key in t;
      const result = Reflect.deleteProperty(t, key);
      if (had) trigger(t, key);
      return result;
    },
  });
}

export function ref(initial) {                        // why ref exists: Proxies can't wrap primitives
  return {
    __isRef: true,
    get value() { track(this, 'value'); return initial; },
    set value(v) { if (!Object.is(initial, v)) { initial = v; trigger(this, 'value'); } },
  };
}

export function effect(fn, options = {}) {
  const e = {
    deps: [],
    scheduler: options.scheduler,
    run() {
      cleanup(e);                                     // drop stale deps before re-tracking
      activeEffect = e;
      try { return fn(); } finally { activeEffect = null; }
    },
  };
  e.run();
  return e;
}

function cleanup(e) {
  for (const dep of e.deps) dep.delete(e);
  e.deps.length = 0;
}
```

Three load-bearing details, each a Vue pitfall explained:

- **`track` only when `activeEffect` is set** → reading reactive state in plain code creates no subscription. This is why destructuring props/state (`const { count } = state`) at setup time **loses reactivity**: you copied a value during a read; nothing re-runs (`vue-nuxt/common-pitfalls.md` §1).
- **`ref` exists because Proxies need objects.** `.value` isn't ergonomic ceremony — it's the property access that makes track/trigger possible on a primitive.
- **`cleanup` before each run** → branch-dependent deps stay correct (`show ? a.x : b.y` mustn't keep subscribing to both). React solves the same problem with the deps array; Vue re-derives deps automatically each run. That's the fundamental trade: Vue tracks at runtime (no stale-closure deps lists), React re-executes and compares (no Proxy edge cases).

## Step 3 — computed

```js
export function computed(getter) {
  let value, stale = true;
  const runner = effect(getter, {
    scheduler() {                                      // dep changed: don't recompute now —
      if (!stale) { stale = true; trigger(self, 'value'); }  // just invalidate + notify readers
    },
  });
  const self = {
    get value() {
      track(self, 'value');
      if (stale) { value = runner.run(); stale = false; }    // lazy: recompute on next read
      return value;
    },
  };
  return self;
}
```

Lazy + cached + chainable (a computed reading a computed just works, because reading it inside an effect tracks it). Write the test: a computed's getter must not re-run when its deps are untouched.

## Step 4 — the scheduler (why updates are batched, and what nextTick is)

Effects triggered synchronously per-write would render 1,000 times in a 1,000-iteration loop. Real Vue queues render-effects in a microtask, deduplicated:

```js
const queue = new Set();
let flushing = false;
export function queueJob(job) {
  queue.add(job);                                      // Set = same effect queued once per tick
  if (flushing) return;
  flushing = true;
  queueMicrotask(() => { for (const j of queue) j.run(); queue.clear(); flushing = false; });
}
// usage: effect(renderFn, { scheduler: () => queueJob(effectObj) })
```

You have now built the reason `await nextTick()` exists: the DOM updates a microtask after your mutation, so test/DOM code reading immediately sees the old world (`vue-nuxt/testing.md`).

## Step 5 — where the renderer meets reactivity (guided sketch)

Take your mini-react renderer (`react/from-scratch.md`) and change one thing: instead of a global re-render on setState, wrap **each component's render+patch in its own `effect`** with the `queueJob` scheduler. Mutating `state.count` now re-renders *only components that read `count`* — no memo, no `shouldComponentUpdate`, no compiler. That single wiring change is the architectural difference between the two frameworks; everything else (templates compiling to render functions with static-hoisting and patch flags so the VDOM diff can skip static parts) is Vue exploiting compile-time knowledge on top.

## Tests to write (Vitest, the guide's acceptance list)

1. `effect` re-runs on tracked write; not on untracked write; not on same-value write.
2. Destructured value does **not** re-run the effect (reactivity-loss demo — make the pitfall a passing test).
3. Branch cleanup: effect reading `flag ? a.x : b.y` stops re-running on `b.y` writes after flag flips.
4. `computed` is lazy, cached, and chains.
5. Scheduler: 100 writes in a loop → 1 flush; `await` a microtask before asserting DOM/effect output.
6. The infinite-loop guard: an effect that increments what it reads must not hang (assert it runs once per trigger).
