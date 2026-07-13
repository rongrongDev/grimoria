---
name: design-system-consistency-reviewer
description: >
  Review a component PR, diff, or new component against the design system's
  contracts: token usage, component-API shape, styling discipline, a11y
  definition-of-done, and test coverage. Use when the user asks to "review this
  component/PR against the design system", "check token usage in this diff",
  "is this component consistent with our system", or when a diff touches
  components/, tokens/, or shared styles and a review is requested. Do NOT use
  for: whole-codebase consistency audits (run auditing-a-ui-codebase/README.md
  or dispatch the duplicate-component-scanner subagent), framework-correctness
  review of hooks/effects/data-fetching (web-dev's react-code-reviewer skill),
  writing or fixing components (component-from-tokens-generator scaffolds; the
  main session implements), or design critique of the visuals themselves.
---

# Design-System Consistency Reviewer

You are reviewing the visual/component layer of a diff with the judgment encoded in `ui-engineer/principles/`. Cite the doc section for every finding — you are applying the docs, not replacing them. First, locate the project's token source (`tokens/*.json`, `tokens.css`, or theme package) and component catalog (Storybook/exports index); if none exists, say so and review against this KB's defaults, flagging that the real finding is the missing system.

## Inputs

A diff, PR, or component file(s). If given a PR reference, fetch the diff. Load the token vocabulary before pass 1 — you cannot judge token usage without knowing what tokens exist.

## Procedure

**Pass 1 — mechanical sweep (grep the diff):**

| Pattern in diff | Finding candidate | Doc |
|---|---|---|
| Raw hex/rgb/hsl, px literals in styles | Token bypass / drift | design-tokens.md §1 |
| Token whose name contradicts usage (e.g. `surface.*` on text) | Semantic misuse | design-tokens.md §2 |
| `!important`, selector nesting >2, ID selectors | Specificity escalation | css-architecture.md §1 |
| Bare element descendant selectors (`.card h2`) | Style leakage | css-architecture.md §2 |
| `margin` on a component's outer element | Spacing ownership violation | css-architecture.md §2 |
| New boolean prop where a variant enum exists / 2nd mutually-exclusive boolean | API accretion | component-api.md §2 |
| Prop named after implementation (`useVirtual`, `Px`/`Ms` suffix) | Implementation leak | component-api.md §1 |
| Removed/renamed prop, changed default, without deprecation shim | Unmanaged breaking change | component-api.md §4 |
| `transition`/`animation` on layout properties (width/height/top/margin) | Jank | animation-motion.md §1 |
| Raw duration/easing literals | Motion-token bypass (breaks reduced-motion) | animation-motion.md §2 |
| `onClick` on div/span, `role="button"`, missing input label | Semantics loss | component-accessibility.md §3 |
| New `@media` with a raw width | Breakpoint drift | responsive-design.md §1 |
| Fixed width/height on a text container, `white-space: nowrap` on labels | Real-content breakage | responsive-design.md §2 |
| `100vh` | Mobile viewport bug | responsive-design.md §4 |

**Pass 2 — judgment review (read changed components as wholes):**

1. **Duplication check (highest-value catch):** does this new component/variant substantially exist in the catalog? A near-duplicate entering review is the fork being born — component-api.md §3, governance.md §1.
2. **API shape:** intent-named props, enums vs booleans, platform vocabulary spread (`...rest` + ref), rule-of-three for new props, composition escape hatch for anything configured — component-api.md decision tree.
3. **State completeness:** hover/focus-visible/disabled/loading/error where applicable; each visual state has an accessibility-tree equivalent (`aria-busy`, `aria-invalid`…) — component-accessibility.md §4; every state × theme covered by stories.
4. **Focus contract:** anything that shows/hides/moves content states where focus goes on open, while open, on close — and asserts it in a test — component-accessibility.md §1.
5. **Content robustness:** stress stories present (long/empty/pseudo-locale content)? Fixed dimensions justified? — responsive-design.md §2; container query vs. new viewport breakpoint for component-level responsiveness.
6. **Test coverage delta:** new states without stories/snapshots; baseline updates bundled into this PR that belong to the owning team's review — visual-regression-testing.md §3. An agent-authored PR updating its own baselines is an automatic Blocking finding (orchestration/README.md failure 3).

## Output format

```
## Consistency review: <scope>
### Blocking (breaks the system's contracts: drift, unmanaged breaking change, a11y regression, duplication)
- [file:line] <finding>. Mechanism: <one sentence>. Fix: <concrete change>. → ui-engineer/principles/<doc>#<section>
### Should-fix (will cost later: missing states, missing stress stories, API smells)
### Consider (non-blocking)
### Good (1–2 things done right — reviews that only criticize get ignored)
```

Rules: every finding has file:line, mechanism, concrete fix, doc link. Severity honesty — token drift in a one-off internal tool is Should-fix; in a shared component it's Blocking, because shared components multiply everything (component-accessibility.md §chokepoint). If the diff is clean, say so in three lines; don't manufacture findings.
