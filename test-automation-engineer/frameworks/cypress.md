# Cypress — Production Patterns & Common Pitfalls

**Stamped:** 2026-07-06 · **Applies to:** Cypress 13.x · **Tier:** extended — patterns + pitfalls, not full depth. For a new suite, this KB's default is Playwright (`frameworks/playwright/README.md`); this doc exists because Cypress estates are common and worth running *well*. All principles docs apply; below is only what's Cypress-specific.

## The mental model that prevents most Cypress bugs

Cypress commands are **not promises and do not execute when the line runs** — they enqueue onto a command chain executed later, inside the browser, with built-in retry-ability. Ninety percent of "weird Cypress behavior" is fighting this model:

- **Never mix raw async/await or bare variables with the chain.** `const text = cy.get('.x').invoke('text')` does not contain text. Use `.then()`, aliases (`.as('order')`), or restructure. If your test needs complex control flow around command results, the test is usually asserting too procedurally — restate as retryable assertions.
- **Retry-ability retries the *query chain leading to* an assertion, not commands with side effects.** `cy.get('tr').contains('Paid')` retries the whole query until it passes; but `cy.get('tr').first().click()` clicks whatever `.first()` was at that instant. Put assertions *before* actions when state must settle: `cy.get('.status').should('have.text', 'Ready'); cy.get('button').click()`.
- **Conditional testing (`if element exists then...`) is officially and correctly a dead end** — the DOM is a moving target; the check races the app. Deterministic app state via seeding/flags instead (`principles/test-data-management.md`). Any `cy.get('body').then($b => $b.find(...).length)` in a suite is a flake with a countdown.

## Production patterns that hold up

- **`cy.session()` for auth** — cache login state per role across tests/specs; the Cypress equivalent of Playwright storage-state injection (`framework-architecture.md` §setup-through-API). Do login via `cy.request()` (API), not the UI, inside the session setup.
- **`cy.intercept()` at the third-party boundary** — same policy as `page.route` (`principles/test-data-management.md` §hermetic): mock payment/analytics/email in the blocking suite. Also the best wait primitive for no-UI-consequence requests: `cy.intercept('POST', '/api/orders').as('createOrder'); ... cy.wait('@createOrder')` — this is the *good* `cy.wait`, alias-based.
- **`cy.wait(3000)` — the numeric form — is the sleep anti-pattern** (`principles/waiting-and-synchronization.md`), and it's disproportionately common in Cypress suites because the alias form legitimizes the command name. Lint: ban numeric-argument `cy.wait` specifically (the scanner regex in `agents/suite-wide-antipattern-scanner.md` distinguishes the two).
- **Layering without page objects (the Cypress-idiomatic route):** the community favors custom commands + app-action helpers over POM classes. Fine — the *layering rule* (`principles/framework-architecture.md`) is what matters, not the class syntax: selectors and flow logic live in commands/helpers, specs read as intent. Guard the failure mode: a 200-command `commands.js` grab-bag is the god-page-object in different clothes; group commands by domain in separate files, and keep business assertions in specs.
- **Parallelization requires external orchestration** — Cypress has no built-in sharding; you split specs across CI machines yourself (duration-balanced per `principles/parallelization-and-sharding.md`) or pay for Cypress Cloud's load balancing (which is good, and its flake detection feeds the `ci-cd-integration.md` telemetry nicely — but it's a paid dependency; know your exit path: the free tier of the ecosystem alternatives, or DIY spec-splitting from your timing store).

## Structural limits to respect (not fight)

Same-origin-per-test restrictions (relaxed by `cy.origin()` since v12, still ceremony), no true multi-tab, single browser per run, in-browser architecture = no real multi-user/multi-context tests (two actors chatting = two Cypress runs + backend choreography; in Playwright it's two contexts in one test). If a product's core flows are multi-actor/multi-tab (collaboration tools, marketplaces), that's a *tool-fit* signal — the migration case in `principles/maintainability-and-tech-debt.md` §refactor-triggers, not a workaround case.

## Pitfall table

| Pitfall | Detection | Fix | Prevention |
|---|---|---|---|
| Numeric `cy.wait(n)` | Grep `cy\.wait\(\s*\d` | Alias-based intercept wait or retryable assertion | Lint ban on numeric form |
| Chain/async mixing | `const x = cy.*` assignments; stray `await cy.*`; "value is undefined" mysteries | `.then()`/aliases; restructure | ESLint plugin (cypress/no-assigning-return-values, no-async-tests) |
| Conditional testing | `$body.find(...).length` patterns | Deterministic state via seeding/flags | Review checklist; scanner regex |
| Action after non-settled query (`.first().click()` races) | Wrong-element clicks under load | Assert state, then act | Reviewer guidance (`skills/selector-fragility-reviewer` covers the selector half) |
| God `commands.js` | File length; command count | Split by domain; move assertions to specs | Same architecture review triggers as page objects |
| UI login per test | Runtime; login spec steps in every video | `cy.session()` + `cy.request()` login | First thing to check in any slow Cypress suite |

## Cross-references

Layering: `principles/framework-architecture.md` · Waits: `principles/waiting-and-synchronization.md` · Sharding DIY: `principles/parallelization-and-sharding.md` + `frameworks/github-actions/README.md` · Migration decision: `principles/maintainability-and-tech-debt.md`
