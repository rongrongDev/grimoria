---
name: coverage-gap-reviewer
description: Review a red-team program's harm-category coverage matrix (or an informal description of what's been tested) for blind spots, and produce a prioritized list of under-tested cells. Use when auditing a coverage matrix, before a ship gate to find dark cells, when inheriting a program and asking "what aren't we testing," or as the coverage step of guides/analyze-an-existing-program.md. Reviews the STRUCTURE of what's tested — categories, attack classes, surfaces, languages, depth — and needs no attack content whatsoever. Do NOT use to score an individual finding's severity (use finding-severity-triager), to design the whole program (use guides/build-a-red-team-program.md), or to cluster findings by root cause (dispatch finding-cluster-analyzer).
version: 1.0
last-updated: 2026-07-06
---

# Coverage Gap Reviewer

Audits a coverage matrix for blind spots and returns a prioritized gap list. Operationalizes `principles/program-design.md` and `principles/harm-taxonomy.md`. This skill can also review your *own* draft matrix while building a program (`guides/build-a-red-team-program.md` Phase 1).

## Safety note
This skill reads *what has been tested* (structure), never *how*. It requires no payloads and produces none. If handed reproduction detail, ignore it for this purpose and note the hygiene issue.

## Inputs
- A coverage matrix in any form (grid, spreadsheet, or prose "we've tested X and Y"). If only prose exists, that itself is a finding: no matrix means the program can't state what's untested.

## The three axes every matrix must have
1. **Harm categories (rows)** — check against `principles/harm-taxonomy.md`: catastrophic-potential (CBRN, cyber), child safety, self-harm, violence, misinfo, bias/fairness, privacy, manipulation, fraud, model-integrity. A missing *row* is an untested harm category.
2. **Attack classes (columns)** — check against `principles/attack-taxonomy.md`: multi-turn erosion, persona framing, encoding/obfuscation, false-context, prompt injection, refusal suppression, gradual escalation, cross-lingual. A missing *column* is an untested technique class.
3. **Surfaces (third axis)** — chat / API / agentic, **and every supported language and modality**. Missing this axis is the most common structural defect.

## Procedure
1. **Structural check:** Does a real matrix exist with all three axes? If the language/modality axis is absent, flag immediately — non-English coverage is the #1 systemic gap.
2. **Empty-cell scan:** List cells that are `untested`. Prioritize:
   - Catastrophic-potential rows that are empty → highest.
   - Non-English / non-primary-modality columns empty → high (chronically ignored).
   - Multi-turn / context-erosion cells empty → high (tedious, so skipped).
   - Agentic-surface cells empty → high (higher harm ceiling, less mature).
   - Category *intersection* cells (e.g. bias-in-misinfo) → often forgotten entirely.
3. **Depth check:** Are cells depth-annotated (untested / lightly / systematically / generalization-verified) or just binary? Binary cells hide thin coverage — flag any "covered" cell without depth as *unverified*.
4. **Tunnel-vision check:** Which columns are lit across cycles and which stay dark? Same 2–3 classes always lit = tunnel vision; recommend rotation and cell-based budgeting.
5. **Cross-reference recency:** Are dark cells dark because untested, or tested long ago against an old checkpoint? Stale coverage ≈ no coverage after a model change (`topics/differential-testing.md`).

## Output format
```
MATRIX STRUCTURE: <present & complete | missing axis: ___ | no matrix — CARDINAL GAP>
PRIORITIZED GAPS (highest first):
  1. <cell/category> — <why it matters> — <priority: critical/high/medium>
  2. ...
DEPTH ISSUES: <cells marked covered but not depth-annotated / not generalization-verified>
TUNNEL VISION: <classes over-lit vs. dark; rotation recommendation>
STALE COVERAGE: <cells tested only against superseded checkpoints>
RECOMMENDATION: <the 3-5 cells to fill first this cycle, and why>
```

## Worked example (safe, illustrative)
Input: "Matrix rows = all harm categories. Columns = single-shot jailbreaks, persona framing. Surfaces = chat (English). All cells 'covered'."

Output:
```
MATRIX STRUCTURE: Present but INCOMPLETE — missing attack-class columns (multi-turn erosion,
  encoding, prompt injection, cross-lingual, refusal suppression) and missing language/modality axis.
PRIORITIZED GAPS:
  1. Cross-lingual coverage (no non-English axis) — CRITICAL: safety alignment concentrates in
     English; global users will find these first.
  2. Multi-turn erosion column absent across all rows — HIGH: entire class untested; single-shot
     coverage says nothing about trajectory-level failures.
  3. Prompt-injection column absent — HIGH if any agentic/retrieval surface exists.
  4. Catastrophic-potential rows marked "covered" with only two attack classes — HIGH: thin ceiling
     mislabeled as covered.
DEPTH ISSUES: All cells binary "covered" — none generalization-verified. Treat all as UNVERIFIED.
TUNNEL VISION: Only single-shot + persona classes tested — classic two-class tunnel vision.
STALE COVERAGE: unknown — request test dates per cell.
RECOMMENDATION: Add the language axis and multi-turn column first; re-audit the catastrophic rows
  with depth annotation before trusting any "covered" label.
```

## When NOT to use this skill
- Scoring one finding → `finding-severity-triager`.
- Building the program from zero → `guides/build-a-red-team-program.md`.
- Full program review (triage, reporting, feedback too) → `guides/analyze-an-existing-program.md` (this skill is its coverage step).
- Clustering findings by root cause → `agents/finding-cluster-analyzer.md`.

## Related
- `principles/program-design.md` · `principles/harm-taxonomy.md` · `principles/attack-taxonomy.md` · `topics/differential-testing.md`
