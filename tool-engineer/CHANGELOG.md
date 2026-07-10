# CHANGELOG — tool-engineer

Revision protocol: every content change lands here with a date and the tool/framework versions it was verified against. Principles docs (`principles/`, `orchestration/`, `guides/`) are framework-agnostic and rot slowly; `reference/` and `extended/` docs are version-sensitive and must be re-verified (or at least re-dated with a note) when their pinned versions fall a major behind. Undated advice is folklore — if you touch a doc, update its `Last verified:` header *and* this file.

## 2026-07-06 — Initial release (full KB)

Authored the complete knowledge base: design note, 6 core-tier principles docs, 2 reference docs, 4 extended-tier docs, 2 end-to-end guides, orchestration doc, glossary, and 4 callables (2 skills, 2 subagents in `.claude/`).

**Verified against:**

| Tool / framework | Version(s) | Used in |
|---|---|---|
| Python | 3.11–3.13 | `reference/click-typer.md`, `guides/build-a-cli-from-scratch.md` |
| Click | 8.1–8.2 | `reference/click-typer.md` |
| Typer | 0.12–0.16 | `reference/click-typer.md`, build guide |
| uv | 0.7.x-era | build guide (packaging path) |
| ESLint (flat config) | 9.x | `reference/eslint-custom-rules.md` |
| typescript-eslint | 8.x | `reference/eslint-custom-rules.md` |
| Node | 20/22 LTS | reference + extended docs |
| VS Code extension API | engine ^1.9x (2025–2026) | `extended/ide-extensions.md` |
| IntelliJ Platform | 2024.x–2025.x | `extended/ide-extensions.md` |
| Bazel | 7–8 | `extended/monorepo-build-tooling.md` |
| Nx | 20–21 | `extended/monorepo-build-tooling.md` |
| TypeDoc / Sphinx / MkDocs / Docusaurus | 0.26+ / 7–8 / 1.6 / 3 | `extended/docs-generation.md` |

**Known gaps (deliberate, for the next maintainer):**
- CLI framework depth is Python-family only by design (see `DESIGN.md`); a Node (commander/oclif) reference doc is the first candidate addition if the org's tooling shifts Node-first.
- `extended/` docs are patterns+pitfalls by contract — resist deepening them unless the org's exposure grows; deepen by promoting a topic into `principles/`+`reference/` instead.
- No `.claude/commands/` — nothing has earned trivial-command status; default new callables to Skills per `DESIGN.md`.

## Template for future entries

```
## YYYY-MM-DD — <summary>
- <doc path>: <what changed and why — cite the incident/version change that motivated it>
- Re-verified: <tool> <old range> → <new range>
```
