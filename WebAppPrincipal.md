# WebAppPrincipal — Plan for the Principal Skill Web App

**Date:** 2026-07-08 · **Status: BUILT** (2026-07-09, in `webapp/` — see "Implementation notes" at the end)
**Verdict:** Yes — very feasible. The repo is ~504 pure-markdown files (~525k words) organized into 17 role folders with a consistent internal structure. No backend or database is needed; a static site generated from the markdown is the right architecture.

## What the app is

A browsable, searchable knowledge-base site for the 17 principal-level role libraries
(`ai-engineer`, `pentest-engineer`, `game-dev`, `ios-dev`, `backend-dev`, …).
Scope is **folders only** — scattered files at the repo root are ignored.

## Content model (derived from the folder structure)

Each role folder follows the same shape, so the app can treat it as a schema:

| Piece | Source | Notes |
|---|---|---|
| Role | top-level folder (17 of them) | `README.md` becomes the role's landing page |
| Principles | `principles/*.md` | core-principles, decision-trees |
| Guides | `guides/*.md` | step-by-step "build X from zero" docs |
| Topics | `topics/*.md` — or `stacks/`, `engines/`, `frameworks/` | category label varies per role; normalize to "Topics" with the original name shown |
| Skills | `skills/<name>/SKILL.md` | YAML frontmatter (`name`, `description`) — parse it for cards/search |
| Agents | `agents/*.md` | subagent definitions |
| Extended | `extended/*.md` (some roles) | deep-dive docs |
| Glossary / Changelog | `GLOSSARY.md`, `CHANGELOG.md` per role | secondary tabs on the role page |

## Tech stack (recommendation)

- **Astro** with content collections — built for exactly this: markdown in, static HTML out, near-zero JS by default.
- **Pagefind** for full-text search — static index built at deploy time, no server.
- **Shiki** (built into Astro) for code-block highlighting; GFM tables supported out of the box.
- Content is read **directly from the existing folders** via a glob loader — no copying or restructuring the repo; the site rebuilds when the markdown changes.
- Deploy as static output to GitHub Pages / Vercel / Netlify / Cloudflare Pages.

## Routes

```
/                          → home: grid of 17 role cards (name, doc counts, description from README)
/[role]/                   → role landing page (rendered README + sidebar nav)
/[role]/[category]/[slug]  → any doc (topic, guide, principle, agent, extended)
/[role]/skills/[name]      → skill page rendered from SKILL.md (frontmatter shown as a header card)
/[role]/glossary, /[role]/changelog
/search                    → cross-role full-text search
```

## Key features

1. **Home grid** — 17 role cards grouped loosely (AI/ML, Security/Red-team, Platform dev, Quality/Data), each showing counts of topics/guides/skills/agents.
2. **Role sidebar** — persistent left nav per role: Principles, Guides, Topics, Skills, Agents, Extended, Glossary, Changelog.
3. **Markdown rendering** — headings with anchor links, table-of-contents rail on the right, GFM tables, syntax-highlighted code.
4. **Internal link rewriting** — the docs cross-reference each other with relative paths like `topics/rag.md` and `` `principles/decision-trees.md` ``; a build step rewrites `*.md` links to site routes so navigation works.
5. **Search** — Pagefind index across all roles, filterable by role and category.
6. **Skill/agent frontmatter cards** — parse the YAML `description` (which encodes when-to-use / when-not-to-use) into a styled header.
7. **Dark mode + responsive layout** — reading-focused typography; these are long-form docs.

## Build steps

1. Scaffold Astro project in a `webapp/` subfolder; configure a content collection with a glob loader pointed at the repo root, matching only the 18 role folders (explicit allowlist so root-level stray files are excluded).
2. Loader logic: classify each file by `role/category/slug`; special-case `skills/*/SKILL.md`, per-role `README/GLOSSARY/CHANGELOG`; normalize `stacks|engines|frameworks → topics` (keep original label for display).
3. Layouts: home grid, role layout with sidebar, doc layout with TOC.
4. Markdown pipeline: remark plugin to rewrite relative `.md` links to routes; frontmatter parsing for skills/agents.
5. Wire up Pagefind post-build; add role/category filters.
6. Polish: dark mode, mobile nav, 404, favicons.
7. Deploy config (static adapter) + a short README for running locally (`npm run dev`).

**Estimated effort:** the whole thing is a single session of work — roughly steps 1–3 to get a working browsable site, 4–5 for search and link fidelity, 6–7 polish.

## Explicitly out of scope

- Root-level scattered markdown files (per instruction)
- Editing content through the web app (read-only viewer)
- Any server/database/auth

## Implementation notes (2026-07-09)

Built as planned in `webapp/` (Astro 5 + Pagefind). Deviations discovered during implementation:

1. **17 roles, not 18** — the plan's original count was off by one.
2. **Categories can nest one level deeper than planned**: `game-dev/engines/unity/*.md`,
   `security-dev/topics/injection/*.md`, `test-automation-engineer/frameworks/playwright/*.md`, etc.,
   each with a `README.md` index. The content model treats any `README.md` as its folder's
   index page and handles arbitrary nesting; sidebars show these as sub-groups.
3. **11 source files had invalid YAML frontmatter** (unquoted `": "` inside long `description:`
   values — mostly `agents/*.md` plus three `SKILL.md`s). Fixed in the source files by converting
   to folded block scalars (`description: >-`), which preserves the exact string value. These
   would also have broken any strict-YAML consumer, including Claude Code's own frontmatter parsing.
4. **Pagefind filters must live on separate elements** — comma-separated
   `data-pagefind-filter="role:X, category:Y"` silently merges into one filter value.
5. Build verified: 490 pages, 487 indexed for search, ~33k internal links all resolving,
   role/category search filters working, dark mode, mobile nav.

Run it: `cd webapp && npm install && npm run build && npm run preview`
(dev server: `npm run dev` — search only works in the built site).
