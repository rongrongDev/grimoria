# Multi-Agent Orchestration for Tooling Work

**Applies to:** running AI agents (or humans-plus-agents) on developer-tooling tasks — tool changes, audits, rollouts. **Last verified:** 2026-07-06.

Tooling work has a property most software work doesn't: **the blast radius of a mistake is the whole org, and the evidence needed to avoid the mistake is bulk** — thousands of call sites, hundreds of CI configs, megabytes of build logs. That combination is exactly what multi-agent structure is for: put the bulk reading in isolated contexts, keep the judgment in one place, and never let the agent holding the pen be the agent grading the work. This doc is about *when* to split and *what goes wrong*, not a restatement of the principles docs — each pattern names the failure it exists to prevent.

## 1. When to split at all

Don't, by default. A single agent with the right principles doc in context handles most tooling tasks — writing a lint rule, fixing an error message, reviewing a diff. Split when one of three conditions holds:

1. **Bulk-evidence condition:** the task requires reading far more than it concludes (org-wide call-site enumeration, CI-history mining, build-log forensics). → isolate the reading in a subagent that returns a small structured report (`change-impact-scanner`, `build-breakage-tracer`).
2. **Author-cannot-grade condition:** the change's risk is org-blocking (build rules, shared lint configs, generator releases, anything in `distribution-and-versioning.md` §2's protocol). → separate implementer from reviewer; the reviewer gets the *checklists*, not the implementer's rationale, so it re-derives rather than rubber-stamps.
3. **Fan-out condition:** the same bounded procedure applies independently to many targets (audit 20 CLIs for convention compliance). → parallel workers, one merger.

If none hold, added agents are added drift surface.

## 2. The pre-rollout pattern: scan → plan → implement → verify (in that order, gated)

For any breaking change to a widely-used tool, the sequenced roles:

1. **Impact scanner** (isolated subagent, read-only): enumerate every consumer of the surface being changed — before any design is finalized. Output: blast-radius table by team.
2. **Planner** (main context, holding the scan report + `distribution-and-versioning.md` §2): decides deprecation window, migration tooling scope, announce list. The plan cites the scan by team name — "we'll announce broadly" is the tell that step 1 was skipped.
3. **Implementer(s)**: the change + the codemod + the compat shim, as separate reviewable pieces.
4. **Verifier** (fresh context, no implementer rationale): runs the checklists — old invocations still work and warn, codemod is idempotent, exit codes unchanged, `--help` snapshots diff as expected. For codegen: regenerate-the-world and classify the diff (`codegen.md` §2).

**The gate that matters:** step 3 does not start until step 1's report exists. The single most expensive tooling-agent failure I've seen replayed is an agent (or a hurried human — the pathology predates AI) shipping a flag removal with a beautiful changelog and zero call-site scan; the change was correct, documented, announced — and broke 60 CI pipelines that were never going to read the announcement. Correctness of the change is not the risk; *unenumerated consumers* are the risk, and only the boring scan retires it.

## 3. The fan-out audit pattern: many tools, one rubric

Auditing an estate (all internal CLIs for flag-convention compliance; all generators for drift; all dashboards for freshness stamps):

- **One rubric, written first**, in the dispatch prompt — the relevant checklist from the principles doc, plus the exact output contract (the table schema from `guides/analyze-an-existing-tool.md`). Workers grade against the rubric; they do not invent criteria, or you'll merge twenty incompatible taxonomies.
- **One worker per tool**, isolated (each reads one repo's worth of noise); `guides/analyze-an-existing-tool.md` at quick-pass budget is the worker procedure; skills (`cli-error-ux-reviewer`, `codegen-drift-auditor`) are its executable sub-steps.
- **One merger** in the main context: deduplicates *systemic* findings (eight tools with the same unpinned-install bug is one platform finding, not eight tool findings), ranks by blast radius, and produces the estate report. The merger also arbitrates rubric drift — where two workers scored the same pattern differently, the merger re-decides and notes the rubric ambiguity for next time.
- **Cap concurrency at your review capacity**, not your compute capacity. Twenty parallel audits that produce twenty unread reports achieved nothing but spend.

## 4. The post-rollout pattern: a watcher with thresholds, not vibes

After a tool release or rule flip, a monitoring agent earns its keep only if it's armed with **pre-committed numeric triggers** (from the rollout plan, `guides/build-a-cli-from-scratch.md` §10): unclassified-error ratio, old-version tail decay, suppression growth, adoption-vs-last-week. Its job: watch telemetry/support channels, compare against triggers, and *notify with evidence* — never remediate. A watcher that "notices things seem fine" is confirmation bias with an API bill; a watcher that pages on "canary error rate 3× stable" is a rollback trigger working as designed. If you can't state the thresholds, you're not ready to delegate the watching — you're not ready to roll out, either.

## 5. Failure modes specific to tooling agents

| # | Failure mode | Why it happens | Prevention |
|---|---|---|---|
| 1 | **Breaking change shipped without call-site scan** | The change is locally verifiable, so the agent verifies locally and ships; consumers are invisible from inside the repo | Hard gate: no interface-changing PR without an attached `change-impact-scanner` report (make it a PR-template/CI check, not a norm) |
| 2 | **Parallel agents produce conflicting codegen** | Two agents regenerate overlapping output with different generator versions or concurrent writes; diffs oscillate, each "fixing" the other | One-writer rule (`codegen.md` §6): all regeneration serialized through one agent/one pinned version; other agents treat generated paths as read-only |
| 3 | **The auditor "fixes" what it measures** | An agent sent to count suppressions starts removing them; the report becomes unverifiable and the diff unreviewed | Analysis agents are read-only *by tool allowlist* (no Edit/Write), not by instruction alone — instructions lose to helpfulness eventually |
| 4 | **Agent trusts `--help` / README over behavior** | Docs describe aspiration; the agent audits the aspiration and greenlights the reality | Rubrics mandate behavioral probes (run it wrong, check exit codes, close stdin) — the phase-1 discipline of `guides/analyze-an-existing-tool.md` |
| 5 | **Reviewer contaminated by implementer's rationale** | Verifier reads the PR description, adopts its frame, checks that the code does what the description says — not what the checklist says | Fresh-context verifier gets diff + checklist only; rationale withheld until after verdict |
| 6 | **Fan-out without a merger** | Twenty reports, no estate view, systemic bugs counted twenty times or zero | Merger role staffed before workers dispatch; output contracts identical across workers |
| 7 | **Watcher without thresholds** | "Monitor the rollout" delegated as vibes; agent reports prose reassurance | Numeric triggers pre-committed in the rollout plan; watcher outputs trigger-vs-observed table |

## 6. This KB's own division of labor (worked example)

- **Skills — judgment-dense, bounded-read, result-lands-in-context:** `cli-error-ux-reviewer`, `codegen-drift-auditor`. Run them *in* the conversation where the tool's author is working; stranding a UX review in a subagent report defeats its purpose.
- **Subagents — bulk-read, small-return, read-only:** `change-impact-scanner` (pattern §2 step 1), `build-breakage-tracer` (build-log + tool-change forensics; the isolated half of failure triage). Their allowlists omit write tools deliberately — that's failure mode #3's prevention, in config rather than prose.
- **Guides — the orchestrator's script:** `analyze-an-existing-tool.md` is written to be dispatchable as a fan-out worker (§3); `build-a-cli-from-scratch.md` §10 produces the thresholds §4 requires.

## Cross-references

Breaking-change protocol the patterns enforce: `principles/distribution-and-versioning.md` §2 · One-writer codegen law: `principles/codegen.md` §6 · Rollout thresholds and adoption metrics: `principles/adoption-and-rollout.md` §4, `extended/productivity-metrics.md` · Agent-on-test-suite pathologies (adjacent, same shape): `quality-dev/orchestration/README.md`.
