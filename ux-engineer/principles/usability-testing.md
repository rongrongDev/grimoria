# Usability Testing — Small-n Signal Without Fooling Yourself

**Scope:** moderated/unmoderated task-based testing and heuristic evaluation, from the UX engineer's seat (instrumenting the apparatus, interpreting with the researcher, translating for engineering). **Validated against:** Nielsen's 10 heuristics (1994, rev. 2020), the 5-user guidance per Nielsen/Landauer 1993 *with its conditions*, current-generation tooling (Maze, UserTesting, Optimal Workshop, Lookback — the judgment is tool-independent). **Date:** 2026-07-13.

## The mental model

A usability test is **behavioral evidence collection at small n**, and every rule in this doc follows from those two properties. *Behavioral*: what participants **do** is data; what they *say they'd do*, and especially what they *predict they'd like*, is weak-to-worthless — watch the hands, note the words. *Small n*: five participants can't give you percentages; they give you **existence proofs** ("this confusion exists, and here is its mechanism") which is exactly what you need to fix a design — if you keep observation, interpretation, and recommendation rigorously separate, because at n=5 the temptation to round an anecdote up to a statistic is overwhelming.

The famous "5 users find ~85% of problems" carries conditions people drop: it holds per **homogeneous user group**, per **iteration**, for problem *discovery* — not for measuring rates, not for comparing designs, not across distinct populations (5 dispatchers + 0 drivers is one covered group and one guess). The corollary that actually matters: **3 rounds of 5 with fixes between beats 1 round of 15 every time**, because round two tests whether the fixes worked and finds the problems the first set masked.

The UX engineer's specific job in this collaboration: build the apparatus at the right fidelity (`prototyping-fidelity.md`), instrument it, sit in the sessions, and carry the findings across the research→engineering seam intact (`research-to-spec.md`). Findings that skip that last step die in a slide deck.

## Failure modes

### 1. Findings too vague to act on

- **Failure:** the readout says "users were confused by the permissions screen." Engineering can't build anything from it; design guesses; the guess ships; the next round finds the same confusion. The information existed in the session — *which* users, confused at *which moment*, evidenced by *what behavior*, blocked from *what task* — and evaporated between observation and report.
- **Detection:** apply the implementation test to every finding: could an engineer who wasn't in the room change something specific because of this sentence? "Users were confused" fails. "4/6 participants clicked 'Inherited role' expecting folder-level permissions (each said so unprompted when it opened team settings); all 4 then abandoned the role-assignment task" passes.
- **Fix:** re-mine the recordings while they're fresh (this is why sessions are recorded) and rewrite each finding in the evidence format: **behavior observed + where in the flow + frequency (n of N) + task impact + hypothesized mechanism, each labeled as observation or interpretation.**
- **Prevention:** structure note-taking *during* sessions with a rainbow spreadsheet — behaviors as rows, participants as columns, marks in cells. Frequency then falls out of the sheet instead of out of memory, and memory is where "one vivid participant" becomes "users." The `research-to-spec-translator` skill refuses vague inputs for exactly this reason.

### 2. Misweighing frequency — the n=1 panic and the n=4 shrug

- **Failure:** twin errors, same root. (a) One articulate participant struggles memorably, the highlight clip circulates, and a redesign is ordered — for an idiosyncratic problem nobody else had. (b) Four of five participants fail a task, but the failure is inconvenient for the roadmap, so each gets individually explained away ("she was rushing," "he's not really our persona," "edge case"). At small n, both directions of self-deception are cheap.
- **Detection:** any finding traveling without its frequency attached; any prioritization meeting where clips are played but counts aren't shown; retro-detection — findings that got fixed vs. findings that were "explained," compared against what the next round showed.
- **Fix:** the **severity × frequency grid** on every finding: severity (blocked task > major detour/error > friction > cosmetic) × frequency (how many participants, and — the projection step — is the *mechanism* general or personal?). That mechanism question is the honest nuance in both directions: an n=1 failure whose cause is structural (the label genuinely means two things — everyone who reads it carefully will trip) predicts widespread trouble; an n=1 failure whose cause is personal context (participant's previous tool used the same word differently) predicts little. Judge the mechanism, not just the count.
- **Prevention:** prioritize from the grid in a session the whole team attends; no finding enters the backlog without severity, frequency, and mechanism filled in (`research-to-spec.md` carries the format forward).

### 3. Moderator and observer bias shaping the results

- **Failure:** the study finds what the team wanted to find. Mechanisms, in descending order of blatancy: task wording that contains the answer ("use the search bar to find…" — congratulations, search is now discoverable); the moderator rescuing a struggling participant three seconds before the finding happens ("try the menu on the left"); leading probes ("was that confusing?" invites yes); and the quietest one — **selective observation**: stakeholders drop in for two sessions, happen to see the two smooth ones, and leave certain the design is fine. Also here: testing your colleagues, who share your vocabulary and can't not know the product.
- **Detection:** review the task script cold — does any task name a UI element or use the interface's own labels for the goal? Watch for participant phrases like "is that what you wanted me to do?" (they've detected an expected answer and are now performing for you). Compare notes across observers; wildly divergent readings of the same session mean interpretation is running ahead of observation.
- **Fix / prevention:** tasks are **goal-framed scenarios in the user's vocabulary, not the UI's** ("you need your teammate Priya to be able to edit the Q3 board" — never "assign an editor role"); write the script with a second person reviewing for leakage; the moderator's only tools when a participant struggles are silence and "what are you thinking?" — the struggle *is* the data, and rescuing it destroys it (log the rescue if you must end the suffering, and count the task failed); observers watch a scheduled spread of sessions or the counts, not a cherry-picked pair; recruit real users, not adjacent colleagues.

### 4. The apparatus polluting the signal

- **Failure:** the prototype dead-ends, and the dead-end gets logged as user failure. Participant taps a card that's non-interactive *in the prototype* but would be live in the product — nothing happens — participant concludes they were wrong and reroutes; the notes say "user didn't expect the card to open." Or the hardcoded data breaks mid-task (`prototyping-fidelity.md` §4) and the recovery flounder gets read as confusion. The study is now measuring the prototype's gaps, and those "findings" are pure noise — worse, they're *plausible* noise.
- **Detection:** in-session discipline — when nothing happens on an action, ascertain immediately (and note) whether the product would have responded; mark every such moment `[PROTOTYPE GAP]` in the notes, loudly.
- **Fix:** exclude gap-contaminated observations from findings; if a gap invalidated a task for multiple participants, patch the prototype and re-run that task — do not salvage the tainted data.
- **Prevention:** **pilot session, always** — one colleague-stranger through the full script the day before; it catches most dead ends and script ambiguities for the price of an hour. Instrument coded prototypes to log dead-end interactions (clicks on non-interactive elements are also *findings* about perceived affordance — but only when labeled as such). Have a "prototype boundary" script ready: a neutral "that part isn't built — what did you expect to happen?" turns a gap into data instead of noise.

## Heuristic evaluation — the cheap complement, not the substitute

When there's no time or budget for participants, or *before* spending them: 2–3 evaluators independently walk the flow's tasks against Nielsen's 10 heuristics, then merge (independence first — group walkthroughs converge on the loudest voice). Costs hours, catches the mechanical violations (missing feedback → `interaction-design.md` §1, inconsistent vocabulary → `journey-accessibility.md` §4, no undo/exit, error messages that don't help) so real participants aren't spent rediscovering them. Its hard limits: experts systematically miss **mental-model and vocabulary mismatches** — the label that means something different to dispatchers than to designers is invisible from inside the building (`information-architecture.md` §2). Decision rule: heuristic evaluation to *clean* the design, user testing to *learn* from it; heuristic findings are hypotheses, and the ones that would drive big changes get verified with users before the rebuild. The `auditing-a-flow/README.md` playbook is a structured descendant of this method.

## Decision tree — "how should we evaluate this?"

1. Structure/findability question? → tree test or first-click, no sessions needed (`information-architecture.md`).
2. Obvious-violations sweep, or pre-cleaning before sessions? → heuristic evaluation (above).
3. Comprehension/flow-logic question with a prototype? → moderated task-based test, n=5 per user group, think-aloud. Fidelity per `prototyping-fidelity.md`.
4. Input/latency/AT question? → coded prototype, moderated, target devices; include AT users if the question is accessibility (`journey-accessibility.md`) — and pay them properly.
5. Comparing two designs, or measuring a rate ("what % succeed?")? → small-n moderated testing is the wrong tool; you need unmoderated at n≥20–40 per cell, defined success metrics, no think-aloud (it distorts timing). Most teams asking this question actually need question 3's answer first.
6. Whatever you ran: findings → severity × frequency grid → `research-to-spec.md`. A study whose findings don't reach a spec was a performance, not research.

## War story

A logistics product tested a redesigned dispatch board — five sessions, and the team watched live. Participant 3, a 20-year dispatcher, hit a wall on task 2: she kept trying to drag an *unassigned* job onto a driver who was mid-shift, which the new design forbade by policy. She got visibly frustrated and said the sentence that ran through the org for a quarter: "the old system trusted me." The clip was electric; a VP saw it; a project spun up to restore the old drag behavior. Nobody weighed that she was **1 of 5** — the other four had used the new assignment panel without comment, and two had praised it — or asked about *mechanism* (her specific depot ran a nonstandard shift pattern that made mid-shift reassignment routine *there* and rare elsewhere; the notes even said so). Three months of rework later, round-two testing found the restored drag behavior *confused* the majority, who now had two competing ways to assign and picked wrong half the time. The grid would have cost ten minutes and said: severity high, frequency 1/5, mechanism local — investigate the depot pattern, don't redesign. Since then: no finding leaves the room without its count and mechanism stapled to it, and highlight clips are shown *with* the grid on screen. Vivid is not the same as frequent, and the clip is not the finding.

## Related

- Building the apparatus: `prototyping-fidelity.md`. Instrumenting feedback gaps it will reveal: `interaction-design.md`.
- Carrying findings across the seam: `research-to-spec.md` → `spec-handoff.md`; executable: `skills/research-to-spec-translator/SKILL.md`.
- Root-causing a specific failed task after the fact: `agents/usability-failure-tracer.md`.
- Structure-specific methods (card sort, tree test, first-click): `information-architecture.md`.
