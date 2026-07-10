# Node Backend From Scratch — Build an Express-Style Framework

**Applies to the concepts behind:** Express 5, Fastify 5, Hono 4 on Node 22/24. **Date:** 2026-07-06.
**Format:** complete and followable — router, middleware chain, error handling, body parsing; plus tests. ~120 lines of framework. After this, "middleware" stops being a magic word, and the classic Express failure modes (swallowed async errors, next()-called-twice, ordering bugs) become things you can *see*.

## The core insight

A web framework is a **function composition machine**: it turns (method, path, [f1, f2, f3]) registrations into one `handle(req, res)` function. Everything — auth, logging, body parsing, routing itself — is the same shape: `(req, res, next) => void`. The framework's whole job is calling them in order, stopping when one responds, and catching what they throw.

## Step 1 — the server shell

```js
// mini-express.js
import { createServer } from 'node:http';

export function createApp() {
  const stack = [];                                  // [{ method, pattern, keys, handlers }]

  const app = {
    use(fn) { stack.push({ method: null, pattern: null, handlers: [fn] }); return app; },
    listen(port, cb) { return createServer(app.handle).listen(port, cb); },
    handle: (req, res) => runStack(stack, req, res),
  };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    app[method] = (path, ...handlers) => {
      stack.push({ method: method.toUpperCase(), ...compilePath(path), handlers });
      return app;
    };
  }
  return app;
}
```

## Step 2 — path compilation (`/users/:id` → regex + keys)

```js
function compilePath(path) {
  const keys = [];
  const pattern = new RegExp('^' +
    path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  return { pattern, keys };
}
```

## Step 3 — the middleware chain (the heart — read this one slowly)

```js
function runStack(stack, req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  req.path = url.pathname;
  req.query = Object.fromEntries(url.searchParams);
  let i = 0;

  function next(err) {
    if (res.writableEnded) return;                   // someone already responded; stop
    const layer = stack[i++];
    if (!layer) {                                    // ran off the end
      res.statusCode = err ? 500 : 404;
      return res.end(err ? 'Internal Server Error' : 'Not Found');
    }
    if (err) {                                       // error mode: skip to error handlers (arity 4)
      const h = layer.handlers[0];
      if (h.length === 4) {
        try { return h(err, req, res, next); } catch (e) { return next(e); }
      }
      return next(err);
    }
    if (layer.method && layer.method !== req.method) return next();
    if (layer.pattern) {
      const m = layer.pattern.exec(req.path);
      if (!m) return next();
      req.params = Object.fromEntries(layer.keys.map((k, j) => [k, decodeURIComponent(m[j + 1])]));
    }
    dispatch(layer.handlers, req, res, next);
  }

  function dispatch(handlers, req, res, done) {      // run a route's handlers in sequence
    let j = 0;
    function inner(err) {
      if (err || j >= handlers.length) return done(err);
      const h = handlers[j++];
      try {
        const out = h(req, res, inner);
        if (out?.catch) out.catch(inner);            // ← async handlers: rejections -> error chain
      } catch (e) { inner(e); }
    }
    inner();
  }

  next();
}
```

Four framework-defining decisions just happened; each explains a real-world scar:

1. **`next(err)` switches the chain into error mode**, skipping normal layers until an arity-4 handler. Express's actual design — and why your error middleware must have exactly four parameters or it's silently never called (a real bug in most Express codebases at some point).
2. **The `out?.catch(inner)` line is the difference between Express 4 and 5.** Express 4 doesn't await returned promises: an async handler that throws after you forgot try/catch **hangs the request forever** (client timeout, no log). A decade of `express-async-errors` monkey patches exists because of the absence of this one line. Delete it from your build and write the test that hangs — that's the lesson.
3. **`res.writableEnded` guard**: calling `next()` after responding (or twice) otherwise double-executes downstream layers — the "headers already sent" crash and the subtler double-side-effect bug.
4. **Ordering is the API.** `use` and routes execute in registration order: auth before routes, error handler last, 404 second-to-last. Every "my middleware doesn't run" ticket is an ordering misunderstanding; you just built why.

## Step 4 — body parsing as middleware (and the limits that matter)

```js
export function json({ limit = 1_000_000 } = {}) {
  return async (req, res, next) => {
    if (!/^application\/json/.test(req.headers['content-type'] ?? '')) return next();
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) { res.statusCode = 413; return res.end('Payload Too Large'); }
      chunks.push(chunk);
    }
    try { req.body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } 
    catch { res.statusCode = 400; return res.end('Invalid JSON'); }
    next();
  };
}
```

The size cap isn't an optimization — an uncapped body buffer is a one-request memory DoS (`principles/security.md`; `node/concurrency.md` §event-loop). You just built why every framework has a `limit` option and why it must not be raised casually.

## Step 5 — tests (Vitest + real HTTP)

```js
import { describe, it, expect } from 'vitest';
import { createApp, json } from './mini-express.js';

async function request(app, method, path, body) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method, body: body && JSON.stringify(body),
      headers: body && { 'content-type': 'application/json' },
    });
    return { status: res.status, text: await res.text() };
  } finally { server.close(); }
}

describe('mini-express', () => {
  it('routes with params', async () => {
    const app = createApp().get('/users/:id', (req, res) => res.end(`user ${req.params.id}`));
    expect(await request(app, 'GET', '/users/42')).toMatchObject({ status: 200, text: 'user 42' });
  });

  it('404s unmatched, runs middleware in order', async () => {
    const order = [];
    const app = createApp()
      .use((req, res, next) => { order.push('a'); next(); })
      .use((req, res, next) => { order.push('b'); next(); });
    expect((await request(app, 'GET', '/nope')).status).toBe(404);
    expect(order).toEqual(['a', 'b']);
  });

  it('async rejection reaches the arity-4 error handler (the Express-5 line)', async () => {
    const app = createApp()
      .get('/boom', async () => { throw new Error('kaboom'); })
      .use((err, req, res, next) => { res.statusCode = 500; res.end(`caught:${err.message}`); });
    expect(await request(app, 'GET', '/boom')).toMatchObject({ status: 500, text: 'caught:kaboom' });
  });

  it('parses JSON and rejects oversized bodies', async () => {
    const app = createApp().use(json({ limit: 10 }))
      .post('/echo', (req, res) => res.end(JSON.stringify(req.body)));
    expect(await request(app, 'POST', '/echo', { a: 1 })).toMatchObject({ text: '{"a":1}' });
    expect((await request(app, 'POST', '/echo', { padding: 'x'.repeat(100) })).status).toBe(413);
  });
});
```

## Step 6 — what the real frameworks add

- **Express 5:** this, plus routers-as-subapps, content negotiation, and the ecosystem. Its costs: regex-era routing (slower), middleware-mutates-`req` typing pain.
- **Fastify 5:** replaces the linear `stack` scan with a radix-tree router (O(path length), not O(routes)); replaces "mutate req and hope" with **schema-declared routes** (JSON-schema validation + serialization compiled to fast functions) and a plugin system with *encapsulation* (a plugin's decorators/hooks scope to its subtree — the fix for Express's "every middleware sees everything" globalism).
- **Hono 4:** the same machine built Web-standard-native (`Request`/`Response` instead of Node's req/res) so one codebase runs on Node, Bun, workers, and edge runtimes. Middleware signature `(c, next)` with async/await from birth — no arity-4 archaeology.

Pick with `frameworks/node/production-patterns.md`; the machine you just built is inside all three.
