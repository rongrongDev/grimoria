# Glossary

Single source of terminology for every doc, skill, and subagent in this tree. If a doc uses a term differently than defined here, the doc is wrong — fix the doc.

**A11y** — Accessibility. Numeronym (a + 11 letters + y). See `principles/accessibility.md`.

**AbortController / AbortSignal** — Browser/Node standard for cooperative cancellation of async work. The *only* portable cancellation primitive; promises themselves cannot be cancelled.

**Contract test** — A test that verifies a consumer's expectations of a provider's API (shape, status codes, semantics) without running the two together end-to-end. Tools: Pact, or schema-based (OpenAPI + validation in CI).

**Core Web Vitals (CWV)** — Google's field metrics: LCP (Largest Contentful Paint, loading), INP (Interaction to Next Paint, responsiveness — replaced FID in 2024), CLS (Cumulative Layout Shift, visual stability).

**CSR / SSR / SSG / ISR** — Client-Side Rendering; Server-Side Rendering (HTML per request); Static Site Generation (HTML at build); Incremental Static Regeneration (static + revalidation, Next.js term).

**CSRF** — Cross-Site Request Forgery: a victim's browser is tricked into sending an authenticated state-changing request. Mitigated by SameSite cookies, origin checks, and anti-CSRF tokens.

**Dependency confusion** — Supply-chain attack where a public package shadows an internal package name, and a misconfigured resolver installs the attacker's version.

**Double-submit (UI)** — The same mutation fired twice because the UI allowed a second trigger before the first settled. Distinct from the "double-submit cookie" CSRF pattern; context disambiguates.

**Event loop starvation** — A long synchronous task (or a flood of microtasks) prevents the event loop from servicing I/O and timers. In Node this stalls *every* request on the process, not just the offending one.

**Flaky test** — A test whose pass/fail varies without code changes. Almost always an unhandled ordering assumption: time, network, shared state, or animation.

**Hydration** — Attaching client-side framework behavior to server-rendered HTML. **Hydration mismatch**: server HTML ≠ first client render, forcing re-render or corrupting the DOM.

**Idempotency key** — Client-generated unique token sent with a mutation so the server can deduplicate retries. The server-side fix for double-submits.

**Islands architecture** — Server-rendered page with isolated interactive components ("islands") hydrated independently (Astro's model).

**Last-write-wins (race)** — Out-of-order async responses where the *stale* response resolves last and overwrites fresh state. The classic search-typeahead bug.

**Mutation score** — Percentage of injected code mutations killed by the test suite (tool: Stryker Mutator). Measures test *strength*, unlike line coverage which measures test *reach*.

**Optimistic UI** — Applying a mutation's expected result to the UI before the server confirms, with rollback on failure. Trades consistency risk for perceived speed.

**Prototype pollution** — Injecting properties onto `Object.prototype` (typically via unsafe deep-merge of user input using `__proto__` keys), corrupting behavior process-wide.

**RSC (React Server Components)** — Components that execute only on the server and stream a serialized tree to the client; they never re-render client-side and cannot use state or effects.

**Runes** — Svelte 5's explicit reactivity primitives (`$state`, `$derived`, `$effect`), replacing Svelte 3/4's compiler-implicit reactivity.

**SSRF** — Server-Side Request Forgery: the server is induced to make requests to attacker-chosen URLs (often internal — cloud metadata endpoints, admin services).

**Stale closure** — A callback capturing variables from an earlier render/scope, so it reads outdated values when it finally runs. The root cause of a large fraction of React hook bugs.

**TanStack Query** — Async server-state cache for React/Vue/Solid/Svelte (formerly React Query). Referenced throughout as the default answer to hand-rolled fetch state.

**Test pyramid / trophy** — Distribution heuristics for test suites. Pyramid: many unit, fewer integration, fewest e2e. Trophy (Dodds): weight integration heaviest. This KB's stance is in `principles/testing.md`.

**Waterfall (network)** — Sequential dependent requests where each awaits the previous unnecessarily. Detection and fixes in `principles/performance.md` and `principles/async-patterns.md`.

**XSS** — Cross-Site Scripting: attacker-controlled content executes as script in a victim's page. Variants: stored, reflected, DOM-based. See `principles/security.md`.

**Zod** — Runtime schema validation library for TypeScript; referenced as the default for validating untrusted input at boundaries.
