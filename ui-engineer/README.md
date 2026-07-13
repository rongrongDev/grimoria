# ui-engineer — A Principal UI Engineer's Exit Brief

**What this is:** 20+ years of design-system and component-layer judgment — tokens, component APIs, CSS at scale, responsive fidelity, motion, visual testing, governance — encoded for humans (junior → staff) and AI models (Haiku → Opus) to use without the author in the room. Every doc stands alone; every skill and subagent is invokable; every claim is backed by a failure mode, not vibes.

**Scope:** the visual and component layer. Framework architecture, data fetching, testing philosophy, security, performance internals, and page-level accessibility live in the sibling **`web-dev/`** KB — docs here link out rather than re-derive.

**Last full revision:** 2026-07-13. Check `CHANGELOG.md` for what moved since.

## Find what you need in 30 seconds

| You are trying to... | Go to |
|---|---|
| Understand how this KB is organized (and extend it correctly) | `DESIGN.md` |
| Look up a term used anywhere in here | `GLOSSARY.md` |
| **Build a design system from scratch** (tokens → components → tests → adoption) | `building-a-design-system/README.md` |
| **Audit an unfamiliar UI codebase** (drift, duplicates, risks, remediation plan) | `auditing-a-ui-codebase/README.md` |
| Design or fix a token architecture; stop hardcoded-value drift | `principles/design-tokens.md` |
| Design a component's props/slots; stop a kitchen-sink or a fork | `principles/component-api.md` |
| Choose/repair a CSS strategy; end specificity wars; make theming work | `principles/css-architecture.md` |
| Make layouts survive real content, breakpoints, and translations | `principles/responsive-design.md` |
| Implement motion that doesn't jank and respects reduced-motion | `principles/animation-motion.md` |
| Build accessible components (focus, contrast, semantics) | `principles/component-accessibility.md` (foundation: `web-dev/principles/accessibility.md`) |
| Set up visual snapshots that catch regressions without crying wolf | `principles/visual-regression-testing.md` |
| Run a design system as a product (contribution, deprecation, metrics) | `principles/governance.md` |
| Support old Safari / enterprise WebViews; adopt new CSS safely | `topics/cross-browser.md` |
| Make Figma handoff produce system code, not drift | `topics/design-handoff.md` |
| White-label / multi-brand theming | `topics/multi-brand-theming.md` |
| Handle text expansion, RTL, per-script layout | `topics/i18n-layout.md` |
| Review a component PR against the system | invoke the `design-system-consistency-reviewer` skill |
| Scaffold a new system component correctly | invoke the `component-from-tokens-generator` skill |
| Find every duplicate/forked component in a repo | dispatch the `duplicate-component-scanner` subagent |
| Sweep screens across breakpoints × hostile content | dispatch the `responsive-fidelity-auditor` subagent |
| Run multiple AI agents on UI work without them forking the system | `orchestration/README.md` |

## Where to start, by situation

- **New to design systems?** Read `principles/design-tokens.md` and `principles/component-api.md` — the two ideas (decisions-not-values, props-are-a-contract) that everything else builds on. Then build along `building-a-design-system/README.md`.
- **Inheriting a messy UI codebase?** `auditing-a-ui-codebase/README.md`, phases 0–1, today. The census numbers change every conversation that follows.
- **Design system exists but teams route around it?** `principles/governance.md` — the problem is sociological and so is the fix.
- **A specific bug?** The routing table above; every principles doc is organized failure-mode-first, so scan its §headings.

## How the docs are built

Every `principles/` doc: mental model → failure modes (each with **failure → detection → fix → prevention**) → decision tree → war story → related links. Every `topics/` doc: production patterns + common pitfalls only. Every doc carries a date and the tool/spec versions it was validated against.

## Rules for AI models using this KB

- Each doc is self-sufficient given itself + its direct links. Don't load the whole tree.
- Skills fire on the situations named in their `description` and cite the docs they apply. Don't invoke a skill to *learn* — read the doc. Don't read 300 component files to *audit* — dispatch the subagent.
- Never mint tokens, components, or naming conventions mid-task; missing vocabulary is a finding to report, not a gap to improvise (`orchestration/README.md` explains why this rule exists).
- Advice is version-stamped. Cross-browser claims rot fastest — if the stamp is old, re-verify against Baseline before asserting "can't" or "safe."
