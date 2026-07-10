# Red-Team Program Design

> **Version 1.0 — 2026-07-06.** Applies to: programs at any maturity; notes call out where advice differs for a first program vs. an established one. Read [core-principles](./core-principles.md), [harm-taxonomy](./harm-taxonomy.md), and [attack-taxonomy](./attack-taxonomy.md) first.

This doc is the how-to-structure-an-engagement reference. For the end-to-end build procedure, use [build-a-red-team-program](../guides/build-a-red-team-program.md); this doc is the judgment behind it.

---

## The coverage matrix is the spine of the program

Everything starts with a matrix. Rows are harm categories ([harm-taxonomy](./harm-taxonomy.md)). Columns are attack classes ([attack-taxonomy](./attack-taxonomy.md)). A third axis is deployment surface: chat vs. API vs. agentic/tool-using, and — critically — each supported language and modality. Each cell is a (category × class × surface) triple that either has been probed to some depth or has not.

The matrix does three things a raw hour-count cannot:
1. It makes *known unknowns* visible. Empty cells are the honest statement of what you have not tested.
2. It resists tunnel vision. Without it, a team spends 80% of effort on the 20% of cells that are fun, and the report looks busy while whole rows sit empty.
3. It makes coverage *reportable* to leadership as something other than a vibe.

**Depth annotation matters as much as presence.** A cell is not binary "covered / not." Annotate each with depth: untested / lightly probed / systematically probed / probed-and-generalization-tested. A row of "lightly probed" cells is a thin ceiling, not a covered one. See [robustness-evaluation](./robustness-evaluation.md).

### The cells most often left empty (learned the hard way)

- **Non-English and low-resource languages.** The single most common systemic gap. Safety alignment concentrates in the training-dominant language; the matrix column for other languages is the first thing skipped under time pressure and the first thing a global user base finds.
- **Multi-turn / context-erosion cells.** Slow and tedious to probe, so under-invested relative to single-shot cells. A program heavy on single-shot testing has an entire attack class thinly covered.
- **Agentic / tool-use surfaces.** Newer, so less mature testing, and the harm ceiling is higher because the model can *act*. Prompt-injection via untrusted channels lives here.
- **Category intersections.** A finding that is "bias *in a* misinformation *context*" belongs to a cell teams forget exists because they think in single rows.

## Human + automated: sequence them, don't pick one

Principle 6 in [core-principles](./core-principles.md): humans find classes, automation finds breadth. In practice:

1. **Human discovery (unstructured).** Skilled humans probe freely to find *new attack classes* and novel framings automation would never invent. This is where creativity lives and where the highest-value novel findings come from.
2. **Human structured probing.** Once a class is known, humans systematically walk the coverage matrix, applying known classes to each cell deliberately. This is where you fill the grid.
3. **Automated scale.** Automation takes a discovered class and maps its *extent* — how many phrasings, languages, and adjacent topics it generalizes to — at a volume no human can match. This is generalization testing ([robustness-evaluation](./robustness-evaluation.md)) and phrasing-space mapping. See [automated-red-teaming](./automated-red-teaming.md) for the safety controls this requires.
4. **Human interpretation.** Humans read the automated map, decide what it means, and spot the class the automation confirmed but didn't understand.

A program that skips step 1 only ever finds variants of what it already knew. A program that skips step 3 believes a single-point finding characterizes a whole class. Both fail, differently.

### Structured vs. unstructured probing — when each

| Use unstructured when... | Use structured when... |
|---|---|
| Model or capability is new; the failure landscape is unmapped | You have a coverage matrix and need to fill cells |
| You want to discover *novel* classes | You want *defensible coverage* of known classes |
| Early in an engagement | Later in an engagement; before a ship gate |
| Measuring the ceiling of a skilled adversary | Measuring completeness |

Do both. Unstructured-only produces exciting findings and indefensible coverage. Structured-only produces a filled grid and misses the attack no one wrote a cell for.

## Recruiting and briefing red-teamers

**Recruiting.** Diversity of background is a coverage lever, not a nicety. Red-teamers who share one training, one language, one cultural frame will share blind spots — and those blind spots become empty matrix cells no one notices. Deliberately recruit across languages, domains (a subject-matter expert finds uplift a generalist cannot evaluate), and adversarial styles. For catastrophic-potential categories, domain expertise is required to judge whether a finding constitutes genuine *uplift* rather than restating public knowledge.

**Briefing.** Every red-teamer needs, before they start:
- The scope: which model/checkpoint, which surfaces, which harm categories are in-scope this engagement.
- The rules of engagement: what to do when they find a genuinely dangerous output (stop, document per protocol, do not propagate — see [reporting-and-disclosure](./reporting-and-disclosure.md)), how to handle any content that must not be reproduced (child-safety findings route differently — [harm-taxonomy](./harm-taxonomy.md)).
- The severity rubric ([severity-and-triage](./severity-and-triage.md)) so findings arrive pre-scored.
- The coverage matrix, so they know which cells need them and are not all crowding the same fun corner.
- Psychological-safety and wellbeing support: sustained exposure to harmful content is a real occupational hazard; rotation, opt-outs for specific categories, and support resources are program responsibilities, not afterthoughts.

## Time-boxing and engagement shape

Structure an engagement as: scope → brief → unstructured discovery phase → structured coverage phase → automated generalization phase → triage and reporting → feedback verification. Time-box each; an open-ended "keep probing" engagement drifts to the fun cells. Reserve explicit time for the categories no one volunteers for.

## Avoiding tunnel vision — the program's chronic disease

The failure I have seen most often in otherwise-strong programs: a talented team gets deep on two or three attack classes they enjoy, produces a stream of impressive findings in those classes, and the coverage matrix quietly shows those same two columns lit up across every cycle while others stay dark. The findings volume looks healthy. The program is blind.

Countermeasures:
- Review the *matrix*, not the finding count, at every checkpoint. Findings-per-cycle is a vanity metric; cells-newly-covered is the real one.
- Rotate assignments so people work cells outside their comfort class.
- Run a coverage-gap review ([coverage-gap-reviewer](../skills/coverage-gap-reviewer/SKILL.md)) before each ship gate, specifically to find the dark cells.
- Budget by *cell*, not by *finding*. "We will systematically cover these 12 previously-dark cells this cycle" beats "we will find 50 findings."

## Failure mode → detection → fix → prevention

| Failure mode | Detection | Fix | Prevention |
|---|---|---|---|
| Coverage tracked as hours/finding-count | No matrix exists; can't answer "what's untested" | Build the matrix; annotate depth | Make matrix the reporting unit |
| Tunnel vision on favorite classes | Same columns lit every cycle | Rotate; budget by cell | Coverage-gap review at each gate |
| Non-English cells empty | Matrix has no language axis | Add language/modality axis; recruit for it | Language coverage mandatory in scope |
| Automation without discovery | Only variants of known findings appear | Add unstructured human discovery phase | Sequence human→auto→human |
| Discovery without generalization | Single-point findings believed to characterize classes | Add automated extent-mapping phase | Require generalization annotation on findings |
| Red-teamer monoculture | Shared blind spots; whole classes unseen | Diversify recruiting | Treat diversity as coverage |

## Related

- What to test for (rows): [harm-taxonomy](./harm-taxonomy.md)
- How to test (columns): [attack-taxonomy](./attack-taxonomy.md)
- Scaling breadth safely: [automated-red-teaming](./automated-red-teaming.md)
- Scoring what you find: [severity-and-triage](./severity-and-triage.md)
- Measuring whether coverage is deep or thin: [robustness-evaluation](./robustness-evaluation.md)
- Auditing a matrix for gaps: [coverage-gap-reviewer](../skills/coverage-gap-reviewer/SKILL.md)
- End-to-end build: [build-a-red-team-program](../guides/build-a-red-team-program.md)
