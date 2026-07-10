---
name: selector-fragility-reviewer
description: Review a test-automation diff, PR, or named spec/page-object files for brittle selectors, hard-coded waits, instant-read assertions, and shared-state hazards, producing severity-rated findings with concrete rewrites. Use when reviewing any PR that adds or changes UI tests or page objects (Playwright/Selenium/Cypress/Appium), or when asked to "check these tests for fragility/flakiness risk" on a bounded change. Do NOT use for whole-suite sweeps (dispatch the suite-wide-antipattern-scanner subagent — hundreds of files would flood this context), for diagnosing a test that is already flaking (that's @quality-dev/'s flaky-test-diagnoser — this skill prevents, it doesn't diagnose), or for non-UI test code with no selectors or waits (nothing for it to check).
---

# Selector Fragility Reviewer

You are reviewing a bounded set of UI-test changes for the defects that cause selector churn and timing flakiness. This is the merge gate from `principles/locator-strategy.md` and `principles/waiting-and-synchronization.md`; this file is self-contained — you do not need those docs in context to execute.

## Procedure

1. **Scope:** obtain the diff (`git diff`, PR files, or the named files). Review only test-layer and interaction-layer code (specs, page/screen objects, fixtures, custom commands). If the change set is >30 files, stop and recommend the `suite-wide-antipattern-scanner` subagent instead.
2. **Scan each changed hunk against the check tables below.** Judge the *changed lines* primarily, but flag pre-existing violations the change builds upon (a new test importing a page object full of sleeps inherits its flakiness).
3. **For every finding, produce:** severity, `file:line`, the offending code, *why it will break or flake* (one sentence, mechanism not dogma), and a concrete rewrite in the codebase's own framework/idiom.
4. **Verdict:** BLOCK (any Critical), FIX-BEFORE-MERGE (High), ADVISE (Medium/Low only).

## Check 1 — Selectors (severity in brackets)

| Pattern | Detect (regex/eyeball) | Rewrite to |
|---|---|---|
| [Critical] Positional XPath | `//` + index: `//div[3]/span`, `xpath=.*\[\d+\]` | Role/label/test-id; on mobile: accessibility id (XPath is also 10–100× slower on Appium) |
| [Critical] Generated/hashed ids | `#ember\d`, `:r\d+:`, `__[A-Za-z0-9]{5,}` (CSS-modules), `#radix-` | Role or test-id; these change every build |
| [High] Style-coupled classes | `.btn-primary`, `.mt-4`, `.col-`, any utility/variant class | Role/test-id; styling changes must not break tests |
| [High] Positional narrowing to dodge ambiguity | `.first()`, `.nth(`, `:first-child` where "first" is not the semantic | Tighten: role+name, `filter({hasText})`, or scope under a container test-id. Allowed only when "first" is the meaning ("most recent notification") — require a comment saying so |
| [Medium] Text selectors for *navigation* | `getByText`/`contains(` used to click through flows | Role+name (accessible name is contractual; arbitrary copy is not). Text selectors for *asserting content* are fine |
| [Medium] Deep structural CSS | `>`-chains ≥3, `div div span` | Component/test-id anchor + short tail |
| [Low] Selector defined inside a spec file | Any raw locator in `tests/`/`specs/` when the repo has a page-object layer | Move to the page/component object — one definition per element |

## Check 2 — Waits & synchronization

| Pattern | Detect | Rewrite to |
|---|---|---|
| [Critical] Hard sleep | `waitForTimeout(`, `Thread.sleep(`, `time.sleep(`, `cy.wait(` **with numeric arg**, bare `sleep(` | Wait on the condition the next step needs: web-first/polling assertion, `ExpectedConditions`, alias-based `cy.wait('@alias')`, `expect.poll` for non-DOM state. If the author "couldn't find the condition," the finding stands — the condition exists; check what the app signals when ready |
| [Critical] Instant-read assertion racing the app | `expect(await x.isVisible())`, `expect(await x.textContent())`, `assertEquals(el.getText(),…)`, `expect(x.count())` patterns | Retrying form: `await expect(x).toBeVisible()/.toHaveText()/.toHaveCount()`; Selenium: the suite's `assertEventually` helper |
| [High] Raised timeout masking a race | Timeout bumped at call site or (worse) globally in the diff, no comment | Find the real condition; a timeout raise with no justification comment is a silenced signal |
| [High] `networkidle` / load-event waits | `waitForLoadState('networkidle')`, `document.readyState` polls | Wait for the target element on the destination page |
| [Medium] Redundant explicit wait before auto-waiting action | `waitForSelector(x)` then `x.click()` in Playwright/Cypress | Delete the wait; the action waits. (Selenium: keep — it has no auto-wait) |
| [Medium] try/catch or retry-loop around a failing action | `for`+`try` around click/assert | That's a sleep in a costume; fix the condition |

## Check 3 — Shared-state & data hazards (parallel safety)

| Pattern | Detect | Rewrite to |
|---|---|---|
| [Critical] Hardcoded account/entity | Literal emails, usernames, IDs: `admin@`, `test@company`, `user_id = 4` | Data factory / account pool — unique per test by construction |
| [High] New serial/order coupling | `describe.serial`, `@Test(priority`, `dependsOn`, test named `01_`, `step2_` | Self-sufficient setup via factories; serial only for true multi-step journeys, with justification comment |
| [High] Global app-state mutation | Feature-flag/org-setting/pricing writes in setup without scoping | Per-user/per-org scoping, or `@serial`-tagged isolated stage |
| [Medium] Assertions on shared aggregates | Asserting counts/contents of collections the test didn't create | Assert on the test's own created markers |
| [Medium] Fixed ports/paths/filenames | Literal ports, `/tmp/x.csv`, fixed download names | Key by worker index / test id |

## Check 4 — Assertion integrity (when the diff *modifies existing tests*)

Diff the assertion set: assertions deleted, weakened (`toHaveText`→`toBeVisible`), wrapped in try/catch, or made conditional = [Critical] unless the PR explains why the coverage is legitimately obsolete. A test made green by testing less is the worst outcome this skill exists to prevent.

## Output format

```
VERDICT: BLOCK | FIX-BEFORE-MERGE | ADVISE
Summary: <2 sentences: dominant issue class + overall shape>

[CRITICAL] file.spec.ts:42 — hard sleep
  `await page.waitForTimeout(3000)`
  Why: bets 3s is both enough (flakes on slow CI) and necessary (wastes it everywhere else).
  Rewrite: `await expect(page.getByTestId('order-status')).toHaveText('Shipped')`
...
Pre-existing debt touched (not blocking, note for backlog): ...
```

Be precise, not exhaustive: if one root pattern repeats 15×, report it once with all locations listed, one rewrite shown. Never rewrite the author's *test logic* — only the selector/wait/data mechanics.
