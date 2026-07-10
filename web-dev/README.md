# web-dev — A Principal Engineer's Exit Brief

**What this is:** 20+ years of full-stack web judgment, encoded for humans (junior → staff) and AI models (Haiku → Opus) to use without the author in the room. Every doc stands alone; every skill and subagent is invokable; every claim is backed by a failure mode, not vibes.

**Last full revision:** 2026-07-06. Check `CHANGELOG.md` for what moved since.

## Find what you need in 30 seconds

| You are trying to... | Go to |
|---|---|
| Understand how this KB is organized (and extend it correctly) | `DESIGN.md` |
| Look up a term used anywhere in here | `GLOSSARY.md` |
| Decide what/how to test a feature | `principles/testing.md` → then `frameworks/<x>/testing.md` |
| Reason about or review security | `principles/security.md` → framework `security.md` → or invoke the `security-auditor` skill |
| Debug a race condition, stale state, double-submit | `principles/concurrency.md` → framework `concurrency.md` |
| Compose/cancel/retry async work, stream responses | `principles/async-patterns.md` |
| Fix slow pages (CWV, bundles, hydration) | `principles/performance.md` |
| Build accessibly (design-time, not audit-time) | `principles/accessibility.md` |
| Learn how a framework actually works by building its core | `frameworks/<x>/from-scratch.md` (React's is fully followable) |
| Ship production code in a framework | `frameworks/<x>/production-patterns.md` |
| Avoid a framework's known traps | `frameworks/<x>/common-pitfalls.md` |
| Audit an unfamiliar repo (architecture, risks, remediation plan) | `analyzing-existing-projects/README.md` — or dispatch the `legacy-project-onboarder` subagent |
| Review a React diff/PR | invoke the `react-code-reviewer` skill |
| Plan a test strategy for a feature | invoke the `test-strategy-planner` skill |
| Audit dependencies for supply-chain risk | dispatch the `dependency-security-scanner` subagent |
| Run multiple AI agents on web-dev work without them colliding | `orchestration/README.md` |

## Framework coverage

**Core tier** (full depth: from-scratch, production-patterns, testing, security, concurrency, common-pitfalls):

| Framework | Versions covered | Directory |
|---|---|---|
| React | 19.x | `frameworks/react/` |
| Next.js | 15–16, App Router | `frameworks/nextjs/` |
| Vue / Nuxt | Vue 3.5+, Nuxt 3.x–4 | `frameworks/vue-nuxt/` |
| Svelte / SvelteKit | Svelte 5 (runes), SvelteKit 2 | `frameworks/svelte-sveltekit/` |
| Node.js backends | Node 22 LTS / 24; Express 5, Fastify 5, Hono 4 | `frameworks/node/` |

**Extended tier** (production-patterns + common-pitfalls only):

| Framework | Versions covered | Directory |
|---|---|---|
| Angular | 19–20 | `frameworks/angular/` |
| Solid | 1.9 | `frameworks/solid/` |
| Astro | 5.x | `frameworks/astro/` |
| Remix / React Router | React Router v7 (framework mode) | `frameworks/remix-react-router/` |

## How to read a framework directory

1. `production-patterns.md` — what to actually do. Start here if you're shipping today.
2. `common-pitfalls.md` — what will page you at 3am. Read before your first PR.
3. `testing.md`, `security.md`, `concurrency.md` — framework **deltas** on the corresponding `principles/` doc. Read the principles doc first; the delta assumes it.
4. `from-scratch.md` — build the framework's core mechanism yourself. Read when you want the mental model that makes everything else obvious.

## Rules for AI models using this KB

- Each doc is self-sufficient given itself + its direct links. Don't load the whole tree.
- Skills (`.claude/skills/`) fire on the situations named in their `description`; they cite the docs they apply. Don't invoke a skill to *learn* — read the doc. Don't read 50 files to *audit* — dispatch the subagent.
- Advice is version-stamped. If the project you're working on uses an older major version than the stamp, treat the doc as directional, verify against that version's docs, and say so.
