# Multi-Agent Orchestration for UI Work

**Scope:** how to deploy multiple AI agents on visual-layer work without them doing to your design system in a week what forty ungoverned engineers do in three years. Assumes the primitives in `../DESIGN.md` and general agent mechanics from your harness docs; this is UI-specific judgment only. **Date:** 2026-07-13.

## The core insight: agents are the fork problem at machine speed

Everything in `../principles/governance.md` about humans under deadline applies to agents, amplified: an agent that can't find the Button **will write a Button**, in seconds, confidently, with plausible tokens it invented. Parallel agents are a *team of new hires with no memory and no hallway* — every coordination mechanism that works for them (published criteria, canonical catalogs, gates) is mandatory here, and every informal mechanism humans rely on (asking a neighbor, remembering last week) is absent. Orchestrate accordingly: **shared vocabulary decided before fan-out, review gates that don't share the author's context, and the catalog injected into every agent's context rather than hoped-for.**

## Pattern 1 — Planner / implementer / reviewer split (when, and when not)

**Use the split when** the work spans multiple components or teams' surfaces and consistency *is* the deliverable: a token migration, a component consolidation, a theme retrofit.

- **Planner** (or human): produces the shared decisions that must exist *before* parallelism — the semantic-token vocabulary, the canonical component list, naming conventions, the migration order. Output: a written contract, because agents can't absorb intent any other way.
- **Implementers** (parallel, scoped): each owns a disjoint file/directory slice, consumes the contract read-only, and **may not add tokens, components, or conventions** — a needed-but-missing token is a *blocking finding returned to the planner*, never something an implementer mints. This single rule prevents the worst outcome (see failure modes).
- **Reviewer** (separate context, always): runs the `../skills/design-system-consistency-reviewer/` skill against each implementer's diff *without the implementer's context* — sharing context defeats the purpose, because the reviewer inherits the implementer's rationalizations. The visual-regression suite (`../principles/visual-regression-testing.md`) is the reviewer's instrument: parity migrations must produce **zero diffs**; any diff is a finding, not a baseline update.

**Don't split** for single-component work — a lone agent with the docs (`component-from-tokens-generator` skill for scaffolds) plus the normal PR gate is cheaper and loses nothing. The split's overhead is justified exactly when parallel divergence is possible.

**Gate placement that works:** consistency review *before* merge, per slice (drift compounds — ten merged slices with slightly different token choices is a new audit, not a migration); visual suite on every PR touching shared components (the blast-radius tripwire); contrast pair-check and lint ratchets in CI so the mechanical 80% never reaches the reviewer.

## Pattern 2 — Fan-out audits (the read-only fleet)

Auditing token adoption / duplication / fidelity across many packages or teams' codebases is embarrassingly parallel and read-only — the safe, high-yield orchestration case:

- One auditor per package/repo, each running the relevant phase of `../auditing-a-ui-codebase/README.md` (or dispatching its subagents) with an **identical rubric and output schema** — the aggregator can only sum findings that were counted the same way, so the schema is the contract; ad-lib formats make cross-team comparison fiction.
- The aggregator merges into the org-level census (`governance.md` §metrics feeds on exactly this) and — the step teams skip — **cross-references the duplication reports across repos**: five teams' "local" DataTables are invisible to any single-repo scan and are the org's biggest consolidation win.
- Read-only tool allowlists for every auditor, without exception. An auditor that fixes-while-auditing produces unreviewed changes *and* a stale report in one move (same rule as `web-dev`'s dependency scanner, same reason).

## Pattern 3 — The standing gates (orchestration you install once)

Not a workflow — permanent machinery: the consistency-review skill runs on every PR that touches `components/` or `tokens/`; the visual suite gates shared-component merges; the `duplicate-component-scanner` subagent runs quarterly and after any big agent-assisted delivery push (agent-written code is where new near-duplicates now come from — scan for them *proactively*, because agents produce in a sprint what humans produce in a year, and the duplicates arrive at the same rate).

## Failure modes specific to parallel agents on UI

1. **Parallel invention of the "shared" component.** Agents A and B, migrating different features, each need a Badge; none exists; each writes one — same week, different props, different tokens. This is `component-api.md` §3's fork failure without even a deadline excuse. *Prevention:* the implementer no-minting rule; the component catalog (Storybook index / exports list) injected into every implementer's context; the scanner run *after* the push, because prevention leaks.
2. **Conflicting token-naming conventions introduced independently.** Agent A needs a warning color and adds `color.warning.bg`; agent B, same day, adds `color.bg.warning`. Both PRs pass review individually — each is locally consistent — and the vocabulary now has two grammars, which every future agent will extend along whichever it saw first. *Prevention:* tokens are planner/human-owned, period; a schema lint on token JSON (enforce the `category.role.modifier` grammar mechanically) so the convention is code, not lore.
3. **The confident wrong baseline update.** An agent's change produces visual diffs; the agent, "fixing CI," updates the baselines — burying a real regression under an authoritative-looking commit. *Prevention:* baseline updates are human-approved (or owner-team-approved) by policy and by CI permission — an agent may never approve its own visual diff (`visual-regression-testing.md` §3's workflow, enforced with teeth).
4. **Rubric drift across a fan-out.** Ten auditors, subtly different prompts (or the same prompt and different interpretations of "component"), produce numbers that can't be compared — the aggregate census is authoritative-looking noise. *Prevention:* one rubric file passed verbatim to all; a calibration sample (two auditors on the same package, diff their outputs) before trusting the fleet; the aggregator flags per-repo outliers as *methodology* suspects before treating them as findings.
5. **Context-window token misuse.** An agent deep in a long migration loses the semantic-token table from its context and starts pattern-matching from nearby code — which, mid-migration, is exactly the legacy pattern being removed. *Prevention:* slices sized so contract + slice fit comfortably; the contract re-injected per slice, not per session; lint ratchets as the backstop that doesn't depend on anyone's memory, silicon or otherwise.

## Related

- The sociology these patterns mechanize: `../principles/governance.md`. The review instrument: `../skills/design-system-consistency-reviewer/`. The fleet arms: `../agents/`. The safety net under all of it: `../principles/visual-regression-testing.md`.
