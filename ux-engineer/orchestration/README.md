# Multi-Agent Orchestration for UX Work

**Scope:** when and how to split UX-engineering work across multiple AI agents — role splits, fan-out patterns, and the failure modes specific to UX work (which differ from code-work failure modes in one important way: much of the ground truth lives in *user behavior*, which agents cannot generate, only respect). **Date:** 2026-07-13.

## The one principle over all of it

**Agents can execute every rubric in this KB; they cannot replace the evidence the rubrics run on.** An agent can walk a flow keyboard-only, fill a state × event matrix, translate graded findings into requirement blocks. No agent can *be* five users. Orchestration that treats agent output as a substitute for user evidence — rather than as preparation for it or faithful processing of it — produces confident, well-formatted fiction. Every pattern below has a "where the human evidence enters" line for exactly this reason.

## Role splits that work

### 1. The accessibility gate (reviewer as a blocking role)

Before a flow ships, a `flow-accessibility-auditor` dispatch (isolated context) walks it end to end per `../principles/journey-accessibility.md`; the parent (or the human) triages its findings table; Blocking findings stop the release. Why a separate agent and not the implementer checking its own work: the implementer's context is saturated with how the flow is *supposed* to behave, which is precisely the knowledge that makes focus discontinuities and missing announcements invisible — the same reason human self-review fails, mechanized. Where the human evidence enters: the gate verifies *operability* (can the task be completed by keyboard/SR); periodic sessions with real AT users remain the ground truth for *usability* of the accessible path.

### 2. Parallel translation (spec production alongside prototype iteration)

While the main session iterates a prototype (Phase 2–3 of `../building-a-validated-flow/README.md`), a `research-to-spec-translator` invocation processes the *previous* round's graded findings into requirement blocks. The two workstreams meet at Phase 5, where the spec absorbs the current prototype's final shape. This pipelining works because translation needs the findings, not the prototype — but it requires the findings to be *graded already* (severity × frequency per `../principles/usability-testing.md`); feeding an agent raw session notes and letting it infer the grid is failure mode 3 below. Where the human evidence enters: it *is* the input; the agent only reshapes it.

### 3. Planner / implementer split for prototype builds

A planning pass (which fidelity dials, which states, which fixtures — the Phase 0–2 decisions of the from-scratch guide) produces a fidelity contract; an implementer agent builds *to the contract*. The contract is the control: an unconstrained implementer agent polishes (failure mode 4). The planner also decides throwaway-vs-evolutionary up front, which determines the code standards the implementer follows — deciding that after the fact is how prototypes ship (`../principles/prototyping-fidelity.md` §1).

## Fan-out patterns

### Auditing many flows at once

The `../auditing-a-flow/README.md` playbook scales by: **Phase 0 centrally** (one agent or the parent maps all flows — the inventory must be consistent or the merge isn't), then **one auditor dispatch per flow** (phases 1–3; `flow-accessibility-auditor` for artifact ①, or a full-playbook agent per flow for ①–③), then **merge at Phase 4 in the parent**, deduplicating *by mechanism across flows* — the finding that matters most in a fan-out is the one appearing in every flow's table (a shared step-transition component breaking focus everywhere), and it's only visible at the merge. Rules that keep the fan-out honest: every auditor gets the same rubric (this KB's docs — no per-agent improvised criteria), reports in the same findings format (location · class · evidence · severity), and marks unverifiable items as "couldn't verify" rather than silently skipping (a skipped check reads identically to a passed check in a merged table unless the format forbids it).

### Fan-out anti-pattern: parallel *design* work on one flow

Fanning out *audits* works because reading doesn't conflict. Fanning out *design or spec authorship* on the same flow does not: two agents each writing "their" steps' interaction specs will produce locally-reasonable, mutually inconsistent feedback patterns, terminology, and timing (failure mode 2). Design work on a flow parallelizes by *layer* (one agent on the state matrix, one on motion rows, one on copy — different columns of the same artifact, merged by one owner), never by *territory* (steps 1–2 vs. steps 3–4).

## Failure modes

### 1. The scanner-equals-audit failure (the big one)

- **Failure:** an agent asked to "check accessibility" runs axe, sees green, reports the flow accessible. Every incentive points here — the scan is fast, mechanical, and produces authoritative-looking output — and it is structurally wrong: scanners catch a third to half of WCAG issues and zero journey failures (`../principles/journey-accessibility.md`). The agent has verified the scannable layer and *labeled* it as the whole.
- **Detection:** any a11y report that contains no task-completion narrative ("completed checkout via keyboard in N stops; stalled at X") is a scan wearing an audit's clothes. Findings tables with only element-level SCs (1.1.1, 4.1.2, contrast) and no 2.4.3/2.4.7/4.1.3/journey items carry the same signature.
- **Fix / prevention:** the dispatch prompt and the subagent definition *require* the walkthrough steps and the per-transition evidence (ours does — `../agents/flow-accessibility-auditor.md`); the parent rejects reports that lack them; scan results are reported as "element layer clean," a phrase this KB uses deliberately everywhere.

### 2. Conflicting specs from parallel agents

- **Failure:** two agents spec adjacent parts of one flow; each invents reasonable-but-different answers for the shared questions (error presentation, verb choice, motion timing, focus behavior). The conflict ships, because each spec is internally consistent and nobody diffs across them — recreating, at agent speed, the two-teams war story in `../principles/spec-handoff.md`.
- **Detection:** cross-spec grep before implementation: same operation different verbs, same event class different feedback patterns, raw timing values differing across files.
- **Fix / prevention:** **single-writer rule** — one flow's behavioral spec has one owning context; parallelism by layer, not territory (above); shared vocabularies (terminology table, motion patterns, feedback patterns) created *before* fan-out and injected into every dispatch, so agents reference definitions instead of minting them. Missing vocabulary is a finding to report, not a gap to improvise — the same rule `ui-engineer/orchestration/README.md` enforces for tokens, for the same reason.

### 3. Severity laundering through summarization

- **Failure:** raw session notes → agent summary → agent translation → spec, and somewhere in the chain "2 of 6 participants, task-blocking" becomes "some users struggled" becomes a Consider-tier line item. Each hop is a compression, and compressions strip exactly the metadata (n-of-N, severity, mechanism) that `../principles/research-to-spec.md` §3 exists to protect — the deck problem from that doc's war story, automated.
- **Detection:** spot-check requirements back to source: can each walk its chain to a counted observation? Any Evidence field reading "research indicates" without IDs is laundered.
- **Fix / prevention:** grading happens *once*, at the source, by the human who watched (or with them in the loop); agents downstream carry the grid values forward verbatim as structured fields, never re-derive them from prose. The `research-to-spec-translator` skill's template makes the fields mandatory, which is most of the defense.

### 4. Fidelity inflation by helpful implementers

- **Failure:** an agent asked to "improve the prototype" between rounds does what agents do — polishes: design-system styling, smooth transitions, filled-in edge states nobody designed. The next session's participants now defer to the polish (`../principles/prototyping-fidelity.md` war story), and stakeholders start asking to ship it. The agent turned dials the fidelity contract said to leave alone, and made the *apparatus* lie.
- **Detection:** diff the prototype's dials against the contract before each round — visual polish, motion, and new states that no finding requested are inflation.
- **Fix / prevention:** the fidelity contract is in every implementer dispatch, phrased as constraints ("visual dial stays at wireframe; fix only the two dead-ends in findings F3, F7"); prototype changes between rounds are driven *by the findings list only*.

### 5. The evidence-free confidence loop

- **Failure:** the fully-agentic pipeline — agent audits, agent translates, agent respecifies, agent implements — runs without ever touching a user, and each stage's confident output launders the last stage's guesses into premises. Weeks later the team has beautiful artifacts describing a flow no user has seen; disagreements get settled by whichever agent wrote last instead of by evidence.
- **Detection:** ask of any artifact: *what user behavior is upstream of this?* If the answer bottoms out in another artifact, the loop is closed and the evidence is zero.
- **Fix / prevention:** the pipeline has mandatory evidence ports — Phase 3 of the from-scratch guide (sessions) and the verification tests of the audit playbook are not automatable steps, and the orchestration plan schedules them as external dependencies, exactly like a deploy gate. Agents prepare for, and process, evidence; the calendar contains humans.

## Dispatch hygiene (applies to everything above)

Every dispatch carries: the rubric doc paths (agents apply docs, they don't improvise criteria), the shared vocabularies, the output format with evidence fields, and the "couldn't verify ≠ passed" rule. Every merge deduplicates by mechanism and preserves counts. And the standing rule inherited across this KB pair: **read-only agents stay read-only** — an auditor that fixes what it finds has destroyed both its coverage and its credibility.

## Related

- The subagents these patterns dispatch: `../agents/flow-accessibility-auditor.md`, `../agents/usability-failure-tracer.md`.
- The skills that run inline instead: `../skills/journey-accessibility-reviewer/SKILL.md`, `../skills/research-to-spec-translator/SKILL.md`.
- Sibling doc for the visual layer's agent patterns (token-minting bans, baseline-update gates): `ui-engineer/orchestration/README.md`.
