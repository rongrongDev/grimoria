<p align="center">
  <img src="webapp/public/grimoria.webp" alt="Grimoria" width="200">
</p>

# Grimoria

A library of principal-level engineering knowledge bases — one "grimoire" per role — written as if a retiring principal engineer encoded 20+ years of judgment for the humans and AI models who come after them. Each role folder is a self-contained knowledge base with principles, step-by-step guides, stack references, and Claude Code skills/subagents.

## The roles

| Role | Folder |
| --- | --- |
| AI Agent Red Teamer | [`ai-agent-red-teamer/`](ai-agent-red-teamer/) |
| AI Engineer | [`ai-engineer/`](ai-engineer/) |
| AI Eval Engineer | [`ai-eval-engineer/`](ai-eval-engineer/) |
| AI Model Red Teamer | [`ai-model-red-teamer/`](ai-model-red-teamer/) |
| Android Developer | [`android-dev/`](android-dev/) |
| Backend Developer | [`backend-dev/`](backend-dev/) |
| Data Analyst | [`data-analyst/`](data-analyst/) |
| Data Engineer | [`data-engineer/`](data-engineer/) |
| Game Developer | [`game-dev/`](game-dev/) |
| iOS Developer | [`ios-dev/`](ios-dev/) |
| ML Engineer | [`ml-engineer/`](ml-engineer/) |
| Pentest Engineer | [`pentest-engineer/`](pentest-engineer/) |
| Quality Developer | [`quality-dev/`](quality-dev/) |
| Security Developer | [`security-dev/`](security-dev/) |
| Test Automation Engineer | [`test-automation-engineer/`](test-automation-engineer/) |
| Test Data & Environment Engineer | [`test-data-environment-engineer/`](test-data-environment-engineer/) |
| Tool Engineer | [`tool-engineer/`](tool-engineer/) |
| Web Developer | [`web-dev/`](web-dev/) |

Each knowledge base follows the same shape:

- **`README.md`** — the role's landing page and "find what you need in 30 seconds" map
- **`principles/`** — core judgment: architecture tradeoffs, decision trees, war stories
- **`guides/`** — step-by-step "build X from zero" and "assess the unfamiliar" walkthroughs
- **`stacks/`** — technology-specific references
- **`skills/` and `agents/`** — Claude Code skills and subagents for repeatable capabilities
- **`GLOSSARY.md`**, **`DESIGN-NOTES.md`**, **`CHANGELOG.md`** — terminology, maintenance rules, revision history

The `<role>.md` files at the repo root (e.g. [`backend-dev.md`](backend-dev.md)) are the master prompts used to generate and maintain each knowledge base.

## Browse it as a website

[`webapp/`](webapp/) is a static, searchable site (Astro + Pagefind) that renders the knowledge bases directly from the role folders — no copying, no restructuring.

```bash
cd webapp
npm install
npm run dev        # http://localhost:4321 (search disabled in dev)
npm run build      # full build with search index
```

See [`webapp/README.md`](webapp/README.md) for details and [`WebAppPrincipal.md`](WebAppPrincipal.md) for the design plan.

## Using with Claude Code

The skills and subagents inside each role folder are written for Claude Code. Point Claude at a role's `README.md` to load its map, or copy a role's `skills/` and `agents/` content into your project's `.claude/` directory to invoke them directly.
