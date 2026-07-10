# Design Note — ml-engineer Knowledge Base

**Version 1.0 — 2026-07-06.** Author: retiring principal ML engineer. This note explains *why* content landed where it did, so future maintainers extend the KB without eroding its structure.

## The one organizing idea

Everything in this KB is organized around a single observation from 20 years of production ML: **almost every serious ML failure is a silent divergence between two things that were supposed to be the same.** Training features vs. serving features. Offline metric vs. business objective. The data the model was trained on vs. the data it sees today. The experiment you logged vs. the experiment you actually ran. The docs are structured so that every one of these divergence classes has one canonical home, and every skill/subagent is a detector for one of them.

## Primitive assignment (doc vs. Skill vs. Subagent)

The rule I applied: **principles teach, skills do, subagents isolate.**

- **`ml-engineer/principles/`** — cross-cutting judgment that applies regardless of framework: leakage, skew, evaluation, training discipline, serving, monitoring, MLOps, testing, multi-agent orchestration. These are the docs you *reason from*. Each follows failure mode → detection → fix → prevention.
- **`ml-engineer/topics/`** — stack-specific mechanics (sklearn, PyTorch, MLflow, Feast, serving infra) plus extended-tier pattern docs (distributed training, TensorFlow, AutoML, recsys, time-series). Flat files, not directories — every topic fits comfortably in one document, and one file per topic keeps "independently readable" trivially true. (The brief suggested `topics/<name>/`; I chose flat files deliberately — a directory per topic invites splitting content below the unit of independent readability.)
- **`ml-engineer/guides/`** — the two end-to-end capabilities: build a pipeline from scratch, analyze an existing system. Guides sequence the principles; they do not restate them.
- **`.claude/skills/`** — repeatable *reviews of bounded artifacts* whose findings must land in the caller's working context: `data-leakage-scanner` (review a feature/training pipeline diff or named files), `train-serve-skew-auditor` (compare two named code paths), `eval-protocol-reviewer` (review an evaluation setup). These read a handful of files; isolating them would only hide the findings from where the work is happening.
- **`.claude/agents/`** — work whose *reading* is unbounded and would flood the caller: `pipeline-regression-tracer` (trace a production quality regression back through data → features → training → serving; reads logs, data snapshots, and many files, returns a verdict) and `ml-repo-leakage-scanner` (whole-repository sweep for leakage and skew sources across every pipeline, not one diff).

**Deliberate deviation from the brief's examples:** the brief listed `eval-protocol-reviewer` as a subagent. I made it a skill. An eval-protocol review reads a small, nameable set of files (split code, metric definitions, eval config) and its findings gate decisions in the caller's context — that is the skill shape. The subagent boundary I actually respect is *context volume*, not topic. Repo-wide scans and log-trawling traces are agents; bounded reviews are skills.

## Boundary rules (so the KB doesn't rot)

1. A fact lives in exactly one place; everything else links to it. Leakage taxonomy lives in `principles/data-leakage.md`; the skill references it rather than restating it.
2. Skills and agents carry procedure and output contracts only. If you find yourself teaching theory in a SKILL.md, move it to principles and link.
3. Every doc carries a version/date stamp and the framework versions it was verified against. When you revise, bump the stamp and add a CHANGELOG entry.
4. Extended-tier topics stay at production-patterns + pitfalls depth. If one grows full-depth demand, promote it to core tier explicitly in the CHANGELOG.

## Reading-order contract

`README.md` is the map (find anything in <30s). `GLOSSARY.md` is the shared vocabulary. New readers: README → the two guides → principles as needed. Agents/small models: invoke the skill; the skill links exactly the principles sections it depends on.
