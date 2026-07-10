# Changelog

Track every addition/revision here, with the framework versions the content was validated against. Newest first.

## 2026-07-06 — Initial release (v1.0)

Full initial authoring of the knowledge base.

- **Root:** `README.md`, `DESIGN.md`, `GLOSSARY.md`, `CHANGELOG.md`.
- **Principles (full depth):** testing, security, concurrency, async-patterns, performance, accessibility.
- **Core-tier frameworks (6 docs each):**
  - React — validated against React 19.x
  - Next.js — validated against Next.js 15 / 16, App Router
  - Vue/Nuxt — validated against Vue 3.5+, Nuxt 3.x–4
  - Svelte/SvelteKit — validated against Svelte 5 (runes), SvelteKit 2
  - Node.js — validated against Node 22 LTS / 24; Express 5, Fastify 5, Hono 4
- **Extended-tier frameworks (production-patterns + common-pitfalls):**
  - Angular (19–20), Solid (1.9), Astro (5.x), React Router v7 framework mode (Remix successor)
- **Capabilities:** `frameworks/react/from-scratch.md` (fully followable, with tests); `analyzing-existing-projects/README.md` (bounded-time audit playbook).
- **Skills:** `react-code-reviewer`, `security-auditor` (new). `test-strategy-planner` pre-existed (owned by the sibling `quality-dev/` KB) — web-dev references it rather than duplicating; see `DESIGN.md`.
- **Subagents:** `legacy-project-onboarder`, `dependency-security-scanner` (both read-only allowlists).
- **Orchestration:** `orchestration/README.md` — multi-agent patterns for web-dev work.

### Revision policy

- When a covered framework ships a new **major**, re-validate that framework's directory, update version stamps, and log here what changed vs. what merely re-validated.
- Advice found to be wrong gets **corrected in place** and logged here — never leave a known-wrong doc standing because "the changelog notes it."
