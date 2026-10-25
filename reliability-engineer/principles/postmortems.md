# Postmortems: Turning Incidents into Structural Change

**Applies to:** tool-agnostic · **Last verified:** 2026-07-14

**Working definition** (full glossary: `reliability-engineer/GLOSSARY.md`): a **blameless postmortem** is a written analysis of an incident that assumes everyone acted reasonably given what they knew and what the system showed them — so the analysis can reach the systemic causes instead of stopping at a culprit.

The uncomfortable truth first: **most postmortem programs are theater.** The document gets written because process requires it, names a root cause that is really just the last domino, lists action items that die in the backlog, and is never opened again. The incident's tuition was paid; the lesson was not collected. This doc is about the difference between that and the real thing — and the difference is almost entirely in three places: how deep the causal analysis goes, whether action items actually complete, and whether anyone ever rereads the corpus.

## Blameless: why, precisely

Not kindness — epistemics. The moment a postmortem can hurt someone, your information supply dies: people shade timelines, omit the config change they made, stop declaring incidents at all. You will still have the incidents; you'll just stop knowing about them. I've worked in one blame-culture org, and its distinguishing feature wasn't cruelty — it was *silence*: incidents quietly fixed at 2am without a declared incident, discovered months later in an audit, having recurred four times in between because each fixer hid their fix.

Operationally, blameless means:

- **"Human error" is a banned terminal cause.** A human doing the wrong thing is where analysis *starts*: why did the wrong action look right? What did the tooling show them? Why was the wrong action *possible* — why does prod accept an un-reviewed `DELETE`, why do staging and prod credentials live one tab apart? The engineer who fat-fingered prod is your best witness, and the fix is named `require --confirm for destructive ops`, not `be more careful`.
- **Names appear only as roles** ("the on-call," "the IC") in the written doc — the doc outlives the context where the names were fair.
- **Blameless is not consequence-free.** Negligence, ignored process, repeated recklessness are management matters handled in management channels. The *postmortem document* stays systemic; the day it becomes an HR instrument is the day it stops being told the truth. Keep the channels separate and say so explicitly in the process doc.
- **The review meeting sets the culture more than the doc does.** A senior leader asking "who pushed the change?" in the review meeting undoes a year of policy. Brief your leaders: the sanctioned questions are "what did the system show them?" and "why did that look safe?"

### Failure mode: blame culture producing sanitized, useless writeups

- **Failure mode:** postmortems read as legal defenses — vague timelines, passive voice ("a change was made"), causes located conveniently in another team or a vendor; the same incident recurs because its real mechanics were never written down.
- **Detection:** read the last 6 postmortems. Red flags: no postmortem ever finds a process/tooling cause in the authoring team; "root cause: human error / vendor issue" appearing as terminal; timelines with gaps around decisions. Also, an anonymous survey question — "would you feel safe being the person named in a SEV1 postmortem here?" — under 80% yes is your answer.
- **Fix:** leadership must model it: the most senior engineer writes a maximally honest postmortem of their own incident, in public. (This works. Nothing else works as fast.)
- **Prevention:** blameless norms in the written process; review-meeting facilitation by trained facilitators; separation-of-channels rule above; near-misses celebrated in the same pipeline (a near-miss postmortem is a free SEV1 lesson).

## Causal analysis: past the first plausible explanation

The signature failure of postmortem analysis is **stopping at the trigger.** "Root cause: the deploy at 14:02 introduced a nil dereference." That's not a cause, that's the last domino — deploys with bugs are a permanent fact of life. The questions that produce durable fixes are: why did the bug pass CI? Why did canary not catch it (was there a canary? did anyone look?)? Why did the blast radius include *all* regions at once? Why was rollback 40 minutes instead of 4? Each is a systemic factor, each has a mechanical fix, and — this is the point — **fixing them defends against whole classes of future bugs, not just this one.**

Method guidance:

- **Five-whys is a floor, not a method.** Its defect is baked in: it produces a single linear chain, and real incidents are conjunctions — the bug *and* the missing canary *and* the alert gap *and* the slow rollback, none individually sufficient. Ask "why" repeatedly, fine, but branch: for every stage of the incident (introduction, propagation, detection, diagnosis, mitigation), ask *what would have stopped or shrunk it here?* That five-stage sweep is my standard template, and it reliably finds 3–5 contributing factors where five-whys finds one.
- **Write "contributing factors," plural, not "root cause," singular.** Vocabulary shapes analysis; a template with one root-cause box gets one cause.
- **The counterfactual test for depth:** for each named factor, "if only this had been different, how would the incident have gone?" If the answer is "identically," it's not a factor; if every factor is about the trigger and none about detection/mitigation, the analysis is shallow on the response side — which is usually where the cheap wins are.
- **Timeline first, analysis second.** Analysis built on a fuzzy timeline is fiction with confidence. Reconstructing the timeline from logs/metrics/chat across services is bulk work that shouldn't happen in the author's head or the team channel — dispatch `reliability-engineer/agents/incident-timeline-reconstructor.md` and start the human work from its output.

### Failure mode: superficial root-cause analysis

- **Failure mode:** analysis stops at the first plausible (or most comfortable) explanation; action items address the trigger only; the *class* recurs within quarters wearing a different trigger.
- **Detection:** count contributing factors per postmortem (median 1 = shallow program); check whether detection/mitigation factors appear at all; scan the corpus for repeat incident classes (`reliability-engineer/agents/postmortem-quality-reviewer.md` does this mechanically against the whole corpus — repeat-class detection is the single strongest signal of shallow analysis).
- **Fix:** adopt the five-stage sweep in the template; postmortem review meeting doesn't accept a draft with a single-cause analysis for anything SEV2+.
- **Prevention:** template structure (stages + plural factors + counterfactual line per factor); a trained reviewer pool; the corpus-level repeat-class check run quarterly.

## Action items: where programs go to die

An unimplemented action item is a documented decision to have the same incident again. The corpus-level shame I've seen at every org that never built follow-through: the same action item ("add rate limiting to the internal API") written verbatim in three postmortems, eighteen months apart, third time after the biggest outage of the year. The mechanics that prevent this are boring and non-optional:

1. **Every action item gets: an owner (person), a tracker ticket (in the *team's real* backlog, not a postmortem-system shadow list), a priority, and a due date** — at the review meeting, not "after." An AI without these is a wish.
2. **Cap the count; keep the quality.** Ten action items is a list nobody finishes; the review meeting's job is to pick the 3–5 with the best class-of-failure coverage per unit effort, and explicitly *decline* the rest in writing ("considered, not doing, because —"). Declined-with-reasons beats silently-abandoned; future readers can reopen the decision, and the org isn't lying to itself about its intentions.
3. **SLO the follow-through:** e.g., P0 items (would have prevented or halved the incident) complete within 30 days, P1 within 90. Track completion rate as a first-class reliability metric, reported next to SLO compliance — a team at 100% postmortem-authorship and 20% action-item completion is *performing* learning, and the metric makes that visible to the people funding it.
4. **Review the open-items list monthly** at the same ritual that reviews incidents. Items >30 days overdue escalate to the owning team's manager automatically — a process gate, so follow-through survives personnel changes and doesn't depend on the postmortem author nagging.

### Failure mode: action items written but never completed

- **Detection:** completion rate by age (any org that can't produce this number within an hour doesn't track AIs, which *is* the finding); repeat-AI detection across the corpus (the `postmortem-quality-reviewer` subagent reports verbatim and semantic repeats).
- **Fix:** migrate open items into real backlogs with owners *this week* — the migration itself usually kills half of them honestly ("we're never doing this" → declined-with-reason).
- **Prevention:** mechanics 1–4 above; the postmortem is not "done" (and the incident not closable in the tracker) until its AIs are ticketed.

## Making the corpus worth rereading

A postmortem read once by twelve people repays a fraction of its cost; the value compounds only if the corpus is queryable when it matters. What works:

- **Tags at write time:** affected journey, contributing-factor classes (deploy, config, capacity, dependency, cert/expiry, data), detection source (alert vs. customer). Cheap at authoring, priceless at querying.
- **Standing consumers, so the corpus has readers by design:** new on-call onboarding includes the last 5 postmortems for their services (best system-education documents ever written, and they're free); production-readiness reviews ask "which past incidents does this design need to answer for?"; the quarterly reliability review opens with corpus patterns, not individual incidents ("four of nine SEV2s this quarter were expiry-class — where's the automation?").
- **The pre-mortem query habit:** before a risky migration, search the corpus for the last migration's postmortems. Standing on the corpus at *decision* time is its entire ROI; if nobody ever does, check whether it's findability (fix: tags/index) or culture (fix: leaders doing it visibly).

The doc must be **independently readable years later**: expand internal codenames on first use, link the dashboards *and* screenshot them (dashboards rot), datestamp everything absolute (never "last Tuesday").

## The template (proven shape, adapt locally)

```
# <YYYY-MM-DD> — <journey affected> — SEV<n> — <one-line summary>
Status: draft | reviewed | AIs-ticketed        Tags: <journey, factor-classes, detection-source>
## Impact          — users affected, duration, error budget consumed, tickets/revenue if known
## Timeline        — timestamped, absolute times+TZ, detection→diagnosis→mitigation→all-clear;
                     include what was *believed* at each point, not just what was done
## What went well / What went poorly / Where we got lucky
## Contributing factors — plural; per factor: the counterfactual sentence
## Detection review — what alerted us? what *should* have? (feeds alerting coverage:
                     reliability-engineer/principles/alerting.md)
## Action items    — owner · ticket · priority · due date; plus "declined, because —" list
## Standing questions — was severity right? did we close too early? did customers know first?
```

## Where to go next

- Timeline reconstruction (isolated, read-only): `reliability-engineer/agents/incident-timeline-reconstructor.md`
- Corpus-aware draft review (isolated): `reliability-engineer/agents/postmortem-quality-reviewer.md`
- The incident process that feeds this: `reliability-engineer/principles/incident-management.md`
- Alert-coverage gaps found here get fixed there: `reliability-engineer/principles/alerting.md`
