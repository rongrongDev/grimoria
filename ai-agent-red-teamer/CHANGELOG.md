# Changelog

All notable changes to the `ai-agent-red-teamer/` knowledge base. This field moves fast; every doc is date-stamped and every entry here is dated. Newest first.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)-ish, adapted for a knowledge base rather than software.

---

## [1.0.0] — 2026-07-06

Initial release. Full core-tier coverage, extended-tier at patterns+pitfalls depth, two end-to-end guides, two skills, one new subagent (plus a documented reuse of an existing one).

### Added — principles (core tier, full depth)
- `principles/core-principles.md` — the authority ≠ trust model, the trust boundary, the two structuring questions, the gate/authority decision trees, trajectory-over-output, cumulative effect, provenance, standing rules. The anchor doc.
- `principles/indirect-prompt-injection.md` — mechanism, channel taxonomy, detection (provenance tracing, instruction/data separation, reachability intersection, benign-marker probes, trajectory review), architectural fixes in leverage order, prevention.
- `principles/excessive-agency.md` — the authority/need gap, effective/transitive/ambient authority, the four scoping dimensions, red-flag audit list, prevention against capability creep.
- `principles/irreversible-actions-and-oversight.md` — irreversibility classification, action classes warranting gates, gate-meaningfulness failure modes (rubber-stamping, narration-vs-action, agent-satisfiable approval), dry-run/simulation, the gate/alert/autonomous decision tree.
- `principles/trajectory-evaluation.md` — why output-only eval fails, three-layer success criteria, **privilege escalation through legitimate chains** (folded in), logging schema for reconstructability, replay method.
- `principles/reporting-and-verification.md` — the report-not-attack tension, finding contents, severity by blast-radius × reachability, class-level (not instance-level) fix verification.
- `principles/multi-agent-orchestration.md` — the explicit dual: **Part A** (agents doing the red-teaming) and **Part B** (agents being red-teamed), kept separate throughout.

### Added — extended tier (patterns + pitfalls)
- `extended/multi-agent-collusion.md`, `extended/sandbox-and-environment-integrity.md`, `extended/goal-drift-long-horizon.md`, `extended/agent-handoff-injection.md`.

### Added — guides
- `guides/build-agent-redteam-program.md` (Capability A — program from scratch, 8 steps end-to-end).
- `guides/analyze-existing-agent.md` (Capability B — assess one system, 7 phases + checklist).

### Added — meta
- `README.md`, `DESIGN.md`, `GLOSSARY.md`, this `CHANGELOG.md`.

### Added — skills & subagents (physical home: `.claude/`)
- Skill `tool-permission-auditor` (`.claude/skills/tool-permission-auditor/SKILL.md`) — bounded excessive-agency review.
- Skill `irreversible-action-gate-reviewer` (`.claude/skills/irreversible-action-gate-reviewer/SKILL.md`) — bounded gate review.
- Subagent `injection-surface-scanner` (`.claude/agents/injection-surface-scanner.md`) — isolated whole-surface injection-channel sweep.
- **Reused, not forked:** the existing `agent-trajectory-tracer` subagent (built for `ai-engineer`) already treats injected content as a first-class finding, so this KB references it for trajectory forensics rather than duplicating it. Rationale in `DESIGN.md`.

### Deliberate scope decisions
- **No working attack content** anywhere — no injection payloads, exploit chains, or framework-hijack recipes. Verified by a dedicated second review pass at release (see standing gate below). This constraint overrode "comprehensive coverage" wherever they conflicted.
- **No separate `topics/` tree** — framework specifics live as "where this shows up" sections inside principles docs, to avoid inviting framework-hijack detail. (DESIGN.md deviation #2.)
- **Privilege-escalation-via-legitimate-chains** folded into `trajectory-evaluation.md` rather than given its own doc — mechanically it *is* the trajectory problem. (DESIGN.md deviation #3.)
- Content-safety / base-model methodology (jailbreaks, harmful-text taxonomy, responsible disclosure of base-model findings) is **linked to `ai-model-red-teamer/`**, not restated.

---

## Standing gates for future changes

Apply these to every addition or revision before it merges:

1. **Payload-free review (non-negotiable).** A second reader checks specifically for accidental working-attack content — injection strings, reproducible exploit chains, framework-hijack steps, anything runnable if copied. If found, strip to mechanism + fix. This gate outranks completeness.
2. **Single-source rule.** A fact lives in one doc; new content links rather than restates. If you're re-teaching a taxonomy, you're in the wrong file.
3. **Date + maturity stamp.** Bump the version/date on any revised doc; note the framework-maturity level it applies to; add a changelog entry.
4. **Standalone check.** Every doc must remain readable and safe in isolation by a smaller model with no other context.
5. **Extended-tier depth cap.** Extended docs stay at patterns+pitfalls. Promoting one to full depth (into `principles/`) is an explicit, changelog-recorded decision.
