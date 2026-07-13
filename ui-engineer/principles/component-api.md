# Component API Design — Props Are a Contract You'll Pay Interest On

**Scope:** framework-agnostic (examples in React/TSX; the judgment transfers — Vue slots, Svelte snippets, and web-component slots are the same shapes). **Date:** 2026-07-13. For framework-specific state/rendering concerns, see `web-dev/frameworks/<x>/production-patterns.md`.

## The mental model

A component's props are a **public API with hundreds of call sites you don't control**. Every prop you add is a promise you must keep for years; every prop you name badly is a support question forever; every prop that leaks how the component works today is a refactor you can never do. Design a component API the way `web-dev/` tells you to design an HTTP API: minimal surface, named by intent, versioned with discipline.

The core tension: **configuration vs. composition.** Configuration (props) is ergonomic for the 80% case and rigid for the rest; composition (children/slots) is flexible forever and slightly more verbose. The systems that survive put an opinionated configured component on top of a composable one — consumers use `<Dialog title=… actions=…>` daily, and when the design calls for something the props never anticipated, they drop down to `<Dialog.Root><Dialog.Title>…` instead of forking. The fork is the failure you're designing against: **every prop request you refuse without offering an escape hatch becomes a copy-pasted component you now maintain without knowing it exists.**

## Rules that earn their keep

1. **Name props by intent, not implementation.** `variant="danger"`, not `color="red"` (that's the token lesson — `design-tokens.md` — applied to APIs). `isLoading`, not `showSpinner` (tomorrow it's a skeleton). If the prop name would change when the visual design changes, it's leaking implementation.
2. **Enums over booleans, from the second variant on.** `variant: 'primary' | 'secondary'` beats `secondary: boolean`, because the third variant is coming, and `<Button primary secondary>` is a state your types now permit. Booleans are for genuinely independent on/off facts (`disabled`, `fullWidth`) — and if two booleans are mutually exclusive, they were an enum all along.
3. **Accept the platform's vocabulary.** A Button spreads `...rest` onto the underlying `<button>` (type-checked as `ComponentProps<'button'>` or equivalent) so `onFocus`, `aria-*`, `data-testid` work without you re-declaring each one. Components that gatekeep every DOM attribute die by a thousand prop requests.
4. **Expose refs/element access** (`forwardRef` semantics or your framework's equivalent). The consumer who needs to focus or measure your component will get to the DOM node one way or another; the escape hatch you design is safer than the one they'll improvise.
5. **Controlled and uncontrolled, deliberately.** Inputs follow the platform convention: `value` + `onChange` (controlled) and `defaultValue` (uncontrolled), never a third invention. Pick which modes you support and test both; the bug class where a component silently switches modes mid-lifetime is a classic (see `web-dev/frameworks/react/common-pitfalls.md`).
6. **Slots for structure, props for data.** A prop that accepts arbitrary renderable content (`title: ReactNode`) is fine at one or two; when you're at `headerLeft`, `headerRight`, `footerActions`, `footerSecondaryActions`, the component wants to be compound (`Card.Header`, `Card.Footer`) — the slot names were a layout trying to escape.

## Failure modes

### 1. Props that leak implementation details

- **Failure:** `<Table useVirtualScroll rowHeightPx={48}>` — consumers now depend on the virtualization strategy. Two years later the better virtualization library needs variable heights; 300 call sites pass a prop that no longer means anything, and removing it is a breaking change to every one.
- **Detection:** in review, ask of each new prop: "does this describe what the consumer *wants*, or how the component currently *works*?" Words like `use*`, `enable*`-plus-a-library-name, units in prop names (`Px`, `Ms`), and props documented by pointing at internals are the tells.
- **Fix:** re-express as intent (`density="compact"`, `estimatedRowCount`) and translate internally; deprecate the leaked prop with a codemod (see failure 4).
- **Prevention:** the `design-system-consistency-reviewer` skill checks prop names against this test on every component PR; API review before first release for any shared component (governance gate — `governance.md`), because the API is the one part you can't refactor later.

### 2. The kitchen-sink component

- **Failure:** Button grows `icon`, then `iconPosition`, then `iconOnly`, `loading`, `loadingText`, `badge`, `badgeColor`, `tooltip`, `dropdownItems`… 40 props, four of them interacting in undocumented ways, a 700-line render function nobody dares touch, and every new design need adds one more. The API has become a worse programming language.
- **Detection:** prop count trend (alert at ~15 for a leaf component); props that exist only for one call site; boolean props that only make sense in combination (`iconOnly` + `icon`); a props file longer than the component logic.
- **Fix:** decompose along the compound-component seam — `Button` keeps content-agnostic essentials (variant, size, disabled, loading); `SplitButton`, `IconButton` become their own components sharing internals; escape-hatch composition covers the tail. Migrate call sites with a codemod.
- **Prevention:** the **rule of three** — a prop earns its place when the third *independent* consumer needs it; before that, composition or a local wrapper. And the question that stops most sink-props at review: "could the consumer do this with children?" If yes, don't add the prop.

### 3. Composability failure → consumers fork

- **Failure:** the Modal hardcodes its footer as OK/Cancel. A team needs three buttons; the Modal can't; they copy `Modal.tsx` into their feature directory, tweak it, and move on. Eighteen months later there are five Modals, three of which trap focus incorrectly, and a security fix to the original reaches 40% of the app's modals. Forks aren't malice — **they're the rational response to a component that says no and a deadline that says yes.**
- **Detection:** the `duplicate-component-scanner` subagent (near-duplicate detection across the repo); grep for imports of shared-component *source paths* copied into feature directories; ask teams "which system components did you copy?" in governance reviews — they'll tell you.
- **Fix:** consolidate onto a compound/composable version that can express every fork's variation, then migrate forks one by one with visual regression snapshots proving parity (`auditing-a-ui-codebase/README.md` artifact 2 is the worklist).
- **Prevention:** ship the layered API (configured on top of composable) from day one; treat every fork you discover as a bug report against your API, not against the team that forked.

### 4. Breaking changes without a migration path

- **Failure:** the design-system team renames `type` → `variant` and ships it as v3. Product teams, who have feature deadlines, pin v2. Eight months later half the org is on v2 and the fixes only land in v3 — the system has bifurcated, which is the fork failure at library scale.
- **Detection:** version adoption metrics (who's on what, tracked per app); pinned-version count trending up is the fire alarm.
- **Fix / prevention — the deprecation contract:** (a) deprecate before removing — old prop keeps working for a full minor cycle, warns once in dev with the migration instruction; (b) ship a **codemod** with any change touching >20 call sites — if you can't write the codemod, that's evidence the change is more breaking than you thought; (c) batch breaking changes into rare, well-announced majors; (d) semver honestly — a changed default is breaking, a visual redesign of an existing variant is breaking for someone (flag it and coordinate; `visual-regression-testing.md` on intended-change workflow). Full playbook: `governance.md` §deprecation.

## Decision tree — "a team is asking for a new prop"

1. Can they do it with children/slots or the composable layer today? → point there; no API change.
2. Is it the *third independent* team asking for this capability? → design the prop: intent-named, enum-not-boolean, reviewed against failure 1.
3. Second team, or first? → offer the composable escape hatch and *record the request* — the count is your API roadmap.
4. Is the request really a new component wearing a prop costume (`dropdownItems` on Button)? → new component, shared internals.
5. Would the prop change existing rendered output for current consumers? → it's breaking; route through the deprecation contract regardless of how small it looks.

## War story

The five-Buttons story is mine. A design system I ran had a Button whose `icon` prop only accepted our icon set; a team needed a partner's logo in a button, we said "that's off-system," and they forked. Then the fork got forked. By the time we noticed we had `Button`, `BrandButton`, `ActionButton`, `LegacyButton`, and `ButtonV2` — and a compliance fix (focus-visible outlines) that had to be found and applied five times. The consolidation took a quarter; the lesson took ten minutes: we replaced `icon: IconName` with `icon: ReactNode` plus a documented slot, and no Button has been forked in the four years since. The API that says "yes, and here's the supported way" is the only anti-fork technology that works.

## Related

- Token usage inside components: `design-tokens.md`. Styling and style-override API (`className`/`style` policy): `css-architecture.md` §boundaries.
- Focus and ARIA obligations of compound components: `component-accessibility.md`.
- Enforced in PRs by the `design-system-consistency-reviewer` skill; new components scaffolded with these shapes by the `component-from-tokens-generator` skill; forks found by the `duplicate-component-scanner` subagent.
