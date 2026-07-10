# React — Security Delta

**Read first:** `principles/security.md` (the full catalog and mental model). This doc: React-specific sinks and defaults only. **Applies to:** React 19.x client-side; server-integrated concerns in `frameworks/nextjs/security.md`. **Date:** 2026-07-06.
**Operationalized by:** the `security-auditor` skill.

## What React gives you for free — and exactly where the free lunch ends

JSX interpolation escapes text: `<div>{userInput}</div>` is XSS-safe. The escape hatches, in observed-exploit order:

1. **`dangerouslySetInnerHTML`** — the primary sink. Grep for it; every instance needs a provenance story. Rule: raw HTML renders only through one shared component that sanitizes:

```tsx
import DOMPurify from 'dompurify';
export function SafeHtml({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}
```

Review then reduces to "grep `dangerouslySetInnerHTML`, expect exactly one hit." Markdown renderers count: `marked`/`markdown-it` output is *not* sanitized by default — pipe through DOMPurify regardless.

2. **URL props: `href`, `src`, `formAction`, `poster`.** `<a href={userLink}>` executes `javascript:alert(1)` on click — JSX does not validate protocols (React 19 warns; warning ≠ blocking). Validate against an allowlist:

```ts
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
export function safeUrl(raw: string): string | null {
  try { return SAFE_PROTOCOLS.has(new URL(raw, location.origin).protocol) ? raw : null; }
  catch { return null; }
}
```

3. **Spread props from untrusted data:** `<a {...userProvidedObject}>` lets attacker-controlled keys set `href`, `dangerouslySetInnerHTML`, event handlers. Never spread parsed JSON into JSX.
4. **Direct DOM writes in refs/effects:** `ref.current.innerHTML = …`, `document.write` — JSX's escaping doesn't apply; these are vanilla DOM-XSS sinks (principles doc).
5. **Third-party HTML-rendering components** (chart tooltips with `html:` options, rich text editors, iframe embeds) — audit their sanitization posture; assume none.

## JSON/state injection

- `JSON.parse(untrusted)` then straight into state then into a spread or an `href` — combine the boundaries: validate with Zod at parse time (`principles/security.md` §prototype pollution — `{"__proto__":…}` payloads arrive through the same door).
- SSR bootstrapping data into `<script>window.__STATE__=…</script>`: `</script>` inside a string breaks out of the tag. Serialize with a hardened serializer that escapes `<` and the U+2028/U+2029 line separators (e.g. `devalue`) — frameworks do this correctly; hand-rolled hydration scripts almost never do. If you wrote `JSON.stringify` into a script tag, you have this bug.

## Client-side auth reality check

- **Anything in the bundle is public**: env vars prefixed `VITE_`/`NEXT_PUBLIC_`, feature flags, "hidden" admin routes, source maps. Grep your `dist/` for secrets as a CI step (gitleaks works on build output too).
- **Route guards and conditional rendering are UX, not security.** `{isAdmin && <DeleteButton/>}` must be backed by server-side authorization on the mutation — the principles doc's broken-access-control section is 90% of real-world severity, and React apps fail it by trusting the guard component.
- **Token storage:** `HttpOnly` cookie sessions > localStorage JWTs for first-party apps. localStorage is readable by any XSS'd script; one missed sink in §1 converts to full account takeover. (Full argument: principles doc §secrets.)

## CSP with React

Nonce-based CSP (`script-src 'nonce-…' 'strict-dynamic'`) works cleanly with Vite/Next builds; the pain points are inline styles from CSS-in-JS runtimes (prefer build-time extraction: vanilla-extract, Tailwind, CSS Modules) and third-party tags. Ship CSP in report-only first, watch a week of reports, then enforce — teams that skip straight to enforce roll it back within a day and never try again.

## Audit quick list (what the security-auditor skill runs for React)

```
grep -rn "dangerouslySetInnerHTML" src/         # expect: 1 hit, the SafeHtml component
grep -rn "javascript:" src/                     # plus any href={ built from data
grep -rnE "innerHTML|outerHTML|document\.write" src/
grep -rn "localStorage" src/ | grep -iE "token|jwt|secret"
grep -rnE "VITE_|NEXT_PUBLIC_" .env* | # eyeball: nothing secret behind a public prefix
```

Then the non-greppable half: for each mutation the UI can trigger, find the server-side authorization check (principles doc, wrong-user test).
