# Visual Regression Testing — A Tripwire, Not a Test Suite

**Scope:** framework-agnostic. **Validated against:** Playwright 1.5x (`toHaveScreenshot`), Storybook 9 + Chromatic, Percy, Lost Pixel / reg-suit (OSS), vitest browser mode. **Date:** 2026-07-13. Testing *philosophy* (what to test at which layer, flake discipline) is `web-dev/principles/testing.md`; this doc covers only the visual layer it deliberately leaves out.

## The mental model

A visual regression test answers exactly one question: **"did pixels change that nobody intended to change?"** It is not a correctness test (a beautifully rendered wrong number passes), not an a11y test (contrast aside, axe and keyboard walkthroughs own that — `component-accessibility.md`), and not a substitute for interaction tests. It is a **tripwire**: cheap to arm, silent until crossed, and valuable precisely because CSS has unbounded blast radius — a one-line token edit or cascade change can alter a thousand screens (`css-architecture.md`), and no unit test will ever notice. Visual snapshots are the *only* test class whose coverage matches that blast radius.

The economics that make or break it: every snapshot has a **review cost** (a human judges every diff) and a **flake cost** (a nondeterministic snapshot taxes every PR forever). The failed programs I've seen all died the same death — thousands of snapshots, dozens of "expected" diffs per PR, reviewers rubber-stamping orange checkmarks within a month, and then the real regression sails through a wall of noise. **A visual suite that cries wolf is worse than no suite**, because it also burns the team's trust in the concept.

## What to snapshot, at which layer

Match granularity to blast radius:

1. **Component states in isolation** (the workhorse — 80% of your snapshots): every story in the component workshop (Storybook), which means every variant × state you bothered to enumerate — including the content-stress stories (`responsive-design.md` §2) and every theme (`css-architecture.md` §4). Isolated, deterministic, and a diff points at exactly one component. This is also what makes stories pull double duty: documentation, dev sandbox, *and* test fixture — one artifact, three jobs.
2. **Composition/page snapshots** (a thin layer — key screens only): components that are individually correct can still collide — margin collapse between sections, z-index fights between two teams' overlays, a grid that only breaks when the real sidebar is present. A handful of money-path pages with **mocked, frozen data** at 2–3 breakpoints catches the class of bug isolation can't. Resist the urge to snapshot every page: page snapshots have the highest churn (any component change diffs every page containing it) and the vaguest signal.
3. **The theme × breakpoint × stress matrix — sampled, not exhaustive.** Full cross-product explodes (50 components × 6 states × 3 themes × 4 breakpoints × 3 stress cases = 10,800 images; nobody reviews 10,800 diffs). Sample deliberately: all states in the default theme at one breakpoint; all *themes* for the states that differ per theme (interactive/status states); all *breakpoints* only for components with container-query/layout behavior; stress-content stories always (they're few and they're where the bodies are).

## Failure modes

### 1. Snapshots too brittle (fail on every unrelated shift)

- **Failure:** full-page screenshots with live data — every PR diffs because a timestamp advanced, an avatar re-randomized, a font loaded a frame later, an animation was mid-flight, CI's renderer anti-aliased differently than the laptop's. Review fatigue sets in; "approve all" becomes muscle memory; the suite is now decorative.
- **Detection:** measure it — diffs-per-PR that don't correspond to intended visual changes, and time-to-approve trends. A suite where >10% of runs need a human to say "that's just noise" is failing.
- **Fix / prevention (determinism checklist — every item is a bug I've chased):**
  - **Same renderer everywhere:** snapshots render in one pinned browser build in one container image (Playwright's pinned Chromium, or a cloud service's farm). Never compare laptop pixels to CI pixels — OS font rasterization alone guarantees noise.
  - **Frozen time and data:** mock the clock (`page.clock` / MSW-mocked APIs); fixtures, not live endpoints; seeded randomness; fixed locale and timezone in the test env.
  - **Fonts loaded before capture:** wait for `document.fonts.ready` (a FOUT mid-capture is the classic heisen-diff); self-host the fonts so a CDN blip can't restyle your suite.
  - **Animations off:** force `prefers-reduced-motion`, set animation/transition durations to 1ms globally in the test sheet, or use the tool's built-in (`toHaveScreenshot({ animations: 'disabled' })`). Skeletons/spinners: capture the loaded state, or freeze the animation at 0%.
  - **Threshold near zero, not generous:** a fat `maxDiffPixels` "to reduce noise" is how a real 3px regression hides; fix the nondeterminism instead of tolerating it. Small anti-aliasing tolerance (`threshold: 0.1`-ish) only.
  - **Mask the genuinely unmockable** (live map tiles, third-party iframes) rather than loosening the whole image.

### 2. Snapshots too loose (miss real regressions)

- **Failure (the quieter opposite):** only the happy-path story is snapshotted, only in light theme, only at desktop width — so the dark-mode disabled-state regression (a token misuse, `design-tokens.md` §2) ships invisibly. Or thresholds were cranked up during a flake war and now absorb real 5px shifts. Or — the subtle one — **snapshots of the wrong composition**: the component is snapshotted alone on a white canvas, but the bug only manifests inside a constrained sidebar, so isolation passes while production breaks.
- **Detection:** after any visual bug ships, run the blameless question "which snapshot *should* have caught this?" — the answer is your coverage gap map. Audit thresholds whenever a diff you expected doesn't appear.
- **Fix / prevention:** coverage follows the failure modes in this KB, mechanically: themed states because of token misuse, stress content because of `responsive-design.md` §2, container-width variants for container-query components (a story per representative container size), composition snapshots for the collision class. Tight thresholds; fix flake at the source per failure 1 so you're never tempted to loosen.

### 3. The intended-change workflow doesn't exist

- **Failure:** the design system updates Button's padding — *intended* — and 400 snapshots diff. If updating baselines is painful or ungoverned, one of two bad things happens: teams stop making intended changes (the suite is now a ratchet against design evolution), or someone force-updates all baselines and buries a real regression in the batch.
- **Detection:** listen for "I didn't ship the improvement because the snapshot churn wasn't worth it" — the suite has become the tail wagging the dog.
- **Fix / prevention:** baseline updates are **reviewed like code, by the owning team**: batch UIs (Chromatic-style) or `--update-snapshots` diffs in the PR, with the design-system team approving system-wide diffs (they know what the token change *should* touch — a diff appearing on a screen the change shouldn't affect is a finding, and this is exactly how token-blast-radius bugs get caught). Snapshot baselines live in the repo or the service, versioned with the code that produces them, updated in the same PR as the change. This workflow is *also* your breaking-change detector for `component-api.md` §4: a "non-breaking" component change that diffs 40 app screens was breaking, and now you know before shipping.

### 4. Visual tests asked to do interaction's job

- **Failure:** asserting a dropdown "works" by screenshotting it open; asserting form validation by screenshotting the error. The suite gets slow, stateful (you scripted clicks before capture — more flake surface), and redundant with cheaper tests.
- **Fix / prevention:** interaction correctness belongs to component interaction tests (testing-library / Storybook play functions / Playwright — `web-dev/principles/testing.md` owns layer allocation). The visual layer captures *reached states*, ideally states a story can mount directly via props/fixtures rather than by scripting UI. Rule of thumb: if the snapshot requires more than trivial setup interaction, mount the end state as a story instead.

## Decision tree — "should this get a snapshot?"

1. A component state that exists as a story? → yes, snapshot it (theme/breakpoint sampling per the matrix rules).
2. A bug just shipped that pixels would have caught? → add the story that reproduces it, snapshot it; that's the suite's growth algorithm.
3. A whole page? → only money-path pages, mocked data, ≤3 breakpoints — and ask first whether a composition story covers it cheaper.
4. Something behind three clicks of setup? → make the end state mountable as a story, then snapshot the story.
5. Live/third-party/nondeterministic content? → mask it or don't snapshot it; never widen the threshold to accommodate it.

## War story

A team I joined had turned their visual suite off — literally `if: false` in CI — after a quarter in which 2,000 full-page live-data snapshots produced ~80 spurious diffs per PR. The suite had been built exhaustive-first ("snapshot everything, review later"). We rebuilt it economics-first: ~340 story-level snapshots (all system-component states, both themes for stateful stories, stress stories), 9 mocked money-path pages at 3 widths, `document.fonts.ready` + frozen clock + animations disabled, thresholds near zero, Chromatic-style batch review with the systems team owning cross-cutting approvals. Spurious-diff rate fell to roughly one per week. Four months in, a spacing-token change diffed two screens *outside* its predicted blast radius — a component had been consuming the token through a hardcoded alias nobody remembered — caught before ship, which is the exact bug class nothing else on the testing pyramid can see. The suite earned back its `if: true` by being small enough to trust.

## Related

- What feeds the suite: stories incl. stress content (`responsive-design.md`), themes (`css-architecture.md`), token pairs (`design-tokens.md`, `component-accessibility.md` §contrast).
- Wiring it up from scratch: `building-a-design-system/README.md` step 5. Testing philosophy and layer allocation: `web-dev/principles/testing.md`.
- Used as the safety net by: consolidation migrations (`component-api.md` §3), theme retrofits, and the audits in `auditing-a-ui-codebase/README.md`.
