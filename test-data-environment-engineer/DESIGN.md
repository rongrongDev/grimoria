# Design Note — test-data-environment-engineer KB

> Last reviewed: 2026-07-09. Structural conventions match sibling KBs `quality-dev/` and `test-automation-engineer/`.

This knowledge base encodes the judgment of a principal test data & environment engineer. It owns the **substrate**: the data that tests run against and the environments they run in — seeding, masking/anonymization, provisioning, refresh, cleanup, and the compliance envelope around all of it. It deliberately does **not** own test strategy (that's `quality-dev/`) or automation frameworks and execution infrastructure (that's `test-automation-engineer/`). Where a topic touches those KBs, this one links out instead of duplicating.

## How content was assigned to primitives

**Principles (`principles/`) — knowledge to be read and reasoned about.** Everything whose value is *judgment* lives here: when to subset vs. synthesize, why deterministic masking is both required and dangerous, what environment parity actually means (it is not "same versions"). Each core-tier doc carries the full failure-mode → detection → fix → prevention treatment plus a decision tree and a war story, because a reader (human or model) facing a novel situation needs the reasoning, not a script. `core-principles.md` is the compressed judgment layer — the ten rules that survive when everything else is forgotten.

**Patterns (`patterns/`) — extended-tier topics.** Service virtualization, environment scheduling, self-service data platforms, and production-scale subsetting get production-patterns + common-pitfalls depth only, per scope. They are separated from `principles/` so a reader knows the depth contract differs: these tell you what works and what bites, not the full theory.

**Guides (`guides/`) — the two end-to-end capabilities.** `build-a-platform-from-scratch.md` (capability A) and `assess-an-existing-setup.md` (capability B) are *sequenced procedures* that chain the principles docs into an executable path. They belong to neither principles (they don't teach theory) nor skills (they're too large and multi-session to be a single invocation).

**Skills (`skills/<name>/SKILL.md`) — repeatable capabilities with bounded inputs and an output contract.** A skill is chosen when the work is: (a) done repeatedly on different inputs, (b) completable in one focused session, (c) checkable against an explicit output contract. Three qualify:
- `masking-coverage-reviewer` — review a masking config against a schema; the output contract (coverage table + re-identification findings) is independently testable against a known-bad fixture.
- `environment-parity-auditor` — diff a test environment against production across the five parity layers.
- `seed-dataset-designer` — produce a seed-data spec for a named test scenario.

**Subagents (`agents/<name>.md`) — work that must run in an isolated context window.** The test is *context poisoning*: does the work emit volumes of intermediate output (hundreds of table definitions, full pipeline logs) that would degrade the calling agent's reasoning? Two qualify:
- `pii-field-scanner` — sweeps an entire schema + data samples for likely-sensitive fields; reads potentially thousands of columns, returns a ranked gap list. Runs read-only with a minimal tool allowlist because it handles live sensitive data.
- `state-leak-tracer` — replays a pipeline run's data mutations to find shared-state contamination; log volume makes it isolation-worthy.

**Commands** — none. Nothing in this domain is trivial enough that auto-invocation would be wrong *and* a one-liner is right. Default-to-skills held.

## Structural decisions worth explaining

- **Compliance & governance is a principles doc, not a guide.** Legal-basis judgment (GDPR/HIPAA/PCI) changes *which* technical option is permissible; it must be readable as reasoning material before any pipeline is designed, and it gates several decision trees.
- **Every doc is standalone.** Each opens with scope, version/date stamp, and the links it depends on. A smaller model given only one file plus its direct links can act on it. Cross-references are real relative paths.
- **Orchestration (`orchestration/README.md`) covers only multi-agent coordination** — planner/implementer/reviewer splits, fan-out audits, and agent-specific failure modes (redundant environment provisioning, collisions on shared data, trusting masked data without join analysis). It intentionally does not restate single-agent content.
