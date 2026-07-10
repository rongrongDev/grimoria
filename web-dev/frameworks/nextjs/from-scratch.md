# Next.js From Scratch — Build a Mini SSR Framework with File Routing & Hydration

**Applies to the concepts behind:** Next.js 15–16. **Date:** 2026-07-06.
**Format:** guided build. Architecture and key code are complete; you write the glue. For the fully-followable equivalent, do `frameworks/react/from-scratch.md` first — this guide builds *on top of* React (the real one) and assumes its mental model.
**What you'll build:** file-based routing → server rendering → client hydration → per-route data loading. That's 80% of what a meta-framework *is*; the remaining 20% (caching layers, RSC serialization, bundler integration) is described at the end.

## The core insight

A meta-framework is three transforms glued together: **filesystem → route table**, **route + request → HTML string**, **HTML + JS bundle → live page**. Everything else (ISR, streaming, actions) is optimization of one of the three.

## Step 1 — File router

```
pages/index.jsx  → /
pages/about.jsx  → /about
pages/post/[id].jsx → /post/:id
```

```js
// framework/router.js
import { globSync } from 'glob';

export function buildRouteTable(dir = 'pages') {
  return globSync(`${dir}/**/*.jsx`).map((file) => {
    const route = file.slice(dir.length, -'.jsx'.length)
      .replace(/\/index$/, '') || '/';
    const pattern = new RegExp('^' +
      route.replace(/\[(\w+)\]/g, '(?<$1>[^/]+)') + '/?$');
    return { file, route, pattern };
  }).sort((a, b) => b.route.length - a.route.length);   // static before dynamic-ish; good enough here
}

export function matchRoute(table, pathname) {
  for (const r of table) {
    const m = r.pattern.exec(pathname);
    if (m) return { ...r, params: m.groups ?? {} };
  }
  return null;
}
```

Teaching moment: route specificity ordering is a real design problem (Next has explicit precedence rules: static > dynamic > catch-all). Our length-sort is a stand-in; write a test with `/post/new` vs `/post/[id]` and decide the answer *on purpose*.

## Step 2 — Server render

Each page exports a component and (optionally) a loader — the `getServerSideProps` shape, which survives conceptually as RSC's async components:

```jsx
// pages/post/[id].jsx
export async function loader({ params }) {
  return { post: await db.posts.find(params.id) };
}
export default function Post({ post }) {
  return <article><h1>{post.title}</h1><Like id={post.id} initial={post.likes} /></article>;
}
```

```js
// framework/server.js
import { createServer } from 'node:http';
import { renderToString } from 'react-dom/server';

const table = buildRouteTable();
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const match = matchRoute(table, url.pathname);
  if (!match) { res.writeHead(404); return res.end('not found'); }

  const mod = await import(resolveBuilt(match.file));       // your bundler step emits these
  const props = mod.loader ? await mod.loader({ params: match.params }) : {};
  const html = renderToString(<mod.default {...props} />);

  res.setHeader('content-type', 'text/html');
  res.end(`<!doctype html><div id="root">${html}</div>
<script>window.__DATA__=${serialize({ props, route: match.route, params: match.params })}</script>
<script type="module" src="/client.js"></script>`);
}).listen(3000);
```

**Do not skip `serialize`:** `JSON.stringify` into a `<script>` is the XSS from `react/security.md` §JSON — use `devalue` or escape `<` yourself. Building this by hand is how the lesson sticks.

## Step 3 — Hydration

```js
// framework/client.js
import { hydrateRoot } from 'react-dom/client';
const { props, route } = window.__DATA__;
const mod = await routeModules[route]();                    // a generated map of dynamic imports
hydrateRoot(document.getElementById('root'), <mod.default {...props} />);
```

Now break it on purpose: render `new Date().toLocaleTimeString()` in a page. Server HTML and client render disagree → hydration mismatch warning. You have just manufactured the `principles/performance.md` §hydration-mismatch bug and will never again wonder what causes it. Then note what your `routeModules` map did: **per-route code splitting fell out of the architecture** — the client only loads the matched route's module.

## Step 4 — Client-side navigation

Intercept link clicks; fetch the next route's data as JSON instead of HTML (add `?__data` handling to the server that returns `props` as JSON); swap the rendered component. You now have an SPA-after-first-load — and you'll immediately hit two real design problems Next solved: (1) scroll restoration, (2) the navigation race when a slow `?__data` response lands after the user clicked elsewhere — which is `principles/concurrency.md` §1, solved with AbortController on navigation. Implement the abort; it's five lines and it's the whole lesson.

## Step 5 — What real Next.js adds, mapped to what you built

| You built | Next.js has | The delta |
|---|---|---|
| Route table from glob | App Router conventions (layouts, loading, error files) | Nested layouts = route table entries compose a component *tree*, not one component |
| `loader` per page | RSC async components | Data fetching moves *into* components; serialization is a component tree, not a props blob |
| `renderToString` | Streaming `renderToPipeableStream` + Suspense | HTML flushes progressively; `nextjs/concurrency.md` §4's failure-timing consequences |
| `window.__DATA__` | RSC payload / Flight format | Same idea, componentized and streamable |
| Nothing | The four caches | The hard 20%; also the top pitfall source (`common-pitfalls.md` §1) |
| Nothing | Server Actions | RPC endpoints with serialization — and the security surface of `nextjs/security.md` §1 |

If you did steps 1–4, every row of that table reads as "oh, it's *that*, industrialized" — which is the point of the exercise.
