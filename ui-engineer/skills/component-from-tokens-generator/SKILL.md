---
name: component-from-tokens-generator
description: >
  Scaffold a new design-system component from the project's token vocabulary and
  established patterns: token-consuming styles, intent-named prop API, full state
  coverage, a11y baseline (semantics, focus contract, state parity), and stories
  including stress cases. Use when the user asks to "create/scaffold a new
  <Button/Card/Select…> for the design system", "generate a component from our
  tokens", or "add a component following our patterns". Do NOT use for: one-off
  feature UI that isn't entering the shared system (just write it, using system
  components), reviewing an existing component (design-system-consistency-reviewer
  skill), building the token pipeline or first components of a brand-new system
  (follow building-a-design-system/README.md — this skill assumes that
  foundation exists), or fixing bugs in existing components.
---

# Component-from-Tokens Generator

You are scaffolding a component that will be consumed by teams you'll never meet, for years. The scaffold's job is to make the correct patterns the path of least resistance — everything below is the operational form of `ui-engineer/principles/` (linked per step; read the section when judgment is needed, don't guess).

## Inputs

The component name and purpose; the project's token source (`tokens/*.json` or `tokens.css`) and an existing system component to match conventions against (file layout, styling regime, test setup). If no token source or reference component exists, stop — this project needs `building-a-design-system/README.md` first, not a scaffold.

## Procedure

1. **Check it should exist.** Search the catalog/exports for the same idea under another name — scaffolding a near-duplicate automates the fork (component-api.md §3). If the request is really a variant of an existing component, say so and stop.
2. **Classify the pattern** — it determines the skeleton: *token-consumer* (Text/Badge-like → variant props mapped to semantic tokens), *layout primitive* (Stack-like → owns child spacing, margin-free), *interactive control* (Button/Input-like → platform element + state parity), *overlay/disclosure* (Dialog/Menu-like → focus contract; native element or headless library per component-accessibility.md §3 decision tree — **never hand-roll combobox/menu/tabs behavior**). Reference implementations for all four: building-a-design-system/README.md step 3.
3. **Design the API before writing code** (component-api.md): intent-named props; variant enums, not booleans; `...rest` spread + ref onto the platform element; slots/compound parts if the design has ≥3 content regions; controlled/uncontrolled decided explicitly for inputs. Present the proposed props table first if the user is available; otherwise state assumptions at the top of the output.
4. **Write styles from tokens only** — semantic tier, never raw palette, never literals (design-tokens.md); flat scoped selectors, no outer margins (css-architecture.md §2); motion via duration/easing tokens on compositor properties only (animation-motion.md); logical properties throughout (topics/i18n-layout.md); `min-width: 0` on flex children and no fixed dimensions on text containers (responsive-design.md §2). **If a needed semantic token doesn't exist, do not mint one and do not hardcode** — flag it as a token request in the output (design-tokens.md §2: misuse is a vocabulary gap; orchestration/README.md: agents never mint).
5. **Cover the states:** every variant × size; interaction states (hover, `:focus-visible` at 3:1, active, disabled); async states (loading with `aria-busy` and a persistent accessible name); error (`aria-invalid` + `aria-describedby`) where applicable — visual and ARIA state change together (component-accessibility.md §4).
6. **Write the a11y contract into the component:** platform element or APG-pattern library per step 2; keyboard contract in the doc comment; for overlays, the focus contract (open/while-open/close) implemented and asserted via `document.activeElement` in an interaction test (component-accessibility.md §1, definition-of-done checklist).
7. **Generate stories: all states + the stress stories** — 2×-length label, empty content, pseudo-locale string, narrow container, both themes (responsive-design.md §2, visual-regression-testing.md §matrix). If the project has a visual suite, confirm the new stories are picked up by its glob; if not, note it.
8. **Self-review the output** against the mechanical table in `skills/design-system-consistency-reviewer/SKILL.md` pass 1 before presenting — a generator that fails its own review skill ships drift at machine speed.

## Output format

The component file(s) + styles + stories + interaction test, matching the project's existing layout; then a short summary:

```
## Scaffolded: <Component>
- Pattern class: <token-consumer | layout | control | overlay> (reference: <system component matched>)
- API: <props table, one line each: name, type, why it's intent-named>
- A11y: <element/pattern used; keyboard + focus contract one-liner>
- Token requests (blocking gaps, if any): <semantic.token.name — usage — suggested tier>
- Not included (needs a human/design decision): <list>
```

Rules: never invent tokens, never inline literals, never hand-roll APG widget behavior, and say what you *didn't* scaffold — an honest gap list beats a plausible-looking complete component with guessed semantics.
