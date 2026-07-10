# Analyze an Existing App — From Unknown Codebase to Prioritized Remediation Plan

> **Applies to:** any Android codebase (Kotlin/Java, Compose/Views), tooling current as of AGP 8.x era · **Last reviewed:** 2026-07-06
> **Related:** every doc in [principles/](../principles/) — this guide is the *entry procedure*; principles docs are the depth behind each finding.
> **Executable by:** a human engineer, or an agent. For agents: this is a fan-out-friendly procedure — see [multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) for sharding it; the `gradle-config-auditor` and `anr-root-cause-tracer` subagents implement phases of it.

## Contract

**Input:** repo checkout (running app + Play Vitals access are bonuses, not prerequisites).
**Output:** three artifacts — (1) architecture summary, (2) risk register (lifecycle/leak/ANR/security), (3) prioritized remediation plan.
**Time budget:** pick a tier and *stop when time is up* — an audit that never ships is worth zero. Findings ≠ exhaustive; they're the highest-confidence, highest-severity items reachable in budget.

| Tier | Budget | Do phases |
|---|---|---|
| Triage | ~2 h | 1, 2, quick 3 |
| Standard | ~1 day | 1–4 |
| Deep | 2–3 days | 1–5 + runtime evidence |

## Phase 1 — Orient (30 min, mostly reads, no judgment yet)

Collect facts into a scratch table before forming opinions — the #1 audit failure is pattern-matching on the first smell and spending the budget confirming a pet theory.

```
settings.gradle(.kts)        → module count & names (the real architecture map)
gradle/libs.versions.toml    → AGP, Kotlin, Compose vs Views, key libs & their AGE
app/build.gradle             → minSdk/targetSdk (targetSdk lag = deferred behavior-change debt),
                               flavors/dimensions, isMinifyEnabled
AndroidManifest (merged if buildable: Studio "Merged Manifest" or
  ./gradlew :app:processDebugMainManifest) → permissions, exported components,
                               services + foregroundServiceType, providers (startup init load)
Application class            → what initializes at startup, DI framework
git log --format='%an' | sort | uniq -c | sort -rn | head → who knew this code; are they gone?
README/docs/adr folders      → claimed architecture (verify against reality in phase 2)
```

Version-age heuristic: targetSdk ≥2 behind current, AGP ≥2 majors behind, or Support-library-era deps present → budget expands or scope narrows; say so in the report rather than under-delivering silently.

## Phase 2 — Architecture reality check (1–2 h)

Read **one representative vertical slice end-to-end** (pick the feature with the most recent commits — it shows current team habits, not 2019 habits): screen → state holder → data access. Classify:

- UI: Compose / Views / mixed (what's the interop boundary? [topic doc](../topics/legacy-views-and-compose-interop.md))
- State: single UiState? LiveData? God-VM? direct singleton mutation? ([architecture.md](../principles/architecture.md))
- Data: repository layer real or ceremonial (do VMs bypass it)? SSOT or scattered caches?
- DI: Hilt/Koin/manual/none; any `object` singletons with mutable state (**flag every one** — process-death logout bug, [architecture.md](../principles/architecture.md))

Then diff *claimed* vs *actual* architecture. The gap **is** the finding: it tells you documentation credibility and where copy-paste precedent will fight remediation.

## Phase 3 — Mechanical risk scan (1–2 h; the grep list)

Every hit gets file:line + a severity guess; verify top hits, don't verify all. This phase is what wave-1 agent fan-out parallelizes perfectly ([multi-agent-orchestration.md](../principles/multi-agent-orchestration.md)).

```bash
# Concurrency / ANR (concurrency.md)
grep -rn "runBlocking" --include="*.kt" app/ core/ feature*/ | grep -v test
grep -rn "GlobalScope" --include="*.kt" .
grep -rn "allowMainThreadQueries\|\.commit()" --include="*.kt" .
grep -rnE "catch \((e|t): (Exception|Throwable)\)" --include="*.kt" . # CE-swallow candidates
grep -rn "Dispatchers\.(IO|Default|Main)" --include="*.kt" . | grep -v "di/\|Module" # hardcoded dispatchers

# Lifecycle / leaks (lifecycle-and-state.md, memory-and-performance.md)
grep -rn "lifecycleScope.launch" --include="*.kt" .   # each: repeatOnLifecycle present?
grep -rn "collectAsState()" --include="*.kt" .        # should be WithLifecycle
grep -rnE "companion object.*[Cc]ontext|static.*Context" .
grep -rn "observe(this" --include="*.kt" .            # fragment lifecycle vs viewLifecycleOwner

# Background work (background-work.md)
grep -rn "Result.retry" --include="*.kt" .            # capped? classified?
grep -rn "setExact\|startForegroundService" .

# Security (security.md)
grep -rn "HttpLoggingInterceptor" --include="*.kt" .  # release-reachable?
grep -rnE "exported=\"true\"" --include="*.xml" .
grep -rn "EncryptedSharedPreferences" .               # deprecated dependency
grep -rnE "(api_key|secret|token)\s*=\s*\"" --include="*.kt" --include="*.xml" --include="*.properties" .

# Build health (build-and-release.md) — or delegate to gradle-config-auditor
grep -rn "kapt" --include="*.gradle*" .
grep -rn "api(" --include="*.gradle.kts" .            # invalidation cascade candidates
```

If it builds: `./gradlew :app:lintDebug` and read the *existing* report (and note whether lint is suppressed wholesale — `abortOnError=false` with 900 warnings is itself a top-5 finding about team practices).

## Phase 4 — Runtime evidence (if budget/device allows)

Static findings are hypotheses; 30 focused minutes of runtime turns the top ones into facts and often reorders severity:

1. **LeakCanary** (add to debug build if absent — 1-line dependency): drive 3 main flows, rotate everywhere. Every retained-object report is a confirmed finding.
2. **Process-death test** (`adb shell am kill` + relaunch from Recents) on the top 3 input screens ([lifecycle-and-state.md](../principles/lifecycle-and-state.md)).
3. **StrictMode** on with `penaltyLog`: cold start + main flows; count disk/network-on-main hits.
4. **Perfetto cold-start trace**: main-thread gap between process start and first frame; name the top 3 slices.
5. If Play Console access: **Vitals first, actually** — real ANR/crash clusters re-rank every static finding. A grep hit that matches a Vitals cluster jumps to P0.

## Phase 5 — Report (the deliverable; budget 20% of total time for it)

```markdown
# <App> Technical Audit — <date>, <tier> tier, <commit sha>
## 1. Architecture summary          (½ page: modules, UI stack, state pattern,
                                     data flow diagram, claimed-vs-actual gaps)
## 2. Risk register
| ID | Severity | Area | Finding (file:line) | Evidence | Principle doc |
   Severity: P0 = user-facing harm now (crash/ANR/data-loss/security exposure)
             P1 = harm under common conditions (process death, rotation, OEM)
             P2 = engineering drag (build health, testability)
## 3. Remediation plan — ordered by (user harm × confidence) / effort, NOT by area:
   quick wins first (1-line fixes with P0/P1 impact: collectAsStateWithLifecycle swaps,
   retry caps, exported=false), then structural items with a named first step each.
   Every item cites its principle doc so the fixer inherits the full context.
## 4. What this audit did NOT cover  (honesty section — mandatory. An audit that
                                      doesn't state its blind spots gets treated as exhaustive,
                                      and the next incident in an unexamined area burns
                                      the audit's credibility with it.)
```

Rules learned from writing dozens of these: **never ship a wall of 150 findings** — cap the register at ~25, everything else in an appendix; leadership reads severity counts and the top 5; engineers read file:line. And put one *genuinely praised* thing in the summary if it exists — audits that read as pure prosecution get shelved, and a shelved audit protects zero users.

## Agent-execution notes

- Phases 1–3 are safely parallel and read-only; enforce read-only tools on workers.
- Wave 1 (grep scan, per-module) → suspicion ranking → wave 2 deep-reads top modules only.
- Require file:line citations in all worker output; spot-check one per worker before merging into the register (verdict-laundering guard, [multi-agent-orchestration.md](../principles/multi-agent-orchestration.md)).
- The register's "Principle doc" column is the handoff seam: a fix agent gets the finding + that one doc, nothing else, and has everything it needs.
