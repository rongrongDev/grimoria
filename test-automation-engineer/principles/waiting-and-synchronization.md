# Waiting & Synchronization

**Stamped:** 2026-07-06 · Applies to: Playwright 1.50, Selenium 4.27, Appium 2.12, Cypress 13.

Timing is the engineering half of the flakiness problem: the test and the application are two concurrent processes, and every line of a UI test is an implicit bet about the app's state. This doc is about making those bets explicit and safe. (The other half — root-causing an individual flaky test's logic, deciding test-bug vs product-bug — is `@quality-dev/`'s `flaky-test-diagnoser`. Come here when the diagnosis is "timing assumption"; go there to *get* the diagnosis.)

## The one rule

**Wait for the condition the next step actually depends on. Never for time.**

A hard wait (`sleep`, `waitForTimeout`, `Thread.sleep`) is wrong in both directions simultaneously: too short on the slow day (flake), too long on every other day (waste). On a 200-test suite averaging two 3-second sleeps per test, that's 20 minutes of pure dead time per run — and the flakes remain, because CI under load will eventually exceed any constant. I have removed sleeps from suites three times in my career; it has never once made a suite less stable, and it cut runtimes 20–40% each time.

The only legitimate `waitForTimeout` I've accepted in twenty years: asserting that something does *not* happen (no toast appears within 2s), and even then prefer bounded polling of the negative condition, or an app-emitted signal that the operation completed.

## Decision tree: what to wait on

```
Next step depends on...
├─ an element being present/visible/enabled
│    → don't wait explicitly at all in Playwright/Cypress (auto-wait does it);
│      Selenium: WebDriverWait + ExpectedConditions on that element
├─ data/text appearing or changing
│    → web-first assertion that polls: expect(locator).toHaveText(...)
│      (assertions ARE waits in modern frameworks — use them as such)
├─ a network call completing
│    → prefer the UI consequence of the call (the row appears).
│      Only wait on the request itself (waitForResponse) when there is
│      no UI consequence, and match by URL+method predicate, not order.
├─ navigation / page load
│    → wait for the element you need on the new page, not for load events.
│      networkidle is a trap on any app with polling/analytics/websockets —
│      it fires late or never. Element-presence is the contract.
├─ an animation/transition finishing
│    → Playwright actionability handles "stable" for actions; for assertions,
│      disable animations globally in test env (CSS override / reducedMotion).
│      Never sleep out an animation.
├─ a background/async job (email sent, export generated, index updated)
│    → poll the *authoritative* source (API endpoint, DB row, mailbox stub)
│      with expect.poll / Awaitility-style helper — deadline + interval,
│      failure message says what condition timed out
└─ "I don't know, it's just flaky without the sleep"
     → you have not found the real condition yet. Open the trace, find what
       the app was doing at the original failure moment, wait on THAT.
       A sleep placed here is a bug with a timer on it.
```

## Race conditions between test and app: the three classics

1. **Act-before-ready:** clicking a button that's rendered but whose handler isn't attached yet (hydration gap in SSR/React apps). Symptom: click "succeeds," nothing happens, next assertion times out. Playwright actionability does *not* catch this — the element is visible and stable. Fix: wait for a signal that hydration completed (an element that only renders post-hydration, or an app-set `data-hydrated` attribute — ask the app team; it's a one-liner for them). This one bug was ~30% of all flakes on a Next.js product I supported.
2. **Assert-before-settle:** asserting list contents while the fetch is in flight; passes locally (fast API), flakes in CI. Fix: polling assertions (`toHaveText`, `toHaveCount`) with adequate timeout, not `isVisible()`-style instant checks. Instant-read APIs (`isVisible()`, `textContent()`, Selenium's `getText()`) in assertions are the #2 pattern the `suite-wide-antipattern-scanner` hunts.
3. **Stale-element in re-rendering UIs (Selenium):** element located, framework re-renders, reference dies (`StaleElementReferenceException`). Fix: re-locate at action time — which is what Playwright/Cypress lazy locators do by design; in Selenium, never store `WebElement`s, store `By`s and resolve inside your helper.

## Explicit vs implicit waits (Selenium-specific but the lesson generalizes)

Set implicit wait to **0**, permanently. Implicit waits (a) apply a global poll to every lookup, hiding genuinely-missing elements for N seconds each and bloating failure runs, and (b) interact with explicit `WebDriverWait` in officially-undefined ways — the classic symptom is waits that take implicit+explicit time. One global setting cannot express "this element should be instant, that export takes 30 seconds." Explicit waits at each point of actual uncertainty express real knowledge about the app. Details and code: `frameworks/selenium/README.md`.

## Timeout policy

Timeouts are a hierarchy, and each level should be an order of magnitude apart or the error messages lie to you:

- **Action/assertion timeout** (per-step): 5–10s web default. This is the one that fires on real bugs — keep it tight enough that failures are fast.
- **Known-slow operations:** override *locally at the call site* with a comment (`// export takes ~20s, budget 45s`), never by raising the global default. A suite whose global timeout has crept to 60s is a suite where someone silenced a real slowness signal.
- **Test timeout:** ~3× the test's honest p95. Playwright default 30s is right for most.
- **Never** retry-loop around a failing action to "give it more time" — that's a sleep in a costume.

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Hard-coded sleeps | Grep: `waitForTimeout|sleep\(|Thread.sleep|time.sleep|cy.wait(\d` — the numeric-arg `cy.wait` form | Replace with condition per decision tree | **Lint ban** (ESLint `no-restricted-properties` / custom rule), enforced in CI, no warnings — errors. `selector-fragility-reviewer` skill checks diffs |
| Instant-read assertion racing the app | Flake signature: assertion fails, screenshot shows spinner/partial data | Polling assertion with explicit timeout | Code-review checklist; scanner regex for `isVisible()`/`getText()` feeding raw `assert`/`expect` |
| `networkidle`/load-event waits | Timeouts on pages with websockets/analytics; or slow passes (waiting for silence that's irrelevant) | Wait for the target element instead | Lint-warn on `networkidle`; document the app's real readiness signal in the framework README |
| Global timeout creep | Config archaeology: default timeout > 15s | Restore tight default; add call-site overrides where genuinely needed | Timeout values in config require a PR comment justifying them; `analyze-existing-suite.md` audits this |
| Race hidden by test-level retry | Passes-on-retry cluster on one test (flake telemetry) | Trace the original failure, find the missed condition | Retry policy that records every retry-pass as a flake event — `ci-cd-integration.md` |

## Cross-references

- Tool specifics: `frameworks/playwright/README.md` (auto-wait/actionability internals), `frameworks/selenium/README.md` (WebDriverWait patterns), `frameworks/appium/README.md` (mobile idling: animations, IME, `waitForIdleTimeout`), `frameworks/cypress.md` (retry-ability model)
- Flake diagnosis of a specific test: `@quality-dev/` `flaky-test-diagnoser`
- Suite-wide sleep census: `agents/suite-wide-antipattern-scanner.md`
