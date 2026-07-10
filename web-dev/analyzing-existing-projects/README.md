# Analyzing an Existing Project — The Bounded-Time Audit Playbook

**For:** humans and AI agents dropped into an unfamiliar web codebase. **Date:** 2026-07-06.
**Operationalized by:** the `legacy-project-onboarder` subagent (runs this playbook in an isolated context). A human follows it directly.
**Deliverables (always these three, in this order):** ① architecture summary, ② risk/red-flag list, ③ prioritized remediation plan.
**Time budgets:** 30-minute recon / 2-hour standard / 1-day deep. Each phase below states what to *skip* at smaller budgets — running out of time in phase 2 with no deliverable is the failure mode this playbook exists to prevent. Write the deliverables *as you go*, never "at the end."

## The prime directive

You are estimating **where this codebase will hurt someone**, not cataloging everything. Breadth first, depth only where a signal points. The moment you're reading a file line-by-line without a hypothesis, you've fallen in a hole — climb out, return to the checklist.

## Phase 1 — Orientation (10 min recon / 20 min standard)

Read, in order (these are minutes each, and they're the highest-information-density artifacts in any repo):

1. `package.json` (all of them — workspaces?): the framework and **major versions** (→ which `frameworks/<x>/` docs apply, and how far behind supported the stack is), scripts (how it builds/tests/runs), dependency count and vintage.
2. Lockfile *presence* and CI config (`.github/workflows/` etc.): is there a test gate? a build? deploy from where?
3. `README`/`CONTRIBUTING`/`docs/` — noting **claims to verify**, not facts ("we have 80% coverage" is a hypothesis).
4. Directory tree, two levels (`tree -L 2 -d --gitignore` or equivalent): layer-folders vs feature-folders, server/client split, where the money code plausibly lives.
5. Git archaeology (5 min, highest ROI per minute in this phase): `git log --oneline -30` (commit hygiene, release cadence), churn hotspots (`git log --format= --name-only -200 | sort | uniq -c | sort -rn | head -20`) — **the files that change most are where the bodies are buried**, and where remediation pays off first.

Write architecture-summary bullets *now*: stack + versions, deployment shape, structure style, apparent domains, team hygiene signals.

## Phase 2 — Architecture verification (10 min recon / 40 min standard)

Trace **one read path and one write path** end to end — the single highest-value activity in the audit. Pick the money flow (checkout, signup, core CRUD). Entry point → routing → data fetch → render; form → action/endpoint → validation → authz → query → response. Note *as you trace*:

- Where does validation happen (schema at boundary, or hope)? Where does authorization happen (per-handler + ownership-scoped, or middleware-only — the `nextjs/security.md` §3 red flag)?
- Does data flow through a sanctioned layer (query cache/loaders) or hand-rolled fetch-into-state (`principles/concurrency.md` §1 exposure)?
- Layering: does the domain logic import the framework (`node/production-patterns.md` — untestable by construction)?

The trace either confirms the README's architecture story or replaces it. Recon budget: trace one path, not two.

## Phase 3 — Red-flag sweep (10 min recon / 40 min standard / half-day deep)

Greps first (minutes, mechanical — the framework `security.md` docs carry per-framework lists), judgment second. The core battery:

```
# Security sinks (per frameworks/<x>/security.md quick lists):
dangerouslySetInnerHTML | v-html | {@html | set:html | innerHTML | bypassSecurityTrust
exec( | execSync | eval( | new Function
# Concurrency/state red flags:
"export let " in server code; module-scope caches; setInterval/addEventListener without cleanup
# Hygiene:
eslint-disable density; @ts-ignore/any density; TODO|FIXME|HACK count and age
```

Then the judgment checks, each ~5 minutes:

- **Tests:** run them. Do they pass? How long? Then the quality spot-check (principles/testing.md §hollow suite): open the 3 tests nearest the money path — do they assert behavior, or mock the world and assert the mocks?
- **Dependencies:** count majors-behind for the framework and top-10 deps; `npm audit` headline numbers; anything unmaintained on the critical path. (Deep budget: dispatch the `dependency-security-scanner` subagent instead.)
- **The wrong-user probe:** find one owned resource endpoint and check the handler for tenant scoping (`WHERE … AND org_id` or equivalent). One IDOR usually means a family (`principles/security.md` §access control).
- **Performance smells** (only if user-facing perf is in scope): bundle size from a build, `client:load`/`'use client'` density, obvious waterfall shapes in loaders (`principles/performance.md`).

Rate each finding **[critical / high / medium / low] × [certain / suspected]** — the ×certainty axis keeps you honest about what a bounded audit can actually claim, and tells the reader what needs a follow-up spike.

## Phase 4 — Deliverables assembly (10 min, all budgets)

**① Architecture summary** (≤ 1 page): stack+versions+support status, deployment shape, structure paradigm, the traced paths as bullets ("mutations flow: Form → action → Zod → service → Prisma; authz per-action ✓"), team-hygiene signals. Facts and located evidence (`file:line`), not adjectives.

**② Risk list**: table of finding / severity / certainty / evidence pointer / doc reference (link the relevant `principles/` or `frameworks/` doc so the reader gets the full failure-mode treatment without you re-explaining it).

**③ Remediation plan** — ordered by *(blast radius × likelihood) ÷ effort*, and honest about sequencing:

1. **Stop-the-bleeding** (days): critical+certain security findings, missing CI test gate, unpinned deps. These go first regardless of anything.
2. **Guardrails before renovations** (weeks): lint rules/CI gates that prevent *new* instances of every found class (each `frameworks/<x>` doc names the rule), wrong-user tests on the money endpoints, bundle/perf budgets. Guardrails precede refactors because they make refactors safe.
3. **Structural** (quarters): the 1–3 architecture moves the evidence actually supports (e.g., "extract domain layer from handlers — enables the test strategy that everything else needs"). Never more than three; a 15-item structural plan is a wish list wearing a plan costume.

## Calibration warnings (from doing this ~200 times)

- **Old ≠ bad.** A boring, consistent Express 4 app with tests beats a half-migrated modern stack. The most dangerous repos are *mid-migration with both paradigms live* — flag "two ways to do X" as a finding in itself; it predicts bugs better than any version number.
- **Don't confuse unfamiliar with wrong.** Verify the convention is *internally consistent* before flagging it (styled in an unfashionable way is a zero-cost finding; inconsistently styled is real).
- **The absence of things is evidence too:** no error tracking, no migration files, no `SECURITY.md`, no wrong-user tests — each absence is a finding.
- **Resist the rewrite conclusion.** Your remediation plan's credibility dies the moment it says "rewrite" without first exhausting guardrails + strangler-fig increments. Rewrites are occasionally right; they are never the *audit's* call — the audit's job is to make the increments visible.
