# Svelte / SvelteKit — Security Delta

**Read first:** `principles/security.md`; server side inherits `frameworks/node/security.md`. **Applies to:** Svelte 5, SvelteKit 2. **Date:** 2026-07-06.

## Svelte client sinks

1. **`{@html …}`** — the raw-HTML hatch; same policy as every framework: one `<SafeHtml>` component with DOMPurify, grep expects one hit. Svelte escapes `{expr}` interpolation; `{@html}` is the opt-out.
2. **`href`/`src` from user data** — `javascript:` URLs; the `safeUrl` allowlist from `react/security.md` §2 verbatim.
3. **Spread attributes** `{...userObject}` on elements — attacker keys become event handlers/attributes.
4. **Actions/transitions touching `innerHTML`** in custom `use:` directives — vanilla DOM-XSS sinks; audit custom actions like refs.

## SvelteKit server side

- **The file boundary is the secret boundary:** `$env/static/private` / `$env/dynamic/private` refuse to compile into client code — *use them* rather than `process.env` (which doesn't protect you) so leaks become build errors, the `server-only` trick (`nextjs/security.md` §2) built into the framework. Same for `$lib/server/` — put db clients and secret-consuming modules there; SvelteKit hard-errors on client import.
- **Form actions & API routes are public endpoints:** Zod-validate FormData/bodies, authorize per action/route from `event.locals`, ownership-scope queries. `hooks.server.ts` *resolves* the session; it must not be the only enforcement (the middleware lesson, `nextjs/security.md` §3).
- **CSRF:** SvelteKit checks `Origin` on form actions by default (`checkOrigin`) — don't disable it to "fix" a webhook; give webhooks their own `+server.ts` route with signature verification instead. Cookie posture per principles doc (`HttpOnly; Secure; SameSite=Lax` via `event.cookies.set` defaults are sane).
- **`load` payload leaks:** server `load` returns serialize into the HTML (devalue — `</script>`-safe, so injection is handled; *content* is your problem). DTO-select; never return ORM entities. Read your rendered page source as an attacker once per feature — the Nuxt payload audit habit (`vue-nuxt/security.md`).
- **`event.fetch` forwards credentials** to same-origin (and configured) targets — a `load` that fetches a user-influenced URL is SSRF *with the user's cookies attached*; full principles-doc SSRF checklist plus that aggravator.
- **CSP:** configurable in `svelte.config.js` (`kit.csp`) with nonce/hash generation built in — cheapest nonce-CSP setup of the core frameworks; report-only first, per principles doc.

## Audit quick list (sveltekit additions for the security-auditor skill)

```
grep -rn "{@html" src/                          # expect 1 (SafeHtml)
grep -rn "process.env" src/ | grep -v server    # should be $env/*/private in server files
grep -rn "checkOrigin" svelte.config.*          # disabled? finding.
grep -rnE "export const (actions|GET|POST|PATCH|DELETE)" src/routes -l  # each: zod? authz? ownership?
grep -rnE "export (let|const).*(writable|\$state)\(" src/lib            # module-scope per-user state
```
