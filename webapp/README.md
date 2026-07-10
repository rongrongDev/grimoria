# Principal Skills — Web App

A static, searchable web app for browsing the 17 role knowledge bases in this repo.
Built with [Astro](https://astro.build) + [Pagefind](https://pagefind.app). The app
reads the markdown **directly from the role folders at the repo root** — no copying,
no restructuring; edit a doc and the site picks it up.

## Run it

```bash
cd webapp
npm install
npm run dev        # dev server at http://localhost:4321 (search disabled in dev)
```

Full-text search requires the static index, which is generated at build time:

```bash
npm run build      # astro build + pagefind index
npm run preview    # serve dist/ locally
```

## How it maps the repo

- Only the 17 role folders listed in `src/lib/roles.mjs` are included; stray files
  at the repo root are ignored.
- `README.md` files become folder index pages (`/game-dev/`, `/game-dev/engines/unity/`).
- `skills/<name>/SKILL.md` becomes `/role/skills/<name>/`, with its YAML frontmatter
  rendered as a header card. Agent docs get the same card (description, model, tools).
- Relative `*.md` cross-references inside the docs are rewritten to site routes at
  build time (`src/plugins/remark-rewrite-links.mjs`).
- `GLOSSARY.md`, `CHANGELOG.md`, and `DESIGN*.md` appear under "Reference" in each
  role's sidebar.

## Deploy

`npm run build` produces a fully static `dist/` — deployable as-is to GitHub Pages,
Netlify, Vercel, or Cloudflare Pages. Make sure the build command on the host is
`npm run build` (it must run Pagefind after Astro or search will be empty).
