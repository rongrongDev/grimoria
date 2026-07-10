# Vue / Nuxt — Security Delta

**Read first:** `principles/security.md`. Client-sink reasoning parallels `react/security.md` — same catalog, Vue spellings. Server side (Nitro) inherits `frameworks/node/security.md` wholesale. **Applies to:** Vue 3.5+, Nuxt 3.x–4. **Date:** 2026-07-06.

## Vue client sinks

1. **`v-html`** — the `dangerouslySetInnerHTML` equivalent, same policy: exactly one `<SafeHtml>` component wrapping DOMPurify; grep expects one hit. Markdown pipelines included (`marked` output is unsanitized).
2. **Dynamic attribute bindings from user data:** `:href="userLink"` executes `javascript:` on click — validate protocol allowlist (`react/security.md` §2's `safeUrl` works verbatim). `v-bind="userObject"` spread is the React spread-props hole: attacker keys become `onclick`, `src`, anything.
3. **Dynamic component by user string:** `<component :is="fromQuery">` — component-injection primitive; resolve through an explicit allowlist map, never raw input.
4. **Refs + direct DOM writes** (`el.innerHTML = …`) and **runtime template compilation** (`new Function`-built templates, `vue` full build compiling user-supplied template strings — that's XSS *by design*; only compile trusted templates).

## Nuxt/server side

- **`server/api` handlers are the Node backend:** Zod via `readValidatedBody`/`getValidatedQuery`, per-handler authorization, ownership-scoped queries, rate limits — the whole `frameworks/node/security.md` checklist, no exemptions because "it's just a Nuxt route."
- **Payload leaks:** `useAsyncData` return values serialize into the page (view-source). DTO-select server-side — the Next taint-API discussion (`nextjs/security.md` §2) has no Nuxt equivalent yet, so the *discipline* (select fields explicitly, never return ORM entities) carries the whole load. Audit: open `_payload.json` for your top routes and read it as an attacker.
- **Config split:** `runtimeConfig` (server) vs `runtimeConfig.public` (bundled, forever public) — same audit as `NEXT_PUBLIC_`: grep `public:` blocks for anything secret. `.env` in the repo root is read at build; CI secret scanning per principles doc.
- **Route middleware ≠ authorization** — Next's CVE lesson (`nextjs/security.md` §3) applies architecturally: Nuxt route middleware runs client-side on SPA navigations, so it's *trivially* bypassable; it's UX only. Authorization lives in the server handler.
- **SSR serialization:** Nuxt's devalue-based payload serializer handles the `</script>` escape correctly — the hole reopens with hand-rolled `<script>` injection via `useHead({ script: [{ innerHTML: … }] })` fed user data. Grep `innerHTML` in head config.
- **SSRF surface:** Nitro server routes that proxy/fetch user URLs (og-image generators are the recurring Nuxt case) — full principles-doc SSRF checklist.

## Audit quick list (vue/nuxt additions for the security-auditor skill)

```
grep -rn "v-html" app/ components/ pages/          # expect 1 (SafeHtml)
grep -rnE ':href="|:src="' --include='*.vue' | grep -v "^\s*//" # trace user-derived ones
grep -rn "component :is\|<component" --include='*.vue'
grep -rn "public:" nuxt.config.*                    # secrets behind public config?
grep -rn "innerHTML" app.config.* nuxt.config.* composables/ server/
# then: node/security.md checklist over server/
```
