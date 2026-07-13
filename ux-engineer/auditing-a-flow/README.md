# Auditing an Existing Flow for UX Risk — The Playbook

**What this is:** a bounded-time playbook (2–4 days for one flow; scale via fan-out for many) for assessing an unfamiliar flow and producing **four artifacts**: ① journey-accessibility risk assessment, ② IA clarity review, ③ interaction-consistency audit, ④ prioritized remediation plan. Runnable by a human or an AI agent with access to the running product (and ideally its code). **Validated against:** WCAG 2.2 AA. **Date:** 2026-07-13.

**Ground rules:** you are producing *findings with evidence*, not fixes — the remediation plan names fix patterns and owners, but an auditor who starts fixing mid-audit loses coverage and neutrality (the same reason the subagents are read-only). Every finding carries: location (step + element), evidence (screenshot/recording/quote/file:line), the failure class from the relevant principles doc, severity, and affected-population estimate. Severity language is shared across all four artifacts: **task-blocking ≫ major friction ≫ minor friction ≫ cosmetic**.

---

## Phase 0 — Inventory the flow (half a day)

You cannot audit what you haven't mapped. Produce the **flow map**, which every later phase keys against:

1. **Steps and screens**, in order, including the ones the team forgets: entry points (nav, deep links, emails, notifications — flows usually have more doors than their owners believe), exit/completion states, and abandonment exits.
2. **The task(s)** the flow exists to complete, phrased in user vocabulary (what would a user say they're doing?).
3. **State skeleton per step:** what's known to exist for empty/loading/error — from clicking around and, if code is available, from grepping the step's components for state branches. Gaps go in a "couldn't verify" list, which is itself part of artifact ④.
4. **Instrumentation snapshot**, if analytics exist: where do users drop? The funnel doesn't explain anything, but it tells you where to look hardest, and it's the baseline any remediation will be measured against.

If auditing **many** flows: run Phase 0 for all of them first, then fan out phases 1–3 per flow via subagents (`../orchestration/README.md` — one flow per agent, this playbook as the shared rubric, merge at artifact ④).

## Phase 1 — Journey-accessibility risk assessment → artifact ① (half to one day)

Execute `../principles/journey-accessibility.md`'s decision tree against the flow map, in order:

1. **Scanner pass** (axe or equivalent, per step, *per state* — error states are DOM too). Element-level hits route to component fixes (`ui-engineer/principles/component-accessibility.md`); a clean pass proves only that the scannable layer is clean.
2. **Keyboard task-completion**, mouse unplugged: complete the real task including one error recovery and one dismissal. Log every stall (§1), every invisible/obscured focus (2.4.7/2.4.11), every hover-only affordance.
3. **Screen-reader task-completion** (one desktop SR minimum): listen at every step transition (silence = focus-discontinuity finding, §2) and after every async action (silence = missing announcement, §3).
4. **Continuity pass:** timeout behavior mid-flow, redundant re-entry of known data, terminology drift across steps, failure-path recovery with data intact (§4).

**Artifact ① format:** findings table (step · WCAG SC or journey-failure class · evidence · severity · affected population) + a one-paragraph verdict: *can a keyboard-only user and a screen-reader user complete this task today — yes/no/with-what-workarounds?* That sentence is what leadership reads; make it true. Delegation: this phase is exactly what `../agents/flow-accessibility-auditor.md` does in an isolated context — dispatch it when the flow is long or you're fanning out; run it inline (or via the `journey-accessibility-reviewer` skill) for a single short flow.

## Phase 2 — IA clarity review → artifact ② (half to one day)

Per `../principles/information-architecture.md`, adapted to auditing:

1. **Entry findability:** from each persona's natural starting point, is the flow's entry where they'd look, named in their vocabulary? Check the terminology against search logs / support tickets if available (free evidence; searches for the feature by another name are the finding).
2. **Wayfinding within the flow:** at every step, can a user answer *where am I, how much is left, how do I go back, what happens if I stop?* Progress indication, back-safety (does back lose data? — also a §journey-a11y continuity item), and save-and-resume for long flows.
3. **Label audit:** every heading, action label, and option name read *cold* — org-chart smell test (§1: does any label require internal knowledge to parse?), vocabulary mismatch (§2), and the one-verb rule across steps.
4. **Orphan/reachability check:** crawl or map the click-graph around the flow — steps or help content reachable only by URL/old links (§3), and dead ends (states with no forward or backward affordance).
5. **Where evidence is thin, say what test would settle it** — a 10-user first-click test on the disputed entry point, a tree test on the surrounding nav. An audit that can't distinguish "confusing" from "I found it confusing" flags, not asserts (that's `usability-testing.md` §2's mechanism discipline, applied to yourself).

**Artifact ② format:** findings table (location · IA failure class · evidence · severity) + the flow's *observed* terminology table with inconsistencies marked + "recommended verification tests" list for the flagged-not-asserted items.

## Phase 3 — Interaction-consistency audit → artifact ③ (one day)

Walk the flow as an interaction reviewer, three sweeps:

1. **Feedback completeness sweep** (`../principles/interaction-design.md`): per user action — acknowledgment <100ms? busy state? success/failure representation *at the locus of attention*? Run the spam-click test on every submit and the throttle test (realistic latency) on the whole flow; log races, double-fire hazards, and spinner-flicker. Check the >10s actions for progress/backgrounding.
2. **State-coverage sweep** (`../principles/spec-handoff.md`'s eight states, empirically): force empty, error, offline, hostile content (longest-realistic input, paste a 300-char string), back/refresh mid-flow, and — where plausible — concurrent change. Every state you can reach that shows improvised or missing design is a finding; every state you *can't* test goes to the "couldn't verify" list.
3. **Coherence sweep** (`../principles/motion-behavior.md` §3 + `interaction-design.md`): inventory every transition's duration/easing and every feedback pattern into one table — outliers are findings; run the repeated-use test on the flow's core loop (anything intolerable by rep five); reduced-motion walkthrough; and check the same operation behaves identically at every place it appears (cross-surface, and cross-platform if applicable — `../topics/cross-platform-consistency.md`'s parity rows for this flow).

**Artifact ③ format:** findings table (step · action/state · expected per doc · observed · evidence · severity) + the transition/feedback inventory table (which doubles as the flow's starter motion vocabulary when remediation begins).

## Phase 4 — Prioritized remediation plan → artifact ④ (half a day)

Merge ①–③ into one plan; this is the artifact people act on, so its discipline matters most:

1. **Deduplicate by mechanism, not symptom** — one root cause (e.g., "step transitions remount without focus/scroll management") often owns findings in all three artifacts; group them, because it's one fix.
2. **Prioritize by severity × affected population × frequency of encounter** (the `usability-testing.md` §2 grid, with reach added since this is production): task-blocking on the money path for everyone > task-blocking for keyboard/AT users (still Blocking — a blocked population is not a lower tier) > major friction at high traffic > the long tail.
3. **Name the fix pattern and its doc** per group ("adopt focus-management-on-step-change — `journey-accessibility.md` §2"; "state × event matrix for steps 2–4 — `spec-handoff.md`"), the owning team, and a size guess (S/M/L). Patterns, not implementations — the audit stays an audit.
4. **Carry the "couldn't verify" list and the recommended verification tests** as first-class plan items — unknowns are risk, and the cheap research (tree test, 5-user round per `building-a-validated-flow/README.md` phases 1/3) that would convert them is often the highest-leverage line in the plan.
5. **Attach the re-audit trigger:** which items, once fixed, get re-verified how (the a11y items re-run through phase 1's steps 2–3; the funnel baseline re-measured). An audit without a re-verification path is a report, not a plan.

**Plan format:** top-5 table (mechanism · findings it owns · severity/reach · fix pattern + doc · owner · size) → full grouped backlog → couldn't-verify + verification-tests → re-audit triggers.

---

## Compressed checklist

- [ ] Phase 0: flow map (steps, all entry points, task in user words, state skeleton, funnel baseline)
- [ ] Phase 1 → ①: scanner + keyboard task + SR task + continuity; the one-sentence verdict
- [ ] Phase 2 → ②: entry findability, wayfinding, label audit, orphan crawl; flagged-vs-asserted discipline
- [ ] Phase 3 → ③: feedback, state-coverage, coherence sweeps; spam-click + throttle + repeated-use + reduced-motion run
- [ ] Phase 4 → ④: deduped by mechanism, grid-prioritized, fix patterns + owners, unknowns carried, re-audit wired
- [ ] Many flows? Phase 0 centrally, then fan out per `../orchestration/README.md`

## Related

Depth: `../principles/journey-accessibility.md` · `../principles/information-architecture.md` · `../principles/interaction-design.md` · `../principles/motion-behavior.md` · `../principles/spec-handoff.md` (the states the audit forces) · `../principles/usability-testing.md` (grid + mechanism discipline). Executable arms: `../agents/flow-accessibility-auditor.md`, `../skills/journey-accessibility-reviewer/SKILL.md`. Root-causing one known failure instead of sweeping: `../agents/usability-failure-tracer.md`. Building the replacement for what the audit condemns: `../building-a-validated-flow/README.md`.
