# Svelte From Scratch — Build a Signals Runtime (What Runes Compile To)

**Applies to the concepts behind:** Svelte 5 (runes). **Date:** 2026-07-06.
**Format:** the signals core is complete and testable; the compiler half (step 4) is a guided sketch. Do `vue-nuxt/from-scratch.md` first if you haven't — Svelte 5's runtime is the same dependency-tracking family; this guide focuses on what's *different*: push-pull signals with lazy derived values, and a compiler that turns templates into direct DOM instructions with **no VDOM at all**.

## The core insight

Svelte 5 = fine-grained signals (like Vue's track/trigger, like Solid) **plus** a compiler that knows, at build time, exactly which DOM node each expression feeds. Update path: `count.set` → notify subscribers → run tiny pre-compiled functions like `text.data = String(count)`. Nothing diffs, because the compiler already knew where everything goes.

## Step 1 — signals with push-pull invalidation

Vue's version (from-scratch there) eagerly re-runs effects. Modern signal runtimes (Svelte 5, Solid, Vue 3.6's alien-signals-inspired core) are **push dirt, pull values**: writes mark dependents dirty (cheap), values recompute only when read (lazy), and a derived that recomputes to the *same* value doesn't wake its own dependents. Build that:

```js
// signals.js
let activeReaction = null;
const DIRTY = 2, MAYBE_DIRTY = 1, CLEAN = 0;

export function state(value) {
  const s = { value, reactions: new Set() };
  return {
    get() {
      if (activeReaction) { s.reactions.add(activeReaction); activeReaction.deps.push(s); }
      return s.value;
    },
    set(next) {
      if (Object.is(next, s.value)) return;        // the equality gate, again
      s.value = next;
      for (const r of [...s.reactions]) markDirty(r, DIRTY);
    },
  };
}

function markDirty(reaction, flag) {
  if (reaction.status >= flag) return;
  reaction.status = flag;
  if (reaction.kind === 'derived') {
    // push MAYBE_DIRTY downstream: "something upstream changed, verify on next read"
    for (const r of [...reaction.reactions]) markDirty(r, MAYBE_DIRTY);
  } else {
    scheduleEffect(reaction);                       // effects go on the microtask queue
  }
}

export function derived(fn) {
  const d = { kind: 'derived', fn, status: DIRTY, value: undefined,
              deps: [], reactions: new Set() };
  return {
    get() {
      if (activeReaction) { d.reactions.add(activeReaction); activeReaction.deps.push(d); }
      if (d.status !== CLEAN) {
        const old = d.value;
        d.value = run(d);
        d.status = CLEAN;
        if (Object.is(old, d.value)) return d.value; // recomputed but equal: dependents stay asleep
      }
      return d.value;
    },
  };
}

export function effect(fn) {
  const e = { kind: 'effect', fn, status: DIRTY, deps: [] };
  run(e); e.status = CLEAN;
  return e;
}

function run(reaction) {
  for (const dep of reaction.deps) dep.reactions?.delete(reaction);  // re-track from scratch
  reaction.deps.length = 0;
  const prev = activeReaction;
  activeReaction = reaction;
  try { return reaction.fn(); } finally { activeReaction = prev; }
}

const queue = new Set();
function scheduleEffect(e) {
  queue.add(e);
  if (queue.size === 1) queueMicrotask(() => {
    for (const eff of queue) { if (eff.status !== CLEAN) { run(eff); eff.status = CLEAN; } }
    queue.clear();
  });
}
```

(For the followable core, `MAYBE_DIRTY` can be treated as DIRTY — full lazy verification ("check if upstream *actually* changed before recomputing me") is the production refinement; note where you'd add it.)

## Step 2 — map the runes onto it

| Rune (what you write) | Compiles to (what you built) |
|---|---|
| `let count = $state(0)` | `const count = state(0)`; every read of `count` → `count.get()`, every assignment → `count.set(…)` |
| `const double = $derived(count * 2)` | `derived(() => count.get() * 2)`, reads become `.get()` |
| `$effect(() => {…})` | `effect(fn)`, auto-tracked, re-runs on dep writes |

**This table is the answer to "why can't I destructure/alias reactive state in Svelte 5"** — the compiler rewrites *syntactic accesses to the declared variable*. Copy the value into another binding and there's nothing left to rewrite: the exact reactivity-loss physics of Vue (`vue-nuxt/common-pitfalls.md` §1), arrived at from the compiler side.

## Step 3 — templates without a VDOM

Hand-compile one component to see the trick. Source:

```svelte
<script>let count = $state(0);</script>
<button onclick={() => count++}>clicked {count}</button>
```

Compiled shape (conceptually — real output differs cosmetically):

```js
export function Counter(anchor) {
  const count = state(0);
  const btn = document.createElement('button');
  btn.append(document.createTextNode('clicked '));
  const txt = document.createTextNode('0');
  btn.append(txt);
  btn.addEventListener('click', () => count.set(count.get() + 1));
  effect(() => { txt.data = String(count.get()); });   // ONE binding = ONE effect = ONE node write
  anchor.append(btn);
}
```

Compare with your mini-react: no element objects, no `patch`, no children diffing — the compiler resolved "what changes when count changes" at build time. This is why Svelte's update cost scales with *bindings that changed*, not tree size, and why there's no memo API: there's nothing to memoize away. What the compiler *can't* know statically — lists — is why `{#each}` still needs keys (`(item.id)`) and a keyed-diff under the hood: the one place Svelte re-inherits the `react/from-scratch.md` Step 5 lesson.

## Step 4 — the compiler half (guided sketch)

Write the smallest thing that earns the word: parse a template with one interpolation (regex is fine for the exercise), emit the create-nodes + per-binding-effect code as a string, `new Function` it, mount it. Acceptance: your generated component updates one text node per write and never touches siblings (assert with a MutationObserver in the test — that assertion *is* the difference between Svelte and a VDOM).

## Tests to write (Vitest)

1. `state` set with equal value wakes nothing; unequal wakes effects once per microtask flush (batching).
2. `derived` is lazy (getter not called until read) and cached; equal-recompute doesn't wake dependents (the push-pull payoff — write this test carefully, it's the whole point of Step 1).
3. Re-tracking: branch flip stops reactions from stale branch (same test as Vue's №3 — the family resemblance is the lesson).
4. Compiled counter: one node mutates per update (MutationObserver assertion).
