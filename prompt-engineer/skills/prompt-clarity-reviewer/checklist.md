# Clarity Review Checklist (companion to SKILL.md)

Versionable check list — tighten here without touching the skill's triggers.
Manual reviewers: this is the same list the skill executes; work top to bottom
against the **assembled** prompt.

## A. Ambiguity (topics/clarity-and-specification.md §1)
- [ ] A1. Ignorance simulation performed (task attempted from text alone); every question logged
- [ ] A2. Every selecting noun has a selection rule (which one, when several qualify)
- [ ] A3. Absent/empty/unreadable input → behavior defined
- [ ] A4. Multiple candidates → rule defined
- [ ] A5. Conflicting information in input → rule defined
- [ ] A6. Uncertainty clause present ("if you cannot determine X, do Y")
- [ ] A7. Quantities pinned: units, timezone, casing, language, length bounds
- [ ] A8. "Handle gracefully / use judgment / as appropriate" phrases — each is a decision not made; flagged

## B. Conflicts (§2)
- [ ] B1. All imperatives listed; pairs sharing a topic checked for tension
- [ ] B2. Every `always`/`never` pair sharing a topic examined
- [ ] B3. Conditional rules: every condition defined ("high-volume" — where?)
- [ ] B4. Precedence stated where rules can collide
- [ ] B5. Repeated/restated rules: copies identical? (drifted copies = conflict in waiting)
- [ ] B6. Examples consistent with current instructions (full audit → few-shot-example-auditor)

## C. Format (§3)
- [ ] C1. Machine-parsed? → API enforcement on, or gap noted as standing risk
- [ ] C2. Literal skeleton present (not adjectives)
- [ ] C3. Null vs. empty vs. omitted policy stated
- [ ] C4. Enum values defined at boundaries, not just listed
- [ ] C5. "Output nothing else" clause present and positioned last
- [ ] C6. Schema-conformant failure output defined for impossible inputs

## D. Position (core-principles rule 10)
- [ ] D1. Role + hard constraints early; format anchor last
- [ ] D2. No load-bearing instruction buried mid-reference-material
- [ ] D3. Untrusted/variable content not in terminal position

## E. Meta
- [ ] E1. Reviewed the assembled prompt, not the template alone
- [ ] E2. Deliberate-latitude points confirmed with owner (not filed as ambiguity)
- [ ] E3. Each finding: exact quote + severity + concrete rewrite (or named stakeholder decision)
