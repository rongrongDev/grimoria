# Design Note — game-dev Knowledge Base

**Author context:** Principal game engineer, 20+ years across Unity, Unreal, and two custom engines; shipped on PC, console, and mobile; live-service and premium titles. This KB is the retirement handoff — everything here must work without me in the room.
**Written:** 2026-07-06. Engine versions covered: Unity 6.x (6000.x LTS line), Unreal Engine 5.4–5.6, Godot 4.3–4.5. Anything newer: verify against release notes before trusting version-specific claims; the *judgment* (why the rules exist) ages far slower than the API names.

## Why the tree is shaped this way

The single most important structural decision: **engine-agnostic judgment lives in `principles/`, engine-specific mechanics live in `engines/<name>/`.** In 20 years I've watched three engine migrations kill teams who had encoded all their knowledge as "how to do X in engine Y." The reason a fixed timestep exists, why per-frame allocation kills you, what makes a simulation desync — these outlive any engine. The engine docs deliberately *reference* principles docs for the "why" and only add the "how here, and what this engine gets wrong."

```
game-dev/
├── README.md                 # 30-second router: task → doc/skill/subagent
├── GLOSSARY.md               # one canonical definition per term
├── CHANGELOG.md              # dated, per-engine-version revision history
├── DESIGN.md                 # this file
├── principles/               # engine-agnostic judgment — READ AND REASON
│   ├── game-loop-and-timing.md
│   ├── performance-and-frame-budgets.md
│   ├── concurrency-and-race-conditions.md
│   ├── networking-and-multiplayer.md
│   ├── architecture-ecs-vs-oop.md
│   ├── save-load-and-versioning.md
│   ├── security-and-anti-cheat.md
│   ├── testing-and-determinism.md
│   ├── asset-pipeline-and-memory.md
│   └── multi-agent-orchestration.md   # how to run AI agents on game code, not game content
├── engines/
│   ├── unity/                # CORE TIER — full depth, 5 docs
│   ├── unreal/               # CORE TIER — full depth, 5 docs
│   ├── godot/README.md       # EXTENDED TIER — production patterns + pitfalls only
│   ├── custom-engine/README.md        # extended tier
│   └── console-certification/README.md# extended tier, platform-agnostic (cert specifics are NDA'd)
└── guides/
    ├── build-from-scratch.md          # Capability A: deterministic loop + ECS + predicted netcode + tests
    └── analyze-existing-project.md    # Capability B: bounded-time audit of an unfamiliar game codebase

.claude/skills/   (shared across this repo's KBs)
    gc-allocation-auditor/SKILL.md
    netcode-desync-reviewer/SKILL.md
    frame-budget-planner/SKILL.md
.claude/agents/
    frame-profiler-analyzer.md
    save-state-auditor.md
    allocation-hotspot-scanner.md
```

## Doc vs. Skill vs. Subagent — the actual decision rule

I applied one test per piece of content:

1. **Does it change what you *decide*?** → principles/engines doc. Architecture tradeoffs, frame-budget math, "when rollback beats lockstep" — you read these, you don't execute them. A doc is the right primitive when the value is in the reasoning chain, and the reader (human or model) needs to adapt it to context I can't foresee.

2. **Is it a repeatable procedure over an artifact you already have in context (a diff, a feature, a plan)?** → Skill. `gc-allocation-auditor` runs on a diff sitting in the conversation; `netcode-desync-reviewer` runs on a feature's code you can name; `frame-budget-planner` runs on a design doc. Skills carry a checklist honed by specific failures — they exist because smaller models reliably *miss the same things* (boxing allocations, unseeded RNG in simulation code) unless walked through the exact sequence.

3. **Does the work require reading volumes that would poison the calling context, returning only a verdict?** → Subagent. `frame-profiler-analyzer` ingests a multi-megabyte profiler capture; `allocation-hotspot-scanner` reads every per-frame code path in a repo; `save-state-auditor` reads all serialization code plus historical save formats. All three produce a short ranked report from a mountain of input. That asymmetry — huge read, small write — is the *only* reason these are subagents. A subagent that reads three files is just a slower skill.

4. **Commands:** none. Nothing here is trivial enough that losing auto-invocation is acceptable.

Deliberate redundancy: the skills restate the 10–15 highest-value checks from their backing principles doc rather than just linking, because a skill must work when the model never loads the doc. The doc holds the war stories and the why; the skill holds the executable distillation. When they disagree, the doc wins and the skill has a bug — file it in CHANGELOG.

## Depth allocation

- **Core tier (Unity, Unreal, engine-agnostic):** every §3 technical area gets failure mode → detection → fix → prevention, with numbers (frame budgets in ms, allocation sizes, tick rates) not adjectives.
- **Extended tier (Godot, custom engines, console cert):** the 80% of pain that comes from the 20% of pitfalls, one README each. Godot gets real production patterns because teams increasingly ship on it; console cert stays platform-agnostic because TRC/XR/lotcheck specifics are under NDA — what I *can* hand over is the categories that fail cert and the engineering posture that passes it the first time.

## What I chose NOT to include

- Gameplay/design content (balancing, feel, UX) — different discipline, would dilute trust in the engineering content.
- Engine-version-specific API walkthroughs that duplicate official docs — I link the concept, docs churn too fast.
- Exact console cert requirements — NDA. The console doc teaches the shape of cert so nothing in it goes stale or leaks.

## Maintenance contract

Every doc carries `Applies to:` and `Last reviewed:` in its header. When an engine ships a change that invalidates a claim (e.g., Unity's GC characteristics, UE's replication defaults), update the doc, stamp CHANGELOG with the engine version that triggered it. If you can't verify a version-specific claim, mark it `[UNVERIFIED for <version>]` rather than deleting — the historical reasoning still teaches.
