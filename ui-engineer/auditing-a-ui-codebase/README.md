# Auditing an Existing UI Codebase — A Bounded-Time Playbook

**Purpose:** take an unfamiliar UI codebase and produce four artifacts a team can act on: **(1)** a design-token/consistency audit, **(2)** a component-duplication report, **(3)** an accessibility & responsive-fidelity risk list, **(4)** a prioritized remediation plan. **Time box:** 2–4 days for a mid-size app. An audit that takes three weeks gets ignored; precision beyond "what changes the plan" is waste.

**Who runs it:** a human engineer following this doc, or an orchestrator dispatching the two subagents (`../agents/duplicate-component-scanner.md` for artifact 2, `../agents/responsive-fidelity-auditor.md` for the fidelity half of artifact 3) and doing phases 0–1 and 4 itself. For general repo archaeology (build, architecture, data flow) run `web-dev/analyzing-existing-projects/README.md` first or in parallel — this playbook assumes you can already build and run the app.

**Ground rules:** read-only — an audit that "fixes things while it's in there" produces neither a fix nor an audit. Every finding carries *evidence* (file:line, count, or screenshot) and *cost-of-ignoring*; findings without either get cut. Date-stamp the report; numbers rot. **Date:** 2026-07-13.

---

## Phase 0 — Orientation (half a day)

Establish what the codebase *believes* its system is, so findings measure drift from *its own* intent, not from your taste:

- Find the intended source of truth: a design-system package? a `tokens.css`? a Figma library? Nothing? (Nothing is itself finding #1.)
- Identify the styling regime(s): CSS Modules / Tailwind / CSS-in-JS / global CSS — and whether there's more than one (`../principles/css-architecture.md` — the hybrid is a finding).
- Locate the shared-component directory(ies) and the biggest feature directories; note the test and CI setup (is there any visual coverage today?).
- Get the app running with seedable data — phases 2–3 need to render real screens.

## Phase 1 — Token & consistency census (artifact 1)

Mechanical greps first; they turn "the CSS feels inconsistent" into numbers nobody can argue with (`../principles/design-tokens.md` §1):

| Census | Command shape | Healthy | Smell |
|---|---|---|---|
| Unique color literals | grep hex/rgb/hsl in styles, sort -u, count | ≈ palette size | 3–10× palette size |
| Token adoption ratio | `var(--…)` uses ÷ (uses + raw literals) | > 0.9 | < 0.5 |
| Unique spacing values | grep px/rem values in padding/margin/gap | ~10–15 | 40+ |
| Unique font sizes | same, `font-size` | ~7–10 | 25+ |
| `!important` count & trend | grep, then `git log -S '!important' --oneline` for trend | ~0, flat | growing |
| Media-query widths | grep `@media` widths, histogram | = named breakpoints | 2×+ distinct values |
| `z-index` values | grep, sort -n | small tokenized set | 9999, 99999 |

Then the judgment layer: for the top-10 most-duplicated near-miss values (`#3A80F0` vs `#3B82F6`), determine whether a semantic tier exists and is bypassed, or never existed (`design-tokens.md` §3 — different remediations). Spot-check ten shared components for hardcoded values, appearance-based names, and theme-readiness (would dark mode flip this file?).

**Artifact 1 format:** the census table with counts, the tier diagnosis (no tokens / raw-only / semantic-but-bypassed), five representative worst examples with file:line, and the token adoption ratio as the single headline number the team can re-run quarterly (`../principles/governance.md` §metrics).

## Phase 2 — Component duplication scan (artifact 2)

Dispatch `../agents/duplicate-component-scanner.md`, or manually: inventory component names (fuzzy-cluster: `Button/BaseButton/ButtonV2/AppButton`); diff the clusters' props and rendered anatomy; check import counts (`grep -rc` per component) to find which duplicate is actually load-bearing; grep feature directories for copied shared-component source (the fork signature — `../principles/component-api.md` §3).

**Artifact 2 format:** a consolidation table — cluster · members · usage counts · divergence summary (what each fork added, because that's the API gap that caused it) · canonical candidate · migration difficulty (S/M/L) — plus the *why* per fork where discoverable from git history, since remediation differs for "couldn't find it" (discoverability, `governance.md` §1) vs. "it said no" (API, `component-api.md` §3).

## Phase 3 — Accessibility & responsive-fidelity risks (artifact 3)

Static sweep (an hour of greps, high yield): `onClick` on divs/spans, `role="button"`, missing-label inputs, `autoFocus` sprinkled around, `100vh`, fixed heights on text containers, `@media` values from phase 1, animation of layout properties, missing `prefers-reduced-motion` anywhere motion tokens don't exist (`../principles/component-accessibility.md`, `responsive-design.md`, `animation-motion.md` — each grep maps to a doc'd failure mode; cite it in the finding).

Dynamic sweep on the **top 5 money-path screens only** (bounded time goes where users are):

- axe-core run per screen per theme (catches the objective ~third).
- Keyboard walkthrough: Tab order, focus visibility, modal/dropdown focus contracts, Escape behavior.
- Content stress: longest-realistic strings, empty lists, 1,000-item lists, missing images, 200% zoom, pseudo-locale if the product localizes (`../topics/i18n-layout.md`). The `responsive-fidelity-auditor` subagent automates this sweep across breakpoints.
- Theme coverage if a second theme exists: the unthemed-state hunt (`css-architecture.md` §4).

**Artifact 3 format:** a risk list — risk · evidence (screenshot/file:line) · affected surface (one screen? every form?) · severity by *user impact* (task-blocking ≫ cosmetic, per `web-dev/principles/accessibility.md`'s prioritization) · doc reference for the fix pattern.

## Phase 4 — The remediation plan (artifact 4, the one they'll actually read)

Order by **(user impact × recurrence) ÷ effort**, not by finding category — and structure it as three horizons:

1. **Stop the bleeding (a week, no migrations):** lint rules at *current* violation counts as ratchets (may not grow), the contrast pair-check on whatever tokens exist, kill the top task-blocking a11y risks, add stress stories + snapshots for the two worst offenders so migrations have a safety net.
2. **The keystone migration (a quarter, pick ONE):** usually either the semantic-token retrofit (`design-tokens.md` §3) or the top component consolidation (`component-api.md` §3) — whichever artifact 1 vs. 2 shows is the bigger tax. One migration done beats three started; the visual snapshots from horizon 1 are what make it safe.
3. **The invariant (ongoing):** the governance loop so the audit never needs repeating at this scale — quarterly census re-run against the artifact-1 baseline, duplicate scan on a schedule, the review skill (`../skills/design-system-consistency-reviewer/`) on component PRs.

Each item: what · evidence link · effort (S/M/L) · owner-shaped (a team could claim it) · done-looks-like. **Anti-patterns that kill audit credibility:** a 400-item undifferentiated list (nobody starts), "rewrite the CSS" (nobody funds), severity inflation (three fake criticals and the report is wallpaper — same triage discipline as `web-dev`'s dependency scanner).

## Report skeleton

```
# UI Audit — <app> — <date>
## TL;DR (≤10 lines: the 3 headline numbers, the keystone recommendation, the one-week list)
## 1. Token & consistency census        ## 2. Component duplication
## 3. A11y & fidelity risks             ## 4. Remediation plan (3 horizons)
## Appendix: methodology, commands run, screens covered, what was NOT audited
```

The "not audited" appendix is honesty that buys trust — and scopes the next audit.
