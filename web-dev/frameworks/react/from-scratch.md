# Build React's Core From Scratch — VDOM, Diffing, Hooks, With Tests

**Applies to the concepts behind:** React 19.x. **Date:** 2026-07-06.
**What you'll build:** a working ~200-line renderer — `h()` elements, mount, keyed diffing, `useState` with batching, `useEffect` with cleanup — plus a Vitest suite. Follow it start to finish; every file is complete.
**Why bother:** after this, half of `frameworks/react/common-pitfalls.md` becomes obvious instead of memorized: you will *see* why keys matter, why state must not be mutated, why closures go stale, and what "render" actually costs.

**Honesty box:** this is React-2015-shaped — synchronous, recursive, single root. Real React 19 adds a fiber architecture (interruptible rendering as a linked list of units of work), priority lanes, concurrent features (`useTransition`), and a compiler. Step 8 explains what those buy and why we skip them. The *model* you build here — UI as data, diff, commit — is still the real one.

## Step 0 — Project setup

```bash
mkdir mini-react && cd mini-react && npm init -y
npm i -D vitest jsdom
```

`package.json` additions:

```json
{ "type": "module", "scripts": { "test": "vitest run", "test:watch": "vitest" } }
```

`vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom' } });
```

## Step 1 — Elements are just data

The whole trick of React in one sentence: **a component doesn't build UI, it returns a *description* of UI (cheap objects), and the library reconciles that description against reality (expensive DOM).** `h` (a.k.a. `createElement`, what JSX compiles to) builds the description.

Create `src/minireact.js`:

```js
// ---------- Step 1: elements ----------
const TEXT = '#text';

export function h(type, props, ...children) {
  props = props ?? {};
  const norm = [];
  for (const c of children.flat(Infinity)) {
    // false/null/undefined are skipped — this is why `cond && <X/>` works in JSX
    if (c === null || c === undefined || c === false || c === true) continue;
    norm.push(typeof c === 'object' ? c : textNode(c));
  }
  return { type, props, children: norm, key: props.key ?? null,
           dom: null, hooks: null, rendered: null };
}

const textNode = (v) => ({ type: TEXT, props: { nodeValue: String(v) },
                           children: [], key: null, dom: null });
```

The last three fields are private bookkeeping the renderer fills in: `dom` (the real node this vnode owns), `hooks` (component state), `rendered` (what a function component returned).

## Step 2 — Mount: description → real DOM

```js
// ---------- Step 2: mount ----------
function mount(vnode, parentDom, refDom = null) {
  if (typeof vnode.type === 'function') {            // component: expand, then mount the result
    vnode.rendered = renderComponent(vnode);
    mount(vnode.rendered, parentDom, refDom);
    vnode.dom = vnode.rendered.dom;
    return;
  }
  const dom = vnode.type === TEXT
    ? document.createTextNode(vnode.props.nodeValue)
    : document.createElement(vnode.type);
  if (vnode.type !== TEXT) {
    setProps(dom, {}, vnode.props);
    for (const child of vnode.children) mount(child, dom);
  }
  vnode.dom = dom;
  parentDom.insertBefore(dom, refDom);               // refDom lets the differ insert at a position
}

function setProps(dom, oldProps, newProps) {
  for (const k in oldProps) {
    if (k === 'key' || k === 'children' || k in newProps) continue;
    if (k.startsWith('on')) dom.removeEventListener(k.slice(2).toLowerCase(), oldProps[k]);
    else if (k === 'className') dom.className = '';
    else dom.removeAttribute(k);
  }
  for (const k in newProps) {
    if (k === 'key' || k === 'children') continue;
    const o = oldProps[k], n = newProps[k];
    if (o === n) continue;                            // referential equality — remember this line
    if (k.startsWith('on')) {
      if (o) dom.removeEventListener(k.slice(2).toLowerCase(), o);
      dom.addEventListener(k.slice(2).toLowerCase(), n);
    }
    else if (k === 'className') dom.className = n;
    else if (k === 'value' || k === 'checked') dom[k] = n;   // DOM *properties*, not attributes —
    else dom.setAttribute(k, n);                             // attributes only set the default
  }
}
```

Two teaching moments hiding here: (1) `o === n` — the renderer compares by *reference*. Pass a fresh inline object/handler every render and the prop "changed" every time. This is the entire story behind memo/useCallback. (2) `value` must be a property write; `setAttribute('value')` doesn't update a typed-in input — the classic controlled-input confusion.

## Step 3 — Hooks: state that survives re-renders

A function component is called fresh each render — its local variables die. Hooks persist state *outside* the function, on the vnode, indexed by call order. That indexing is not an implementation quirk you can ignore: it is **why hooks can't go in conditionals** — an `if` shifts every later hook's index and state gets read into the wrong slot.

```js
// ---------- Step 3: hooks ----------
let currentVNode = null;   // which component is rendering right now
let hookIndex = 0;

function renderComponent(vnode) {
  vnode.hooks ??= [];
  currentVNode = vnode;
  hookIndex = 0;
  const out = vnode.type({ ...vnode.props, children: vnode.children });
  currentVNode = null;
  return out ?? textNode('');
}

export function useState(initial) {
  const hooks = currentVNode.hooks;
  const i = hookIndex++;
  if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
  const setState = (next) => {
    const value = typeof next === 'function' ? next(hooks[i]) : next;
    if (Object.is(value, hooks[i])) return;          // bail out: same value, no re-render —
    hooks[i] = value;                                //   this is why *mutating* state does nothing
    scheduleRerender();
  };
  return [hooks[i], setState];
}
```

Look at `setState` closely — three React behaviors fall out of these six lines:

- **`Object.is` bail-out**: if you mutate an object and set it back, the reference is identical → no render. "Why doesn't my list update when I `push`" is answered by one line of code you just wrote.
- **Functional updates**: `next(hooks[i])` reads the *current* slot at call time, which is how `setCount(c => c + 1)` dodges stale closures.
- The setter closes over `hooks` (the array) and `i` (the slot) — not over the value. The rendered *component body* closes over the value. That asymmetry **is** the stale-closure phenomenon: `frameworks/react/concurrency.md` §1.

## Step 4 — Batching

Two `setState` calls in one click handler must cause one render, not two.

```js
// ---------- Step 4: batching ----------
let dirty = false;
let doRerender = null;      // wired up by createRoot

function scheduleRerender() {
  if (dirty) return;
  dirty = true;
  queueMicrotask(() => { dirty = false; doRerender(); });    // coalesce a burst into one pass
}
```

This is also why, in your tests below, you must `await Promise.resolve()` (flush microtasks) after firing events — and why React's own `act()` exists.

## Step 5 — Diffing (reconciliation)

The heart. Compare old and new descriptions; touch the DOM minimally.

```js
// ---------- Step 5: diff ----------
function patch(parentDom, oldVNode, newVNode) {
  if (oldVNode.type !== newVNode.type) {             // different type → give up, replace subtree.
    mount(newVNode, parentDom, oldVNode.dom);        //   (why switching component types resets
    unmount(oldVNode);                               //    all state below that point)
    return;
  }
  if (typeof newVNode.type === 'function') {
    newVNode.hooks = oldVNode.hooks;                 // same component → state carries over,
    newVNode.rendered = renderComponent(newVNode);   //   by ref, so live setters keep working
    patch(parentDom, oldVNode.rendered, newVNode.rendered);
    newVNode.dom = newVNode.rendered.dom;
    return;
  }
  const dom = (newVNode.dom = oldVNode.dom);
  if (newVNode.type === TEXT) {
    if (newVNode.props.nodeValue !== oldVNode.props.nodeValue)
      dom.nodeValue = newVNode.props.nodeValue;
    return;
  }
  setProps(dom, oldVNode.props, newVNode.props);
  patchChildren(dom, oldVNode.children, newVNode.children);
}

function patchChildren(parentDom, oldChildren, newChildren) {
  const byKey = new Map(oldChildren.filter(c => c.key != null).map(c => [c.key, c]));
  const unkeyedOld = oldChildren.filter(c => c.key == null);
  const used = new Set();
  let u = 0;                                          // cursor into unkeyed old children

  newChildren.forEach((newChild, i) => {
    const oldChild = newChild.key != null
      ? byKey.get(newChild.key) ?? null
      : unkeyedOld[u++] ?? null;                      // unkeyed matches BY POSITION — this line
                                                      //   is the entire "why keys" lesson
    const ref = parentDom.childNodes[i] ?? null;
    if (oldChild && oldChild.type === newChild.type) {
      used.add(oldChild);
      patch(parentDom, oldChild, newChild);
      if (newChild.dom !== ref) parentDom.insertBefore(newChild.dom, ref);  // keyed reorder = move
    } else {
      mount(newChild, parentDom, ref);
    }
  });
  for (const c of oldChildren) if (!used.has(c)) unmount(c);
}

function unmount(vnode) {
  if (typeof vnode.type === 'function') {
    for (const hk of vnode.hooks ?? []) hk?.cleanup?.();     // effect cleanup (Step 7)
    return unmount(vnode.rendered);
  }
  vnode.dom?.remove();
}
```

Stare at the `unkeyedOld[u++]` line until it hurts: without keys, "delete the first row" matches old-row-1 against new-row-0 and *patches row 1's DOM to look like row 0* — every row shifts content while keeping its DOM node (and its input state, focus, animations). Test 5 below proves it. Also note real React's differ uses index-with-key heuristics rather than a filter-and-cursor, and production frameworks minimize moves with longest-increasing-subsequence; ours is honest but naive.

## Step 6 — The root

```js
// ---------- Step 6: root ----------
const clone = (v) => ({ ...v, dom: null, hooks: null, rendered: null,
                        children: v.children.map(clone) });

export function createRoot(container) {
  let input = null, current = null;
  doRerender = () => {                               // single live root; real React tracks roots properly
    const next = clone(input);
    patch(container, current, next);
    current = next;
    flushEffects();
  };
  return {
    render(element) {
      input = element;
      const next = clone(element);
      current ? patch(container, current, next) : mount(next, container);
      current = next;
      flushEffects();
    },
  };
}
```

Re-render re-clones the *description* and diffs — the description is cheap; that's the point of Step 1.

## Step 7 — useEffect

```js
// ---------- Step 7: effects ----------
let pendingEffects = [];

export function useEffect(fn, deps) {
  const hooks = currentVNode.hooks;
  const i = hookIndex++;
  const prev = hooks[i];
  const changed = !prev || !deps || !prev.deps
    || deps.length !== prev.deps.length
    || deps.some((d, j) => !Object.is(d, prev.deps[j]));
  hooks[i] = { deps, cleanup: prev?.cleanup };
  if (changed) {
    const slot = hooks[i];
    pendingEffects.push(() => { slot.cleanup?.(); slot.cleanup = fn() ?? undefined; });
  }
}

function flushEffects() {
  const fx = pendingEffects; pendingEffects = [];
  for (const run of fx) run();
}
```

Effects run **after commit** (the DOM is already updated), old cleanup runs before the new effect, and the deps comparison is `Object.is` per slot — so a fresh inline object/array dep re-fires every render. Three more pitfalls now self-explanatory.

## Tests — `src/minireact.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import { h, createRoot, useState, useEffect } from './minireact.js';

const flush = () => Promise.resolve();               // one microtask tick = our batch boundary
const setup = () => {
  const el = document.createElement('div');
  document.body.replaceChildren(el);
  return { el, root: createRoot(el) };
};

describe('elements', () => {
  it('normalizes children and skips conditional holes', () => {
    const v = h('ul', null, false, [h('li', null, 'a'), null], 'txt');
    expect(v.children.map(c => c.type)).toEqual(['li', '#text']);
  });
});

describe('mount & patch', () => {
  it('renders and updates attributes minimally', () => {
    const { el, root } = setup();
    root.render(h('a', { href: '/x', className: 'c' }, 'hi'));
    expect(el.innerHTML).toBe('<a href="/x" class="c">hi</a>');
    root.render(h('a', { href: '/y', className: 'c' }, 'hi'));
    expect(el.querySelector('a').getAttribute('href')).toBe('/y');
  });

  it('replaces subtree when type changes', () => {
    const { el, root } = setup();
    root.render(h('span', null, 'a'));
    root.render(h('p', null, 'a'));
    expect(el.innerHTML).toBe('<p>a</p>');
  });
});

describe('useState', () => {
  const Counter = () => {
    const [n, setN] = useState(0);
    return h('button', { onclick: () => setN(c => c + 1) }, `n:${n}`);
  };

  it('updates on click', async () => {
    const { el, root } = setup();
    root.render(h(Counter, null));
    el.querySelector('button').click();
    await flush();
    expect(el.textContent).toBe('n:1');
  });

  it('batches multiple set calls into one render', async () => {
    let renders = 0;
    const Twice = () => {
      renders++;
      const [n, setN] = useState(0);
      return h('button', { onclick: () => { setN(c => c + 1); setN(c => c + 1); } }, `n:${n}`);
    };
    const { el, root } = setup();
    root.render(h(Twice, null));
    el.querySelector('button').click();
    await flush();
    expect(el.textContent).toBe('n:2');   // functional updates both applied…
    expect(renders).toBe(2);              // …in a single re-render (initial + one)
  });

  it('bails out when value is Object.is-equal (mutation does nothing)', async () => {
    let renders = 0;
    const Mut = () => {
      renders++;
      const [arr, setArr] = useState([]);
      return h('button', { onclick: () => { arr.push(1); setArr(arr); } }, `len:${arr.length}`);
    };
    const { el, root } = setup();
    root.render(h(Mut, null));
    el.querySelector('button').click();
    await flush();
    expect(el.textContent).toBe('len:0'); // pushed, but same reference → no render
    expect(renders).toBe(1);
  });
});

describe('keys', () => {
  const List = (items) => h('ul', null, items.map(t => h('li', { key: t }, t)));

  it('preserves DOM identity across reorder when keyed', () => {
    const { el, root } = setup();
    root.render(List(['a', 'b', 'c']));
    const liB = el.querySelectorAll('li')[1];
    liB.dataset.marker = 'kept';                     // simulate DOM-held state (focus, input…)
    root.render(List(['b', 'c', 'a']));
    expect(el.textContent).toBe('bca');
    expect(el.querySelectorAll('li')[0].dataset.marker).toBe('kept'); // "b" moved, not rebuilt
  });

  it('WITHOUT keys, removal shifts state onto the wrong row', () => {
    const Unkeyed = (items) => h('ul', null, items.map(t => h('li', null, t)));
    const { el, root } = setup();
    root.render(Unkeyed(['a', 'b']));
    el.querySelectorAll('li')[0].dataset.marker = 'was-a';
    root.render(Unkeyed(['b']));                     // removed "a"
    // position-matching patched old li[0] to say "b": the marker leaked onto row "b"
    expect(el.querySelector('li').dataset.marker).toBe('was-a');
  });
});

describe('useEffect', () => {
  it('runs after commit, re-runs on dep change, cleans up on unmount', async () => {
    const log = [];
    const Eff = ({ dep }) => {
      useEffect(() => { log.push(`run:${dep}`); return () => log.push(`clean:${dep}`); }, [dep]);
      return h('i', null, dep);
    };
    const { root } = setup();
    root.render(h(Eff, { dep: 1 }));
    root.render(h(Eff, { dep: 1 }));                 // same dep → no re-run
    root.render(h(Eff, { dep: 2 }));                 // change → cleanup old, run new
    root.render(h('b', null, 'gone'));               // type change → unmount → final cleanup
    expect(log).toEqual(['run:1', 'clean:1', 'run:2', 'clean:2']);
  });
});
```

Run `npm test`. All green? You've built a component framework. Break things on purpose next — delete the `Object.is` bail-out and watch the mutation test change behavior; remove `newVNode.hooks = oldVNode.hooks` and watch state vanish on every render.

## Step 8 — What real React adds, and why

- **Fiber:** our `patch` is recursive and synchronous — a 10,000-node diff blocks the main thread with no way to stop (see `principles/performance.md` on INP). React rebuilt rendering as a linked list of "fiber" work units it can pause, resume, and *abandon*.
- **Lanes / concurrency:** with interruptible rendering, updates get priorities — a keystroke can interrupt a half-finished low-priority list render (`useTransition`, `useDeferredValue`). Consequence you must carry into real React: **renders can run and be thrown away**, which is why render-phase side effects are forbidden and why `frameworks/react/concurrency.md` matters.
- **Synthetic events, portals, Suspense, SSR/hydration, RSC:** engineering mass on the same core model.
- **React Compiler (React 19 era):** automates the memoization our `o === n` line made necessary.

None of these change the model you just built: **UI = f(state), rendered as data, reconciled by diff, committed minimally.** Everything else in the React docs of this KB assumes you now own that model.
