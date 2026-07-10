# Guide: Audit an Existing Eval Setup (Bounded-Time Protocol)

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Applies to:** any inherited/unfamiliar eval suite — internal or vendor-supplied; harness-agnostic
**Audience:** engineer or agent handed an eval suite they didn't build, needing a defensible assessment. Output contract and time budgets below; the protocol degrades gracefully — each phase produces standalone value if you stop there.

**Time budgets:** Rapid ≈ 2–4 h (phases 0–2, desk-only) · Standard ≈ 1–2 days (adds phase 3's cheap experiments) · Deep ≈ 1 week (adds subagent scans, recalibration). State which you ran in the report; don't let a Rapid audit masquerade as a Deep one.

---

## Output contract (write these four sections, nothing less)

1. **Validity assessment** — does it measure what it claims, with what evidence?
2. **Bias & contamination risk list** — each risk: evidence, severity (high/med/low), confidence.
3. **Statistical-rigor review** — what the numbers can and cannot support.
4. **Prioritized remediation plan** — ordered by (decision-risk × cheapness-to-fix); each item names its fix and its deep-dive doc.

Verdict vocabulary for section 1, use exactly one: **sound** (trust for its stated decision) / **usable-with-corrections** (trust after named fixes) / **decorative** (numbers should not drive decisions until rebuilt). Most inherited suites land in the middle; be prepared to say "decorative" out loud — the audit's value is proportional to your willingness to.

---

## Phase 0 — Establish what it claims (30 min)

Find or reconstruct the claim sentence (`../principles/eval-design.md` §task definition): what capability, what population, scored how, gating what decision. Interview one owner/user if available; ask specifically **"what decision did this last change?"** — a suite that has never changed a decision is a dashboard, and that finding alone can end a Rapid audit ("decorative" via disuse; see `../principles/regression-testing-and-edd.md` §5 theater).

If no claim can be stated even after the interview, record that as the headline finding: an eval without a claim can't be *valid*, only busy.

## Phase 1 — Validity desk-check (1–2 h)

Read, in order: the rubric/criteria, 20 items *with* their expected outputs (random, not the first 20 — the first 20 are always the author's best work), the scorer/judge prompt, the last 3 run reports.

Score against these checks (each maps to a deep-dive doc):
- **Criteria ambiguity:** could two competent readers score differently? Grab the two worst criteria and predict-the-verdict on 5 items yourself; failure to predict = ambiguity (`../principles/eval-design.md` §1). Run `.claude/skills/eval-rubric-reviewer/` on the rubric — cheapest signal in the whole audit.
- **Proxy gap:** for each metric, write the gaming note (cheapest way to inflate it). Check whether observed system behavior shows signs of having found it (e.g., embedding-similarity metric + suspiciously reference-shaped outputs — `../principles/eval-design.md` §2).
- **Ground-truth provenance:** who decided the expected outputs? Sample 10 for correctness yourself or with a domain expert; wrong labels found here are per-item invisible-forever penalties.
- **Coverage vs. claim:** stratum tags present? Coverage matrix vs. the claimed population; if production traffic is accessible, spot-check the traffic-weight divergence (`../principles/production-offline-gap.md` §1 — the museum-suite and pet-scenario failures both announce themselves here).
- **Population match:** golden-set age, last refresh date, whether the product has pivoted since (`../principles/regression-testing-and-edd.md` §3).

## Phase 2 — Bias & contamination risk list (1–2 h desk; subagent for depth)

**Judge risks** (if any LLM judging — `../principles/llm-as-judge.md` bias catalog):
- Judge family vs. evaluated-model families (self-preference exposure, esp. cross-family comparisons)
- Pairwise without position swapping? A/A test ever run? (If no evidence of one: assume position bias; it's the base rate.)
- Judge config versioned/hashed into runs? Unversioned judge = every historical trend suspect (`../principles/llm-as-judge.md` §5)
- Calibration evidence: judge–human kappa, when, on what sample. "We read some outputs" ≠ calibration. No calibration = the headline finding writes itself.
- Length-vs-score correlation computable from stored results at desk — compute it (§3 verbosity).

**Human-label risks** (if any — `../principles/human-evaluation.md`): IRR ever measured, per-item or overall-only; rater qualifications vs. correctness items; session-length/gold-item practices; aggregation method (majority-vote-only loses contested items).

**Contamination risks** (`../principles/contamination-and-leakage.md`):
- Public/pre-cutoff items? → cutoff arithmetic now; flag for completion probes.
- Held-out tier exists? How many iteration runs against the dev set (harness logs)? Hundreds of runs + no held-out = assume iteration leakage; the dev trend is partly fiction (§3).
- Item provenance vs. training-data sources (shared upstream docs — §2); production→training and production→eval pipelines partitioned by conversation ID?
- **Deep tier:** spawn `contamination-scanner` (`.claude/agents/contamination-scanner.md`) for completion probes + near-dup sweeps; it returns a verdict artifact for the report.

## Phase 3 — Statistical-rigor review (1 h desk + cheap experiments in Standard tier)

Desk checks from stored run data:
- CIs reported anywhere? Compute Wilson CI for the current headline number and its n; state the half-width in the report — this single number recontextualizes every past "win" (`../principles/statistical-rigor.md` §1).
- **MDE vs. celebrated deltas:** n ≈ 16·p(1−p)/Δ² inverted; if the suite's MDE is 8 points and the last quarter's decisions cited 2–3-point moves, those decisions were noise-driven — name them.
- Multiple comparisons: count sliced metrics per report × comparisons; no correction + >5 slices = manufactured findings at a predictable rate (§3).
- Gate thresholds: derived from a measured A/A band, or folklore? Any A/A run in history? Re-run-until-green culture (check CI retry patterns — `../principles/regression-testing-and-edd.md` §1)?
- Versioning: can any two historical scores be verified comparable (set version + judge hash both recorded)? If not, the trend chart is decoration.

**Standard-tier experiments (cheap, high-yield, in order):** (1) A/A run — one run, measures the flake band, calibrates everything else you say; (2) shuffle test if parallelized (`../principles/cost-and-scalability.md` §3); (3) pairwise judge A/A (identical outputs) if pairwise judging exists; (4) score 30 items with a second judge family, eyeball agreement.

## Phase 4 — Remediation plan (1 h)

Order by **(risk to pending decisions) × (cheapness)**. The recurring top-5, with typical effort:
1. Add CIs + compute MDE; re-annotate recent decisions as noise-consistent or real (hours — `../principles/statistical-rigor.md`)
2. Pin & hash set/judge versions; establish a pinned baseline run (hours — `../principles/regression-testing-and-edd.md` §4)
3. A/A band → derive gate thresholds; quarantine protocol for flaky items (day — §1)
4. Split dev/held-out; if burned, mint held-out from fresh production sample (days — `../principles/contamination-and-leakage.md` §3, `../principles/production-offline-gap.md` §4)
5. Judge calibration study against human labels (1–2 weeks incl. labeling turnaround — `../principles/llm-as-judge.md` §4)

For each item: named fix, owner, deep-dive link, and what decision it unblocks. A remediation plan without owners is a wish list.

---

## Auditor's field notes

- **Distrust the demo items.** Whoever shows you the suite shows its best neighborhoods. Random-sample everything you read.
- **The absence of an artifact is a finding.** No A/A run, no calibration record, no held-out tier, no versioning — each absence goes in the report as its own line, because "we never measured X" is precisely the risk.
- **Don't fix while auditing.** Mixed audit/repair sessions produce neither a clean assessment nor a clean fix, and you lose the before-state evidence. Audit, report, then remediate against the report.
- **Calibrate your tone to the decision at stake.** A decorative suite gating nothing is a cleanup ticket; a decorative suite gating model launches is an incident.

## Related
Everything deep-links inline. Rebuilding from the rubble: `build-eval-suite-from-scratch.md`. Running phases 2's scans in isolation: `../principles/multi-agent-orchestration.md`.
