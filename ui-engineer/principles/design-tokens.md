# Design Tokens — The Architecture Decision You Only Get to Make Once

**Scope:** framework-agnostic. **Validated against:** W3C DTCG token format (2025.1 draft), Style Dictionary 4.x, CSS custom properties (Baseline: universal), Figma Variables. **Date:** 2026-07-13.

## The mental model

A design token is a **named design decision**, not a named value. `#3B82F6` is a value. `color.action.primary` is a decision: "this is what interactive things look like here." The entire payoff of a token system — theming, dark mode, multi-brand, redesigns that take a week instead of a year — comes from that distinction, and every failure mode below is some way of collapsing it.

The architecture that survives is **three tiers**:

1. **Raw (primitive) tokens** — the palette. `blue.500 = #3B82F6`, `space.4 = 16px`, `font.size.300 = 1.125rem`. No meaning, just an inventory of permitted values. Named by *what they are*.
2. **Semantic (alias) tokens** — the decisions. `color.text.primary → gray.900`, `color.surface.raised → white`, `space.inset.card → space.4`. Named by *what they're for*. **This is the only tier application and component code may reference.**
3. **Component tokens** (optional, add when needed) — `button.primary.bg → color.action.primary`. Only worth the ceremony when a component must be themeable independently of the semantic layer (white-labeling, or a component library consumed by teams who can't touch your semantic tier).

The load-bearing rule: **meaning flows one way.** Raw tokens know nothing. Semantic tokens point at raw tokens. Components point at semantic tokens. The moment a component references `blue.500` directly, that component has opted out of every future theme.

## Naming: the part everyone gets wrong first

Name semantic tokens by **role**, never by appearance, because appearance is exactly what themes change:

- `color.text.danger`, not `color.red.text` — in the colorblind-safe theme, danger might be orange.
- `color.surface.raised` / `color.surface.sunken`, not `color.gray.50` / `color.white` — in dark mode, "raised" gets *lighter*, which no appearance-based name survives.
- `space.inset.*` (padding), `space.stack.*` (vertical gaps), `space.inline.*` (horizontal gaps) — spacing named by relationship, so a density theme can compress insets without touching stacks.

Decision tree — **"should this be a token, and at which tier?"**

1. Is it a value a designer chose once and reuses? (brand color, spacing step, radius, shadow, duration, easing, z-index, breakpoint) → raw token.
2. Does it carry meaning that could re-map under a theme? (text vs. background, action vs. danger, raised vs. sunken) → semantic token aliasing a raw one.
3. Is it a one-off the design deliberately wants un-themeable? (an illustration's exact color, a marketing page's hero gradient) → hardcode it *with a comment saying it's deliberate*, or you'll spend review time re-litigating it forever.
4. Is it layout math (a `grid-template-columns` expression, a `calc()`)? → not a token. Tokens are decisions, not computations. Tokenize the *inputs* (`space.*`), write the math in CSS.

Scales: use a **non-linear numeric scale with gaps** (`50, 100, 200 … 900` for color; `1, 2, 3, 4, 6, 8, 12, 16` in 4px units for space; a modular ratio ~1.2 for type). Gaps exist so you can insert `space.5` in year three without renaming everything — t-shirt sizes (`sm/md/lg`) always run out of letters and end in `xxxsm`.

## Storage and pipeline

Single source of truth in **DTCG-format JSON** (`$value`, `$type`, aliases via `{group.token}`), transformed by **Style Dictionary** (or equivalent) into every consumption format: CSS custom properties, TS constants for anything needing values in JS (charts, canvas), native formats if you have them. CSS custom properties are the runtime delivery mechanism because they're the only one that themes without a rebuild — a theme is just a class or `@media` block that reassigns semantic properties (see `css-architecture.md` §theming for the cascade mechanics, and `building-a-design-system/README.md` step 1 for the full pipeline wired up).

Figma Variables should be *generated from or synced to* the same JSON — the day the Figma library and the code tokens diverge, designers start speccing values that don't exist and engineers start hardcoding them (see `topics/design-handoff.md`).

## Failure modes

### 1. Raw values hardcoded instead of tokens

- **Failure:** `color: #3A80F0` — eyeballed from a screenshot, three points off `blue.500`. Multiply by two years and forty engineers: the codebase has 200 unique hex values against a 40-color palette, and the rebrand estimate comes back "six months, high risk" because nobody can tell deliberate values from drift. I've run that census; the number was 371.
- **Detection:** lint, not eyes. `stylelint` with `declaration-property-value-allowed-list` (or `stylelint-declaration-strict-value`) rejecting raw color/px literals in component styles; a repo-wide grep census (`auditing-a-ui-codebase/README.md` artifact 1) for the backlog.
- **Fix:** map each literal to the nearest raw token, then ask *which semantic token* this usage is — the mapping is a judgment call (is this gray text `text.secondary` or `text.disabled`?), which is why the fix is a review task, not a codemod, except for exact-match literals.
- **Prevention:** the lint rule in CI from day one (it's cheap at zero violations and politically impossible at 371); autocomplete-friendly token exports so the token is *easier* to type than the hex; the `design-system-consistency-reviewer` skill on every component PR.

### 2. Semantic token used for its current value, not its meaning

- **Failure:** an engineer needs white text on an image and reaches for `color.surface.default` "because it's white." It *is* white — until dark mode ships and `surface.default` becomes near-black, and now there's invisible text on hero images. This is the subtlest token bug because it's invisible in the default theme and lint-clean.
- **Detection:** only two things catch it — reviewers who ask "read the token name aloud; is that what this *is*?", and visual regression runs of **every themed state** (`visual-regression-testing.md`): the dark-mode snapshot lights up red.
- **Fix:** add the missing semantic token (`color.text.on-image`, `color.text.inverse`) rather than "fixing" the value locally. Every misuse is a vocabulary gap: the engineer reached for the wrong word because the right one didn't exist.
- **Prevention:** publish the semantic vocabulary with *usage descriptions*, not just values ("`surface.default`: page background — never use for text"); make requesting a new semantic token a same-day operation (see `governance.md` — slow token requests are the #1 cause of misuse); snapshot all themes in CI.

### 3. Token architecture that doesn't scale to dark mode / multi-brand

- **Failure:** a "token system" that is really one flat list of named values — no semantic tier. Dark mode arrives; someone writes `.dark { --blue-500: #60A5FA; }` — redefining *raw* tokens so their names lie (`gray-900` is now white). Every future theme multiplies the lie. Alternatively: the semantic tier exists but half the components bypassed it (failure 1), so dark mode ships with a hundred hardcoded holdouts glowing white.
- **Detection:** the thirty-minute stress test — *before* you need it, prototype a dark theme by reassigning only semantic tokens. Everything that doesn't flip is a bypass; every raw token you're tempted to redefine is a missing semantic name.
- **Fix:** introduce the semantic tier retroactively: census usages, cluster by role, define the vocabulary, migrate highest-traffic components first. Painful but mechanical; budget it like the migration it is (`governance.md` §deprecation for the playbook).
- **Prevention:** three tiers from day one even when there's one theme — the semantic tier costs a day up front and saves the quarter later. Run the dark-mode stress test as an architecture review gate even if dark mode isn't on the roadmap. For full multi-brand (different values *and* different scales per brand), see `topics/multi-brand-theming.md`.

### 4. Token sprawl (the overcorrection)

- **Failure:** after reading advice like this, a team tokenizes everything — `button.primary.hover.border.top.width` — 3,000 tokens, each used once. Nobody can find the right token, so they guess wrong (failure 2) or hardcode (failure 1). A token used once is a variable; a token nobody can find is a bug factory.
- **Detection:** usage census — count references per token. A healthy semantic tier is dozens of tokens, not thousands, and its median token is used many times.
- **Fix / prevention:** component tokens only for components that genuinely re-theme independently; delete write-only tokens on a schedule; treat "engineers can find the right token in 30 seconds" as an acceptance criterion of the naming, tested by watching someone try.

## War story

A payments product I inherited had shipped dark mode by literally forking the stylesheet — `theme-dark.css`, 4,100 lines, copy-pasted and hand-inverted. Every UI change had to be made twice; within a year the themes had drifted (a promo banner readable only in light mode shipped to 40% of users). The fix took one quarter: build the raw palette, define 47 semantic tokens, migrate components tier-by-tier with visual regression snapshots in both themes as the safety net, delete the fork. The system has since absorbed two rebrands and a high-contrast theme at roughly a week each. The 47-token vocabulary was the entire asset; the pipeline around it was a day of Style Dictionary config.

## Related

- Consumed by: `css-architecture.md` (delivery via custom properties), `building-a-design-system/README.md` (pipeline setup), `component-from-tokens-generator` skill (scaffolding against the vocabulary), `design-system-consistency-reviewer` skill (enforcing it in PRs), `auditing-a-ui-codebase/README.md` (the census).
- Contrast thresholds as token-level properties: `component-accessibility.md` §contrast.
- Motion tokens (duration/easing/reduced-motion): `animation-motion.md`.
