---
name: suite-scaffolder
description: Scaffold a new automation module — spec file(s), page/screen objects, data factories, and fixture wiring — that conforms to the repository's established framework patterns, for a named feature or screen. Use when adding test coverage for a new feature/page/flow in an existing automation suite ("write E2E tests for the coupon flow", "add a page object for settings"), or when standing up the first module from guides/build-framework-from-scratch.md. Do NOT use to design WHAT to test (that's @quality-dev/'s test-strategy-planner — this skill takes a scenario list as input, or drafts one and asks for confirmation), to review existing tests (use selector-fragility-reviewer), or in a repo with no automation framework yet (follow guides/build-framework-from-scratch.md first; scaffolding without an established pattern just invents one).
---

# Suite Scaffolder

You are stamping a new module into an existing automation suite. The output must be indistinguishable from the best existing module in the repo — **the repo's conventions outrank this skill's defaults** wherever they conflict, except for the non-negotiables (marked ⛔), which you flag rather than replicate even if local convention violates them.

## Procedure

### 1. Learn the local dialect (always first — never scaffold from memory)

Read, in this order:
- The framework config (`playwright.config.*`, etc.) — projects, fixtures path, testDir, testIdAttribute.
- The composed `test`/fixture file every spec imports — what's injectable (auth, factories, page objects)?
- **The best recent module**: one spec + its page object(s) + any factory it uses. "Best": recently touched, no lint suppressions, follows the layering. If the repo has a designated worked example (README-linked), use that.
- Naming/structure conventions: file suffixes, directory shape, page-object style (class vs functions), locator idiom.

Record the dialect (2–3 lines) at the top of your output so a reviewer can check your inference.

### 2. Confirm the scenario list

Input should name the feature and scenarios. If scenarios are missing, draft the minimal set (happy path + the failure modes the UI surfaces) and present for confirmation — scenario *selection* is strategy (`@quality-dev/`), not scaffolding. Do not silently invent a large scenario matrix.

### 3. Generate, in dependency order

**Factories first** (if the feature has new entities): follow the repo's factory pattern; unique values by construction (uuid/timestamp in identifiers) ⛔; overridable defaults; create through the API client, not SQL.

**Page/component object(s):** locators + intent-level methods only.
- Locator priority ⛔: role+name > label > test-id > text(content only) > scoped css. No XPath, no style classes, no `.nth()` without a semantic-firstness comment.
- If the app lacks the roles/test-ids you need: **emit a TODO block listing the exact attributes the app team must add** (element, suggested `data-testid` value) rather than writing a brittle selector. A scaffold that starts life fragile defeats its purpose.
- No business assertions in page objects ⛔ (structural sync waits are fine). No sleeps ⛔.
- Reuse existing component objects (search `components/` before writing widget-handling code — duplicating the date-picker logic is the classic scaffolding failure).

**Spec file(s):** one behavior per test; body reads as intent (user actions + assertions), no raw locators/waits ⛔; data via factories/fixtures, never literals ⛔; retrying/web-first assertions only ⛔; independent tests — no serial mode, no shared module-level mutable state ⛔.

**Fixture wiring:** extend the composed fixtures file with the new page object (and factory fixture if the repo does data-as-fixtures). Match existing scope choices (worker vs test) — copy the analogous fixture.

### 4. Verify before handing over

Run, and include results in your output:
1. Lint passes (the repo's automation lint rules are the pattern-enforcement layer — a scaffold that needs suppressions is wrong).
2. New tests pass **repeated + parallel**: `--repeat-each=10 --workers=4` (or the stack's equivalent). One green run proves almost nothing about flakiness; ten parallel greens is the minimum bar for new code.
3. Break-check: sanity-check that at least one assertion fails when it should (temporarily invert an expectation or point at a wrong value, observe a *readable* failure, revert). A test that can't fail informatively isn't done.

If the environment can't run tests (no app instance available), say so explicitly and mark the module as unverified — never imply verification that didn't happen.

## Output format

```
Dialect notes: <what was inferred from the repo, 2–3 lines>
Files created/modified: <tree>
TODOs for app team: <missing test-ids/roles, exact attributes> (if any)
Verification: lint ✓ | 10×4 repeat-parallel ✓ (or: NOT RUN — reason)
Deviations from repo convention: <only where a ⛔ forced it, with the principle cited>
```

## Failure modes to avoid (learned the hard way)

- **Scaffolding from this skill's defaults instead of the repo's dialect** — produces a third convention in a two-convention repo. Step 1 is not optional.
- **Copying the *nearest* module instead of the *best*** — the nearest one may be the legacy pattern mid-migration. Prefer the README-designated example; when in doubt, the most recently *reviewed-and-merged* module.
- **Absorbing local anti-patterns out of politeness** — if the "best" module still has sleeps, do not replicate them; scaffold clean and note the divergence. The ⛔ items come from `principles/locator-strategy.md`, `waiting-and-synchronization.md`, and `test-data-management.md` and outrank local habit.
- **Over-scaffolding** — don't generate empty placeholder methods "for later," speculative page objects for screens nobody tests yet, or a scenario matrix beyond what was confirmed. Scaffolds are seeds, not cathedrals.
