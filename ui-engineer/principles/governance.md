# Design-System Governance — Systems Die of Sociology, Not CSS

**Scope:** framework- and tooling-agnostic; this is the organizational layer. **Date:** 2026-07-13.

## The mental model

Every technical failure in this KB has a governance failure upstream of it. Components fork (`component-api.md` §3) because the official one was undiscoverable or said "no" too slowly. Tokens get bypassed (`design-tokens.md` §1–2) because requesting a new one took three weeks. Five Buttons exist because nobody owned noticing. A design system is not a component library; it's a **contract between a producing team and consuming teams**, and the contract fails in predictable ways: the producers become a bottleneck, the consumers route around them, and routing around a design system is always locally rational and globally ruinous.

The governing insight from twenty years of watching this: **teams under deadline will always take the fastest path. Governance is the art of making the correct path the fastest one.** Every rule below is that sentence applied to a specific decision.

## The three governance decisions that matter

### 1. Discoverability — the system you can't find doesn't exist

- **Failure:** an engineer needs a date picker. Searching the repo finds three; the docs site is stale; Slack says "I think team X built one?" They build a fourth — not from arrogance, from *45 minutes of failed searching versus a day of building*. Duplication is a search failure before it's an engineering failure.
- **Detection:** the periodic duplication scan (`agents/duplicate-component-scanner.md`) — every near-duplicate found is a discoverability bug with a timestamp; also watch "does X exist?" questions in the support channel (each one is a docs-search failure that happened to get asked instead of built).
- **Fix / prevention:** one canonical, *searchable* catalog (Storybook with visual index — engineers search by what things look like, so screenshots beat prop tables for findability); components named by what they are, not internal codenames (`DatePicker`, not `Chronos`); the catalog linked from the places engineers actually start (repo README, PR template, editor autocomplete via the published package); a support channel with a same-day answer norm — the cost of answering "use `<DatePicker>`, here's the story" is minutes; the cost of not answering is the fourth date picker.

### 2. The contribution model — bottleneck vs. free-for-all

The central tension: a **closed** system (only the systems team changes it) guarantees quality and guarantees bottleneck — requests queue, teams fork. An **open** free-for-all keeps velocity and dissolves coherence — the system becomes a junk drawer with a nice logo. The model that survives is **federated with a gate**:

- Anyone can propose and *build* a change or component; the systems team **reviews against published criteria** (the checklists in this KB: token usage, API shape, a11y definition-of-done, stress stories, snapshots) rather than taste. Published criteria are what make review fast and non-political — "fails contrast pair-check" closes a debate that "I don't like it" opens.
- **Tiering makes the gate cheap:** system-core (Button, Input, Dialog — full rigor, systems-team approval), system-extended (community-contributed, reviewed, labeled with an owning team), and local (lives in the feature, no gate — *explicitly blessed as fine*). The local tier is load-bearing: telling teams "one-off compositions don't need us" keeps the gate for things that are actually shared, and gives ambitious one-offs a promotion path (local → third consumer appears → propose for extended — the rule of three from `component-api.md` applied to whole components).
- **Speed is a governance SLO.** Token requests answered same-day (`design-tokens.md` §2 — slow vocabulary is the root cause of misuse); component proposals triaged within a week. If you can't staff those SLOs, shrink the system's surface until you can — a small fast system beats a large slow one every time, because the slow one forks.

### 3. Deprecation — the half you'll actually be judged on

Adding components is the fun half. A system that only adds becomes the junk drawer; consumers can't tell the good Button from the deprecated one (discoverability failure again, self-inflicted).

- **Failure:** `ButtonV2` ships; `Button` lingers "temporarily" with no removal plan. New engineers copy whichever the nearest file used. Three years later both are load-bearing, the docs cover neither honestly, and the systems team maintains two Buttons forever — which is the fork failure (`component-api.md` §3) performed *by the system on itself*.
- **The playbook that works:**
  1. **Announce with a migration path** — codemod for mechanical changes (>20 call sites and no codemod = you don't understand your own change), written migration guide for judgment changes, and a *named date*.
  2. **Mark it everywhere the consumer is:** deprecation banner in the catalog, `@deprecated` JSDoc (strikethrough in every editor), a one-time dev-console warning, lint rule making new usages an error while existing usages warn — the ratchet: the count can only go down.
  3. **Drive the count down actively.** Deprecation without migration labor is a wish. The systems team migrates the top consumers themselves (it's the best API-feedback loop they'll ever get), tracks the usage count on a dashboard, and *celebrates zero* — then deletes the code the same week, because a deprecated component at zero usages that lingers gets re-adopted.
  4. **Visual snapshots prove parity** during migration (`visual-regression-testing.md`), which is what makes consuming teams accept the swap without re-QA-ing their app — the single biggest friction-reducer in any migration I've run.
- **Versioning discipline** for the published package: semver honestly (changed defaults and visual redesigns of existing variants are breaking — `component-api.md` §4), batch majors, keep the previous major on security-fix support for a stated window, and *measure version adoption* — a rising pinned-old-version count is the system bifurcating in slow motion.

## Health metrics — measure adoption like a product

A design system is an internal product; run it on product metrics, not vibes:

| Metric | What it tells you | Alarm threshold |
|---|---|---|
| Token coverage (token-sourced values ÷ all values, from the lint census) | Drift rate | Trending down, ever |
| System-component share of new UI code | Adoption at the margin (the leading indicator) | Falling two quarters running |
| Duplicate count (scanner run quarterly) | Discoverability + API adequacy | Any new fork of a core component |
| Median time-to-answer: token request / proposal triage | Whether the correct path is the fastest | > 1 day / > 1 week |
| Version adoption spread | Bifurcation risk | >2 majors in production |
| Deprecated-usage counts | Whether deprecation is real | Flat for a quarter |

The census tooling behind rows 1 and 3 is `auditing-a-ui-codebase/README.md` artifacts 1–2 — the audit playbook run on your own system, quarterly, is governance's instrument panel.

## Decision tree — "a team built something off-system"

1. Is it genuinely local (one consumer, no shared semantics)? → bless it; that's the local tier working as designed. Note it; don't police it.
2. Does a system component *almost* cover it? → treat as an API bug report (`component-api.md` decision tree); fix the API, offer the migration, thank the team — the tone matters, because teams that get scolded for forking stop *telling* you they forked.
3. Is it the second-or-third parallel implementation of the same idea? → consolidation candidate: pick a canonical owner, migrate with snapshot-parity proof, deprecate the rest via the playbook.
4. Did they fork because the gate was too slow? → the finding is about your SLO, not their patience. Fix the SLO.

## War story

Two systems, same company, five years apart. The first was run as a fortress: a brilliant central team, closed contribution, every request triaged into a quarterly roadmap. Quality was impeccable; the queue was four months; by year two, product teams had quietly built 30+ shadow components, and the org concluded "the design system failed" — it hadn't failed technically, it had been *routed around*. The second system I set up with the opposite constitution: published acceptance criteria, federated contribution with a two-day triage SLO, an explicit local tier, and the quarterly duplicate scan as the public scoreboard. It was scrappier component-by-component — and at year three it had 90%+ share of new UI code and *zero* shadow forks of core components, because forking was never once the fastest path. Nobody routes around a door that's already open.

## Related

- The failures governance prevents: `component-api.md` §3–4 (forks, breaking changes), `design-tokens.md` §1–2 (drift, misuse), `css-architecture.md` §1 (override wars).
- Instruments: `auditing-a-ui-codebase/README.md` (the census), `agents/duplicate-component-scanner.md` (the scan), `visual-regression-testing.md` §3 (intended-change review as blast-radius control).
- Adoption docs for a new system: `building-a-design-system/README.md` step 6. Multi-team agent coordination on system work: `orchestration/README.md`.
