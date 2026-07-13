# Research-to-Spec Translation — From "Users Were Confused" to a Testable Requirement

**Scope:** the translation step — turning qualitative research output into specific, implementable, verifiable requirements. Upstream (running the study honestly): `usability-testing.md`. Downstream (completing the spec for engineering): `spec-handoff.md`. **Validated against:** WCAG 2.2 AA where findings are accessibility findings; Given/When/Then acceptance-criteria convention. **Date:** 2026-07-13.

## The mental model

Research findings and engineering requirements are different species, and most research dies in the gap between them. The bridge is a **chain with five links**, each traceable to the next *in both directions*:

> **Observation** (what participants did) → **Insight** (the mechanism behind it) → **Design decision** (what we'll change and why this addresses the mechanism) → **Requirement** (the specific behavior to build) → **Acceptance criterion** (the observable test that it's built and that it worked).

Two properties make the chain load-bearing:

- **Forward, each link narrows.** Observations are many; insights cluster them; decisions choose; requirements specify; criteria verify. If a step *widens* ("users struggled with X" → "redesign the whole page"), you've left the chain and entered opinion.
- **Backward, everything is auditable.** Any requirement can answer "why does this exist?" by walking back to observed behavior. A requirement that can't is a preference wearing a spec's clothes — which is fine, preferences are allowed, but they must be *labeled* as such, because six months from now someone will want to "simplify" the flow, and the requirements that can show their evidence survive that meeting while the unlabeled ones get deleted along with the ones that were load-bearing.

The vocabulary discipline: the chain's first link is written in **behavior language** ("4/6 clicked X expecting Y"), never emotion language ("users found it frustrating") — emotions are real but unimplementable; the behavior that produced them is where the fix lives.

## Failure modes

### 1. Directional vagueness — requirements that can't fail

- **Failure:** the study concludes "the flow should be more intuitive," "simplify the permissions step," "improve discoverability of search." These cannot be implemented (build what, exactly?), cannot be estimated, and — the tell — **cannot fail**: no shipped thing could ever be proven non-compliant with "more intuitive." So engineering interprets freely, ships something, everyone declares victory, and the next study finds the identical problem, now with organizational scar tissue ("we already fixed that").
- **Detection:** the falsifiability test on every requirement: *describe an implementation that satisfies the words but not the intent.* If it's easy ("we made the font bigger — that's simpler"), the requirement is vapor. Also detectable downstream: engineers asking "what does done look like?" is the spec failing in real time.
- **Fix:** force each vague directive back down the chain to its observations, then respecify at behavior level. "More intuitive" decomposes into the actual observed failures: "4/6 didn't realize saving ≠ publishing" becomes *"After Save, the editor shows persistent state 'Draft — not visible to customers' adjacent to the title; criterion: 5/5 participants in the next round correctly state whether their work is live."*
- **Prevention:** the requirement template (below) has mandatory Evidence and Acceptance-criteria fields — vagueness physically doesn't fit in it. The `research-to-spec-translator` skill enforces the template and flags any requirement whose criterion isn't observable.

### 2. Solution-jumping — skipping the mechanism link

- **Failure:** observation straight to requirement with no insight in between: participants missed the save confirmation → "make the toast bigger." Ships. Next round: they still miss it — because the mechanism was never *timing and location* (the toast appeared in the corner, 2 seconds, while their eyes were on the button — `interaction-design.md` §2's locus-of-attention problem), not size. The team has now spent two rounds and gained a bigger toast. Solution-jumping feels efficient because a solution appears immediately; it's slow because the solution is a guess wearing the data as a costume.
- **Detection:** in the chain audit, look for requirements whose Insight field restates the observation ("users missed the toast" → insight: "the toast is missable") — a real insight names a *mechanism* that predicts other failures. Also: fixes that failed in the next round are solution-jumps found late; log them as such.
- **Fix:** insert the missing link explicitly — for each clustered observation, write the mechanism hypothesis and its confidence, and let *competing* mechanisms coexist ("size" vs. "location" vs. "timing") with the cheapest discriminating test named. Sometimes the discriminator is a 10-minute prototype tweak between sessions.
- **Prevention:** insight review before spec-writing: the researcher and UX engineer walk the observation clusters and agree on mechanisms *as a separate step* from proposing changes. Twenty minutes; it's where the actual thinking happens.

### 3. Severity and frequency stripped in translation

- **Failure:** the study's carefully graded findings (`usability-testing.md` §2's severity × frequency grid) arrive in the spec as a flat bullet list. Engineering — reasonably — implements top to bottom, or cheapest-first. The task-blocking failure that hit 4/5 participants ships in the same release as the n=1 cosmetic nit, or after it. Prioritization made by list-ordering accident instead of evidence.
- **Detection:** open any spec produced from research: do requirements carry severity/frequency? Compare implementation order against the grid — mismatches mean the metadata died at the seam.
- **Fix:** requirements inherit their findings' grid coordinates (a requirement addressing multiple findings takes the max severity), and the spec states its own priority tiers: *Blocking* (task-completion failures — includes journey-a11y failures per `journey-accessibility.md`), *Should-fix* (major friction), *Consider* (minor/cosmetic).
- **Prevention:** the template's Priority field derives from Evidence, not from negotiation; the translator skill computes it and shows its work.

### 4. Untraceable requirements — the chain with no backward path

- **Failure:** the spec is specific and testable — but nothing records *why*. Eighteen months later: "why does deleting a workspace require typing its name? Feels hostile, let's use a normal confirm dialog." Nobody remembers the study where two participants deleted production workspaces via muscle-memory confirm-clicking. The friction was the *feature*, its evidence is gone, and the regression ships with positive intentions. The inverse also bites: requirements that were always just stakeholder preference acquire fake authority ("it must have been research-based") and can't be revisited when they should be.
- **Detection:** sample five requirements from any living spec and ask maintainers *why* each exists. Blank looks = broken chains. Grep-level: requirements with empty or generic Evidence fields ("best practice").
- **Fix:** archaeology while witnesses remain — re-attach evidence links (study, session, timestamp) to load-bearing requirements; explicitly mark the preference-based ones `[decision — no research basis]`, which is honest and makes them legitimately revisitable.
- **Prevention:** the Evidence field is mandatory and *specific* (study ID + finding ID, not "research says"); research repositories keep findings at stable citable addresses; and the one-line rule for reviewers: **no requirement without provenance — evidence or labeled preference, nothing unlabeled.**

## The requirement template

One block per requirement; the `research-to-spec-translator` skill emits exactly this shape (template file: `skills/research-to-spec-translator/spec-template.md`):

```
REQ-<id>: <one-sentence behavior statement — active voice, observable>
Evidence:   <study/finding IDs + the observation, with n of N>  |  [decision — no research basis]
Insight:    <the mechanism this addresses, one sentence>
Priority:   Blocking | Should-fix | Consider   (derived from severity × frequency)
Behavior:   Given <state>, when <event>, then <observable outcome>   (× as many as needed)
Covers:     <edge cases this implies — empty/error/loading/long-content — or "see state matrix">
Verify:     <how we'll know it worked: next-round task metric, analytics event, a11y walkthrough>
```

The **Verify** line is the one teams skip and shouldn't: it closes the loop back to research. A requirement whose success will never be measured is a bet nobody collects on.

## Decision tree — "I have research output; what do I do with it?"

1. Raw notes/recordings, not yet findings? → back up one step: build the rainbow spreadsheet and grade the grid (`usability-testing.md` §1–2). Translation needs graded findings as input.
2. Findings in hand? → cluster by *mechanism* (not by screen — one mechanism often spans screens), write insights, hold the insight review (§2's prevention).
3. Each insight → is a design decision already clear? If yes: requirement blocks per the template. If competing mechanisms: name the cheapest discriminating test instead of guessing — a spec can legitimately contain "REQ blocked pending discriminator."
4. Requirements drafted? → falsifiability pass (§1) + provenance pass (§4) + priority derivation (§3). Then complete edge-case coverage per `spec-handoff.md` — translation produces the requirements; handoff makes them buildable.
5. Big pile, deadline, or you want the discipline enforced? → invoke the `research-to-spec-translator` skill. A *specific reported failure* you need root-caused before you can even write the insight? → dispatch `agents/usability-failure-tracer.md`.

## War story

A collaboration product ran its best-attended study ever — five sessions on the new sharing flow, executives watching. The readout deck said: "Sharing feels heavyweight. Users want it simpler." Engineering received exactly that sentence, plus enthusiasm. What shipped, in good faith: fewer clicks — the permission picker collapsed into a smart default ("anyone with the link can edit") with options tucked behind an expander. Simpler by every metric anyone had written down. The next study — and, before it, one incident report — surfaced what the sessions had *actually* contained: participants weren't burdened by the clicks; they were **uncertain what the recipient would be able to do**, and re-checked the settings repeatedly (that re-checking was the "heavyweight" feeling — the mechanism was *low confidence*, not *high effort*). The simplification had removed the one screen where consequences were visible, and a customer's contractor edited a document the owner believed was read-only. Walking the chain after the fact: the observation ("participants re-opened sharing settings 2–4 times per task, verbalizing uncertainty about recipient capabilities") had been in the session notes verbatim — it just never survived into the deck, which compressed it into "feels heavyweight." One stripped link, one incident, one quarter of rework. The fix that stuck: the readout deck was demoted to a *summary of* the requirement blocks, never the delivery vehicle — decks compress, and the chain doesn't survive compression.

## Related

- Producing findings worth translating: `usability-testing.md`. Making the resulting spec implementation-complete: `spec-handoff.md`.
- Executable version of this doc: `skills/research-to-spec-translator/SKILL.md` (+ its `spec-template.md`).
- Tracing one failure to its causal decision when the mechanism is disputed: `agents/usability-failure-tracer.md`.
- Requirements that are accessibility findings ride the same template: `journey-accessibility.md`.
